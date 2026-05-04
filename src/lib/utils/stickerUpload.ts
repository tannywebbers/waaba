import { supabase } from '@/integrations/supabase/client';

const ALLOWED_EXT = ['webp', 'png', 'jpg', 'jpeg', 'gif'];

function inferMime(file: File): string {
  if (file.type && file.type.startsWith('image/')) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  switch (ext) {
    case 'webp': return 'image/webp';
    case 'png':  return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif':  return 'image/gif';
    default:     return 'image/webp';
  }
}

function safeName(name: string): string {
  // Strip unsafe chars; keep extension
  const cleaned = name.replace(/[^\\w.\\-]+/g, '_').slice(-80);
  return cleaned || `sticker.webp`;
}

export interface UploadStickerResult {
  ok: boolean;
  error?: string;
  publicUrl?: string;
}

/** Validate, upload to `stickers` bucket and insert a row. */
export async function uploadStickerFile(file: File, userId: string): Promise<UploadStickerResult> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const mime = inferMime(file);

  // Accept by extension OR mime
  const looksLikeImage = mime.startsWith('image/') || ALLOWED_EXT.includes(ext);
  if (!looksLikeImage) {
    return { ok: false, error: `Unsupported file (${file.name}). Use webp, png, jpg or gif.` };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 5 MB.` };
  }

  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(file.name)}`;
  const { error: upErr } = await supabase.storage.from('stickers').upload(path, file, {
    contentType: mime, upsert: false,
  });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: urlData } = supabase.storage.from('stickers').getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  const { error: insErr } = await supabase.from('stickers' as any).insert({
    user_id: userId, name: file.name, media_url: publicUrl,
    mime_type: mime, source: 'uploaded',
  } as any);
  if (insErr) return { ok: false, error: insErr.message };

  return { ok: true, publicUrl };
}

/** Download a remote sticker (e.g. WhatsApp CDN) and persist it to the user's library. */
export async function saveRemoteStickerToLibrary(
  remoteUrl: string,
  userId: string,
  sourceMessageId?: string,
): Promise<UploadStickerResult> {
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) return { ok: false, error: `Download failed (${res.status})` };
    const blob = await res.blob();

    // Pick mime: prefer response content-type, fall back to image/webp
    const headerMime = res.headers.get('content-type') || '';
    const mime = headerMime.startsWith('image/') ? headerMime : (blob.type || 'image/webp');
    const ext = mime.split('/')[1]?.split(';')[0] || 'webp';

    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('stickers').upload(path, blob, {
      contentType: mime, upsert: false,
    });
    if (upErr) return { ok: false, error: upErr.message };

    const { data: urlData } = supabase.storage.from('stickers').getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    const { error: insErr } = await supabase.from('stickers' as any).insert({
      user_id: userId, name: `sticker.${ext}`, media_url: publicUrl,
      mime_type: mime, source: 'saved_from_chat', source_message_id: sourceMessageId,
    } as any);
    if (insErr) return { ok: false, error: insErr.message };

    return { ok: true, publicUrl };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error' };
  }
}
