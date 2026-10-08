import { supabase } from '@/integrations/supabase/client';

function safeName(name: string): string {
  return (name || 'image').replace(/[^\w.\-]+/g, '_').slice(-80);
}

// Uploads a local file into the public chat-media bucket under the user's folder.
export async function uploadUserImage(
  userId: string,
  file: File,
  folder = 'avatars',
): Promise<string | null> {
  if (!userId || !file) return null;
  const path = `${userId}/${folder}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage
    .from('chat-media')
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
  if (error) {
    console.warn('Image upload failed:', error.message);
    return null;
  }
  const { data } = supabase.storage.from('chat-media').getPublicUrl(path);
  return data?.publicUrl || null;
}

// Downloads an image URL and stores it in the bucket so the app no longer
// depends on the remote host. Returns null when the download/upload fails so
// callers can fall back to the original URL.
export async function uploadUrlToStorage(
  userId: string,
  url: string,
  folder = 'contact-images',
): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size) return null;
    const guessed = (url.split('?')[0].split('/').pop() || 'contact-image');
    const file = new File([blob], guessed, { type: blob.type || 'image/jpeg' });
    return await uploadUserImage(userId, file, folder);
  } catch (e) {
    console.warn('Image download failed:', e);
    return null;
  }
}
