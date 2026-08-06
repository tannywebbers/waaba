import { supabase } from '@/integrations/supabase/client';
import { logEvent } from '@/lib/systemLog';

export interface SendDiagnosticInput {
  /** Where the send originated, e.g. 'chat:template', 'chat:media', 'bulk:template' */
  context: string;
  userId?: string | null;
  /** Recipient in international digits-only format */
  to?: string;
  messageType: string;
  templateName?: string;
  templateLanguage?: string;
  templateParams?: Record<string, string> | null;
  /** Whatever we passed into the edge function */
  request?: unknown;
  /** Raw response body from the whatsapp-api edge function */
  response?: any;
  /** Transport-level error from functions.invoke */
  invokeError?: { message?: string } | null;
}

/**
 * Records a full picture of one WhatsApp send attempt:
 * - into the in-app System Logs (Settings → System Logs), with the exact
 *   payload that reached Meta, the template name/params and Meta's error code
 * - into `webhook_logs` so it survives a reload and can be reviewed later
 */
export async function logSendDiagnostics(input: SendDiagnosticInput) {
  const {
    context, userId, to, messageType, templateName, templateLanguage, templateParams,
    request, response, invokeError,
  } = input;

  const success = !invokeError && !!response?.success;
  const diagnostics = response?.diagnostics ?? null;

  const errorSummary = success
    ? null
    : {
        message: response?.error || invokeError?.message || 'Unknown send failure',
        code: response?.errorCode ?? null,
        subcode: response?.errorSubcode ?? null,
        title: response?.errorTitle ?? null,
        details: response?.errorDetails ?? null,
        fbtraceId: response?.fbtraceId ?? null,
        httpStatus: diagnostics?.httpStatus ?? null,
      };

  const headline = success
    ? `✅ Send OK · ${messageType}${templateName ? ` · ${templateName}` : ''} → ${to || 'unknown'} · wamid ${response?.messageId || 'n/a'}`
    : `❌ Send FAILED · ${messageType}${templateName ? ` · ${templateName}` : ''} → ${to || 'unknown'} · Meta code ${errorSummary?.code ?? 'n/a'}${errorSummary?.subcode ? `/${errorSummary.subcode}` : ''} · ${errorSummary?.message}`;

  const details = {
    context,
    recipient: to,
    messageType,
    template: templateName
      ? {
          name: templateName,
          language: templateLanguage,
          paramsSent: templateParams ?? null,
          componentsSentToMeta: diagnostics?.templateComponentsSent ?? null,
        }
      : undefined,
    endpoint: diagnostics?.endpoint ?? null,
    graphApiVersion: diagnostics?.graphApiVersion ?? null,
    httpStatus: diagnostics?.httpStatus ?? null,
    durationMs: diagnostics?.durationMs ?? null,
    payloadSentToMeta: diagnostics?.requestPayload ?? request ?? null,
    metaResponse: diagnostics?.metaResponse ?? response ?? null,
    error: errorSummary,
  };

  logEvent(success ? 'info' : 'error', `send:${context}`, headline, details);

  if (!userId) return;

  try {
    await supabase.from('webhook_logs').insert({
      user_id: userId,
      event_type: success ? 'send_success' : 'send_failure',
      direction: 'outgoing',
      phone_number: to || null,
      message_type: templateName ? `template:${templateName}` : messageType,
      status: success ? 'sent' : 'failed',
      error: success ? null : `${errorSummary?.code ?? ''}${errorSummary?.subcode ? `/${errorSummary.subcode}` : ''} ${errorSummary?.message ?? ''}`.trim(),
      payload: details as any,
    } as any);
  } catch (e) {
    logEvent('warn', 'send:diagnostics', 'Could not persist send diagnostics to webhook_logs.', {
      reason: e instanceof Error ? e.message : String(e),
    });
  }
}
