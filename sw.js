// Service worker: guarda os arquivos do app para funcionar sem internet.
// Ao incluir ou renomear arquivos, atualize a lista e aumente a VERSAO.
const VERSAO = 'phe-v5';
const ARQUIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/db.js',
  'js/model.js',
  'js/seed.js',
  'js/xlsx.js',
  'js/planilha.js',
  'data/anvisa.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSAO).then(function (c) { return c.addAll(ARQUIVOS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (nomes) {
    return Promise.all(nomes.filter(function (n) { return n !== VERSAO; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});

// Rede primeiro (pega atualizações quando há internet) e cache quando estiver offline.
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then(function (resp) {
    if (resp.ok) {
      const copia = resp.clone();
      caches.open(VERSAO).then(function (c) { c.put(e.request, copia); });
    }
    return resp;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true });
  }));
});
