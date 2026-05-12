// sw.js - Basic Service Worker for PWA
const CACHE_NAME = 'book-of-elisha-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Activate worker immediately
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim()); // Become available to all pages
});

// A simple pass-through cache strategy. 
// It fetches from the network first. If offline, it tries to serve from cache.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Optional: Cache files as the user visits them
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          if (event.request.method === 'GET') {
            cache.put(event.request, responseClone);
          }
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
