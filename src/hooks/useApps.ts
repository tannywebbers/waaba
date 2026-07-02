import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AppItem {
  id: string;
  name: string;
}

export function useApps() {
  const { user } = useAuth();
  const [apps, setApps] = useState<AppItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('apps')
      .select('id, name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    setApps((data || []) as AppItem[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel('apps-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'apps', filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  const addApp = async (name: string) => {
    if (!user) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    await supabase.from('apps').insert({ user_id: user.id, name: trimmed });
    await load();
  };

  const renameApp = async (id: string, name: string) => {
    await supabase.from('apps').update({ name: name.trim() }).eq('id', id);
    await load();
  };

  const deleteApp = async (id: string) => {
    await supabase.from('apps').delete().eq('id', id);
    await load();
  };

  return { apps, loading, addApp, renameApp, deleteApp, reload: load };
}
