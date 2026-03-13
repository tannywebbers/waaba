import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const WHATSAPP_API_URL = 'https://graph.facebook.com/v25.0';

serve(async (req) => {
  // Handle CORS preflight FIRST (was at bottom before — should be early)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const userId = url.searchParams.get('user_id');

  console.log('🔔 Webhook request:', req.method, 'userId:', userId);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // ============ WEBHOOK VERIFICATION (GET) ============
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    console.log('🔐 Verification attempt:', { mode, token: token?.substring(0, 8) + '...' });

    if (mode === 'subscribe') {
      let verified = false;

      // Try with userId first
      if (userId) {
        const { data: settings, error } = await supabase
          .from('whatsapp_settings')
          .select('verify_token')
          .eq('user_id', userId)
          .single();

        if (error) console.error('❌ Settings lookup error:', error.message);

        if (settings && settings.verify_token === token) {
          verified = true;
          await supabase.from('whatsapp_settings').update({ is_connected: true }).eq('user_id', userId);
          // Log webhook verification
          await supabase.from('webhook_logs').insert({
            user_id: userId,
            event_type: 'webhook_verified',
            direction: 'incoming',
            status: 'success',
          });
          console.log('✅ Verified for user:', userId);
        }
      }

      // Fallback: match token across all users
      if (!verified) {
        const { data: allSettings, error } = await supabase
          .from('whatsapp_settings')
          .select('user_id, verify_token')
          .eq('verify_token', token);

        if (error) console.error('❌ Token match error:', error.message);

        if (allSettings && allSettings.length > 0) {
          verified = true;
          await supabase.from('whatsapp_settings').update({ is_connected: true }).eq('user_id', allSettings[0].user_id);
          console.log('✅ Verified via token match for user:', allSettings[0].user_id);
        }
      }

      if (verified) {
        return new Response(challenge, { status: 200 });
      }
    }

    console.log('❌ Verification failed');
    return new Response('Forbidden', { status: 403 });
  }

  // ============ INCOMING MESSAGES & STATUS UPDATES (POST) ============
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('📨 Webhook POST body:', JSON.stringify(body).substring(0, 500));

      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value) {
        console.log('⚠️ No value in payload, full body:', JSON.stringify(body));
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      // ---- SETTINGS LOOKUP ----
      let settings: any = null;

      // Method 1: Direct user_id from URL
      if (userId) {
        const { data, error } = await supabase
          .from('whatsapp_settings')
          .select('api_token, user_id, phone_number_id')
          .eq('user_id', userId)
          .eq('is_connected', true)
          .single();

        if (error) {
          console.error('❌ Settings lookup by userId error:', error.message);
        } else {
          settings = data;
          console.log('✅ Found settings via URL userId:', userId);
        }
      }

      // Method 2: Match by phone_number_id from the webhook payload (MOST RELIABLE)
      if (!settings && value.metadata?.phone_number_id) {
        const phoneNumberId = value.metadata.phone_number_id;
        console.log('🔍 Trying to match by phone_number_id:', phoneNumberId);

        const { data, error } = await supabase
          .from('whatsapp_settings')
          .select('api_token, user_id, phone_number_id')
          .eq('phone_number_id', phoneNumberId)
          .eq('is_connected', true)
          .single();

        if (error) {
          console.log('⚠️ No match by phone_number_id:', error.message);
        } else if (data) {
          settings = data;
          console.log('✅ Found settings via phone_number_id:', phoneNumberId, 'user:', data.user_id);
        }
      }

      // Method 3: Fallback — find any connected super user
      if (!settings) {
        console.log('🔍 Fallback: searching all connected settings...');

        const { data: allSettings, error: settingsError } = await supabase
          .from('whatsapp_settings')
          .select('api_token, user_id, phone_number_id')
          .eq('is_connected', true);

        if (settingsError) {
          console.error('❌ All settings query error:', settingsError.message);
        }

        if (allSettings && allSettings.length > 0) {
          // Try to exclude shared users
          const { data: allSharedUserIds, error: sharedError } = await supabase
            .from('shared_inbox_users')
            .select('shared_user_id');

          if (sharedError) {
            console.log('⚠️ shared_inbox_users query error (table may not exist):', sharedError.message);
            settings = allSettings[0];
          } else {
            const excludeIds = (allSharedUserIds || []).map((r: any) => r.shared_user_id);
            settings = allSettings.find((s: any) => !excludeIds.includes(s.user_id)) || allSettings[0];
          }

          if (settings) {
            console.log('✅ Fallback settings found for user:', settings.user_id);
          }
        }
      }

      if (!settings?.api_token || !settings?.user_id) {
        console.error('❌ CRITICAL: No WhatsApp settings found! Cannot process webhook.');
        console.error('   userId param:', userId);
        console.error('   phone_number_id from payload:', value.metadata?.phone_number_id);
        return new Response('OK', { status: 200, headers: corsHeaders });
      }

      const whatsappToken = settings.api_token;
      const settingsUserId = settings.user_id;
      const superUserId = userId || settingsUserId;

      console.log('✅ Processing with user:', settingsUserId, 'superUser:', superUserId);

      // ---- HELPER: Build phone variants ----
      const buildPhoneVariants = (phone: string): string[] => {
        const raw = phone.replace(/^\+/, '');
        const variants = new Set([phone, `+${raw}`, raw]);

        // Nigerian format: 234XXXXXXXXXX ↔ 0XXXXXXXXXX
        if (raw.startsWith('234') && raw.length === 13) {
          variants.add('0' + raw.slice(3));
        }
        if (raw.startsWith('0') && raw.length === 11) {
          variants.add('+234' + raw.slice(1));
          variants.add('234' + raw.slice(1));
        }

        return [...variants];
      };

      // ---- HELPER: Download and upload media ----
      const downloadAndUploadMedia = async (mediaId: string, mediaType: string): Promise<string | null> => {
        try {
          console.log(`📥 Downloading ${mediaType}, mediaId: ${mediaId}`);

          const mediaInfoResponse = await fetch(`${WHATSAPP_API_URL}/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${whatsappToken}` },
          });

          if (!mediaInfoResponse.ok) {
            const errText = await mediaInfoResponse.text();
            console.error('❌ Failed to get media info:', mediaInfoResponse.status, errText);
            return null;
          }

          const mediaInfo = await mediaInfoResponse.json();
          const mediaFileUrl = mediaInfo.url;

          if (!mediaFileUrl) {
            console.error('❌ No URL in media info:', JSON.stringify(mediaInfo));
            return null;
          }

          const mediaResponse = await fetch(mediaFileUrl, {
            headers: { 'Authorization': `Bearer ${whatsappToken}` },
          });

          if (!mediaResponse.ok) {
            console.error('❌ Failed to download media:', mediaResponse.status);
            return null;
          }

          const mediaBlob = await mediaResponse.blob();
          console.log(`✅ Downloaded ${mediaBlob.size} bytes`);

          const mimeType = mediaInfo.mime_type || mediaResponse.headers.get('content-type') || 'application/octet-stream';
          let extension = 'bin';

          if (mimeType.includes('image/jpeg') || mimeType.includes('image/jpg')) extension = 'jpg';
          else if (mimeType.includes('image/png')) extension = 'png';
          else if (mimeType.includes('image/webp')) extension = 'webp';
          else if (mimeType.includes('video/mp4')) extension = 'mp4';
          else if (mimeType.includes('audio/ogg')) extension = 'ogg';
          else if (mimeType.includes('audio/mpeg')) extension = 'mp3';
          else if (mimeType.includes('audio/opus')) extension = 'opus';
          else if (mimeType.includes('audio/')) extension = 'webm';
          else if (mimeType.includes('application/pdf')) extension = 'pdf';
          else if (mimeType.includes('application/vnd.openxmlformats-officedocument')) extension = 'docx';

          const fileName = `whatsapp/${superUserId}/${Date.now()}_${mediaId.slice(-6)}.${extension}`;
          console.log(`📤 Uploading to storage: ${fileName}`);

          const { error: uploadError } = await supabase.storage
            .from('chat-media')
            .upload(fileName, mediaBlob, {
              contentType: mimeType,
              cacheControl: '3600',
            });

          if (uploadError) {
            console.error('❌ Upload error:', uploadError);
            return null;
          }

          const { data: urlData } = supabase.storage
            .from('chat-media')
            .getPublicUrl(fileName);

          console.log('✅ Media uploaded:', urlData.publicUrl.substring(0, 80));
          return urlData.publicUrl;

        } catch (err) {
          console.error('❌ Media processing error:', err);
          return null;
        }
      };

      // ---- HELPER: Find or create contact ----
      const findOrCreateContact = async (from: string, profileName?: string) => {
        const phoneVariants = buildPhoneVariants(from);
        console.log('📱 Phone variants:', phoneVariants);

        let contactId: string | null = null;
        let targetUserId = superUserId;

        // Get shared users for this super user
        let sharedUserIds: string[] = [];
        const { data: sharedUsers, error: sharedErr } = await supabase
          .from('shared_inbox_users')
          .select('shared_user_id')
          .eq('super_user_id', superUserId)
          .eq('status', 'active');

        if (sharedErr) {
          console.log('⚠️ shared_inbox_users error:', sharedErr.message);
        } else {
          sharedUserIds = (sharedUsers || []).map(s => s.shared_user_id);
        }

        // Step 1: Check shared user contacts (batch query with IN)
        if (sharedUserIds.length > 0) {
          const { data: sharedContacts } = await supabase
            .from('contacts')
            .select('id, user_id, assigned_user_id')
            .in('phone', phoneVariants)
            .in('user_id', sharedUserIds)
            .limit(1);

          if (sharedContacts && sharedContacts.length > 0) {
            contactId = sharedContacts[0].id;
            targetUserId = sharedContacts[0].user_id;
            console.log('✅ Found in shared user contacts:', contactId, '→', targetUserId);

            await supabase.from('contacts').update({
              last_seen: new Date().toISOString(),
              is_online: true,
            }).eq('id', contactId);
          }
        }

        // Step 2: Check super user contacts (batch query with IN)
        if (!contactId) {
          const { data: contacts } = await supabase
            .from('contacts')
            .select('id, user_id, assigned_user_id, name')
            .in('phone', phoneVariants)
            .eq('user_id', superUserId)
            .limit(1);

          if (contacts && contacts.length > 0) {
            contactId = contacts[0].id;

            if (contacts[0].assigned_user_id) {
              const isActive = sharedUserIds.includes(contacts[0].assigned_user_id);
              if (isActive) {
                targetUserId = contacts[0].assigned_user_id;
                console.log('✅ Routed to assigned shared user:', targetUserId);
              } else {
                targetUserId = superUserId;
                await supabase.from('contacts').update({ assigned_user_id: null }).eq('id', contactId);
                console.log('⚠️ Assigned user inactive, reset to super user');
              }
            } else {
              targetUserId = superUserId;
            }

            await supabase.from('contacts').update({
              last_seen: new Date().toISOString(),
              is_online: true,
            }).eq('id', contactId);

            console.log('✅ Found in super user contacts:', contactId);
          }
        }

        // Step 3: Auto-create contact
        if (!contactId) {
          const contactName = profileName || from;
          console.log('👤 Creating contact:', contactName, from);

          const { data: newContact, error: createError } = await supabase
            .from('contacts')
            .insert({
              user_id: superUserId,
              name: contactName,
              phone: from,
              loan_id: `WA-${Date.now()}`,
              last_seen: new Date().toISOString(),
              is_online: true,
            })
            .select('id')
            .single();

          if (createError) {
            console.error('❌ Contact creation error:', createError.message);

            // Race condition: contact may have been created between our check and insert
            // Retry lookup
            const { data: retryContacts } = await supabase
              .from('contacts')
              .select('id, assigned_user_id')
              .in('phone', phoneVariants)
              .eq('user_id', superUserId)
              .limit(1);

            if (retryContacts && retryContacts.length > 0) {
              contactId = retryContacts[0].id;
              targetUserId = retryContacts[0].assigned_user_id || superUserId;
              console.log('✅ Found contact on retry:', contactId);
            }
          } else {
            contactId = newContact.id;
            targetUserId = superUserId;
            console.log('✅ Contact created:', contactId);
          }
        }

        return { contactId, targetUserId };
      };

      // ============ PROCESS INCOMING MESSAGES ============
      if (value.messages?.length > 0) {
        for (const message of value.messages) {
          const from = message.from;
          const messageId = message.id;

          console.log(`📩 Message from ${from}, type: ${message.type}, id: ${messageId}`);

          // Duplicate check FIRST (avoid unnecessary processing)
          const { data: existing } = await supabase
            .from('messages')
            .select('id')
            .eq('whatsapp_message_id', messageId)
            .limit(1);

          if (existing && existing.length > 0) {
            console.log('⚠️ Duplicate message, skipping:', messageId);
            continue;
          }

          let content = '';
          let type = 'text';
          let mediaUrl = null;

          // Handle message types
          switch (message.type) {
            case 'text':
              content = message.text?.body || '';
              break;

            case 'button':
              content = message.button?.text || message.button?.payload || '[Button]';
              type = 'text';
              break;

            case 'interactive':
              if (message.interactive?.type === 'button_reply') {
                content = message.interactive.button_reply?.title || '[Button]';
              } else if (message.interactive?.type === 'list_reply') {
                content = message.interactive.list_reply?.title || '[List item]';
              } else {
                content = `[Interactive: ${message.interactive?.type || 'unknown'}]`;
              }
              type = 'text';
              break;

            case 'image':
              type = 'image';
              content = message.image?.caption || '[Image]';
              if (message.image?.id) {
                mediaUrl = await downloadAndUploadMedia(message.image.id, 'image');
              }
              break;

            case 'document':
              type = 'document';
              content = message.document?.filename || message.document?.caption || '[Document]';
              if (message.document?.id) {
                mediaUrl = await downloadAndUploadMedia(message.document.id, 'document');
              }
              break;

            case 'audio':
              type = 'audio';
              content = '[Voice Message]';
              if (message.audio?.id) {
                mediaUrl = await downloadAndUploadMedia(message.audio.id, 'audio');
              }
              break;

            case 'video':
              type = 'video';
              content = message.video?.caption || '[Video]';
              if (message.video?.id) {
                mediaUrl = await downloadAndUploadMedia(message.video.id, 'video');
              }
              break;

            case 'sticker':
              type = 'image';
              content = '[Sticker]';
              if (message.sticker?.id) {
                mediaUrl = await downloadAndUploadMedia(message.sticker.id, 'sticker');
              }
              break;

            case 'reaction':
              type = 'text';
              content = message.reaction?.emoji || '[Reaction]';
              console.log('😀 Reaction:', content);
              break;

            case 'location':
              type = 'text';
              content = `[Location: ${message.location?.latitude}, ${message.location?.longitude}]`;
              break;

            case 'contacts':
              type = 'text';
              const contactName = message.contacts?.[0]?.name?.formatted_name || 'Unknown';
              content = `[Contact: ${contactName}]`;
              break;

            default:
              content = `[${message.type || 'unknown'}]`;
              console.log('⚠️ Unhandled message type:', message.type, JSON.stringify(message).substring(0, 200));
              break;
          }

          // Find or create contact
          const profileName = value.contacts?.[0]?.profile?.name;
          const { contactId, targetUserId } = await findOrCreateContact(from, profileName);

          if (!contactId || !targetUserId) {
            console.error('❌ Cannot route message — no contact/user for:', from);
            continue;
          }

          // Insert message
          const { error: msgError } = await supabase
            .from('messages')
            .insert({
              user_id: targetUserId,
              contact_id: contactId,
              content,
              type,
              status: 'delivered',
              is_outgoing: false,
              media_url: mediaUrl,
              whatsapp_message_id: messageId,
            });

          if (msgError) {
            console.error('❌ Insert message error:', msgError.message, msgError.details);
            // Log error
            await supabase.from('webhook_logs').insert({
              user_id: targetUserId,
              event_type: 'error',
              direction: 'incoming',
              phone_number: from,
              message_type: type,
              error: msgError.message,
              payload: { messageId, content: content.substring(0, 100) },
            });
          } else {
            console.log('✅ Message saved:', {
              contact_id: contactId,
              target_user: targetUserId,
              type,
              has_media: !!mediaUrl,
              content_preview: content.substring(0, 40),
            });
            // Log successful message
            await supabase.from('webhook_logs').insert({
              user_id: targetUserId,
              event_type: 'message_received',
              direction: 'incoming',
              phone_number: from,
              message_type: type,
              status: 'delivered',
              payload: { messageId, content: content.substring(0, 100), has_media: !!mediaUrl },
            });
          }
        }
      }

      // ============ PROCESS STATUS UPDATES ============
      if (value.statuses?.length > 0) {
        for (const status of value.statuses) {
          const waMessageId = status.id;
          const newStatus = status.status; // sent, delivered, read, failed
          const statusTimestamp = status.timestamp
            ? new Date(parseInt(status.timestamp) * 1000).toISOString()
            : new Date().toISOString();

          console.log(`📊 Status: ${waMessageId} → ${newStatus}`);

          // Handle failed status with error info
          if (newStatus === 'failed' && status.errors?.length > 0) {
            console.error('❌ Message failed:', JSON.stringify(status.errors));
          }

          const { data: updated, error: updateError } = await supabase
            .from('messages')
            .update({ status: newStatus })
            .eq('whatsapp_message_id', waMessageId)
            .select('id, contact_id');

          if (updateError) {
            console.error('❌ Status update error:', updateError.message);
          } else if (updated && updated.length > 0) {
            console.log('✅ Status updated for', updated.length, 'message(s)');
            // Log status update
            await supabase.from('webhook_logs').insert({
              user_id: settingsUserId,
              event_type: 'status_update',
              direction: 'incoming',
              phone_number: status.recipient_id,
              status: newStatus,
              payload: { waMessageId, timestamp: statusTimestamp },
            });

            // Update contact activity
            const contactId = updated[0].contact_id;
            if (contactId && (newStatus === 'delivered' || newStatus === 'read')) {
              const contactUpdate: Record<string, any> = {
                last_seen: statusTimestamp,
              };
              if (newStatus === 'read') {
                contactUpdate.is_online = true;
              }
              await supabase.from('contacts').update(contactUpdate).eq('id', contactId);
            }
          } else {
            console.log('⚠️ No message found for status update. waMessageId:', waMessageId);
            console.log('   This likely means the outgoing message was not stored with whatsapp_message_id');
            console.log('   Status recipient:', status.recipient_id);
          }
        }
      }

      return new Response('OK', { status: 200, headers: corsHeaders });
    } catch (error) {
      console.error('❌ Webhook processing error:', error);
      // Still return 200 to prevent Meta from retrying and creating duplicates
      return new Response('OK', { status: 200, headers: corsHeaders });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
