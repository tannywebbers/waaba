export interface TemplateVariable {
  value: string;
  label: string;
}

/** Single source of truth for every variable available in app/Meta/auto-reply templates. */
export const APP_VARIABLES: TemplateVariable[] = [
  { value: 'customer_name', label: 'Customer Name' },
  { value: 'user_display_name', label: 'Your Display Name' },
  { value: 'loan_id', label: 'Loan ID' },
  { value: 'amount', label: 'Amount' },
  { value: 'due_date', label: 'Due Date' },
  { value: 'account_number', label: 'Account Number' },
  { value: 'account_name', label: 'Account Name' },
  { value: 'bank_name', label: 'Bank Name' },
  { value: 'phone_number', label: 'Phone Number' },
  { value: 'app_name', label: 'App Name' },
  { value: 'day_type', label: 'Day Type' },
  { value: 'current_date', label: 'Current Date' },
  { value: 'current_time', label: 'Current Time' },
  { value: 'payment_details', label: 'Payment Details' },
  { value: 'message_id', label: 'Message ID (random 16 chars)' },
  { value: 'bvn', label: 'BVN' },
  { value: 'contact_name', label: 'Contact Name' },
  { value: 'contact_email', label: 'Contact Email' },
  { value: 'contact_phone', label: 'Contact Phone' },
  { value: 'contact_role', label: 'Contact Role' },
  { value: 'parent_name', label: 'Parent Name' },
  { value: 'customer_image_url', label: 'Customer Image URL' },
];

export interface VariableContext {
  messageId?: string;
  senderName?: string;
  fallbackApp?: string;
  appTemplates?: Record<string, string>;
}

const pad = (n: number) => String(n).padStart(2, '0');

const firstAccount = (c: any) => {
  const list = c?.accountDetails ?? c?.account_details ?? [];
  return Array.isArray(list) ? list[0] : undefined;
};

const accField = (ad: any, camel: string, snake: string) => (ad ? (ad[camel] ?? ad[snake] ?? '') : '');

const contactList = (c: any): any[] => {
  const list = c?.contacts ?? c?.contact_list ?? c?.contactPeople ?? [];
  if (Array.isArray(list)) return list;
  return c?.contact ? [c.contact] : [];
};

const firstContact = (c: any) => contactList(c)[0];

const generateId = () => {
  let out = '';
  for (let i = 0; i < 16; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
};

export function computeDueDate(dayType: unknown): string {
  if (dayType === undefined || dayType === null || dayType === '') return '';
  const n = Number(dayType);
  if (Number.isNaN(n)) return '';
  const due = new Date();
  due.setDate(due.getDate() - n);
  return `${pad(due.getDate())}/${pad(due.getMonth() + 1)}/${due.getFullYear()}`;
}

export function formatCurrentDate(d = new Date()): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatCurrentTime(d = new Date()): string {
  let h = d.getHours();
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${pad(h)}:${pad(d.getMinutes())} ${suffix}`;
}

/** Resolves a single variable name. All aliases point at the same canonical value. */
export function resolveVariable(name: string, c: any, ctx: VariableContext = {}): string {
  const key = String(name || '').trim().toLowerCase();
  const dayType = c?.dayType ?? c?.day_type;
  const ad = firstAccount(c);
  const cc = firstContact(c);
  const now = new Date();

  switch (key) {
    case 'customer_name':
    case 'name':
      return c?.name || '';
    case 'user_display_name':
    case 'sender_name':
    case 'user_name':
    case 'display_name':
    case 'my_name':
      return ctx.senderName || '';
    case 'loan_id':
      return c?.loanId ?? c?.loan_id ?? '';
    case 'amount': {
      const amount = c?.amount;
      if (amount === undefined || amount === null || amount === '') return '';
      const n = Number(amount);
      return Number.isNaN(n) ? String(amount) : new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(n);
    }
    case 'phone_number':
    case 'phone':
      return c?.phone || '';
    case 'app_name':
    case 'app_type':
      return c?.appType ?? c?.app_type ?? ctx.fallbackApp ?? '';
    case 'day_type':
      return dayType === undefined || dayType === null ? '' : String(dayType);
    case 'due_date':
      return computeDueDate(dayType);
    case 'account_number':
      return accField(ad, 'accountNumber', 'account_number') || cc?.account_number || '';
    case 'account_name':
      return accField(ad, 'accountName', 'account_name') || cc?.recipient_name || '';
    case 'bank_name':
    case 'bank':
      return accField(ad, 'bank', 'bank') || cc?.bank_name || '';
    case 'payment_details': {
      const list = c?.accountDetails ?? c?.account_details ?? [];
      if (!Array.isArray(list) || list.length === 0) {
        const bankContacts = contactList(c).filter((cc: any) => cc?.bank_name || cc?.account_number || cc?.recipient_name);
        if (bankContacts.length === 0) return '';
        return bankContacts
          .map((cc: any) => `${cc?.bank_name || ''} - ${cc?.account_number || ''} (${cc?.recipient_name || ''})`)
          .join('; ');
      }
      return list
        .map((a: any) => `${accField(a, 'bank', 'bank')} - ${accField(a, 'accountNumber', 'account_number')} (${accField(a, 'accountName', 'account_name')})`)
        .join('; ');
    }
    case 'current_date':
      return formatCurrentDate(now);
    case 'current_time':
      return formatCurrentTime(now);
    case 'message_id':
      return ctx.messageId || generateId();
    case 'bvn':
      return c?.bvn ?? '';
    case 'contact_name':
      return cc?.name ?? c?.contactName ?? c?.contact_name ?? '';
    case 'contact_email':
      return cc?.email ?? c?.contactEmail ?? c?.contact_email ?? '';
    case 'contact_phone':
      return cc?.phone ?? c?.contactPhone ?? c?.contact_phone ?? '';
    case 'contact_role':
      return cc?.role ?? c?.contactRole ?? c?.contact_role ?? '';
    case 'parent_name':
      return c?.parentName ?? c?.parent_name ??
        contactList(c).find((cc: any) => /parent/i.test(String(cc?.role || '')))?.name ??
        cc?.name ?? c?.name ?? '';
    case 'customer_image_url':
      return c?.imageUrl ?? c?.image_url ?? c?.avatar ?? c?.avatar_url ?? '';
    default:
      return '';
  }
}

/** Replaces every {{variable}} and reports the ones with no value. */
export function resolveTemplateBody(
  body: string,
  contact: any,
  options: VariableContext = {},
): { text: string; missing: string[] } {
  const ctx: VariableContext = { ...options, messageId: options.messageId || generateId() };
  const missing: string[] = [];
  const text = String(body || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
    const value = resolveVariable(name, contact, ctx);
    if (!value) {
      if (!missing.includes(name)) missing.push(name);
      return match;
    }
    return value;
  });
  return { text, missing };
}

/** Resolves a value selected in Template Mapping, including app_template:name. */
export function resolveMappedField(field: string, contact: any, ctx: VariableContext = {}): string {
  const selected = String(field || '').trim();
  if (selected.startsWith('app_template:')) {
    const name = selected.slice('app_template:'.length).trim();
    const body = ctx.appTemplates?.[name];
    if (!body) return `[Missing template: ${name}]`;
    return resolveTemplateBody(body, contact, ctx).text;
  }
  return resolveVariable(selected, contact, ctx);
}

/** Normalises template text before inserting it into the composer. */
export function formatTemplateForComposer(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
