// MedReview PWA Service Worker
// - App shell (navegação): rede primeiro, cache só como reserva offline
// - /assets/* (arquivos com hash): cache primeiro
// - Mídias de cartas, jsDelivr e GitHub: cache primeiro
// - Catálogo, ícones, manifest e fontes: stale-while-revalidate
// - Supabase (REST, Auth, Realtime, Storage privado) e qualquer outra origem: NUNCA passa pelo cache
const CACHE_NAME = 'medreview-pwa-v7' // v7 apaga o cache antigo (inclui respostas do Supabase guardadas por engano)

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/catalog.json',
  '/favicon.ico',
  '/favicon.svg',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/apple-touch-icon.png',
  '/og-image.png',
]

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

// Instalação: pré-armazena o essencial; um arquivo que falhe não derruba os demais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(STATIC_ASSETS.map((asset) => cache.add(asset)))
    )
  )
  self.skipWaiting()
})

// Ativação: remove versões antigas do cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

function offlineResponse() {
  return new Response('', { status: 408, statusText: 'Offline' })
}

// Só guarda respostas 200 e nunca guarda HTML no lugar de JS/CSS
// (acontece quando um arquivo antigo some e o servidor devolve o index.html)
function isCacheable(request, response) {
  if (!response || response.status !== 200) return false
  const type = response.headers.get('content-type') || ''
  if ((request.destination === 'script' || request.destination === 'style') && type.includes('text/html')) {
    return false
  }
  return true
}

function putInCache(key, response) {
  const clone = response.clone()
  return caches.open(CACHE_NAME).then((cache) => cache.put(key, clone))
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (isCacheable(request, response)) putInCache(request, response)
    return response
  } catch (err) {
    return offlineResponse()
  }
}

async function staleWhileRevalidate(event) {
  const request = event.request
  const cached = await caches.match(request)
  const network = fetch(request)
    .then((response) => {
      if (isCacheable(request, response)) putInCache(request, response)
      return response
    })
    .catch(() => null)

  if (cached) {
    event.waitUntil(network) // mantém o SW vivo até atualizar o cache em segundo plano
    return cached
  }
  return (await network) || offlineResponse()
}

// Navegação: sempre tenta a versão nova do app; offline usa a última guardada
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request)
    if (response && response.status === 200) putInCache('/index.html', response)
    return response
  } catch (err) {
    return (
      (await caches.match('/index.html')) ||
      (await caches.match('/')) ||
      offlineResponse()
    )
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request

  // Só trata GET; escritas e requisições parciais (vídeo/áudio) vão direto para a rede
  if (request.method !== 'GET' || request.headers.has('range')) return

  const url = new URL(request.url)

  // 1. Mídias das cartas e CDNs: cache primeiro
  if (
    url.pathname.includes('/cards-media/') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('githubusercontent.com')
  ) {
    event.respondWith(cacheFirst(request))
    return
  }

  // 2. Outras origens: só as fontes do Google entram no cache.
  //    Supabase (REST/Auth/Realtime) e o resto passam direto, sem cache.
  if (url.origin !== self.location.origin) {
    if (FONT_HOSTS.includes(url.hostname)) {
      event.respondWith(staleWhileRevalidate(event))
    }
    return
  }

  // 3. Mesma origem
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  // catalog.json, manifest, ícones etc.
  event.respondWith(staleWhileRevalidate(event))
})
