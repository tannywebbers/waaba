import { supabase } from './supabase';

/**
 * Returns the user id whose whatsapp_settings row should be used.
 * Shared inbox users send via their super user's WhatsApp connection.
 */
export async function getEffectiveWhatsAppUserId(currentUserId: string): Promise<string> {
  try {
    const { data } = await supabase.rpc('get_effective_whatsapp_user_id' as any, {
      _user_id: currentUserId,
    });
    if (typeof data === 'string' && data) return data;
  } catch {
    // fall through to direct query
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
