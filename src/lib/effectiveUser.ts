import { supabase } from '@/integrations/supabase/client';

/**
 * Returns the user id whose whatsapp_settings row should be used.
 * - If the current user is an active shared inbox user, this is their super_user_id.
 * - Otherwise it is the current user's own id.
 *
 * This lets shared users automatically send/receive via the super user's WhatsApp
 * connection without configuring their own credentials.
 */
export async function getEffectiveWhatsAppUserId(currentUserId: string): Promise<string> {
  try {
    const { data } = await supabase.rpc('get_effective_whatsapp_user_id' as any, {
      _user_id: currentUserId,
    });
    if (typeof data === 'string' && data) return data;
  } catch (err) {
    console.warn('[effectiveUser] RPC failed, falling back to direct query', err);
  }

  try {
    const { data } = await supabase
      .from('shared_inbox_users' as any)
      .select('super_user_id')
      .eq('shared_user_id', currentUserId)
      .eq('status', 'active')
      .maybeSingle();
    return (data as any)?.super_user_id || currentUserId;
  } catch {
    return currentUserId;
  }
}
