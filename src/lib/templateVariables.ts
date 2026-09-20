import { generateMessageId } from '@/lib/utils/messageId';

export interface TemplateVariable {
  value: string;
  label: string;
}

/** Variables available to app templates, Meta template mapping and auto replies. */
export const APP_VARIABLES: TemplateVariable[] = [
  { value: 'customer_name', label: 'Customer Name' },
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
];

const pad = (n: number) => String(n).padStart(2, '0');

const firstAccount = (c: any) => {
  const list = c?.accountDetails ?? c?.account_details ?? [];
  return Array.isArray(list) ? list[0] : undefined;
};

const accField = (ad: any, camel: string, snake: string) => (ad ? (ad[camel] ?? ad[snake] ?? '') : '');

/** dayType 0 = due today, positive N = N days overdue. */
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

/**
 * Resolves a single variable name against a contact.
 * `ctx.messageId` keeps {{message_id}} identical within one resolved message.
 */
export function resolveVariable(name: string, c: any, ctx: { messageId?: string } = {}): string {
  const key = String(name || '').toLowerCase();
  const dayType = c?.dayType ?? c?.day_type;
  const ad = firstAccount(c);
  const now = new Date();

  switch (key) {
    case 'customer_name':
    case 'name':
      return c?.name || '';
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
      return c?.appType ?? c?.app_type ?? '';
    case 'day_type':
      return dayType === undefined || dayType === null ? '' : String(dayType);
    case 'due_date':
      return computeDueDate(dayType);
    case 'account_number':
      return accField(ad, 'accountNumber', 'account_number');
    case 'account_name':
      return accField(ad, 'accountName', 'account_name');
    case 'bank_name':
    case 'bank':
      return accField(ad, 'bank', 'bank');
    case 'payment_details': {
      const list = c?.accountDetails ?? c?.account_details ?? [];
      if (!Array.isArray(list) || list.length === 0) return '';
      return list
        .map((a: any) => `${accField(a, 'bank', 'bank')} - ${accField(a, 'accountNumber', 'account_number')} (${accField(a, 'accountName', 'account_name')})`)
        .join('; ');
    }
    case 'current_date':
      return formatCurrentDate(now);
    case 'current_time':
      return formatCurrentTime(now);
    case 'message_id':
      return ctx.messageId || generateMessageId();
    default:
      return '';
  }
}

/**
 * Replaces every {{variable}} in `body` with the contact's value.
 * Returns the resolved text plus the list of variables that had no value,
 * so callers can warn before sending instead of shipping a broken message.
 */
export function resolveTemplateBody(body: string, contact: any): { text: string; missing: string[] } {
  const ctx = { messageId: generateMessageId() };
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

/**
 * Inserts text into a textarea/input at the caret position and returns the new value
 * plus the caret offset to restore afterwards.
 */
export function insertAtCursor(
  el: HTMLTextAreaElement | HTMLInputElement | null,
  current: string,
  text: string
): { value: string; caret: number } {
  if (!el) {
    return { value: `${current}${text}`, caret: current.length + text.length };
  }
  const start = el.selectionStart ?? current.length;
  const end = el.selectionEnd ?? start;
  const value = current.slice(0, start) + text + current.slice(end);
  return { value, caret: start + text.length };
}
