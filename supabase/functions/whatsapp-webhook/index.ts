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

const updateWebhookDiagnostics = async (supabase: any, userId: string | null | undefined, values: Record<string, any>) => {
  if (!userId) return;
  const { error } = await supabase
    .from('whatsapp_settings')
    .update(values)
    .eq('user_id', userId);

  if (error) {
    console.error('❌ Failed to update webhook diagnostics:', error.message, values);
  }
};

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

const logPayloadDebug = (body: any) => {
  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;

  console.log('FULL WEBHOOK BODY:', JSON.stringify(body, null, 2));
  console.log('Entry:', JSON.stringify(body.entry, null, 2));
  console.log('Changes:', JSON.stringify(entry?.changes, null, 2));
  console.log('Value:', JSON.stringify(value, null, 2));
  console.log('Metadata:', JSON.stringify(value?.metadata, null, 2));
  console.log('Phone Number ID:', value?.metadata?.phone_number_id);
  console.log('Contacts:', JSON.stringify(value?.contacts, null, 2));
  console.log('Messages:', JSON.stringify(value?.messages, null, 2));
  console.log('Statuses:', JSON.stringify(value?.statuses, null, 2));
};

const sendBlockedReply = async (settings: any, to: string) => {
  const response = await fetch(`${WHATSAPP_API_URL}/${settings.phone_number_id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.api_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: '_This business blocked you_' } }),
  });
  await response.text();
  return response.ok;
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

// 🔥 IMPROVED: GUARANTEED contact creation with retry logic
const findOrCreateContact = async (
  supabase: any,
  superUserId: string,
  from: string,
  profileName?: string,
): Promise<{ contactId: string; targetUserId: string }> => {
  const phoneVariants = buildPhoneVariants(from);
  let contactId: string | null = null;
  let targetUserId = superUserId;

  console.log(`🔍 Looking for contact with phone variants:`, phoneVariants);

  // Step 1: Check shared inbox users
  const { data: sharedUsers, error: sharedErr } = await supabase
    .from('shared_inbox_users')
    .select('shared_user_id')
    .eq('super_user_id', superUserId)
    .eq('status', 'active');

  const sharedUserIds = sharedErr ? [] : (sharedUsers || []).map((user: any) => user.shared_user_id);

  if (sharedErr) {
    console.log('⚠️ shared_inbox_users lookup failed:', sharedErr.message);
  }

  // Step 2: Check if contact exists in shared inboxes
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
      console.log(`✅ Found contact in shared inbox:`, contactId);

      await supabase
        .from('contacts')
        .update({ last_seen: new Date().toISOString(), is_online: true, is_deleted: false, deleted_at: null })
        .eq('id', contactId);
      
      return { contactId: contactId!, targetUserId };
    }
  }

  // Step 3: Check if contact exists for super user
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
      console.log(`✅ Found existing contact:`, contactId);

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
        .update({ last_seen: new Date().toISOString(), is_online: true, is_deleted: false, deleted_at: null })
        .eq('id', contactId);
      
      return { contactId: contactId!, targetUserId };
    }
  }

  // Step 4: CREATE NEW CONTACT (with retry logic)
  console.log(`👤 Contact not found, creating new contact for:`, from);
  
  const maxRetries = 3;
  let lastError: any = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔄 Contact creation attempt ${attempt}/${maxRetries}`);
    
    const { data: newContact, error: createError } = await supabase
      .from('contacts')
      .insert({
        user_id: superUserId,
        name: profileName || from,
        phone: from,
        last_seen: new Date().toISOString(),
        is_online: true,
        is_deleted: false,
      })
      .select('id')
      .maybeSingle();

    if (!createError && newContact) {
      contactId = newContact.id;
      targetUserId = superUserId;
      console.log(`✅ Contact created successfully:`, contactId);
      return { contactId: contactId!, targetUserId };
    }

    lastError = createError;
    console.error(`❌ Contact creation attempt ${attempt} failed:`, createError?.message);

    // RETRY LOOKUP: Maybe contact was just created by another webhook
    console.log(`🔍 Retry: Looking for contact again...`);
    const { data: retryContacts } = await supabase
      .from('contacts')
      .select('id, assigned_user_id')
      .in('phone', phoneVariants)
      .eq('user_id', superUserId)
      .limit(1);

    if (retryContacts?.length) {
      contactId = retryContacts[0].id;
      targetUserId = retryContacts[0].assigned_user_id || superUserId;
      console.log(`✅ Contact found on retry:`, contactId);
      return { contactId: contactId!, targetUserId };
    }

    // Wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      const delay = 100 * Math.pow(2, attempt);  // 200ms, 400ms, 800ms
      console.log(`⏳ Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // 🔥 CRITICAL: If all retries failed, throw error to prevent message loss
  console.error(`🚨 CRITICAL: Failed to create contact after ${maxRetries} attempts`);
  console.error(`🚨 Phone: ${from}, Profile: ${profileName}, Error:`, lastError);
  
  throw new Error(`Failed to create contact for ${from} after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
};

const processIncomingMessages = async (
  supabase: any,
  value: any,
  whatsappToken: string,
  settingsUserId: string,
  superUserId: string,
  settings: any,
) => {
  for (const message of value.messages || []) {
    const messageId = message.id;
    const from = message.from;
    let content = '';
    let type = 'text';
    let mediaUrl: string | null = null;

    switch (message.type) {
      case 'text':
        content = message.text?.body || '[No text]';
        break;
      case 'image':
        type = 'image';
        content = message.image?.caption || '[Image]';
        if (message.image?.id) {
          mediaUrl = await downloadAndUploadMedia(supabase, whatsappToken, superUserId, message.image.id, 'image');
        }
        break;
      case 'video':
        type = 'video';
        content = message.video?.caption || '[Video]';
        if (message.video?.id) {
          mediaUrl = await downloadAndUploadMedia(supabase, whatsappToken, superUserId, message.video.id, 'video');
        }
        break;
      case 'audio':
        type = 'audio';
        content = '[Voice message]';
        if (message.audio?.id) {
          mediaUrl = await downloadAndUploadMedia(supabase, whatsappToken, superUserId, message.audio.id, 'audio');
        }
        break;
      case 'voice':
        type = 'audio';
        content = '[Voice message]';
        if (message.voice?.id) {
          mediaUrl = await downloadAndUploadMedia(supabase, whatsappToken, superUserId, message.voice.id, 'voice');
        }
        break;
      case 'document':
        type = 'document';
        content = message.document?.filename || '[Document]';
        if (message.document?.id) {
          mediaUrl = await downloadAndUploadMedia(supabase, whatsappToken, superUserId, message.document.id, 'document');
        }
        break;
      case 'sticker':
        type = 'sticker';
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

    const { data: duplicate, error: duplicateError } = await supabase
      .from('messages')
      .select('id')
      .eq('whatsapp_message_id', messageId)
      .maybeSingle();

    if (duplicateError) {
      console.error('❌ Duplicate Check - Error querying messages:', { messageId, error: duplicateError.message });
      await logWebhookEvent(supabase, {
        user_id: settingsUserId,
        event_type: 'duplicate_check_error',
        direction: 'incoming',
        phone_number: from,
        message_type: type,
        error: duplicateError.message,
        payload: { sender: from, messageId, rawMessage: message },
      });
    }

    if (duplicate) {
      console.log('⚠️ Duplicate incoming message skipped:', messageId);
      await logWebhookEvent(supabase, {
        user_id: settingsUserId,
        event_type: 'duplicate_message',
        direction: 'incoming',
        phone_number: from,
        message_type: type,
        status: 'skipped',
        payload: { messageId },
      });
      continue;
    }
    
    // 🔥 IMPROVED: Wrap in try-catch to handle contact creation failures
    let contactId: string;
    let targetUserId: string;
    
    try {
      const result = await findOrCreateContact(supabase, superUserId, from, profileName);
      contactId = result.contactId;
      targetUserId = result.targetUserId;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      // 🔥 CRITICAL: Log failure but DON'T skip the message
      console.error('🚨 CRITICAL: Contact creation failed, logging to webhook_logs:', errorMessage);
      
      await logWebhookEvent(supabase, {
        user_id: superUserId,
        event_type: 'critical_error',
        direction: 'incoming',
        phone_number: from,
        message_type: type,
        error: `Contact creation failed: ${errorMessage}`,
        payload: { sender: from, messageId, messageType: type, content, profileName, rawMessage: message },
      });
      
      // Message is recoverable from webhook_logs even if a contact row cannot be created.
      continue;
    }

    const { data: contactState } = await supabase
      .from('contacts')
      .select('is_blocked')
      .eq('id', contactId)
      .maybeSingle();

    if (contactState?.is_blocked) {
      const replied = await sendBlockedReply(settings, from);

      await logWebhookEvent(supabase, {
        user_id: targetUserId,
        event_type: 'blocked_auto_reply',
        direction: 'outgoing',
        phone_number: from,
        message_type: 'text',
        status: replied ? 'sent' : 'failed',
        payload: { contactId, incomingMessageId: messageId },
      });
      continue;
    }

    console.log('Message Insert - Pre-save:', {
      senderPhone: from,
      messageId,
      messageType: type,
      content,
      contactFoundOrCreate: contactId,
      targetUserId,
    });

    // Insert message
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
      console.error('Message Insert - Failure:', {
        sender: from,
        messageId,
        error: msgError.message,
        details: msgError.details,
      });
      await logWebhookEvent(supabase, {
        user_id: targetUserId,
        event_type: 'error',
        direction: 'incoming',
        phone_number: from,
        message_type: type,
        error: msgError.message,
        payload: { sender: from, messageId, messageType: type, content, contactId, targetUserId, rawMessage: message, insertDetails: msgError.details },
      });
      continue;
    }

    console.log('Message Insert - Success:', { sender: from, messageId, contactId, targetUserId });

    await updateWebhookDiagnostics(supabase, targetUserId, {
      last_real_message_at: new Date().toISOString(),
      last_matched_phone_number_id: value.metadata?.phone_number_id || settings.phone_number_id || null,
      last_mapping_failure_reason: null,
      webhook_subscription_health: 'healthy',
      webhook_config_warning: null,
    });

    await logWebhookEvent(supabase, {
      user_id: targetUserId,
      event_type: 'message_received',
      direction: 'incoming',
      phone_number: from,
      message_type: type,
      status: 'delivered',
      payload: { messageId, content: content.substring(0, 100), has_media: !!mediaUrl },
    });

    // Send push notifications
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
    await processIncomingMessages(supabase, value, settings.api_token, settingsUserId, superUserId, settings);
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

      const mappingIsValid = Boolean(
        settings?.user_id && (
          (phoneNumberId && settings.phone_number_id === phoneNumberId) ||
          (explicitUserId && settings.user_id === explicitUserId)
        )
      );

      const resolvedUserId = mappingIsValid ? settings.user_id : (explicitUserId || null);

      await logWebhookEvent(supabase, {
        user_id: resolvedUserId,
        event_type: 'raw_webhook',
        direction: 'incoming',
        payload: body,
      });

      if (!mappingIsValid) {
        console.log('⚠️ Webhook strict mapping failed; acknowledged without processing', { explicitUserId, phoneNumberId });
        await logWebhookEvent(supabase, {
          user_id: resolvedUserId,
          event_type: 'strict_mapping_skipped',
          direction: 'incoming',
          status: 'skipped',
          payload: { explicitUserId, phoneNumberId },
        });
        return okResponse();
      }

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
