import { supabase } from '@/integrations/supabase/client';

// Columns that only exist after migration 20261007100000 is applied.
const CONTACT_OPTIONAL_COLUMNS = ['bvn', 'image_url', 'image_key', 'image_alt', 'image_uploaded_at'];
const LIST_OPTIONAL_COLUMNS = ['email', 'role', 'notes', 'bank_name', 'account_number', 'recipient_name', 'is_primary', 'labels', 'user_id'];

function missingColumn(error: any): string | null {
  const msg = String(error?.message || '');
  const find = msg.match(/Could not find the '(\w+)' column/i);
  if (find) return find[1];
  const exists = msg.match(/column\s+(?:[\w]+\.)?(\w+)\s+does not exist/i);
  if (exists) return exists[1];
  return null;
}

function isMissingColumnError(error: any): boolean {
  return error?.code === 'PGRST204' || error?.code === '42703';
}

function isMissingRelation(error: any): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

export type SavedRow<T> = {
  data: T | null;
  error: any;
  dropped: string[];
};

// Inserts or updates a contacts row, dropping unknown columns (DB migration not
// applied yet) instead of failing the whole save.
export async function saveContactRow(
  payload: Record<string, any>,
  id?: string,
): Promise<SavedRow<any>> {
  const body: Record<string, any> = { ...payload };
  const dropped: string[] = [];
  const optional = CONTACT_OPTIONAL_COLUMNS;
  for (let attempt = 0; attempt <= optional.length + 1; attempt++) {
    const query = id
      ? supabase.from('contacts').update(body).eq('id', id)
      : supabase.from('contacts').insert(body);
    const { data, error } = await query.select().maybeSingle();
    if (!error) return { data, error: null, dropped };
    const col = missingColumn(error);
    if (isMissingColumnError(error) && col && col in body) {
      delete body[col];
      dropped.push(col);
      continue;
    }
    return { data: null, error, dropped };
  }
  return { data: null, error: { message: 'Contact could not be saved.' }, dropped };
}

export type SavedListResult = {
  missingTable: boolean;
  dropped: string[];
  error: any;
};

// Replaces the contact-list rows for a customer. Returns missingTable=true when
// the customer_contacts table does not exist yet (migration not applied).
export async function saveContactList(
  customerId: string,
  userId: string,
  rows: Record<string, any>[],
): Promise<SavedListResult> {
  if (rows.length === 0) return { missingTable: false, dropped: [], error: null };
  const body = rows.map(r => ({ ...r }));
  const dropped: string[] = [];
  for (let attempt = 0; attempt <= LIST_OPTIONAL_COLUMNS.length + 2; attempt++) {
    const del = await supabase
      .from('customer_contacts')
      .delete()
      .eq('customer_id', customerId)
      .eq('user_id', userId);
    if (del.error) {
      if (isMissingRelation(del.error)) return { missingTable: true, dropped, error: null };
      const col = missingColumn(del.error);
      if (col && dropped.indexOf(col) === -1) {
        body.forEach(r => { delete r[col]; });
        dropped.push(col);
        continue;
      }
      if (missingColumn(del.error)) continue;
      return { missingTable: false, dropped, error: del.error };
    }
    const ins = await supabase.from('customer_contacts').insert(body);
    if (!ins.error) return { missingTable: false, dropped, error: null };
    if (isMissingRelation(ins.error)) return { missingTable: true, dropped, error: null };
    const col = missingColumn(ins.error);
    if (col && dropped.indexOf(col) === -1) {
      body.forEach(r => { delete r[col]; });
      dropped.push(col);
      continue;
    }
    if (missingColumn(ins.error)) continue;
    return { missingTable: false, dropped, error: ins.error };
  }
  return { missingTable: false, dropped, error: { message: 'Contact list could not be saved.' } };
}

// Reads every contact-list row for the given customers. Returns null when the
// table is missing so callers can treat the feature as unavailable.
export async function fetchContactLists(
  customerIds: string[],
  userId: string,
): Promise<Record<string, any[]> | null> {
  if (customerIds.length === 0) return {};
  const { data, error } = await supabase
    .from('customer_contacts')
    .select('*')
    .in('customer_id', customerIds)
    .eq('user_id', userId);
  if (error) {
    if (isMissingRelation(error)) return null;
    console.warn('Contact list fetch failed:', error.message);
    return null;
  }
  const grouped: Record<string, any[]> = {};
  (data || []).forEach((row: any) => {
    if (!grouped[row.customer_id]) grouped[row.customer_id] = [];
    grouped[row.customer_id].push(row);
  });
  return grouped;
}
