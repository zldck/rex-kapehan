const CACHE_NAME = 'rex-kapehan-v2';
const RUNTIME_CACHE = 'rex-kapehan-runtime-v2';
const API_CACHE = 'rex-kapehan-api-v2';

const urlsToCache = [
  '/',
  '/admin',
  '/dashboard',
  '/manifest.json',
  '/offline.html',
  '/globals.css',
];

// Install the service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(urlsToCache);
      }),
    ]).then(() => self.skipWaiting())
  );
});

// Intercept network requests
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isAPI = url.pathname.startsWith('/api/');
  const isAsset = /\.(js|css|png|jpg|jpeg|svg|gif|webp|woff2|woff|ttf|eot)$/.test(url.pathname);

  if (event.request.method !== 'GET') {
    return;
  }

  // API routes: stale-while-revalidate
  if (isAPI) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(API_CACHE).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        });
        return response || fetchPromise;
      }).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Assets: cache-first
  if (isAsset) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        }).catch(() => {
          return caches.match('/offline.html');
        });
      })
    );
    return;
  }

  // Pages: network-first
  event.respondWith(
    fetch(event.request).then((response) => {
      if (!response || response.status !== 200 || response.type !== 'basic') {
        return response;
      }
      const responseToCache = response.clone();
      caches.open(RUNTIME_CACHE).then((cache) => {
        cache.put(event.request, responseToCache);
      });
      return response;
    }).catch(() => {
      return caches.match(event.request).then((response) => {
        return response || caches.match('/offline.html');
      });
    })
  );
});

// Remove old caches on activation
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME, RUNTIME_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});