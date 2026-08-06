import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    const now = new Date().toISOString();
    console.log('SCHEDULED WORKER HIT:', now);

    await supabase.from('webhook_logs').insert({
      event_type: 'scheduled_worker_execution',
      direction: 'outgoing',
      status: 'running',
      payload: { now },
    });

    const { data: dueMessages, error } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(25);

    if (error) throw error;

    let processed = 0;
    for (const scheduled of dueMessages || []) {
      const { data: claimed } = await supabase
        .from('scheduled_messages')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', scheduled.id)
        .eq('status', 'pending')
        .select('*')
        .maybeSingle();

      if (!claimed) continue;

      try {
        const [{ data: settings }, { data: contact }] = await Promise.all([
          supabase.from('whatsapp_settings').select('*').eq('user_id', claimed.user_id).maybeSingle(),
          supabase.from('contacts').select('*').eq('id', claimed.contact_id).maybeSingle(),
        ]);

        if (!settings?.api_token || !settings?.phone_number_id || !contact?.phone) {
          throw new Error('Missing WhatsApp settings or recipient contact');
        }

        const { data: alreadySent } = await supabase
          .from('scheduled_messages')
          .select('id')
          .eq('id', claimed.id)
          .eq('status', 'sent')
          .maybeSingle();

        if (alreadySent) continue;

        const to = String(contact.phone).replace(/[^\d+]/g, '').replace(/^\+/, '');
        const sendRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({
            action: 'send_message',
            token: settings.api_token,
            phoneNumberId: settings.phone_number_id,
            to,
            type: claimed.type,
            content: claimed.content,
            templateName: claimed.template_name,
            templateLanguage: claimed.template_language || 'en',
            templateParams: claimed.template_params || undefined,
          }),
        });
        const sendData = await sendRes.json();
        if (!sendRes.ok || !sendData?.success) throw new Error(sendData?.error || 'WhatsApp send failed');

        await supabase.from('messages').insert({
          user_id: claimed.user_id,
          contact_id: claimed.contact_id,
          content: claimed.content,
          type: claimed.type,
          status: 'sent',
          is_outgoing: true,
          whatsapp_message_id: sendData.messageId || null,
          template_name: claimed.template_name,
          template_params: claimed.template_params,
        });

        await supabase.from('scheduled_messages').update({ status: 'sent', error: null, updated_at: new Date().toISOString() }).eq('id', claimed.id);
        await supabase.from('webhook_logs').insert({ user_id: claimed.user_id, event_type: 'scheduled_message', direction: 'outgoing', status: 'success', phone_number: contact.phone, message_type: claimed.type, payload: { scheduled_message_id: claimed.id } });
        processed++;
      } catch (sendError) {
        const message = sendError instanceof Error ? sendError.message : String(sendError);
        await supabase.from('scheduled_messages').update({ status: 'failed', error: message, updated_at: new Date().toISOString() }).eq('id', claimed.id);
        await supabase.from('webhook_logs').insert({ user_id: claimed.user_id, event_type: 'scheduled_message', direction: 'outgoing', status: 'failed', error: message, payload: { scheduled_message_id: claimed.id } });
      }
    }

    await supabase.from('webhook_logs').insert({
      event_type: 'scheduled_worker_execution',
      direction: 'outgoing',
      status: 'success',
      payload: { now, processed },
    });

    return new Response(JSON.stringify({ success: true, processed }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    await supabase.from('webhook_logs').insert({
      event_type: 'scheduled_worker_execution',
      direction: 'outgoing',
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});