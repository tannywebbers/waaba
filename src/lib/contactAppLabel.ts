// @ts-nocheck
import { supabase } from '@/integrations/supabase/client';

const LABEL_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

function colorForName(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return LABEL_COLORS[hash % LABEL_COLORS.length];
}

/**
 * Automatically label contacts by their app name: for every distinct app type in
 * the incoming contacts, find-or-create a label named after that app and assign
 * it to the matching contacts. Idempotent — existing assignments are left alone.
 */
export async function ensureContactAppLabels(
  userId: string,
  contacts: Array<{ id: string; appType?: string }>,
): Promise<void> {
  const byApp: Record<string, string[]> = {};
  contacts.forEach((c) => {
    const app = String(c.appType || '').trim();
    if (!app) return;
    if (!byApp[app]) byApp[app] = [];
    byApp[app].push(c.id);
  });
  const appNames = Object.keys(byApp);
  if (appNames.length === 0) return;

  const { data: existingLabels } = await supabase
    .from('labels')
    .select('id,name')
    .eq('user_id', userId);
  const labelByLower: Record<string, { id: string; name: string }> = {};
  ((existingLabels as any[]) || []).forEach((l) => {
    if (!labelByLower[(l.name || '').toLowerCase()]) labelByLower[(l.name || '').toLowerCase()] = l;
  });

  const labelIdByApp: Record<string, string> = {};
  for (const app of appNames) {
    const existing = labelByLower[app.toLowerCase()];
    if (existing) {
      labelIdByApp[app] = existing.id;
      continue;
    }
    const { data, error } = await supabase
      .from('labels')
      .insert({ user_id: userId, name: app, color: colorForName(app) })
      .select('id')
      .maybeSingle();
    if (!error && data) {
      labelIdByApp[app] = data.id;
      continue;
    }
    // Race guard: another device may have created it in the meantime.
    const { data: check } = await supabase
      .from('labels')
      .select('id')
      .eq('user_id', userId)
      .eq('name', app)
      .maybeSingle();
    if (check) labelIdByApp[app] = check.id;
  }

  const contactIds = Array.from(new Set(contacts.map((c) => c.id)));
  const labelIds = Object.values(labelIdByApp);
  if (contactIds.length === 0 || labelIds.length === 0) return;

  const { data: assigned } = await supabase
    .from('chat_labels')
    .select('chat_id,label_id')
    .eq('user_id', userId)
    .in('chat_id', contactIds)
    .in('label_id', labelIds);
  const existingKeys = new Set(((assigned as any[]) || []).map((r) => `${r.chat_id}:${r.label_id}`));

  const inserts: Array<{ user_id: string; chat_id: string; label_id: string }> = [];
  for (const app of appNames) {
    const labelId = labelIdByApp[app];
    if (!labelId) continue;
    for (const chatId of byApp[app]) {
      if (!existingKeys.has(`${chatId}:${labelId}`)) {
        inserts.push({ user_id: userId, chat_id: chatId, label_id: labelId });
      }
    }
  }
  if (inserts.length > 0) {
    await supabase.from('chat_labels').insert(inserts);
  }
}