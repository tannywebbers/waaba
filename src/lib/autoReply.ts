import { supabase } from '@/integrations/supabase/client';
import { getEffectiveWhatsAppUserId } from '@/lib/effectiveUser';

export type MatchType = 'exact' | 'contains';

export interface AutoReplyStep {
  id: string;
  keywords: string[];
  matchType: MatchType;
  message: string;
  delaySeconds?: number;
}

export interface AutoReply {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  steps: AutoReplyStep[];
  createdAt?: string;
  updatedAt?: string;
}

export function newStep(): AutoReplyStep {
  return {
    id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    keywords: [],
    matchType: 'contains',
    message: '',
    delaySeconds: 0,
  };
}

function normalize(value: string): string {
  return (value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Formats a due date as dd/mm/yyyy, dayType days before today. Mirrors the webhook's calcDueDate. */
function calcDueDate(dayType: unknown): string {
  if (dayType === null || dayType === undefined || dayType === '') return '';
  const d = new Date();
  d.setDate(d.getDate() - Number(dayType || 0));
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/**
 * Replaces {{variable}} placeholders in an auto reply message with the contact's
 * real details. Mirrors supabase/functions/whatsapp-webhook/index.ts so client-side
 * previews/sends match what the live webhook path produces.
 */
export async function resolveAutoReplyVariables(contactId: string, body: string): Promise<string> {
  if (!body || !/\{\{\s*\w+\s*\}\}/.test(body)) return body;

  const { data: contact } = await supabase
    .from('contacts')
    .select('name, phone, loan_id, amount, app_type, day_type')
    .eq('id', contactId)
    .maybeSingle();

  let accounts: any[] = [];
  if (/account_number|payment_details/.test(body)) {
    const { data } = await supabase
      .from('account_details')
      .select('bank, account_number, account_name')
      .eq('contact_id', contactId);
    accounts = data || [];
  }

  const now = new Date();
  const map: Record<string, string> = {
    customer_name: contact?.name || '',
    loan_id: contact?.loan_id || '',
    amount: contact?.amount !== null && contact?.amount !== undefined ? String(contact.amount) : '',
    phone_number: contact?.phone || '',
    app_name: contact?.app_type || '',
    day_type: contact?.day_type !== null && contact?.day_type !== undefined ? String(contact.day_type) : '',
    due_date: calcDueDate(contact?.day_type),
    account_number: accounts[0]?.account_number || '',
    payment_details: accounts
      .map((a) => `${a.bank} - ${a.account_number} (${a.account_name})`)
      .join('; '),
    current_date: now.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' }),
    current_time: now.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' }),
  };

  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
    const key = String(name).toLowerCase();
    return key in map ? map[key] : match;
  });
}

/** Returns true when the incoming text matches a step's keywords. */
export function stepMatches(step: AutoReplyStep, incoming: string): boolean {
  const text = normalize(incoming);
  if (!text) return false;
  const keywords = (step.keywords || []).map(normalize).filter(Boolean);
  if (keywords.length === 0) return false;

  if (step.matchType === 'exact') {
    return keywords.some((k) => text === k);
  }
  return keywords.some((k) => text.includes(k));
}

/** Finds all matching steps across all active auto replies (in order). */
export function findAutoReplyMatches(
  replies: AutoReply[],
  incoming: string
): { reply: AutoReply; step: AutoReplyStep }[] {
  const matches: { reply: AutoReply; step: AutoReplyStep }[] = [];
  for (const reply of replies) {
    if (!reply.isActive) continue;
    for (const step of reply.steps || []) {
      if (stepMatches(step, incoming)) {
        matches.push({ reply, step });
      }
    }
  }
  return matches;
}

export function rowToAutoReply(row: any): AutoReply {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    isActive: row.is_active ?? true,
    steps: Array.isArray(row.steps) ? row.steps : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Shape used for JSON import/export. */
export interface AutoReplyJSON {
  name: string;
  isActive?: boolean;
  steps: {
    keywords: string[] | string;
    matchType?: MatchType;
    message: string;
    delaySeconds?: number;
  }[];
}

export const AUTO_REPLY_DEMO_JSON: AutoReplyJSON[] = [
  {
    name: 'Greetings flow',
    isActive: true,
    steps: [
      {
        keywords: ['hi', 'hello', 'good morning'],
        matchType: 'contains',
        message: 'Hello! Thanks for reaching out. How can we help you today?',
      },
      {
        keywords: ['balance'],
        matchType: 'contains',
        message: 'To check your balance, please reply with your loan ID.',
        delaySeconds: 2,
      },
    ],
  },
  {
    name: 'Office hours',
    isActive: true,
    steps: [
      {
        keywords: ['are you open'],
        matchType: 'exact',
        message: 'We are open Monday to Friday, 8am - 6pm.',
      },
    ],
  },
];

export function parseAutoReplyJSON(raw: unknown): { valid: AutoReplyJSON[]; errors: string[] } {
  const errors: string[] = [];
  const valid: AutoReplyJSON[] = [];
  const list = Array.isArray(raw) ? raw : [raw];

  list.forEach((item: any, index) => {
    const label = `Item ${index + 1}`;
    if (!item || typeof item !== 'object') {
      errors.push(`${label}: must be an object`);
      return;
    }
    if (!item.name || typeof item.name !== 'string') {
      errors.push(`${label}: "name" is required`);
      return;
    }
    if (!Array.isArray(item.steps) || item.steps.length === 0) {
      errors.push(`${label}: "steps" must be a non-empty array`);
      return;
    }
    const steps: AutoReplyJSON['steps'] = [];
    item.steps.forEach((step: any, si: number) => {
      const kw = Array.isArray(step?.keywords)
        ? step.keywords
        : typeof step?.keywords === 'string'
          ? step.keywords.split(',')
          : [];
      const keywords = kw.map((k: string) => String(k).trim()).filter(Boolean);
      if (keywords.length === 0) {
        errors.push(`${label} step ${si + 1}: at least one keyword is required`);
        return;
      }
      if (!step?.message || typeof step.message !== 'string') {
        errors.push(`${label} step ${si + 1}: "message" is required`);
        return;
      }
      const matchType: MatchType = step.matchType === 'exact' ? 'exact' : 'contains';
      steps.push({ keywords, matchType, message: step.message, delaySeconds: Number(step.delaySeconds) || 0 });
    });
    if (steps.length > 0) {
      valid.push({ name: item.name, isActive: item.isActive !== false, steps });
    }
  });

  return { valid, errors };
}

export function toStoredSteps(json: AutoReplyJSON): AutoReplyStep[] {
  return json.steps.map((s) => ({
    ...newStep(),
    keywords: Array.isArray(s.keywords) ? s.keywords : String(s.keywords).split(',').map((k) => k.trim()),
    matchType: s.matchType === 'exact' ? 'exact' : 'contains',
    message: s.message,
    delaySeconds: Number(s.delaySeconds) || 0,
  }));
}

/**
 * Evaluates an incoming message against the user's auto replies and, on a match,
 * sends the response through WhatsApp and stores it as an outgoing message.
 * Safe to call on every incoming message — it no-ops when nothing matches.
 */
export async function runAutoReply(params: {
  userId: string;
  contactId: string;
  contactPhone: string;
  incomingText: string;
  messageType?: string;
}): Promise<boolean> {
  const { userId, contactId, contactPhone, incomingText, messageType } = params;
  if (!userId || !contactId || !incomingText) return false;
  if (messageType && messageType !== 'text') return false;

  try {
    const { data: rows } = await supabase
      .from('auto_replies' as any)
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    const replies = (rows || []).map(rowToAutoReply);
    const matches = findAutoReplyMatches(replies, incomingText);
    if (matches.length === 0) return false;

    const { data: settings } = await supabase
      .from('whatsapp_settings')
      .select('api_token, phone_number_id')
      .eq('user_id', await getEffectiveWhatsAppUserId(userId))
      .maybeSingle();

    if (!settings?.api_token || !settings?.phone_number_id) return false;

    for (const match of matches) {
      const messageBody = await resolveAutoReplyVariables(contactId, match.step.message);

      const delay = Math.max(0, Number(match.step.delaySeconds) || 0);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay * 1000));

      const to = (contactPhone || '').replace(/[^\d+]/g, '').replace(/^\+/, '');
      const { data } = await supabase.functions.invoke('whatsapp-api', {
        body: {
          action: 'send_message',
          token: settings.api_token,
          phoneNumberId: settings.phone_number_id,
          to,
          type: 'text',
          content: messageBody,
        },
      });

      const wamid = data?.messageId || data?.wamid || null;

      await supabase.from('messages').insert({
        user_id: userId,
        contact_id: contactId,
        content: messageBody,
        type: 'text',
        status: data?.success ? 'sent' : 'failed',
        is_outgoing: true,
        whatsapp_message_id: wamid,
      } as any);
    }

    return true;
  } catch (err) {
    console.warn('[autoReply] failed', err);
    return false;
  }
}
