import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const url = new URL(req.url);

  try {
    // GET /push-notifications?user_id=xxx&since=ISO_DATE
    if (req.method === 'GET') {
      const userId = url.searchParams.get('user_id');
      const since = url.searchParams.get('since');

      if (!userId) {
        return new Response(JSON.stringify({ error: 'user_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let query = supabase
        .from('messages')
        .select('id, contact_id, content, type, status, created_at, media_url, whatsapp_message_id')
        .eq('user_id', userId)
        .eq('is_outgoing', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (since) {
        query = query.gt('created_at', since);
      }

      const { data: messages, error: msgError } = await query;
      if (msgError) {
        return new Response(JSON.stringify({ error: msgError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const contactIds = [...new Set((messages || []).map(m => m.contact_id))];
      let contacts: Record<string, string> = {};

      if (contactIds.length > 0) {
        const { data: contactsData } = await supabase
          .from('contacts')
          .select('id, name')
          .in('id', contactIds);

        if (contactsData) {
          contacts = Object.fromEntries(contactsData.map(c => [c.id, c.name]));
        }
      }

      const notifications = (messages || []).map(m => ({
        id: m.id,
        contact_id: m.contact_id,
        contact_name: contacts[m.contact_id] || 'Unknown',
        content: m.content,
        type: m.type,
        media_url: m.media_url,
        created_at: m.created_at,
        whatsapp_message_id: m.whatsapp_message_id,
      }));

      return new Response(JSON.stringify({
        success: true,
        count: notifications.length,
        notifications,
        server_time: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /push-notifications — Register push token
    if (req.method === 'POST') {
      const body = await req.json();
      const { user_id, token, device_info, platform } = body;

      if (!user_id || !token) {
        return new Response(JSON.stringify({ error: 'user_id and token are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { error } = await supabase
        .from('push_tokens')
        .upsert(
          {
            user_id,
            token,
            platform: platform || null,
            device_info: device_info || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,token' }
        );

      if (error) {
        console.error('❌ Token upsert error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log('✅ Push token registered for user:', user_id, '| platform:', platform);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Push notifications error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
