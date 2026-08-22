import { supabase } from './supabase';
import { getEffectiveWhatsAppUserId } from './effectiveUser';
import { Chat, Message } from './types';

export interface WhatsAppSettings {
  api_token: string;
  phone_number_id: string;
}

export type SendType = 'text' | 'image' | 'video' | 'document' | 'audio' | 'sticker' | 'template';

/** Meta-supported audio MIME types for WhatsApp Cloud API */
export const SUPPORTED_AUDIO_MIMES = [
  'audio/aac',
  'audio/amr',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/opus',
];

export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '').replace(/^\+/, '');
}

export async function getWhatsAppSettings(userId: string): Promise<WhatsAppSettings | null> {
  const effectiveUserId = await getEffectiveWhatsAppUserId(userId);
  const { data } = await supabase
    .from('whatsapp_settings')
    .select('*')
    .eq('user_id', effectiveUserId)
    .maybeSingle();
  if (!data?.api_token || !data?.phone_number_id) return null;
  return data as WhatsAppSettings;
}

export interface InvokeResult {
  success?: boolean;
  messageId?: string;
  error?: string;
  errorCode?: number;
  errorSubcode?: number;
  errorDetails?: string;
  [key: string]: any;
}

export async function invokeWhatsAppApi(
  settings: WhatsAppSettings,
  chat: Chat,
  body: Record<string, any>
): Promise<{ data: InvokeResult | null; error: any }> {
  return supabase.functions.invoke('whatsapp-api', {
    body: {
      token: settings.api_token,
      phoneNumberId: settings.phone_number_id,
      to: normalizePhone(chat.contact.phone),
      ...body,
    },
  });
}

/**
 * Upload a local file URI (image picker / document picker / audio recording)
 * to the chat-media bucket following the web convention:
 * `${userId}/${contactId}/${Date.now()}-${fileName}`
 */
export async function uploadChatMedia(
  userId: string,
  contactId: string,
  fileUri: string,
  mimeType: string,
  fileName: string
): Promise<string> {
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const filePath = `${userId}/${contactId}/${Date.now()}-${fileName}`;
  const { error } = await supabase.storage
    .from('chat-media')
    .upload(filePath, blob, { contentType: mimeType, upsert: false });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(filePath);
  return urlData.publicUrl;
}

/**
 * Upload a voice recording directly to Meta to get a media id
 * (same flow as web: graph.facebook.com/{phoneId}/media then messages).
 */
export async function sendVoiceNoteViaMeta(
  settings: WhatsAppSettings,
  chat: Chat,
  recordingUri: string
): Promise<string> {
  const formData = new FormData();
  formData.append('file', {
    uri: recordingUri,
    name: 'voice-note.m4a',
    type: 'audio/mp4',
  } as any);
  formData.append('type', 'audio/mp4');
  formData.append('messaging_product', 'whatsapp');

  const metaUploadRes = await fetch(
    `https://graph.facebook.com/v25.0/${settings.phone_number_id}/media`,
    { method: 'POST', headers: { Authorization: `Bearer ${settings.api_token}` }, body: formData }
  );
  if (!metaUploadRes.ok) {
    const metaErr = await metaUploadRes.json().catch(() => null);
    throw new Error(metaErr?.error?.message || 'Failed to upload audio to WhatsApp');
  }
  const mediaId = (await metaUploadRes.json())?.id;
  if (!mediaId) throw new Error('No media ID returned from WhatsApp');

  const sendRes = await fetch(
    `https://graph.facebook.com/v25.0/${settings.phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.api_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizePhone(chat.contact.phone),
        type: 'audio',
        audio: { id: mediaId },
      }),
    }
  );
  const sendData = await sendRes.json();
  if (!sendRes.ok || !sendData.messages?.[0]?.id) {
    throw new Error(sendData?.error?.message || 'Failed to send voice note');
  }
  return sendData.messages[0].id;
}

export interface ReplyContext {
  id?: string;
  whatsappMessageId?: string;
  snapshot: any;
}

export async function persistMessage(
  userId: string,
  chat: Chat,
  fields: Partial<{
    content: string;
    type: SendType;
    status: Message['status'];
    media_url: string | null;
    whatsapp_message_id: string | null;
    template_name: string | null;
    template_params: any;
    reply_to_message_id: string | null;
    reply_to_wamid: string | null;
    reply_snapshot: any;
  }>
): Promise<Message | null> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      user_id: userId,
      contact_id: chat.id,
      is_outgoing: true,
      ...fields,
    })
    .select()
    .maybeSingle();
  if (error || !data) {
    console.error('[whatsapp] insert failed:', error);
    return null;
  }
  return {
    id: data.id,
    contactId: data.contact_id,
    content: data.content,
    type: data.type,
    status: data.status,
    isOutgoing: true,
    timestamp: new Date(data.created_at),
    mediaUrl: data.media_url || undefined,
    whatsappMessageId: data.whatsapp_message_id || undefined,
    templateName: data.template_name || undefined,
    templateParams: data.template_params || undefined,
    replySnapshot: data.reply_snapshot || undefined,
  };
}
