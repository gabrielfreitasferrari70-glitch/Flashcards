// MedReview Cache Cleanser - Unregisters legacy service workers and purges stale caches
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll())
      .then((clients) => {
        clients.forEach((client) => {
          if (client.url && 'navigate' in client) {
            client.navigate(client.url)
          }
        })
      })
  )
})

// Never intercept network requests with stale cache
self.addEventListener('fetch', () => {
  return
})
