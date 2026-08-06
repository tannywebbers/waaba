import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ✅ CHANGE 1: v18.0 → v25.0
const WHATSAPP_API_URL = 'https://graph.facebook.com/v25.0';

const normalizeRecipient = (value: string): string => value.replace(/\D/g, '');

/**
 * Ensures newline support
 */
const normalizeText = (text: any): string => {
  if (!text) return '';

  let normalized = String(text);

  // Convert literal \n into actual newline
  normalized = normalized.replace(/\\n/g, '\n');

  // Normalize Windows/Mac line endings
  normalized = normalized.replace(/\r\n/g, '\n');

  return normalized;
};

async function testWebhookConnection(token: string) {
  const res = await fetch(`${WHATSAPP_API_URL}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  await res.text();
  return res.ok;
}

async function fetchGraphJson(path: string, token: string) {
  const res = await fetch(`${WHATSAPP_API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { action, ...params } = await req.json();
    console.log('📞 [WhatsApp API] Action:', action);

    switch (action) {

      case 'send_message': {

        const {
          token,
          phoneNumberId,
          to,
          type,
          content,
          templateName,
          templateParams,
          templateLanguage,
          templateComponents,
          mediaFileName,
          replyToWamid,        // ✨ NEW: WhatsApp message ID being replied to
          reactionEmoji,       // ✨ NEW: emoji for reaction; '' to remove
        } = params;

        const normalizedTo = normalizeRecipient(String(to || ''));

        if (!normalizedTo || normalizedTo.length < 8) {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Invalid recipient phone number',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        let messageBody: any = {
          messaging_product: 'whatsapp',
          to: normalizedTo,
        };

        // ✨ Reply context — Meta accepts `context.message_id` on most message types
        if (replyToWamid && type !== 'reaction' && type !== 'template') {
          messageBody.context = { message_id: replyToWamid };
        }

        if (type === 'template' && templateName) {
          console.log('📋 Building template:', templateName);
          const orderedEntries = templateParams
            ? Object.entries(templateParams).sort(([a], [b]) => {
                const numA = parseInt(a.replace(/\D/g, '')) || 0;
                const numB = parseInt(b.replace(/\D/g, '')) || 0;
                return numA - numB;
              })
            : [];

          const orderedParams = orderedEntries.map(([, value]) => ({
            type: 'text',
            text: normalizeText(value) || ' ',
          }));

          const components = Array.isArray(templateComponents) && templateComponents.length > 0
            ? templateComponents
                .map((component: any) => {
                  const componentType = String(component?.type || '').toUpperCase();

                  if (componentType === 'BODY') {
                    return {
                      type: 'body',
                      parameters: orderedParams,
                    };
                  }

                  if (componentType === 'HEADER') {
                    if (component.format === 'TEXT') {
                      return {
                        type: 'header',
                        parameters: orderedParams.slice(0, 1),
                      };
                    }

                    return {
                      type: 'header',
                      parameters: [],
                    };
                  }

                  if (componentType === 'FOOTER') {
                    return {
                      type: 'footer',
                      text: normalizeText(component.text || ''),
                    };
                  }

                  return {
                    ...component,
                    parameters: orderedParams,
                  };
                })
                .filter(Boolean)
            : [{ type: 'body', parameters: orderedParams }];

          messageBody.type = 'template';
          messageBody.template = {
            name: templateName,
            language: { code: templateLanguage || 'en' },
            components,
          };
        }
        else if (type === 'image') {
          messageBody.type = 'image';
          messageBody.image = { link: content };
        }
        else if (type === 'document') {
          messageBody.type = 'document';
          messageBody.document = { link: content, filename: mediaFileName || 'document' };
        }
        else if (type === 'audio') {
          messageBody.type = 'audio';
          messageBody.audio = { link: content };
        }
        else if (type === 'video') {
          messageBody.type = 'video';
          messageBody.video = { link: content };
        }
        // ✨ NEW: Sticker (must be a publicly reachable .webp link)
        else if (type === 'sticker') {
          messageBody.type = 'sticker';
          messageBody.sticker = { link: content };
        }
        // ✨ NEW: Reaction — emoji on a previous message; empty string removes it
        else if (type === 'reaction') {
          if (!replyToWamid) {
            return new Response(JSON.stringify({ success: false, error: 'reactionTargetWamid is required for reaction' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
          delete messageBody.context;
          messageBody.type = 'reaction';
          messageBody.reaction = {
            message_id: replyToWamid,
            emoji: reactionEmoji ?? '',
          };
        }
        else {
          messageBody.type = 'text';
          messageBody.text = { body: normalizeText(content) };
        }

        console.log('📤 Final WhatsApp Payload:', JSON.stringify(messageBody, null, 2));

        const response = await fetch(
          `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(messageBody),
          }
        );

        const data = await response.json();

        if (!response.ok) {

          const errorCode = data?.error?.code || response.status;
          const errorMessage =
            data?.error?.message || 'Failed to send message';

          console.error(
            `❌ WhatsApp Send Error (${errorCode}):`,
            errorMessage
          );

          return new Response(
            JSON.stringify({
              success: false,
              error: errorMessage,
              errorCode,
            }),
            {
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
              },
            }
          );
        }

        const messageId = data?.messages?.[0]?.id;

        console.log('✅ Message sent:', messageId);

        return new Response(
          JSON.stringify({
            success: true,
            messageId,
          }),
          {
            headers: {
              ...corsHeaders,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      case 'test_connection': {
        const { token, phoneNumberId } = params;

        const isValidToken = await testWebhookConnection(token);
        if (!isValidToken) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid WhatsApp access token' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const response = await fetch(
          `${WHATSAPP_API_URL}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await response.json();
        if (!response.ok) {
          return new Response(JSON.stringify({ success: false, error: data?.error?.message || 'Connection failed' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const diagnostics: any = {
          phoneNumberId,
          phoneNumberMatches: String(data?.id || phoneNumberId) === String(phoneNumberId),
          permissions: [],
          missingPermissions: [],
          webhookSubscriptions: [],
          missingWebhookFields: [],
          appMode: 'unknown',
          warnings: [],
        };

        const permissions = await fetchGraphJson('/me/permissions', token);
        if (permissions.ok && Array.isArray(permissions.json?.data)) {
          diagnostics.permissions = permissions.json.data.filter((p: any) => p.status === 'granted').map((p: any) => p.permission);
          diagnostics.missingPermissions = ['whatsapp_business_management', 'whatsapp_business_messaging', 'business_management']
            .filter((permission) => !diagnostics.permissions.includes(permission));
        } else {
          diagnostics.warnings.push(`Could not verify permissions: ${permissions.json?.error?.message || permissions.status}`);
        }

        const subscribedApps = await fetchGraphJson(`/${phoneNumberId}/subscribed_apps`, token);
        if (subscribedApps.ok) {
          const subscribedFields = (subscribedApps.json?.data || []).flatMap((app: any) => app.subscribed_fields || []);
          diagnostics.webhookSubscriptions = [...new Set(subscribedFields)];
          diagnostics.missingWebhookFields = ['messages', 'message_template_status_update', 'message_deliveries', 'message_reads', 'message_reactions']
            .filter((field) => !diagnostics.webhookSubscriptions.includes(field));
        } else {
          diagnostics.warnings.push(`Could not verify webhook subscriptions: ${subscribedApps.json?.error?.message || subscribedApps.status}`);
        }

        if (diagnostics.missingPermissions.length) {
          diagnostics.warnings.push(`Missing token permissions: ${diagnostics.missingPermissions.join(', ')}`);
        }
        if (diagnostics.missingWebhookFields.length) {
          diagnostics.warnings.push(`Missing webhook fields: ${diagnostics.missingWebhookFields.join(', ')}`);
        }
        diagnostics.warnings.push('Confirm the Meta app is Live, the correct WABA is subscribed, and this phone number belongs to the same WABA. These cannot always be verified by API token alone.');

        return new Response(JSON.stringify({ success: true, phoneNumber: data?.display_phone_number || data?.verified_name || phoneNumberId, diagnostics }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'sync_templates': {
        const { token, businessAccountId, userId } = params;
        console.log('📋 [Sync Templates] businessAccountId:', businessAccountId, 'userId:', userId);

        const response = await fetch(`${WHATSAPP_API_URL}/${businessAccountId}/message_templates?limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();

        if (!response.ok) {
          console.error('❌ Template fetch error:', data);
          return new Response(JSON.stringify({ success: false, error: data?.error?.message || 'Failed to fetch templates' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const templates = data?.data || [];
        console.log(`📋 Fetched ${templates.length} templates from Meta`);

        // Delete existing templates for this user and re-insert
        await supabase.from('whatsapp_templates').delete().eq('user_id', userId);

        const rows = templates.map((t: any) => ({
          user_id: userId,
          template_id: t.id,
          name: t.name,
          status: t.status,
          category: t.category,
          language: t.language,
          components: t.components,
        }));

        if (rows.length > 0) {
          const { error: insertErr } = await supabase.from('whatsapp_templates').insert(rows);
          if (insertErr) {
            console.error('❌ Template insert error:', insertErr);
            return new Response(JSON.stringify({ success: false, error: insertErr.message }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        return new Response(JSON.stringify({ success: true, count: rows.length }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_business_profile': {
        const { token, phoneNumberId } = params;
        
        console.log('👤 [WhatsApp API] Fetching business profile for phone:', phoneNumberId);
        
        try {
          // Step 1: Get phone number details (including display number)
          console.log('📱 [WhatsApp API] Step 1: Fetching phone number details...');
          // ✅ CHANGE 3: explicit fields for reliability
          const phoneResponse = await fetch(
            `${WHATSAPP_API_URL}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          
          if (!phoneResponse.ok) {
            const phoneError = await phoneResponse.json();
            console.error('❌ [WhatsApp API] Phone number fetch failed:', phoneError);
            return new Response(JSON.stringify({ 
              success: false, 
              error: phoneError.error?.message || 'Failed to fetch phone number details' 
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          
          const phoneData = await phoneResponse.json();
          // ✅ CHANGE 3: separate phoneNumber (formatted display) from verifiedName (business name)
          const phoneNumber = phoneData.display_phone_number || '';
          const verifiedName = phoneData.verified_name || '';
          console.log('✅ [WhatsApp API] Phone:', phoneNumber, 'Name:', verifiedName);
          
          // Step 2: Get WhatsApp Business Profile
          console.log('🏢 [WhatsApp API] Step 2: Fetching business profile...');
          const profileResponse = await fetch(
            `${WHATSAPP_API_URL}/${phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          
          if (!profileResponse.ok) {
            const profileError = await profileResponse.json();
            console.error('❌ [WhatsApp API] Business profile fetch failed:', profileError);
            
            // If profile doesn't exist, return basic info with phone number
            if (profileError.error?.code === 100 || profileError.error?.message?.includes('does not exist')) {
              console.log('⚠️ [WhatsApp API] No business profile set up, returning basic info');
              return new Response(JSON.stringify({ 
                success: true, 
                phoneNumber,
                profile: {
                  name: verifiedName || phoneNumber || 'Business',
                  description: undefined,
                  vertical: undefined,
                  address: undefined,
                  email: undefined,
                  website: undefined,
                  website2: undefined,
                  profilePictureUrl: undefined,
                }
              }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
            
            return new Response(JSON.stringify({ 
              success: false, 
              error: profileError.error?.message || 'Failed to fetch business profile' 
            }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          }
          
          const profileData = await profileResponse.json();
          const profileInfo = profileData.data?.[0] || {};
          
          console.log('✅ [WhatsApp API] Business profile fetched:', {
            hasAbout: !!profileInfo.about,
            hasDescription: !!profileInfo.description,
            hasVertical: !!profileInfo.vertical,
            hasEmail: !!profileInfo.email,
            hasWebsite: !!profileInfo.websites,
            hasProfilePicture: !!profileInfo.profile_picture_url,
          });

          // ✅ CHANGE 4: handle websites as proper array, expose both entries
          const websites: string[] = Array.isArray(profileInfo.websites)
            ? profileInfo.websites
            : profileInfo.websites
              ? [profileInfo.websites]
              : [];
          
          // Build profile object with all available data
          const profile = {
            // ✅ CHANGE 4: verifiedName is the official Meta display name — use it first
            name: verifiedName || profileInfo.vertical || phoneNumber || 'Business',
            description: profileInfo.about || profileInfo.description || undefined,
            address: profileInfo.address || undefined,
            email: profileInfo.email || undefined,
            website: websites[0] || undefined,
            website2: websites[1] || undefined,  // ✅ CHANGE 4: second website, was previously dropped
            vertical: profileInfo.vertical || undefined,
            profilePictureUrl: profileInfo.profile_picture_url || undefined,
          };
          
          console.log('✅ [WhatsApp API] Returning profile:', {
            name: profile.name,
            hasDescription: !!profile.description,
            hasEmail: !!profile.email,
            hasWebsite: !!profile.website,
            hasWebsite2: !!profile.website2,
          });
          
          return new Response(JSON.stringify({ 
            success: true, 
            phoneNumber,
            profile,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
          
        } catch (error: any) {
          console.error('❌ [WhatsApp API] Fatal error fetching business profile:', error);
          return new Response(JSON.stringify({ 
            success: false, 
            error: error.message || 'Failed to fetch business profile' 
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
    }

  } catch (error) {

    console.error('❌ Fatal error:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
