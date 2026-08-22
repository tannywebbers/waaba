import { useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/stores/appStore';
import { mapMessageRow, mapContactRow } from '@/lib/mappers';

/**
 * Global realtime channel: mirrors the web app's `global-realtime` channel.
 * Handles contacts INSERT/UPDATE and messages INSERT/UPDATE for this user.
 */
export function useRealtime(user: User | null) {
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('mobile-realtime')
      // New contact creation (from webhook)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'contacts',
      }, async (payload: any) => {
        const c = payload.new;
        if (c.user_id !== user.id && c.assigned_user_id !== user.id) return;

        const { data: fullContact } = await supabase
          .from('contacts')
          .select('*, account_details(*)')
          .eq('id', c.id)
          .single();

        if (!fullContact) return;
        useAppStore.getState().upsertContact(mapContactRow(fullContact));
      })
      // Contact online/last_seen updates
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'contacts',
      }, (payload: any) => {
        const c = payload.new;
        const state = useAppStore.getState();
        if (!state.contacts.find(ct => ct.id === c.id)) return;

        state.upsertContact({
          ...state.contacts.find(ct => ct.id === c.id)!,
          name: c.name,
          isOnline: c.is_online ?? false,
          lastSeen: c.last_seen ? new Date(c.last_seen) : undefined,
          isPinned: c.is_pinned ?? false,
          isMuted: c.is_muted ?? false,
          isArchived: c.is_archived ?? false,
        });
      })
      // New messages (incoming + our own sends from other devices)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `user_id=eq.${user.id}`,
      }, (payload: any) => {
        const m = payload.new;
        const state = useAppStore.getState();
        const contactExists = state.contacts.some(c => c.id === m.contact_id);

        if (!contactExists) {
          // Wait briefly for the contact INSERT to arrive first
          setTimeout(() => {
            if (useAppStore.getState().contacts.some(c => c.id === m.contact_id)) {
              useAppStore.getState().addMessage(mapMessageRow(m));
            } else {
              useAppStore.getState().loadData(user.id);
            }
          }, 500);
          return;
        }

        useAppStore.getState().addMessage(mapMessageRow(m));
      })
      // Status updates (sent -> delivered -> read, failed)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `user_id=eq.${user.id}`,
      }, (payload: any) => {
        const m = payload.new;
        if (!m.status) return;
        useAppStore.getState().updateMessage(m.contact_id, m.id, {
          status: m.status,
          errorCode: m.error_code ?? undefined,
          errorTitle: m.error_title || undefined,
          errorDetails: m.error_details || undefined,
        });
      })
      .subscribe(status => {
        console.log('[Realtime] Subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);
}
