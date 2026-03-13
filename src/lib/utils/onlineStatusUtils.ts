import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// 70 seconds threshold to match WhatsApp standard
const ONLINE_THRESHOLD_MS = 120 * 1000;

/**
 * Check if a contact is online based on their last_seen timestamp
 * Online = last_seen within last 70 seconds
 */
export function isContactOnline(lastSeen: Date | string | undefined | null): boolean {
  if (!lastSeen) return false;
  const lastSeenDate = lastSeen instanceof Date ? lastSeen : new Date(lastSeen);
  return Date.now() - lastSeenDate.getTime() < ONLINE_THRESHOLD_MS;
}

/**
 * Background task to update online status for all contacts
 */
export async function updateContactsOnlineStatus(userId: string) {
  try {
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, last_seen, is_online')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching contacts for status update:', error);
      return;
    }

    const updates: { id: string; is_online: boolean }[] = [];

    contacts?.forEach(contact => {
      const shouldBeOnline = isContactOnline(contact.last_seen);

      if (contact.is_online !== shouldBeOnline) {
        updates.push({ id: contact.id, is_online: shouldBeOnline });
      }
    });

    if (updates.length > 0) {
      for (const update of updates) {
        await supabase
          .from('contacts')
          .update({ is_online: update.is_online })
          .eq('id', update.id);
      }
    }
  } catch (error) {
    console.error('Error updating contacts online status:', error);
  }
}

/**
 * React hook to automatically update online status in the background
 */
export function useOnlineStatusUpdater(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    updateContactsOnlineStatus(userId);

    const interval = setInterval(() => {
      updateContactsOnlineStatus(userId);
    }, 15 * 1000); // Every 15 seconds for accuracy

    return () => clearInterval(interval);
  }, [userId]);
}
