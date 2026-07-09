import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface SharedUser {
  id: string;
  sharedUserId: string;
  name: string;
  email: string;
  balance: number;
  status: string;
}

export interface SharedInboxInfo {
  isSharedUser: boolean;
  superUserId: string | null;
  superUserName: string | null;
  balance: number;
  isSuperUser: boolean;
  sharedUsers: SharedUser[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useSharedInbox(): SharedInboxInfo {
  const { user } = useAuth();
  const [isSharedUser, setIsSharedUser] = useState(false);
  const [superUserId, setSuperUserId] = useState<string | null>(null);
  const [superUserName, setSuperUserName] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
  const [isSuperUser, setIsSuperUser] = useState(false);
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    try {
      // Check if current user is a shared user (active or revoked membership)
      const { data: sharedMembership } = await supabase
        .from('shared_inbox_users' as any)
        .select('*')
        .eq('shared_user_id', user.id)
        .in('status', ['active', 'revoked'])
        .limit(1);

      const membership = (sharedMembership as any[])?.[0];

      if (membership) {
        setIsSharedUser(true);
        setSuperUserId(membership.super_user_id);
        setBalance(membership.balance ?? 0);

        // Get super user's name from profiles
        const { data: superProfile } = await supabase
          .from('profiles')
          .select('name, email')
          .eq('user_id', membership.super_user_id)
          .maybeSingle();

        setSuperUserName((superProfile as any)?.name || (superProfile as any)?.email || null);
      } else {
        setIsSharedUser(false);
        setSuperUserId(null);
        setSuperUserName(null);
        setBalance(0);
      }

      // Check if current user has shared users (is super user)
      const { data: mySharedUsers } = await supabase
        .from('shared_inbox_users' as any)
        .select('*')
        .eq('super_user_id', user.id);

      const sharedList = (mySharedUsers as any[]) || [];

      if (sharedList.length > 0) {
        setIsSuperUser(true);

        const userIds = sharedList.map((u: any) => u.shared_user_id);

        // Use SECURITY DEFINER RPC that reads from auth.users so users
        // without a public.profiles row still resolve to a real name/email
        // (fixes "Unknown" in the shared inbox list).
        const { data: infos } = await supabase.rpc('get_users_info' as any, { _ids: userIds });

        const infoMap: Record<string, any> = {};
        ((infos as any[]) || []).forEach((p: any) => {
          infoMap[p.user_id] = p;
        });

        setSharedUsers(
          sharedList.map((u: any) => ({
            id: u.id,
            sharedUserId: u.shared_user_id,
            name: infoMap[u.shared_user_id]?.name || infoMap[u.shared_user_id]?.email || 'Unknown',
            email: infoMap[u.shared_user_id]?.email || '',
            balance: u.balance ?? 0,
            status: u.status,
          }))
        );
      } else {
        setIsSuperUser(false);
        setSharedUsers([]);
      }
    } catch (err) {
      console.error('Failed to load shared inbox info:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime subscription for shared_inbox_users changes
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`shared-inbox-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_inbox_users' }, () => {
        refresh();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, refresh]);

  return { isSharedUser, superUserId, superUserName, balance, isSuperUser, sharedUsers, loading, refresh };
}
