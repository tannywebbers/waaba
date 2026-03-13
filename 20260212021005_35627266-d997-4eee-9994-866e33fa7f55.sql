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
          mediaFileName
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

        /**
         * TEMPLATE MESSAGE
         */
        if (type === 'template' && templateName) {

          console.log('📋 Building template:', templateName);

          let orderedParams: any[] = [];

          if (templateParams) {
            orderedParams = Object.entries(templateParams)
              .sort(([a], [b]) => {
                const numA = parseInt(a.replace(/\D/g, '')) || 0;
                const numB = parseInt(b.replace(/\D/g, '')) || 0;
                return numA - numB;
              })
              .map(([, value]) => {

                const normalized = normalizeText(value);

                return {
                  type: 'text',
                  text: normalized || ' ',
                };
              });
          }

          messageBody.type = 'template';

          messageBody.template = {
            name: templateName,
            language: { code: templateLanguage || 'en' },
            components: [
              {
                type: 'body',
                parameters: orderedParams,
              },
            ],
          };
        }

        /**
         * IMAGE MESSAGE
         */
        else if (type === 'image') {
          messageBody.type = 'image';
          messageBody.image = {
            link: content,
          };
        }

        /**
         * DOCUMENT MESSAGE
         */
        else if (type === 'document') {
          messageBody.type = 'document';
          messageBody.document = {
            link: content,
            filename: mediaFileName || 'document',
          };
        }

        /**
         * AUDIO MESSAGE
         */
        else if (type === 'audio') {
          messageBody.type = 'audio';
          messageBody.audio = {
            link: content,
          };
        }

        /**
         * TEXT MESSAGE
         */
        else {

          const normalizedContent = normalizeText(content);

          messageBody.type = 'text';

          messageBody.text = {
            body: normalizedContent,
          };
        }

        console.log(
          '📤 Final WhatsApp Payload:',
          JSON.stringify(messageBody, null, 2)
        );

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
        // ✅ CHANGE 2: explicit fields so display_phone_number & verified_name always return
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
        return new Response(JSON.stringify({ success: true, phoneNumber: data?.display_phone_number || data?.verified_name || phoneNumberId }), {
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
