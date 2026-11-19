import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const normalizePhone = (value: string) => String(value || '').replace(/\D/g, '');

const pick = (source: Record<string, any>, keys: string[]) =>
  Object.fromEntries(keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return jsonResponse({ success: false, error: 'Missing access token' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: authData, error: authError } = await anonClient.auth.getUser(jwt);
    if (authError || !authData?.user) {
      return jsonResponse({ success: false, error: 'Invalid access token' }, 401);
    }

    const user = authData.user;
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    let ownerUserId = user.id;
    try {
      const { data } = await supabase.rpc('get_effective_whatsapp_user_id', { _user_id: user.id });
      if (typeof data === 'string' && data) ownerUserId = data;
    } catch { /* keep current user */ }

    const { action, ...body } = await req.json();

    const getOwnedContact = async (contactId: string) => {
      if (!contactId) return null;
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .or(`user_id.eq.${user.id},assigned_user_id.eq.${user.id}`)
        .maybeSingle();
      if (error) throw error;
      return data;
    };

    const resolveRecipient = async () => {
      const direct = normalizePhone(String(body.to || body.phone || ''));
      if (direct) return direct;
      const contact = await getOwnedContact(String(body.contactId || ''));
      return normalizePhone(String(contact?.phone || ''));
    };

    const sendViaWhatsApp = async (requestBody: Record<string, any>, contactId?: string) => {
      const recipient = await resolveRecipient();
      if (!recipient || recipient.length < 8) {
        return { ok: false, result: { success: false, error: 'Invalid recipient phone number' }, status: 400 };
      }

      const { data: settings, error: settingsError } = await supabase
        .from('whatsapp_settings')
        .select('api_token, phone_number_id')
        .eq('user_id', ownerUserId)
        .maybeSingle();
      if (settingsError) throw settingsError;
      if (!settings?.api_token || !settings?.phone_number_id) {
        return { ok: false, result: { success: false, error: 'WhatsApp is not configured' }, status: 400 };
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          action: 'send_message',
          token: settings.api_token,
          phoneNumberId: settings.phone_number_id,
          to: recipient,
          type: requestBody.type || 'text',
          ...requestBody,
        }),
      });
      const result = await response.json().catch(() => ({ success: false, error: 'Invalid response from WhatsApp API' }));

      const targetContactId = contactId || body.contactId;
      if (targetContactId) {
        const contact = await getOwnedContact(String(targetContactId));
        if (contact) {
          const type = requestBody.type || 'text';
          const mediaTypes = ['image', 'video', 'document', 'audio', 'sticker'];
          await supabase.from('messages').insert({
            user_id: user.id,
            contact_id: targetContactId,
            content: requestBody.content || '',
            type: mediaTypes.includes(type) ? type : 'text',
            media_url: mediaTypes.includes(type) ? requestBody.content : null,
            status: result?.success ? 'sent' : 'failed',
            is_outgoing: true,
            whatsapp_message_id: result?.messageId || result?.wamid || null,
          });
        }
      }

      return { ok: response.ok, result, status: response.ok ? 200 : 502 };
    };

    if (action === 'bootstrap') {
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('*, account_details (*)')
        .or(`user_id.eq.${user.id},assigned_user_id.eq.${user.id}`)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });
      if (contactsError) throw contactsError;

      const contactIds = (contacts || []).map((c: any) => c.id);
      let messages: any[] = [];
      if (contactIds.length > 0) {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .in('contact_id', contactIds)
          .eq('is_deleted', false)
          .order('created_at', { ascending: true });
        if (error) throw error;
        messages = data || [];
      }

      const [appsResult, templatesResult, settingsResult, profileResult] = await Promise.all([
        supabase.from('apps').select('id, name').eq('user_id', user.id).order('created_at', { ascending: true }),
        supabase.from('whatsapp_templates').select('*').eq('user_id', ownerUserId),
        supabase.from('whatsapp_settings').select('*').eq('user_id', ownerUserId).maybeSingle(),
        supabase.from('profiles').select('name, avatar_url').eq('user_id', user.id).maybeSingle(),
      ]);

      return jsonResponse({
        success: true,
        userId: user.id,
        ownerUserId,
        contacts: contacts || [],
        messages,
        apps: appsResult.data || [],
        templates: templatesResult.data || [],
        settings: settingsResult.data || null,
        profile: profileResult.data || null,
      });
    }

    if (action === 'get_profile') {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, profile: data || null, user: { id: user.id, email: user.email } });
    }

    if (action === 'get_contacts' || action === 'search_contacts') {
      let query = supabase
        .from('contacts')
        .select('*, account_details (*)')
        .or(`user_id.eq.${user.id},assigned_user_id.eq.${user.id}`)
        .order('created_at', { ascending: false });
      if (!body.includeDeleted) query = query.eq('is_deleted', false);

      const search = String(body.search || body.query || '').trim();
      if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
      if (body.appType) query = query.eq('app_type', body.appType);
      if (body.isPinned !== undefined) query = query.eq('is_pinned', body.isPinned);
      if (body.isArchived !== undefined) query = query.eq('is_archived', body.isArchived);
      if (body.isBlocked !== undefined) query = query.eq('is_blocked', body.isBlocked);
      if (body.limit) query = query.limit(Math.min(Number(body.limit) || 500, 1000));

      const { data, error } = await query;
      if (error) throw error;
      return jsonResponse({ success: true, contacts: data || [] });
    }

    if (action === 'create_contact') {
      const patch = pick(body, ['name', 'phone', 'email', 'role', 'notes', 'app_type', 'avatar_url']);
      if (!patch.name || !patch.phone) {
        return jsonResponse({ success: false, error: 'name and phone are required' }, 400);
      }
      const { data, error } = await supabase
        .from('contacts')
        .insert({ ...patch, user_id: user.id })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, contact: data });
    }

    if (action === 'update_contact') {
      const patch = pick(body, [
        'name', 'phone', 'email', 'role', 'notes', 'app_type', 'avatar_url',
        'is_pinned', 'is_muted', 'is_archived', 'is_blocked', 'is_deleted',
      ]);
      if (!body.contactId || Object.keys(patch).length === 0) {
        return jsonResponse({ success: false, error: 'contactId and at least one field are required' }, 400);
      }
      const owned = await getOwnedContact(String(body.contactId));
      if (!owned) return jsonResponse({ success: false, error: 'Contact not found' }, 404);
      const { data, error } = await supabase
        .from('contacts')
        .update(patch)
        .eq('id', body.contactId)
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, contact: data });
    }

    if (action === 'get_messages') {
      if (!body.contactId) return jsonResponse({ success: false, error: 'contactId is required' }, 400);
      const owned = await getOwnedContact(String(body.contactId));
      if (!owned) return jsonResponse({ success: false, error: 'Contact not found' }, 404);

      let query = supabase
        .from('messages')
        .select('*')
        .eq('contact_id', body.contactId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });
      if (body.before) query = query.lt('created_at', body.before);
      const limit = Math.min(Number(body.limit) || 250, 1000);
      const { data, error } = await query.limit(limit);
      if (error) throw error;
      return jsonResponse({ success: true, messages: data || [] });
    }

    if (action === 'send_message' || action === 'send_text' || action === 'send_media') {
      const requestBody = pick(body, [
        'type', 'content', 'templateName', 'templateParams', 'templateLanguage',
        'templateComponents', 'mediaFileName', 'caption', 'replyToWamid', 'reactionEmoji',
      ]);
      requestBody.type = requestBody.type || (action === 'send_media' ? 'document' : 'text');
      if (action === 'send_text') {
        requestBody.type = 'text';
        requestBody.content = body.content || body.text || '';
      }
      if (action === 'send_media' && !requestBody.type) requestBody.type = 'document';
      const sent = await sendViaWhatsApp(requestBody);
      return jsonResponse(sent.result, sent.status);
    }

    if (action === 'send_template') {
      const requestBody = pick(body, [
        'templateName', 'templateParams', 'templateLanguage', 'templateComponents',
      ]);
      if (!requestBody.templateName) {
        return jsonResponse({ success: false, error: 'templateName is required' }, 400);
      }
      const sent = await sendViaWhatsApp({ type: 'template', ...requestBody });
      return jsonResponse(sent.result, sent.status);
    }

    if (action === 'upload_media_base64') {
      const fileName = String(body.fileName || 'file');
      const mimeType = String(body.mimeType || 'application/octet-stream');
      const base64 = String(body.base64 || '').replace(/^data:[^;]+;base64,/, '');
      if (!base64) return jsonResponse({ success: false, error: 'base64 is required' }, 400);

      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      if (bytes.byteLength > 100 * 1024 * 1024) {
        return jsonResponse({ success: false, error: 'File is larger than 100 MB' }, 400);
      }

      const contactId = String(body.contactId || 'media');
      const filePath = `${user.id}/${contactId}/${Date.now()}-${fileName}`;
      const { error } = await supabase.storage
        .from('chat-media')
        .upload(filePath, new Blob([bytes], { type: mimeType }), { contentType: mimeType, upsert: false });
      if (error) throw error;

      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(filePath);
      return jsonResponse({ success: true, path: filePath, url: urlData.publicUrl, mimeType, fileName });
    }

    if (action === 'mark_read') {
      const { error } = await supabase
        .from('messages')
        .update({ status: 'read' })
        .eq('contact_id', body.contactId)
        .eq('is_outgoing', false)
        .neq('status', 'read');
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'mark_all_read') {
      const contactIds = (await supabase
        .from('contacts')
        .select('id')
        .or(`user_id.eq.${user.id},assigned_user_id.eq.${user.id}`)).data || [];
      if (contactIds.length > 0) {
        const { error } = await supabase
          .from('messages')
          .update({ status: 'read' })
          .in('contact_id', contactIds.map((c: any) => c.id))
          .eq('is_outgoing', false)
          .neq('status', 'read');
        if (error) throw error;
      }
      return jsonResponse({ success: true });
    }

    if (action === 'update_contact_flag') {
      const allowed = ['is_pinned', 'is_muted', 'is_archived', 'is_blocked', 'is_deleted'];
      const patch = pick(body, allowed);
      if (Object.keys(patch).length === 0) {
        return jsonResponse({ success: false, error: 'No supported flag supplied' }, 400);
      }
      const { error } = await supabase
        .from('contacts')
        .update(patch)
        .eq('id', body.contactId)
        .or(`user_id.eq.${user.id},assigned_user_id.eq.${user.id}`);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'get_templates') {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('user_id', ownerUserId)
        .order('name', { ascending: true });
      if (error) throw error;
      return jsonResponse({ success: true, templates: data || [] });
    }

    if (action === 'get_apps') {
      const { data, error } = await supabase
        .from('apps')
        .select('id, name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return jsonResponse({ success: true, apps: data || [] });
    }

    if (action === 'get_settings') {
      const { data, error } = await supabase
        .from('whatsapp_settings')
        .select('*')
        .eq('user_id', ownerUserId)
        .maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, settings: data || null });
    }

    if (action === 'save_settings') {
      const patch = pick(body, ['api_token', 'phone_number_id', 'business_account_id', 'app_id', 'webhook_url', 'verify_token']);
      const { error } = await supabase
        .from('whatsapp_settings')
        .upsert({ user_id: ownerUserId, ...patch }, { onConflict: 'user_id' });
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error('[mobile-api] error', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
