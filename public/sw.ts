/// <reference lib="webworker" />

import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkFirst, CacheFirst } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope;

/*
====================================================
STATIC CACHE NAME (NO VERSIONING)
====================================================
*/
const CACHE_PREFIX = `lotus-cache`;

/*
====================================================
INSTALL — silent install only
(no skipWaiting)
====================================================
*/
self.addEventListener('install', () => {
  console.log('Service Worker installed silently');
});

/*
====================================================
ACTIVATE — only cleanup outdated workbox caches
(no clientsClaim, no takeover)
====================================================
*/
self.addEventListener('activate', () => {
  console.log('Service Worker activated quietly');
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

/*
====================================================
ROUTES — BACKGROUND CACHING ONLY
====================================================
*/

/* Pages */
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new StaleWhileRevalidate({
    cacheName: `${CACHE_PREFIX}-pages`,
  })
);

/* Images */
registerRoute(
  ({ url }) =>
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.svg'),
  new CacheFirst({
    cacheName: `${CACHE_PREFIX}-images`,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      }),
    ],
  })
);

/* Fonts */
registerRoute(
  ({ url }) =>
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff'),
  new CacheFirst({
    cacheName: `${CACHE_PREFIX}-fonts`,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
    ],
  })
);

/* Supabase / API */
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co'),
  new NetworkFirst({
    cacheName: `${CACHE_PREFIX}-api`,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60, // 1 hour
      }),
    ],
  })
);

/*
====================================================
PUSH NOTIFICATIONS
====================================================
*/
self.addEventListener('push', (event: PushEvent) => {
  let data: any = {};

  try {
    data = event.data?.json() || {};
  } catch {
    data = {
      title: 'New Message',
      body: event.data?.text() || 'You have a new message',
    };
  }

  const options: NotificationOptions = {
    body: data.body || 'You have a new message',
    icon: data.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: data.data || {},
    requireInteraction: false,
    silent: false,
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(data.title || 'Notification', options));
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(urlToOpen);
    })
  );
});

/*
====================================================
BACKGROUND SYNC
====================================================
*/
self.addEventListener('sync', (event: any) => {
  if (event.tag === 'send-messages') {
    event.waitUntil(Promise.resolve());
  }
});

/*
====================================================
MESSAGES FROM FRONTEND
ONLY manual update allowed
====================================================
*/
self.addEventListener('message', (event: ExtendableMessageEvent) => {

  if (event.data?.type === 'PLAY_NOTIFICATION_SOUND') {
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) =>
        client.postMessage({ type: 'PLAY_SOUND' })
      );
    });
  }

  /*
  ONLY manual activation
  */
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
