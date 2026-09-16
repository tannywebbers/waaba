import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AutoReply, AutoReplyStep, rowToAutoReply } from '@/lib/autoReply';

export function useAutoReplies() {
  const { user } = useAuth();
  const [autoReplies, setAutoReplies] = useState<AutoReply[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('auto_replies' as any)
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (error) console.warn('[useAutoReplies] load failed', error.message);
    setAutoReplies((data || []).map(rowToAutoReply));
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`auto-replies-${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'auto_replies', filter: `user_id=eq.${user.id}`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, load]);

  const createAutoReply = useCallback(async (name: string, steps: AutoReplyStep[], isActive = true) => {
    if (!user) return null;
    const { data, error } = await supabase
      .from('auto_replies' as any)
      .insert({ user_id: user.id, name, steps, is_active: isActive } as any)
      .select()
      .maybeSingle();
    if (error) throw error;
    await load();
    return data ? rowToAutoReply(data) : null;
  }, [user, load]);

  const updateAutoReply = useCallback(async (
    id: string,
    patch: { name?: string; steps?: AutoReplyStep[]; isActive?: boolean }
  ) => {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.steps !== undefined) payload.steps = patch.steps;
    if (patch.isActive !== undefined) payload.is_active = patch.isActive;
    const { error } = await supabase.from('auto_replies' as any).update(payload as any).eq('id', id);
    if (error) throw error;
    await load();
  }, [load]);

  const deleteAutoReply = useCallback(async (id: string) => {
    const { error } = await supabase.from('auto_replies' as any).delete().eq('id', id);
    if (error) throw error;
    await load();
  }, [load]);

  return { autoReplies, loading, reload: load, createAutoReply, updateAutoReply, deleteAutoReply };
}
