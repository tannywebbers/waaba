import { supabase } from './supabase';

export interface MobileApiResult {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

export async function callMobileApi<T extends MobileApiResult = MobileApiResult>(
  body: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('mobile-api', { body });
  if (error) throw new Error(error.message || 'Mobile API request failed');
  const result = (data || {}) as T;
  if (!result.success) throw new Error(result.error || 'Mobile API request failed');
  return result;
}

export const mobileApi = {
  bootstrap: () => callMobileApi({ action: 'bootstrap' }),
  sendMessage: (payload: Record<string, unknown>) => callMobileApi({ action: 'send_message', ...payload }),
  markRead: (contactId: string) => callMobileApi({ action: 'mark_read', contactId }),
  updateContactFlag: (contactId: string, patch: Record<string, unknown>) =>
    callMobileApi({ action: 'update_contact_flag', contactId, ...patch }),
  getSettings: () => callMobileApi({ action: 'get_settings' }),
  saveSettings: (patch: Record<string, unknown>) => callMobileApi({ action: 'save_settings', ...patch }),
};
