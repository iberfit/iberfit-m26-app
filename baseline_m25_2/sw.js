const CACHE = 'iberfit-recovery-m25-2';
const ASSETS = [
  '/', '/index.html', '/src/styles.css', '/src/app.js', '/src/domain.js', '/src/planning.js', '/src/plan-change.js', '/src/rls-policy.js', '/src/iri.js',
  '/src/documents.js', '/src/reports.js', '/src/conflicts.js', '/src/session-lifecycle.js', '/src/intelligence.js', '/src/store.js', '/src/sync.js', '/src/api.js', '/src/auth.js',
  '/src/expediente.js', '/src/exercise-catalog.js', '/src/exercise-catalog-data.js', '/src/supabase-adapter.js', '/src/remote-hydration.js', '/src/experience.js', '/src/accessibility.js', '/src/performance.js',
  '/src/beta.js',
  '/src/observability.js',
  '/src/chaos.js',
  '/src/backup.js',
  '/src/load-probe.js',
  '/src/release-candidate.js',
  '/src/beta-operations.js',
  '/src/data-governance.js',
  '/src/production-readiness.js',
  '/src/rollout.js',
  '/src/release-operations.js',
  '/src/repositories/index.js', '/src/repositories/indexeddb.js', '/src/repositories/local-storage.js',
  '/src/repositories/supabase.js', '/src/repositories/hybrid.js', '/src/repositories/memory.js',
  '/public/runtime-config.js', '/public/exercise-catalog-m25.json', '/public/manifest.webmanifest', '/public/isotipo-iberfit.png', '/public/icon-192.png', '/public/icon-512.png', '/public/icon-maskable-192.png', '/public/icon-maskable-512.png', '/public/apple-touch-icon.png', '/public/favicon-32.png', '/public/favicon-64.png'
];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html'))));
});
