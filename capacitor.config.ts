import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.25ebd64b4c514ca8841280005aac7bf8',
  appName: 'waaba',
  webDir: 'dist',
  server: {
    url: 'https://25ebd64b-4c51-4ca8-8412-80005aac7bf8.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  android: {
    // Portrait-only + no activity recreation on rotation
    // (set in AndroidManifest after `npx cap add android`)
  },
};

export default config;
