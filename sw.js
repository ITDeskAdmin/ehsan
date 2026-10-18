// ═══════════════════════════════════════════════════════════
// SERVICE WORKER — IT Panel Pro v7.3
// ═══════════════════════════════════════════════════════════

const CACHE_VERSION = 'v7.3.1'; // اگر فایل‌ها را تغییر دادی، این نسخه را تغییر بده
const STATIC_CACHE = 'panel-static-' + CACHE_VERSION;
const RUNTIME_CACHE = 'panel-runtime-' + CACHE_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json'
];

// نصب — پیش‌کش
self.addEventListener('install', (event) => {
  console.log('[SW] Installing v' + CACHE_VERSION);
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return cache.addAll(PRECACHE_URLS).catch(err => {
        console.warn('[SW] Precache partial fail:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// فعال‌سازی — پاک‌سازی نسخه‌های قدیمی
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating v' + CACHE_VERSION);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch — استراتژی هوشمند
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // فقط GET
  if (request.method !== 'GET') return;

  // Supabase و APIها → همیشه آنلاین (network-first)
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('api.github.com') ||
      url.hostname.includes('qrserver.com')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // فونت‌های گوگل → cache-first
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com') ||
      url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // صفحات و منابع محلی → network-first با fallback به cache
  if (url.origin === location.origin) {
    event.respondWith(networkFirst(request, true));
    return;
  }

  // بقیه → network-first
  event.respondWith(networkFirst(request));
});

// استراتژی: Network First
async function networkFirst(request, offlineFallback = false) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (offlineFallback) {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    return new Response('⚠️ آفلاین هستید', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

// استراتژی: Cache First
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('', { status: 503 });
  }
}

// پیام‌ها از صفحه اصلی
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
