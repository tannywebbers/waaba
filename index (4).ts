import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const FREECONVERT_API = 'https://api.freeconvert.com/v1/process';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const apiKey = Deno.env.get('FREECONVERT_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ success: false, error: 'FREECONVERT_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { audioBase64, mimeType, extension } = await req.json();

    if (!audioBase64) {
      return new Response(JSON.stringify({ success: false, error: 'audioBase64 is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const srcExt = extension || (mimeType?.includes('ogg') ? 'ogg' : 'webm');
    const srcMime = mimeType || 'audio/webm';
    const filename = `voice-note.${srcExt}`;

    console.log('🎵 Starting audio conversion:', { srcExt, srcMime, dataLength: audioBase64.length });

    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Step 1: Create import/upload task
    console.log('📤 Step 1: Creating import task...');
    const importRes = await fetch(`${FREECONVERT_API}/import/upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ filename }),
    });

    if (!importRes.ok) {
      const err = await importRes.text();
      console.error('❌ Import task failed:', err);
      return new Response(JSON.stringify({ success: false, error: 'Failed to create upload task', details: err }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const importData = await importRes.json();
    const importTaskId = importData.id;
    const uploadUrl = importData.result?.form?.url;
    const uploadParams = importData.result?.form?.parameters || {};

    if (!uploadUrl) {
      console.error('❌ No upload URL in response:', JSON.stringify(importData));
      return new Response(JSON.stringify({ success: false, error: 'No upload URL returned' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Upload the file
    console.log('📤 Step 2: Uploading audio file...');
    const binaryData = Uint8Array.from(atob(audioBase64), c => c.charCodeAt(0));

    const formData = new FormData();
    // Add all form parameters first
    for (const [key, value] of Object.entries(uploadParams)) {
      formData.append(key, String(value));
    }
    formData.append('file', new Blob([binaryData], { type: srcMime }), filename);

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error('❌ Upload failed:', err);
      return new Response(JSON.stringify({ success: false, error: 'Failed to upload audio file' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Upload complete');

    // Step 3: Create convert task
    console.log('🔄 Step 3: Creating convert task...');
    const convertRes = await fetch(`${FREECONVERT_API}/convert`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input: importTaskId,
        input_format: srcExt,
        output_format: 'mp3',
        options: {
          audio_codec: 'mp3',
          audio_bitrate: '128k',
        },
      }),
    });

    if (!convertRes.ok) {
      const err = await convertRes.text();
      console.error('❌ Convert task failed:', err);
      return new Response(JSON.stringify({ success: false, error: 'Failed to create convert task' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const convertData = await convertRes.json();
    const convertTaskId = convertData.id;

    // Step 4: Create export task
    console.log('📥 Step 4: Creating export task...');
    const exportRes = await fetch(`${FREECONVERT_API}/export/url`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ input: convertTaskId }),
    });

    if (!exportRes.ok) {
      const err = await exportRes.text();
      console.error('❌ Export task failed:', err);
      return new Response(JSON.stringify({ success: false, error: 'Failed to create export task' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const exportData = await exportRes.json();
    const jobId = exportData.job;
    const exportTaskId = exportData.id;

    // Step 5: Poll for completion
    console.log('⏳ Step 5: Polling for completion... jobId:', jobId);
    const maxWait = 60000;
    const pollInterval = 2000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));

      const statusRes = await fetch(`${FREECONVERT_API}/tasks/${exportTaskId}`, { headers });
      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();
      console.log('   Poll status:', statusData.status);

      if (statusData.status === 'completed') {
        const downloadUrl = statusData.result?.url;
        if (!downloadUrl) {
          return new Response(JSON.stringify({ success: false, error: 'Conversion completed but no download URL' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        console.log('✅ Conversion complete! Download URL ready.');
        return new Response(JSON.stringify({ success: true, downloadUrl }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (statusData.status === 'error') {
        console.error('❌ Conversion error:', statusData.message);
        return new Response(JSON.stringify({ success: false, error: 'Audio conversion failed: ' + (statusData.message || 'Unknown error') }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Conversion timed out after 60 seconds' }), {
      status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ convert-audio error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
