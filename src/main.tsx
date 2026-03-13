import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyAdminAppearance } from '@/lib/adminAppearance';

const SW_VERSION = import.meta.env.VITE_APP_VERSION || '1';
const SW_CACHE_PREFIX = `waba-${SW_VERSION}`;

applyAdminAppearance();
window.addEventListener('storage', (event) => {
  if (event.key?.startsWith('admin_')) applyAdminAppearance();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('✅ Service Worker registered:', registration.scope);

      const applyUpdate = (sw: ServiceWorker) => {
        sw.postMessage({ type: 'SKIP_WAITING' });
      };

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            applyUpdate(installing);
          }
        });
      });

      if (registration.waiting) {
        applyUpdate(registration.waiting);
      }

      // Clean old caches for previous versions
      const cacheKeys = await caches.keys();
      await Promise.all(
        cacheKeys
          .filter((key) => (key.startsWith('waba-') || key.startsWith('lotus-')) && !key.startsWith(SW_CACHE_PREFIX))
          .map((key) => caches.delete(key)),
      );

      // Silent update: do NOT reload on controllerchange
      // The new SW will activate on next user-initiated reload
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('✅ New service worker activated. Changes take effect on next reload.');
      });

      // Check for updates periodically
      setInterval(() => {
        registration.update();
      }, 5 * 60 * 1000);
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
    }
  });

  // Play notification sound when SW asks for it
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'PLAY_SOUND') return;

    const audio = new Audio('data:audio/wav;base64,UklGRl4FAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YToFAACAgICAgICAgICAgICAgICAgICA/3+AgP9/gID/f4CAgICAgICAgICAgH+AgIB/gICAf4CAgH+AgIB/gICAgICAgICAgICAgICAgICAgP9/gID/f4CA/3+AgP9/gIB/gICAgICAgICAgICAgICAgICAgICA/3+AgP9/gID/f4CA/3+AgICAgICAgICAgICAgICAgICAgICAgICA/3+AgP9/gIB/gICAf4CAgH+AgIB/gICAgICAgICAgICAgICAgICA');
    audio.volume = 0.5;
    audio.play().catch(() => {});
  });
}

let deferredPrompt: (Event & { prompt?: () => void }) | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e as Event & { prompt?: () => void };
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
});

createRoot(document.getElementById('root')!).render(<App />);
