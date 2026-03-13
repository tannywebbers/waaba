import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── FCM HTTP v1 helpers ──

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8', binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
}

function base64url(data: string | Uint8Array): string {
  const str = typeof data === 'string'
    ? btoa(data)
    : btoa(String.fromCharCode(...data));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getGoogleAccessToken(serviceAccount: { client_email: string; private_key: string; project_id: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));

  const key = await importPrivateKey(serviceAccount.private_key);
  const signatureInput = new TextEncoder().encode(`${header}.${payload}`);
  const signatureBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, signatureInput);
  const signature = base64url(new Uint8Array(signatureBuffer));

  const jwt = `${header}.${payload}.${signature}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`Google OAuth error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

async function sendFCM(token: string, title: string, body: string, data: Record<string, string>, serviceAccount: any): Promise<any> {
  const accessToken = await getGoogleAccessToken(serviceAccount);
  const projectId = serviceAccount.project_id;

  const message = {
    message: {
      token,
      notification: { title, body },
      data: data || {},
      webpush: {
        notification: {
          title,
          body,
          icon: '/pwa-192x192.png',
          badge: '/pwa-192x192.png',
          tag: data?.contactId ? `message-${data.contactId}` : 'waba-message',
          renotify: true,
          vibrate: [200, 100, 200],
        },
        fcm_options: {
          link: data?.contactId ? `/?chat=${data.contactId}` : '/',
        },
      },
      android: {
        priority: 'high' as const,
        notification: { sound: 'default', channel_id: 'default' },
      },
    },
  };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    }
  );

  const result = await res.json();
  if (!res.ok) {
    console.error('❌ FCM error:', JSON.stringify(result));
    throw new Error(`FCM send failed: ${JSON.stringify(result)}`);
  }
  return result;
}

async function sendExpo(token: string, title: string, body: string, data: Record<string, string>): Promise<any> {
  const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: token,
      title: title || 'New Message',
      body: body || 'You have a new message',
      data: data || {},
      sound: 'default',
      priority: 'high',
      badge: 1,
      channelId: 'default',
    }),
  });
  return expoResponse.json();
}

// ── Main handler ──

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { token, title, body, data } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ success: false, error: 'token is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const isExpoToken = token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
    const msgTitle = title || 'New Message';
    const msgBody = body || 'You have a new message';
    // Ensure data values are strings for FCM
    const stringData: Record<string, string> = {};
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        stringData[k] = String(v);
      }
    }

    let result: any;

    if (isExpoToken) {
      console.log('📤 Sending Expo push to:', token);
      result = await sendExpo(token, msgTitle, msgBody, stringData);

      if (result?.data?.status === 'error') {
        console.error('❌ Expo push error:', result.data.message);
      } else {
        console.log('✅ Expo push sent');
      }
    } else {
      // FCM token
      const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
      if (!serviceAccountJson) {
        console.error('❌ FIREBASE_SERVICE_ACCOUNT secret not set, cannot send FCM');
        return new Response(JSON.stringify({ success: false, error: 'FCM not configured' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const serviceAccount = JSON.parse(serviceAccountJson);
      console.log('📤 Sending FCM push to:', token.substring(0, 20) + '...');
      result = await sendFCM(token, msgTitle, msgBody, stringData, serviceAccount);
      console.log('✅ FCM push sent:', result?.name);
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ send-push error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
