/* eslint-disable no-undef */
// Legacy FCM service worker path — kept so devices that registered it previously
// keep receiving notifications. All logic lives in /fcm-sw.js (also imported by /sw.js).
importScripts('/fcm-sw.js');
