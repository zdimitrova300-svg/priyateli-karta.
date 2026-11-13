'use strict';

const VERSION = 'priyateli-v7';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const TILE_CACHE = `${VERSION}-tiles`;
const TILE_LIMIT = 240;

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png',
];

const RUNTIME_HOSTS = new Set([
  'cdn.jsdelivr.net',
  'unpkg.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![SHELL_CACHE, RUNTIME_CACHE, TILE_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function trimCache(name, limit) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

function isTile(url) {
  return url.hostname === 'tile.openstreetmap.org';
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const type = response.headers.get('content-type') || '';
          if (response.ok && type.includes('text/html')) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html').then((cached) => cached || Response.error()))
    );
    return;
  }

  if (isTile(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok || response.type === 'opaque') {
            cache.put(request, response.clone()).then(() => trimCache(TILE_CACHE, TILE_LIMIT));
          }
          return response;
        } catch {
          return cached || Response.error();
        }
      })
    );
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !RUNTIME_HOSTS.has(url.hostname)) return;

  event.respondWith(
    caches.open(RUNTIME_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok || response.type === 'opaque') {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    })
  );
});
