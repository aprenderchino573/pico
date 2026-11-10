// PICO — service worker: funciona sin conexión.
// Red primero (así las actualizaciones de GitHub llegan en cuanto hay conexión) y caché como respaldo.
const CACHE = 'pico-v3';
const ARCHIVOS = [
  './', 'index.html', 'estilo.css', 'movil.css', 'main.js', 'contenido.js', 'audio.js', 'stats.js', 'iconos.js', 'almacen.js',
  'manifest.webmanifest', 'fuentes/DSEG7Classic-Bold.woff2', 'fuentes/DSEG14Classic-Bold.woff2',
  'iconos/icono-192.png', 'iconos/icono-512.png', 'iconos/apple-touch-icon.png', 'iconos/favicon-32.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => { if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
