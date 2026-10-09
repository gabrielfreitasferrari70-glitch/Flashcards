// MedReview PWA Offline Service Worker (Cache-First para mídias/catálogo + Stale-While-Revalidate para UI)
const CACHE_NAME = 'medreview-pwa-v2'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/catalog.json',
  '/favicon.ico',
  '/og-image.png'
]

// Instalação: pré-armazena os arquivos essenciais para o funcionamento offline
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pré-cache parcial:', err)
      })
    })
  )
  self.skipWaiting()
})

// Ativação: limpa versões legadas do cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    }).then(() => self.clients.claim())
  )
})

// Interceptação de requisições: garante funcionamento 100% offline
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // 1. Não intercepta requisições de auth ou Supabase Realtime (WebSockets)
  if (url.pathname.includes('/realtime/') || url.pathname.includes('/auth/v1/')) {
    return
  }

  // 2. Mídias de cartas (/cards-media/) e CDN jsDelivr: Cache First com fallback de rede
  if (url.pathname.includes('/cards-media/') || url.hostname.includes('jsdelivr.net') || url.hostname.includes('githubusercontent.com')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return networkRes
        }).catch(() => {
          // Se estiver offline e não tiver no cache, retorna resposta vazia amigável
          return new Response('', { status: 408, statusText: 'Offline' })
        })
      })
    )
    return
  }

  // 3. Catálogo de cartas (/catalog.json) e App Shell: Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200 && event.request.method === 'GET') {
            const clone = networkRes.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return networkRes
        })
        .catch(() => cached)

      return cached || fetchPromise
    })
  )
})
