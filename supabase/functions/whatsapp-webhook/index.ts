import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const WHATSAPP_API_URL = 'https://graph.facebook.com/v25.0';

const okResponse = () => new Response('OK', { status: 200, headers: corsHeaders });

const createSupabaseAdmin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

const logWebhookEvent = async (supabase: any, payload: Record<string, any>) => {
  const { error } = await supabase.from('webhook_logs').insert(payload);
  if (error) {
    console.error('❌ Failed to log webhook event:', error.message);
  }
};

const getSettingsByUserId = async (supabase: any, userId: string) => {
  const { data, error } = await supabase
    .from('whatsapp_settings')
    .select('user_id, api_token, phone_number_id, verify_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('❌ Settings lookup by user_id failed:', error.message);
    return null;
  }

  return data;
};

const getSettingsByPhoneNumberId = async (supabase: any, phoneNumberId: string) => {
  const { data, error } = await supabase
    .from('whatsapp_settings')
    .select('user_id, api_token, phone_number_id, verify_token')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  if (error) {
    console.error('❌ Settings lookup by phone_number_id failed:', error.message);
    return null;
  }

  return data;
};

const buildPhoneVariants = (phone: string): string[] => {
  const raw = phone.replace(/^\+/, '');
  const variants = new Set([phone, `+${raw}`, raw]);

  if (raw.startsWith('234') && raw.length === 13) {
    variants.add('0' + raw.slice(3));
  }

  if (raw.startsWith('0') && raw.length === 11) {
    variants.add('+234' + raw.slice(1));
    variants.add('234' + raw.slice(1));
  }

  return [...variants];
};

const downloadAndUploadMedia = async (
  supabase: any,
  whatsappToken: string,
  ownerUserId: string,
  mediaId: string,
  mediaType: string,
) => {
  try {
    console.log(`📥 Downloading ${mediaType}, mediaId: ${mediaId}`);

    const mediaInfoResponse = await fetch(`${WHATSAPP_API_URL}/${mediaId}`, {
      headers: { Authorization: `Bearer ${whatsappToken}` },
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
      headers: { Authorization: `Bearer ${whatsappToken}` },
    });

    if (!mediaResponse.ok) {
      console.error('❌ Failed to download media:', mediaResponse.status);
      return null;
    }

    const mediaBlob = await mediaResponse.blob();
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

    const fileName = `whatsapp/${ownerUserId}/${Date.now()}_${mediaId.slice(-6)}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(fileName, mediaBlob, {
        contentType: mimeType,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('❌ Upload error:', uploadError.message);
      return null;
    }

    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(fileName);
    return urlData.publicUrl;
  } catch (error) {
    console.error('❌ Media processing error:', error);
    return null;
  }
};

const findOrCreateContact = async (
  supabase: any,
  superUserId: string,
  from: string,
  profileName?: string,
) => {
  const phoneVariants = buildPhoneVariants(from);
  let contactId: string | null = null;
  let targetUserId = superUserId;

  const { data: sharedUsers, error: sharedErr } = await supabase
    .from('shared_inbox_users')
    .select('shared_user_id')
    .eq('super_user_id', superUserId)
    .eq('status', 'active');

  const sharedUserIds = sharedErr ? [] : (sharedUsers || []).map((user: any) => user.shared_user_id);

  if (sharedErr) {
    console.log('⚠️ shared_inbox_users lookup failed:', sharedErr.message);
  }

  if (sharedUserIds.length > 0) {
    const { data: sharedContacts } = await supabase
      .from('contacts')
      .select('id, user_id')
      .in('phone', phoneVariants)
      .in('user_id', sharedUserIds)
      .limit(1);

    if (sharedContacts?.length) {
      contactId = sharedContacts[0].id;
      targetUserId = sharedContacts[0].user_id;

      await supabase
        .from('contacts')
        .update({ last_seen: new Date().toISOString(), is_online: true })
        .eq('id', contactId);
    }
  }

  if (!contactId) {
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, assigned_user_id')
      .in('phone', phoneVariants)
      .eq('user_id', superUserId)
      .limit(1);

    if (contacts?.length) {
      contactId = contacts[0].id;
      const assignedUserId = contacts[0].assigned_user_id;

      if (assignedUserId && sharedUserIds.includes(assignedUserId)) {
        targetUserId = assignedUserId;
      } else {
        targetUserId = superUserId;

        if (assignedUserId) {
          await supabase.from('contacts').update({ assigned_user_id: null }).eq('id', contactId);
        }
      }

      await supabase
        .from('contacts')
        .update({ last_seen: new Date().toISOString(), is_online: true })
        .eq('id', contactId);
    }
  }

  if (!contactId) {
    const { data: newContact, error: createError } = await supabase
      .from('contacts')
      .insert({
        user_id: superUserId,
        name: profileName || from,
        phone: from,
        loan_id: `WA-${Date.now()}`,
        last_seen: new Date().toISOString(),
        is_online: true,
      })
      .select('id')
      .maybeSingle();

    if (createError) {
      console.error('❌ Contact creation error:', createError.message);

      const { data: retryContacts } = await supabase
        .from('contacts')
        .select('id, assigned_user_id')
        .in('phone', phoneVariants)
        .eq('user_id', superUserId)
        .limit(1);

      if (retryContacts?.length) {
        contactId = retryContacts[0].id;
        targetUserId = retryContacts[0].assigned_user_id || superUserId;
      }
    } else if (newContact) {
      contactId = newContact.id;
      targetUserId = superUserId;
    }
  }

  return { contactId, targetUserId };
};

const processIncomingMessages = async (
  supabase: any,
  value: any,
  whatsappToken: string,
  settingsUserId: string,
  superUserId: string,
) => {
  for (const message of value.messages || []) {
    const from = message.from;
    const messageId = message.id;

    console.log(`📩 Message from ${from}, type: ${message.type}, id: ${messageId}`);

    const { data: existing } = await supabase
      .from('messages')
      .select('id')
      .eq('whatsapp_message_id', messageId)
      .maybeSingle();

    if (existing) {
      console.log('⚠️ Duplicate message, skipping:', messageId);
      continue;
    }

    let content = '';
    let type = 'text';
    let mediaUrl = null;

    switch (message.type) {
      case 'text':
        content = message.text?.body || '';
        break;
      case 'button':
        content = message.button?.text || message.button?.payload || '[Button]';
        break;
      case 'interactive':
        if (message.interactive?.type === 'button_reply') {
          content = message.interactive.button_reply?.title || '[Button]';
        } else if (message.interactive?.type === 'list_reply') {
          content = message.interactive.list_reply?.title || '[List item]';
        } else {
          content = `[Interactive: ${message.interactive?.type || 'unknown'}]`;
        }
        break;
      case 'image':
        type = 'image';
        content = message.image?.caption || '[Image]';
        if (message.image?.id) {
          mediaUrl = await downloadAndUploadMedia(supabase, whatsappToken, superUserId, message.image.id, 'image');
        }
        break;
      case 'document':
        type = 'document';
        content = message.document?.filename || message.document?.caption || '[Document]';
        if (message.document?.id) {
          mediaUrl = await downloadAndUploadMedia(supabase, whatsappToken, superUserId, message.document.id, 'document');
        }
        break;
      case 'audio':
        type = 'audio';
        content = '[Voice Message]';
        if (message.audio?.id) {
          mediaUrl = await downloadAndUploadMedia(supabase, whatsappToken, superUserId, message.audio.id, 'audio');
        }
        break;
      case 'video':
        type = 'video';
        content = message.video?.caption || '[Video]';
        if (message.video?.id) {
          mediaUrl = await downloadAndUploadMedia(supabase, whatsappToken, superUserId, message.video.id, 'video');
        }
        break;
      case 'sticker':
        type = 'image';
        content = '[Sticker]';
        if (message.sticker?.id) {
          mediaUrl = await downloadAndUploadMedia(supabase, whatsappToken, superUserId, message.sticker.id, 'sticker');
        }
        break;
      case 'reaction':
        content = message.reaction?.emoji || '[Reaction]';
        break;
      case 'location':
        content = `[Location: ${message.location?.latitude}, ${message.location?.longitude}]`;
        break;
      case 'contacts':
        content = `[Contact: ${message.contacts?.[0]?.name?.formatted_name || 'Unknown'}]`;
        break;
      default:
        content = `[${message.type || 'unknown'}]`;
        console.log('⚠️ Unhandled message type:', message.type);
        break;
    }

    const profileName = value.contacts?.[0]?.profile?.name;
    const { contactId, targetUserId } = await findOrCreateContact(supabase, superUserId, from, profileName);

    if (!contactId || !targetUserId) {
      console.error('❌ Cannot route message — no contact/user for:', from);
      continue;
    }

    const { error: msgError } = await supabase.from('messages').insert({
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
      console.error('❌ Insert message error:', msgError.message);
      await logWebhookEvent(supabase, {
        user_id: targetUserId,
        event_type: 'error',
        direction: 'incoming',
        phone_number: from,
        message_type: type,
        error: msgError.message,
        payload: { messageId, content: content.substring(0, 100) },
      });
      continue;
    }

    await logWebhookEvent(supabase, {
      user_id: targetUserId,
      event_type: 'message_received',
      direction: 'incoming',
      phone_number: from,
      message_type: type,
      status: 'delivered',
      payload: { messageId, content: content.substring(0, 100), has_media: !!mediaUrl },
    });

    try {
      const { data: pushTokens } = await supabase
        .from('push_tokens')
        .select('token')
        .eq('user_id', targetUserId);

      if (pushTokens?.length) {
        const profileDisplayName = value.contacts?.[0]?.profile?.name || from;
        const notifBody = type === 'text' ? content.substring(0, 200) : `[${type}]`;

        for (const pushToken of pushTokens) {
          try {
            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                token: pushToken.token,
                title: profileDisplayName,
                body: notifBody,
                data: { contactId, type, from },
              }),
            });
          } catch (pushError) {
            console.error('❌ Push send error:', pushError);
          }
        }
      }
    } catch (pushError) {
      console.error('❌ Push notification error:', pushError);
    }
  }
};

const processStatuses = async (supabase: any, value: any, settingsUserId: string) => {
  for (const status of value.statuses || []) {
    const waMessageId = status.id;
    const newStatus = status.status;
    const statusTimestamp = status.timestamp
      ? new Date(parseInt(status.timestamp, 10) * 1000).toISOString()
      : new Date().toISOString();

    const { data: updated, error: updateError } = await supabase
      .from('messages')
      .update({ status: newStatus })
      .eq('whatsapp_message_id', waMessageId)
      .select('id, contact_id');

    if (updateError) {
      console.error('❌ Status update error:', updateError.message);
      continue;
    }

    if (!updated?.length) {
      console.log('⚠️ No message found for status update:', waMessageId);
      continue;
    }

    await logWebhookEvent(supabase, {
      user_id: settingsUserId,
      event_type: 'status_update',
      direction: 'incoming',
      phone_number: status.recipient_id,
      status: newStatus,
      payload: { waMessageId, timestamp: statusTimestamp },
    });

    const contactId = updated[0].contact_id;
    if (contactId && (newStatus === 'delivered' || newStatus === 'read')) {
      const contactUpdate: Record<string, any> = { last_seen: statusTimestamp };

      if (newStatus === 'read') {
        contactUpdate.is_online = true;
      }

      await supabase.from('contacts').update(contactUpdate).eq('id', contactId);
    }
  }
};

const processWebhookPayload = async (
  supabase: any,
  body: any,
  explicitUserId: string | null,
  settings: any,
) => {
  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  if (!value) {
    console.log('⚠️ No value in payload, skipping processing');
    return;
  }

  if (!settings?.api_token || !settings?.user_id) {
    console.log('⚠️ Strict mapping failed, webhook acknowledged without processing');
    return;
  }

  const settingsUserId = settings.user_id;
  const superUserId = explicitUserId || settingsUserId;

  if (value.messages?.length) {
    await processIncomingMessages(supabase, value, settings.api_token, settingsUserId, superUserId);
  }

  if (value.statuses?.length) {
    await processStatuses(supabase, value, settingsUserId);
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log('WEBHOOK HIT:', new Date().toISOString());

  const supabase = createSupabaseAdmin();
  const url = new URL(req.url);
  const explicitUserId = url.searchParams.get('user_id');

  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode !== 'subscribe' || !token || !challenge || !explicitUserId) {
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    const settings = await getSettingsByUserId(supabase, explicitUserId);

    if (!settings?.verify_token || settings.verify_token !== token) {
      console.log('❌ Verification failed for user:', explicitUserId);
      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    await logWebhookEvent(supabase, {
      user_id: explicitUserId,
      event_type: 'webhook_verified',
      direction: 'incoming',
      status: 'success',
    });

    return new Response(challenge, { status: 200, headers: corsHeaders });
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const phoneNumberId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id || null;

      let settings = null;
      if (explicitUserId) {
        settings = await getSettingsByUserId(supabase, explicitUserId);
      }

      if (!settings && phoneNumberId) {
        settings = await getSettingsByPhoneNumberId(supabase, phoneNumberId);
      }

      const resolvedUserId = settings?.user_id || explicitUserId || null;

      await logWebhookEvent(supabase, {
        user_id: resolvedUserId,
        event_type: 'raw_webhook',
        direction: 'incoming',
        payload: body,
      });

      const processPromise = processWebhookPayload(supabase, body, explicitUserId, settings)
        .catch((error) => {
          console.error('❌ Webhook processing error:', error);
        });

      const edgeRuntime = (globalThis as typeof globalThis & {
        EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
      }).EdgeRuntime;

      if (edgeRuntime?.waitUntil) {
        edgeRuntime.waitUntil(processPromise);
        return okResponse();
      }

      await processPromise;
      return okResponse();
    } catch (error) {
      console.error('❌ Webhook request parsing error:', error);
      return okResponse();
    }
  }

  return new Response('Method not allowed', { status: 405, headers: corsHeaders });
});
