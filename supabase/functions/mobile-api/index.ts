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
const arr = (value: any) => Array.isArray(value) ? value : [];
const limitOf = (value: any, fallback = 200, max = 1000) => Math.min(Number(value) || fallback, max);

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
    if (authError || !authData?.user) return jsonResponse({ success: false, error: 'Invalid access token' }, 401);

    const user = authData.user;
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    let ownerUserId = user.id;
    try {
      const { data } = await supabase.rpc('get_effective_whatsapp_user_id', { _user_id: user.id });
      if (typeof data === 'string' && data) ownerUserId = data;
    } catch { /* keep current user */ }

    const { action, ...body } = await req.json();

    const ownedContacts = () => supabase
      .from('contacts')
      .select('*')
      .or(`user_id.eq.${user.id},assigned_user_id.eq.${user.id}`);

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

    const waSettings = async () => {
      const { data, error } = await supabase
        .from('whatsapp_settings')
        .select('*')
        .eq('user_id', ownerUserId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.api_token || !data?.phone_number_id) {
        return { settings: data, missing: true, error: 'WhatsApp is not configured' };
      }
      return { settings: data, missing: false, error: '' };
    };

    const callWhatsApp = async (waAction: string, extra: Record<string, any> = {}) => {
      const configured = await waSettings();
      if (configured.missing) {
        return { ok: false, result: { success: false, error: configured.error }, status: 400 };
      }
      const response = await fetch(`${supabaseUrl}/functions/v1/whatsapp-api`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          action: waAction,
          token: configured.settings.api_token,
          phoneNumberId: configured.settings.phone_number_id,
          ...extra,
        }),
      });
      const result = await response.json().catch(() => ({ success: false, error: 'Invalid response from WhatsApp API' }));
      return { ok: response.ok, result, status: response.ok ? 200 : 502 };
    };

    const sendViaWhatsApp = async (requestBody: Record<string, any>, contactId?: string) => {
      const recipient = await resolveRecipient();
      if (!recipient || recipient.length < 8) {
        return { ok: false, result: { success: false, error: 'Invalid recipient phone number' }, status: 400 };
      }

      const type = requestBody.type || 'text';
      const mediaTypes = ['image', 'video', 'document', 'audio', 'sticker'];
      const content = requestBody.content ?? requestBody.mediaUrl ?? '';
      const waBody = { ...requestBody, to: recipient, type, content };
      const sent = await callWhatsApp('send_message', waBody);

      const targetContactId = contactId || body.contactId;
      if (targetContactId) {
        const contact = await getOwnedContact(String(targetContactId));
        if (contact) {
          await supabase.from('messages').insert({
            user_id: user.id,
            contact_id: targetContactId,
            content: String(content || ''),
            type: mediaTypes.includes(type) ? type : type === 'template' ? 'template' : 'text',
            media_url: mediaTypes.includes(type) ? content : null,
            status: sent.result?.success ? 'sent' : 'failed',
            is_outgoing: true,
            whatsapp_message_id: sent.result?.messageId || sent.result?.wamid || null,
            template_name: requestBody.templateName || null,
            template_params: requestBody.templateParams || null,
            reply_to_message_id: requestBody.replyToMessageId || null,
            reply_to_wamid: requestBody.replyToWamid || null,
            reply_snapshot: requestBody.replySnapshot || null,
            error_code: Number.isFinite(Number(sent.result?.error?.code)) && sent.result?.error?.code !== undefined
              ? Number(sent.result.error.code)
              : null,
            error_title: sent.result?.error?.title || null,
            error_details: sent.result?.error?.message || null,
          });
        }
      }
      return sent;
    };

    const sharedInboxPayload = async () => {
      const membership = await supabase
        .from('shared_inbox_users')
        .select('*')
        .eq('shared_user_id', user.id)
        .maybeSingle();
      const isSharedUser = !!membership.data && (!membership.error);
      const superUserId = isSharedUser ? membership.data.super_user_id : user.id;
      let sharedUsers: any[] = [];
      const owned = await supabase
        .from('shared_inbox_users')
        .select('*')
        .eq('super_user_id', user.id)
        .order('created_at', { ascending: false });
      if (!owned.error && owned.data?.length) {
        try {
          const info = await supabase.rpc('get_users_info', {
            _ids: owned.data.map((row: any) => row.shared_user_id),
          });
          const byId = new Map(arr(info.data).map((row: any) => [row.id || row.user_id, row]));
          sharedUsers = owned.data.map((row: any) => {
            const details: any = byId.get(row.shared_user_id) || {};
            return {
              id: row.id,
              sharedUserId: row.shared_user_id,
              name: details.name || details.full_name || '',
              email: details.email || '',
              balance: row.balance || 0,
              status: row.status || 'active',
            };
          });
        } catch {
          sharedUsers = owned.data.map((row: any) => ({
            id: row.id,
            sharedUserId: row.shared_user_id,
            name: '',
            email: '',
            balance: row.balance || 0,
            status: row.status || 'active',
          }));
        }
      }
      return {
        isSharedUser,
        isSuperUser: !isSharedUser,
        superUserId,
        balance: isSharedUser ? membership.data?.balance || 0 : 0,
        sharedUsers,
      };
    };

    const upsertContactFull = async (payload: Record<string, any>) => {
      const contactPatch = pick(payload, [
        'name', 'phone', 'loanId', 'amount', 'dayType', 'appType', 'avatar_url',
        'bvn', 'imageUrl', 'imageKey', 'imageAlt', 'imageUploadedAt',
      ]);
      const mapped: Record<string, any> = {
        name: contactPatch.name,
        phone: normalizePhone(String(contactPatch.phone || '')),
        loan_id: contactPatch.loanId ?? null,
        amount: contactPatch.amount ?? null,
        day_type: contactPatch.dayType ?? null,
        app_type: contactPatch.appType ?? 'tloan',
        avatar_url: contactPatch.avatar_url ?? null,
        bvn: contactPatch.bvn ?? null,
        image_url: contactPatch.imageUrl ?? null,
        image_key: contactPatch.imageKey ?? null,
        image_alt: contactPatch.imageAlt ?? null,
        image_uploaded_at: contactPatch.imageUploadedAt ?? null,
      };
      if (!mapped.name || !mapped.phone) throw new Error('name and phone are required');

      let contactId = String(payload.contactId || payload.id || '');
      let contact;
      if (contactId) {
        const owned = await getOwnedContact(contactId);
        if (!owned) throw new Error('Contact not found');
        const updated = await supabase.from('contacts').update(mapped).eq('id', contactId).select('*').maybeSingle();
        if (updated.error) throw updated.error;
        contact = updated.data;
      } else {
        const inserted = await supabase
          .from('contacts')
          .insert({ ...mapped, user_id: user.id, is_deleted: false, deleted_at: null })
          .select('*')
          .maybeSingle();
        if (inserted.error) throw inserted.error;
        contact = inserted.data;
        contactId = contact.id;
      }

      if (payload.accountDetails !== undefined) {
        await supabase.from('account_details').delete().eq('contact_id', contactId);
        const accounts = arr(payload.accountDetails).map((row: any) => ({
          contact_id: contactId,
          bank: row.bank || row.bankName || '',
          account_number: row.accountNumber || row.account_number || '',
          account_name: row.accountName || row.account_name || row.recipientName || '',
        })).filter((row: any) => row.bank || row.account_number || row.account_name);
        if (accounts.length) {
          const { error } = await supabase.from('account_details').insert(accounts);
          if (error) throw error;
        }
      }

      if (payload.customerContacts !== undefined) {
        await supabase.from('customer_contacts').delete().eq('customer_id', contactId);
        const children = arr(payload.customerContacts).map((row: any) => ({
          customer_id: contactId,
          user_id: user.id,
          name: row.name || '',
          phone: row.phone || null,
          email: row.email || null,
          role: row.role || null,
          notes: row.notes || null,
          bank_name: row.bankName || null,
          account_number: row.accountNumber || null,
          recipient_name: row.recipientName || null,
          is_primary: row.isPrimary ?? false,
          labels: row.labels || null,
        })).filter((row: any) => row.name);
        if (children.length) {
          const { error } = await supabase.from('customer_contacts').insert(children);
          if (error) throw error;
        }
      }

      if (payload.labelIds !== undefined) {
        await supabase.from('chat_labels').delete().eq('user_id', user.id).eq('chat_id', contactId);
        const chatLabels = arr(payload.labelIds).filter(Boolean).map((labelId: string) => ({
          user_id: user.id,
          chat_id: contactId,
          label_id: labelId,
        }));
        if (chatLabels.length) {
          const { error } = await supabase.from('chat_labels').insert(chatLabels);
          if (error) throw error;
        }
      }

      if (mapped.app_type) {
        await supabase.from('apps').upsert({ user_id: user.id, name: mapped.app_type }, { onConflict: 'user_id,name' });
      }
      return contact;
    };

    if (action === 'bootstrap') {
      const [contactsResult, appsResult, templatesResult, appTemplatesResult, mappingsResult, labelsResult,
        chatLabelsResult, stickersResult, scheduledResult, settingsResult, profileResult, preferencesResult,
        sharedResult] = await Promise.all([
        supabase.from('contacts').select('*, account_details (*)').or(`user_id.eq.${user.id},assigned_user_id.eq.${user.id}`).eq('is_deleted', false).order('created_at', { ascending: false }),
        supabase.from('apps').select('*').eq('user_id', user.id).order('name', { ascending: true }),
        supabase.from('whatsapp_templates').select('*').eq('user_id', ownerUserId),
        supabase.from('app_templates').select('*').eq('user_id', user.id).order('name', { ascending: true }),
        supabase.from('template_mappings').select('*').eq('user_id', ownerUserId),
        supabase.from('labels').select('*').eq('user_id', user.id).order('name', { ascending: true }),
        supabase.from('chat_labels').select('*').eq('user_id', user.id),
        supabase.from('stickers').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('scheduled_messages').select('*').eq('user_id', user.id).order('scheduled_at', { ascending: true }),
        supabase.from('whatsapp_settings').select('*').eq('user_id', ownerUserId).maybeSingle(),
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle(),
        sharedInboxPayload(),
      ]);

      const contacts = contactsResult.data || [];
      const contactIds = contacts.map((c: any) => c.id);
      let messages: any[] = [];
      let customerContacts: any[] = [];
      if (contactIds.length) {
        const [messagesResult, customerResult] = await Promise.all([
          supabase.from('messages').select('*').in('contact_id', contactIds).eq('is_deleted', false).order('created_at', { ascending: true }),
          supabase.from('customer_contacts').select('*').in('customer_id', contactIds),
        ]);
        messages = messagesResult.data || [];
        customerContacts = customerResult.data || [];
      }

      const accountDetailsByContactId: Record<string, any[]> = {};
      for (const contact of contacts) {
        accountDetailsByContactId[contact.id] = contact.account_details || [];
      }
      const customerContactsByContactId: Record<string, any[]> = {};
      for (const row of customerContacts) {
        const key = row.customer_id;
        if (!customerContactsByContactId[key]) customerContactsByContactId[key] = [];
        customerContactsByContactId[key].push(row);
      }

      return jsonResponse({
        success: true,
        userId: user.id,
        ownerUserId,
        isOwner: user.id === ownerUserId,
        contacts,
        messages,
        accountDetailsByContactId,
        customerContactsByContactId,
        apps: appsResult.data || [],
        templates: templatesResult.data || [],
        whatsappTemplates: templatesResult.data || [],
        appTemplates: appTemplatesResult.data || [],
        templateMappings: mappingsResult.data || [],
        labels: labelsResult.data || [],
        chatLabels: chatLabelsResult.data || [],
        stickers: stickersResult.data || [],
        scheduledMessages: scheduledResult.data || [],
        settings: settingsResult.data || null,
        profile: profileResult.data || null,
        preferences: preferencesResult.data || null,
        sharedInbox: sharedResult,
      });
    }

    if (action === 'get_profile') {
      const { data, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, profile: data || null, user: { id: user.id, email: user.email }, isOwner: user.id === ownerUserId });
    }

    if (action === 'save_profile') {
      const patch = pick(body, ['name', 'email', 'avatar_url']);
      const { data, error } = await supabase
        .from('profiles')
        .upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
        .select('*')
        .maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, profile: data });
    }

    if (action === 'change_email') {
      if (!body.email) return jsonResponse({ success: false, error: 'email is required' }, 400);
      const { error } = await supabase.auth.admin.updateUserById(user.id, { email: String(body.email) });
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'change_password') {
      if (!body.password) return jsonResponse({ success: false, error: 'password is required' }, 400);
      const { error } = await supabase.auth.admin.updateUserById(user.id, { password: String(body.password) });
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'delete_account') {
      const tables = ['messages', 'chat_labels', 'contacts', 'labels', 'whatsapp_settings', 'whatsapp_templates',
        'app_templates', 'template_mappings', 'push_tokens', 'user_preferences', 'profiles'];
      for (const table of tables) {
        const column = table === 'shared_inbox_users' ? 'super_user_id' : table === 'profiles' || table === 'user_preferences' ? 'user_id' : 'user_id';
        await supabase.from(table).delete().eq(column, user.id);
      }
      await supabase.from('shared_inbox_users').delete().eq('super_user_id', user.id);
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'get_contacts' || action === 'search_contacts') {
      let query = ownedContacts().order('created_at', { ascending: false });
      if (!body.includeDeleted) query = query.eq('is_deleted', false);
      const search = String(body.search || body.query || '').trim();
      if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,loan_id.ilike.%${search}%`);
      if (body.appType) query = query.eq('app_type', body.appType);
      if (body.isPinned !== undefined) query = query.eq('is_pinned', body.isPinned);
      if (body.isArchived !== undefined) query = query.eq('is_archived', body.isArchived);
      if (body.isBlocked !== undefined) query = query.eq('is_blocked', body.isBlocked);
      const { data, error } = await query.limit(limitOf(body.limit, 500));
      if (error) throw error;
      return jsonResponse({ success: true, contacts: data || [] });
    }

    if (action === 'get_contact_details') {
      const contact = await getOwnedContact(String(body.contactId || ''));
      if (!contact) return jsonResponse({ success: false, error: 'Contact not found' }, 404);
      const [accounts, children, labels, messages] = await Promise.all([
        supabase.from('account_details').select('*').eq('contact_id', body.contactId),
        supabase.from('customer_contacts').select('*').eq('customer_id', body.contactId),
        supabase.from('chat_labels').select('*, labels (*)').eq('chat_id', body.contactId).eq('user_id', user.id),
        supabase.from('messages').select('*').eq('contact_id', body.contactId).eq('is_deleted', false).order('created_at', { ascending: true }).limit(limitOf(body.limit, 250)),
      ]);
      return jsonResponse({
        success: true,
        contact,
        accountDetails: accounts.data || [],
        customerContacts: children.data || [],
        labels: (labels.data || []).map((row: any) => row.labels).filter(Boolean),
        messages: messages.data || [],
      });
    }

    if (action === 'create_contact') {
      const contact = await upsertContactFull(body);
      return jsonResponse({ success: true, contact });
    }

    if (action === 'upsert_contact_full') {
      const contact = await upsertContactFull(body);
      return jsonResponse({ success: true, contact });
    }

    if (action === 'bulk_upsert_contacts') {
      const contacts: any[] = [];
      const errors: any[] = [];
      for (const payload of arr(body.contacts)) {
        try {
          contacts.push(await upsertContactFull(payload));
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      return jsonResponse({ success: true, contacts, errors });
    }

    if (action === 'update_contact') {
      const contactId = String(body.contactId || '');
      const owned = await getOwnedContact(contactId);
      if (!owned) return jsonResponse({ success: false, error: 'Contact not found' }, 404);
      const patch = pick(body, [
        'name', 'phone', 'app_type', 'avatar_url', 'loan_id', 'amount', 'day_type',
        'bvn', 'image_url', 'image_key', 'image_alt', 'image_uploaded_at',
        'is_pinned', 'is_muted', 'is_archived', 'is_blocked', 'is_deleted', 'assigned_user_id',
      ]);
      const { data, error } = await supabase.from('contacts').update(patch).eq('id', contactId).select('*').maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, contact: data });
    }

    if (action === 'bulk_update_contact_flags') {
      const ids = arr(body.contactIds).filter(Boolean);
      const flags = pick(body.flags || {}, ['is_pinned', 'is_muted', 'is_archived', 'is_blocked', 'is_deleted']);
      if (!ids.length || !Object.keys(flags).length) return jsonResponse({ success: false, error: 'contactIds and flags are required' }, 400);
      const { error } = await supabase.from('contacts').update(flags).in('id', ids).or(`user_id.eq.${user.id},assigned_user_id.eq.${user.id}`);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'restore_contacts') {
      const ids = arr(body.contactIds).filter(Boolean);
      const { data, error } = await supabase.from('contacts').update({ is_deleted: false, deleted_at: null }).in('id', ids).or(`user_id.eq.${user.id},assigned_user_id.eq.${user.id}`).select('*');
      if (error) throw error;
      return jsonResponse({ success: true, contacts: data || [] });
    }

    if (action === 'permanent_delete_contacts') {
      const ids = arr(body.contactIds).filter(Boolean);
      for (const table of ['messages', 'chat_labels', 'account_details', 'customer_contacts']) {
        const column = table === 'messages' || table === 'account_details' ? 'contact_id' : table === 'customer_contacts' ? 'customer_id' : 'chat_id';
        await supabase.from(table).delete().in(column, ids);
      }
      const { error } = await supabase.from('contacts').delete().in('id', ids).or(`user_id.eq.${user.id},assigned_user_id.eq.${user.id}`);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'assign_conversation') {
      const contactId = String(body.contactId || '');
      const owned = await getOwnedContact(contactId);
      if (!owned) return jsonResponse({ success: false, error: 'Contact not found' }, 404);
      const { data, error } = await supabase.from('contacts').update({ assigned_user_id: body.assignedUserId || null }).eq('id', contactId).select('*').maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, contact: data });
    }

    if (action === 'get_messages') {
      const contact = await getOwnedContact(String(body.contactId || ''));
      if (!contact) return jsonResponse({ success: false, error: 'Contact not found' }, 404);
      let query = supabase.from('messages').select('*').eq('contact_id', body.contactId).eq('is_deleted', false).order('created_at', { ascending: true });
      if (body.before) query = query.lt('created_at', body.before);
      const { data, error } = await query.limit(limitOf(body.limit, 250));
      if (error) throw error;
      return jsonResponse({ success: true, messages: data || [] });
    }

    if (action === 'send_message' || action === 'send_text' || action === 'send_media' || action === 'send_template') {
      const requestBody = pick(body, [
        'type', 'content', 'mediaUrl', 'mediaFileName', 'caption', 'templateName', 'templateParams',
        'templateLanguage', 'templateComponents', 'replyToMessageId', 'replyToWamid', 'reactionTargetWamid', 'replySnapshot', 'reactionEmoji',
      ]);
      requestBody.type = requestBody.type || (action === 'send_media' ? 'document' : action === 'send_template' ? 'template' : 'text');
      if (action === 'send_text') {
        requestBody.type = 'text';
        requestBody.content = body.content || body.text || '';
      }
      if (action === 'send_template' && body.templateName) requestBody.templateName = body.templateName;
      const sent = await sendViaWhatsApp(requestBody);
      return jsonResponse(sent.result, sent.status);
    }

    if (action === 'react_to_message') {
      const { data: message, error: findError } = await supabase.from('messages').select('*').eq('id', body.messageId).maybeSingle();
      if (findError) throw findError;
      if (!message) return jsonResponse({ success: false, error: 'Message not found' }, 404);
      const sent = await sendViaWhatsApp({
        type: 'reaction',
        content: '',
        reactionEmoji: body.emoji ?? '',
        replyToWamid: message.whatsapp_message_id,
        reactionTargetWamid: message.whatsapp_message_id,
      });
      const reactions = message.reactions || {};
      const key = body.emoji ? String(body.emoji) : 'removed';
      reactions[key] = (Number(reactions[key]) || 0) + 1;
      const { data: updated, error } = await supabase.from('messages').update({ reactions }).eq('id', body.messageId).select('*').maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, message: updated, whatsapp: sent.result }, sent.status);
    }

    if (action === 'delete_message') {
      const { error } = await supabase.from('messages').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('id', body.messageId);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'clear_chat') {
      const { error } = await supabase.from('messages').update({ is_deleted: true, deleted_at: new Date().toISOString() }).eq('contact_id', body.contactId);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'forward_message') {
      const { data: message, error } = await supabase.from('messages').select('*').eq('id', body.messageId).maybeSingle();
      if (error) throw error;
      if (!message) return jsonResponse({ success: false, error: 'Message not found' }, 404);
      const results: any[] = [];
      for (const contactId of arr(body.contactIds)) {
        const sent = await sendViaWhatsApp({
          type: ['image', 'video', 'document', 'audio'].includes(message.type) ? message.type : 'text',
          content: message.type === 'text' ? message.content : message.media_url,
          mediaFileName: message.content || 'file',
          caption: message.type === 'text' ? undefined : message.content,
        }, String(contactId));
        results.push({ contactId, success: sent.result?.success, error: sent.result?.error || null });
      }
      return jsonResponse({ success: true, results });
    }

    if (action === 'create_scheduled_message') {
      const owned = await getOwnedContact(String(body.contactId || ''));
      if (!owned) return jsonResponse({ success: false, error: 'Contact not found' }, 404);
      const { data, error } = await supabase.from('scheduled_messages').insert({
        user_id: user.id,
        contact_id: body.contactId,
        content: body.content || '',
        type: body.type || 'text',
        template_name: body.templateName || null,
        template_params: body.templateParams || null,
        template_language: body.templateLanguage || null,
        scheduled_at: body.scheduledAt,
        status: 'pending',
      }).select('*').maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, scheduledMessage: data });
    }

    if (action === 'list_scheduled_messages') {
      let query = supabase.from('scheduled_messages').select('*').eq('user_id', user.id).order('scheduled_at', { ascending: true });
      if (body.contactId) query = query.eq('contact_id', body.contactId);
      if (body.status) query = query.eq('status', body.status);
      const { data, error } = await query.limit(limitOf(body.limit, 200));
      if (error) throw error;
      return jsonResponse({ success: true, scheduledMessages: data || [] });
    }

    if (action === 'update_scheduled_message') {
      const patch = pick(body, ['content', 'scheduledAt', 'status']);
      if (patch.scheduledAt) patch.scheduled_at = patch.scheduledAt;
      delete patch.scheduledAt;
      const { data, error } = await supabase.from('scheduled_messages').update(patch).eq('id', body.scheduledMessageId).eq('user_id', user.id).select('*').maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, scheduledMessage: data });
    }

    if (action === 'cancel_scheduled_message') {
      const { error } = await supabase.from('scheduled_messages').update({ status: 'cancelled' }).eq('id', body.scheduledMessageId).eq('user_id', user.id);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'upload_media_base64' || action === 'upload_sticker_base64') {
      const fileName = String(body.fileName || (action === 'upload_sticker_base64' ? 'sticker.webp' : 'file'));
      const mimeType = String(body.mimeType || 'application/octet-stream');
      const base64 = String(body.base64 || '').replace(/^data:[^;]+;base64,/, '');
      if (!base64) return jsonResponse({ success: false, error: 'base64 is required' }, 400);
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      if (bytes.byteLength > 100 * 1024 * 1024) return jsonResponse({ success: false, error: 'File is larger than 100 MB' }, 400);
      const bucket = action === 'upload_sticker_base64' ? 'stickers' : 'chat-media';
      const folder = action === 'upload_sticker_base64' ? `${user.id}` : `${user.id}/${body.contactId || 'media'}`;
      const filePath = `${folder}/${Date.now()}-${fileName}`;
      const { error } = await supabase.storage.from(bucket).upload(filePath, new Blob([bytes], { type: mimeType }), { contentType: mimeType, upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
      if (action === 'upload_sticker_base64') {
        const { data: sticker, error: stickerError } = await supabase.from('stickers').insert({
          user_id: user.id,
          name: body.name || fileName,
          media_url: urlData.publicUrl,
          mime_type: mimeType,
          source: body.source || 'uploaded',
        }).select('*').maybeSingle();
        if (stickerError) throw stickerError;
        return jsonResponse({ success: true, path: filePath, url: urlData.publicUrl, sticker });
      }
      return jsonResponse({ success: true, path: filePath, url: urlData.publicUrl, mimeType, fileName });
    }

    if (action === 'list_stickers') {
      const { data, error } = await supabase.from('stickers').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      return jsonResponse({ success: true, stickers: data || [] });
    }

    if (action === 'delete_sticker') {
      const { error } = await supabase.from('stickers').delete().eq('id', body.stickerId).eq('user_id', user.id);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'mark_read') {
      const { error } = await supabase.from('messages').update({ status: 'read' }).eq('contact_id', body.contactId).eq('is_outgoing', false).neq('status', 'read');
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'mark_all_read') {
      const contactIds = (await ownedContacts().select('id')).data || [];
      if (contactIds.length) {
        await supabase.from('messages').update({ status: 'read' }).in('contact_id', contactIds.map((c: any) => c.id)).eq('is_outgoing', false).neq('status', 'read');
      }
      return jsonResponse({ success: true });
    }

    if (action === 'update_contact_flag') {
      const allowed = ['is_pinned', 'is_muted', 'is_archived', 'is_blocked', 'is_deleted'];
      const patch = pick(body, allowed);
      if (!Object.keys(patch).length) return jsonResponse({ success: false, error: 'No supported flag supplied' }, 400);
      if (patch.is_deleted) patch.deleted_at = new Date().toISOString();
      if (patch.is_deleted === false) patch.deleted_at = null;
      const { error } = await supabase.from('contacts').update(patch).eq('id', body.contactId).or(`user_id.eq.${user.id},assigned_user_id.eq.${user.id}`);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'get_labels') {
      const { data, error } = await supabase.from('labels').select('*').eq('user_id', user.id).order('name', { ascending: true });
      if (error) throw error;
      return jsonResponse({ success: true, labels: data || [] });
    }

    if (action === 'upsert_label') {
      const patch = pick(body, ['name', 'color']);
      if (!patch.name) return jsonResponse({ success: false, error: 'name is required' }, 400);
      const record = { user_id: user.id, ...patch, color: patch.color || '#25D366' };
      const query = body.labelId
        ? supabase.from('labels').update(record).eq('id', body.labelId).eq('user_id', user.id)
        : supabase.from('labels').insert(record);
      const { data, error } = await query.select('*').maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, label: data });
    }

    if (action === 'delete_label') {
      await supabase.from('chat_labels').delete().eq('label_id', body.labelId).eq('user_id', user.id);
      const { error } = await supabase.from('labels').delete().eq('id', body.labelId).eq('user_id', user.id);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'set_chat_labels') {
      await supabase.from('chat_labels').delete().eq('user_id', user.id).eq('chat_id', body.contactId);
      const rows = arr(body.labelIds).filter(Boolean).map((labelId: string) => ({ user_id: user.id, chat_id: body.contactId, label_id: labelId }));
      if (rows.length) {
        const { error } = await supabase.from('chat_labels').insert(rows);
        if (error) throw error;
      }
      const { data } = await supabase.from('chat_labels').select('*').eq('user_id', user.id).eq('chat_id', body.contactId);
      return jsonResponse({ success: true, chatLabels: data || [] });
    }

    if (action === 'get_templates' || action === 'list_whatsapp_templates') {
      const { data, error } = await supabase.from('whatsapp_templates').select('*').eq('user_id', ownerUserId).order('name', { ascending: true });
      if (error) throw error;
      return jsonResponse({ success: true, templates: data || [] });
    }

    if (action === 'list_app_templates') {
      const { data, error } = await supabase.from('app_templates').select('*').eq('user_id', user.id).order('name', { ascending: true });
      if (error) throw error;
      return jsonResponse({ success: true, templates: data || [] });
    }

    if (action === 'upsert_app_template') {
      const patch = pick(body, ['name', 'body']);
      if (!patch.name || patch.body === undefined) return jsonResponse({ success: false, error: 'name and body are required' }, 400);
      const record = { user_id: user.id, ...patch, updated_at: new Date().toISOString() };
      const query = body.templateId
        ? supabase.from('app_templates').update(record).eq('id', body.templateId).eq('user_id', user.id)
        : supabase.from('app_templates').insert(record);
      const { data, error } = await query.select('*').maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, template: data });
    }

    if (action === 'delete_app_template') {
      const { error } = await supabase.from('app_templates').delete().eq('id', body.templateId).eq('user_id', user.id);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'list_template_mappings') {
      let query = supabase.from('template_mappings').select('*').eq('user_id', ownerUserId).order('template_name', { ascending: true });
      if (body.templateName) query = query.eq('template_name', body.templateName);
      const { data, error } = await query;
      if (error) throw error;
      return jsonResponse({ success: true, mappings: data || [] });
    }

    if (action === 'save_template_mapping') {
      if (!body.templateName || !body.variableNumber || !body.mappedField) {
        return jsonResponse({ success: false, error: 'templateName, variableNumber and mappedField are required' }, 400);
      }
      const mapping = {
        user_id: ownerUserId,
        template_name: body.templateName,
        variable_number: Number(body.variableNumber),
        mapped_field: body.mappedField,
      };
      await supabase.from('template_mappings').delete()
        .eq('user_id', ownerUserId)
        .eq('template_name', body.templateName)
        .eq('variable_number', mapping.variable_number);
      const { error } = await supabase.from('template_mappings').insert(mapping);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'clear_template_mapping') {
      const { error } = await supabase.from('template_mappings').delete().eq('user_id', ownerUserId).eq('template_name', body.templateName);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'get_apps') {
      const { data, error } = await supabase.from('apps').select('*').eq('user_id', user.id).order('name', { ascending: true });
      if (error) throw error;
      return jsonResponse({ success: true, apps: data || [] });
    }

    if (action === 'add_app' || action === 'rename_app') {
      if (!body.name) return jsonResponse({ success: false, error: 'name is required' }, 400);
      const query = body.appId
        ? supabase.from('apps').update({ name: body.name, updated_at: new Date().toISOString() }).eq('id', body.appId).eq('user_id', user.id)
        : supabase.from('apps').insert({ user_id: user.id, name: body.name });
      const { data, error } = await query.select('*').maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, app: data });
    }

    if (action === 'delete_app') {
      const { error } = await supabase.from('apps').delete().eq('id', body.appId).eq('user_id', user.id);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'list_auto_replies') {
      const { data, error } = await supabase.from('auto_replies').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (error) throw error;
      return jsonResponse({ success: true, autoReplies: data || [] });
    }

    if (action === 'upsert_auto_reply') {
      const patch = pick(body, ['name', 'steps', 'is_active']);
      if (!patch.name) return jsonResponse({ success: false, error: 'name is required' }, 400);
      const record = { user_id: user.id, ...patch, steps: patch.steps || [], updated_at: new Date().toISOString() };
      const query = body.autoReplyId
        ? supabase.from('auto_replies').update(record).eq('id', body.autoReplyId).eq('user_id', user.id)
        : supabase.from('auto_replies').insert(record);
      const { data, error } = await query.select('*').maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, autoReply: data });
    }

    if (action === 'toggle_auto_reply' || action === 'delete_auto_reply') {
      const table = supabase.from('auto_replies');
      const query = action === 'delete_auto_reply'
        ? table.delete().eq('id', body.autoReplyId).eq('user_id', user.id)
        : table.update({ is_active: !!body.isActive, updated_at: new Date().toISOString() }).eq('id', body.autoReplyId).eq('user_id', user.id);
      const { error } = await query;
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'get_api_stats') {
      const statuses = ['sent', 'delivered', 'read', 'failed'];
      const counts: Record<string, number> = {};
      for (const status of statuses) {
        const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', status);
        counts[status] = count || 0;
      }
      const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
      return jsonResponse({
        success: true,
        stats: {
          total,
          sent: counts.sent + counts.delivered + counts.read,
          delivered: counts.delivered + counts.read,
          read: counts.read,
          failed: counts.failed,
          deliveryRate: total ? Math.round(((counts.delivered + counts.read) / total) * 100) : 0,
        },
      });
    }

    if (action === 'get_logs') {
      let query = supabase.from('webhook_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      if (body.eventType) query = query.eq('event_type', body.eventType);
      if (body.direction) query = query.eq('direction', body.direction);
      if (body.status) query = query.eq('status', body.status);
      if (body.search) query = query.or(`event_type.ilike.%${body.search}%,phone_number.ilike.%${body.search}%,error.ilike.%${body.search}%`);
      const { data, error } = await query.limit(limitOf(body.limit, 200));
      if (error) throw error;
      return jsonResponse({ success: true, logs: data || [] });
    }

    if (action === 'clear_logs') {
      const { error } = await supabase.from('webhook_logs').delete().eq('user_id', user.id);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'get_preferences') {
      const { data, error } = await supabase.from('user_preferences').select('*').eq('user_id', user.id).maybeSingle();
      if (error) {
        return jsonResponse({ success: true, preferences: null, defaults: { notifications_enabled: true, notification_sound: 'default', vibration_enabled: true, message_preview: true, theme: 'system', primary_color: '#28A156', dark_mode: false, font_family: 'system' } });
      }
      return jsonResponse({ success: true, preferences: data || null });
    }

    if (action === 'save_preferences') {
      const patch = pick(body, [
        'notifications_enabled', 'notification_sound', 'vibration_enabled', 'message_preview',
        'theme', 'primary_color', 'dark_mode', 'font_family',
      ]);
      const { data, error } = await supabase.from('user_preferences').upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }).select('*').maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, preferences: data });
    }

    if (action === 'register_push_token') {
      if (!body.token) return jsonResponse({ success: false, error: 'token is required' }, 400);
      await supabase.from('push_tokens').delete().eq('token', body.token);
      const { data, error } = await supabase.from('push_tokens').insert({
        user_id: user.id,
        token: body.token,
        platform: body.platform || 'android',
        device_info: body.deviceInfo || 'Waaba Android',
      }).select('*').maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, token: data });
    }

    if (action === 'unregister_push_token') {
      const { error } = await supabase.from('push_tokens').delete().eq('user_id', user.id).eq('token', body.token);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'get_settings') {
      const { data, error } = await supabase.from('whatsapp_settings').select('*').eq('user_id', ownerUserId).maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, settings: data || null, isOwner: user.id === ownerUserId });
    }

    if (action === 'save_settings') {
      if (user.id !== ownerUserId) return jsonResponse({ success: false, error: 'Only the workspace owner can change WhatsApp credentials' }, 403);
      const patch = pick(body, [
        'api_token', 'phone_number_id', 'business_account_id', 'app_id', 'webhook_url', 'verify_token',
        'is_connected', 'last_webhook_hit_at', 'last_real_message_at', 'last_matched_phone_number_id',
        'last_mapping_failure_reason', 'webhook_subscription_health', 'webhook_config_warning',
      ]);
      const { error } = await supabase.from('whatsapp_settings').upsert({ user_id: ownerUserId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'test_whatsapp_connection') {
      const sent = await callWhatsApp('test_connection', {});
      if (sent.ok && sent.result?.success) {
        await supabase.from('whatsapp_settings').update({ is_connected: true, updated_at: new Date().toISOString() }).eq('user_id', ownerUserId);
      }
      return jsonResponse({ ...sent.result, connected: !!sent.result?.success }, sent.status);
    }

    if (action === 'sync_whatsapp_templates') {
      const configured = await waSettings();
      if (configured.missing) return jsonResponse({ success: false, error: configured.error }, 400);
      const sent = await callWhatsApp('sync_templates', {
        businessAccountId: configured.settings?.business_account_id,
        userId: ownerUserId,
      });
      return jsonResponse(sent.result, sent.status);
    }

    if (action === 'get_whatsapp_business_profile') {
      const sent = await callWhatsApp('get_business_profile', {});
      return jsonResponse(sent.result, sent.status);
    }

    if (action === 'generate_webhook_url') {
      const verifyToken = String(body.verifyToken || crypto.randomUUID());
      const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-webhook?user_id=${ownerUserId}&connection=${encodeURIComponent(verifyToken)}`;
      const { error } = await supabase.from('whatsapp_settings').upsert({
        user_id: ownerUserId,
        verify_token: verifyToken,
        webhook_url: webhookUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
      return jsonResponse({ success: true, webhookUrl, verifyToken });
    }

    if (action === 'reset_whatsapp_connection') {
      await supabase.from('webhook_logs').delete().eq('user_id', ownerUserId);
      const { error } = await supabase.from('whatsapp_settings').upsert({
        user_id: ownerUserId,
        api_token: null,
        phone_number_id: null,
        business_account_id: null,
        app_id: null,
        webhook_url: null,
        verify_token: null,
        is_connected: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'list_shared_inbox') {
      return jsonResponse({ success: true, ...await sharedInboxPayload() });
    }

    if (action === 'search_users') {
      if (!body.email) return jsonResponse({ success: false, error: 'email is required' }, 400);
      const { data, error } = await supabase.rpc('search_users_by_email', { _email: body.email });
      if (error) throw error;
      return jsonResponse({ success: true, users: data || [] });
    }

    if (action === 'add_shared_user') {
      if (user.id !== ownerUserId || !body.sharedUserId) return jsonResponse({ success: false, error: 'Not allowed' }, 403);
      const { data, error } = await supabase.from('shared_inbox_users').insert({
        super_user_id: user.id,
        shared_user_id: body.sharedUserId,
        balance: Number(body.balance) || 0,
        status: 'active',
      }).select('*').maybeSingle();
      if (error) throw error;
      return jsonResponse({ success: true, member: data });
    }

    if (action === 'update_shared_user') {
      const owned = await supabase.from('shared_inbox_users').select('*').eq('id', body.memberId).eq('super_user_id', user.id).maybeSingle();
      if (owned.error || !owned.data) return jsonResponse({ success: false, error: 'Member not found' }, 404);
      const patch = pick(body, ['status', 'balance']);
      const { data, error } = await supabase.from('shared_inbox_users').update(patch).eq('id', body.memberId).select('*').maybeSingle();
      if (error) throw error;
      if (patch.status && patch.status !== 'active') {
        await supabase.from('contacts').update({ assigned_user_id: null }).eq('assigned_user_id', owned.data.shared_user_id);
      }
      return jsonResponse({ success: true, member: data });
    }

    if (action === 'remove_shared_user') {
      const owned = await supabase.from('shared_inbox_users').select('*').eq('id', body.memberId).eq('super_user_id', user.id).maybeSingle();
      if (owned.error || !owned.data) return jsonResponse({ success: false, error: 'Member not found' }, 404);
      await supabase.from('contacts').update({ assigned_user_id: null }).eq('assigned_user_id', owned.data.shared_user_id);
      const { error } = await supabase.from('shared_inbox_users').delete().eq('id', body.memberId);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'leave_shared_inbox') {
      const membership = await supabase.from('shared_inbox_users').select('*').eq('shared_user_id', user.id).maybeSingle();
      if (!membership.data) return jsonResponse({ success: false, error: 'Membership not found' }, 404);
      await supabase.from('contacts').update({ assigned_user_id: null }).eq('assigned_user_id', user.id);
      const { error } = await supabase.from('shared_inbox_users').delete().eq('id', membership.data.id);
      if (error) throw error;
      return jsonResponse({ success: true });
    }

    if (action === 'bulk_send') {
      const recipients = arr(body.contacts);
      const results: any[] = [];
      for (const recipient of recipients) {
        const contactId = String(recipient.contactId || recipient.id || '');
        if (body.scheduledAt) {
          const { data, error } = await supabase.from('scheduled_messages').insert({
            user_id: user.id,
            contact_id: contactId,
            content: body.content || '',
            type: body.type || 'text',
            template_name: body.templateName || null,
            template_params: body.templateParams || null,
            template_language: body.templateLanguage || null,
            scheduled_at: body.scheduledAt,
            status: 'pending',
          }).select('*').maybeSingle();
          results.push({ contactId, success: !error, scheduledMessage: data, error: error?.message || null });
        } else {
          const sent = await sendViaWhatsApp({
            type: body.type || 'text',
            content: body.content || '',
            templateName: body.templateName,
            templateParams: body.templateParams,
            templateLanguage: body.templateLanguage,
            templateComponents: body.templateComponents,
          }, contactId);
          results.push({ contactId, success: !!sent.result?.success, error: sent.result?.error || null });
        }
      }
      return jsonResponse({ success: true, results });
    }

    return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
  } catch (error) {
    console.error('[mobile-api] error', error);
    return jsonResponse({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
