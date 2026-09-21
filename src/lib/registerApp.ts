import { supabase } from '@/integrations/supabase/client';

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * Ensures an app name is registered in the user's `apps` table (case-insensitive).
 * Returns the canonical name (the existing row's name, or the newly inserted one)
 * so callers can store a consistent app value on contacts. Returns `null` when the
 * name is empty or could not be looked up / stored.
 */
export async function ensureAppRegistered(userId: string, appName: string): Promise<string | null> {
  const name = String(appName || '').trim();
  if (!name || !userId) return null;

  const { data: existing, error: findError } = await supabase
    .from('apps')
    .select('name')
    .eq('user_id', userId)
    .ilike('name', escapeLike(name))
    .maybeSingle();
  if (findError) {
    console.error('[ensureAppRegistered] lookup failed:', findError.message);
    return null;
  }
  if (existing) return existing.name;

  const { data: inserted, error: insertError } = await supabase
    .from('apps')
    .insert({ user_id: userId, name })
    .select('name')
    .maybeSingle();
  if (insertError) {
    // Race: another tab/process created the same app moments ago.
    if (/duplicate|unique/i.test(insertError.message)) {
      const { data: raced } = await supabase
        .from('apps')
        .select('name')
        .eq('user_id', userId)
        .ilike('name', escapeLike(name))
        .maybeSingle();
      return raced?.name || null;
    }
    console.error('[ensureAppRegistered] insert failed:', insertError.message);
    return null;
  }
  return inserted?.name || name;
}