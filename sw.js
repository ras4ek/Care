/* ────────────────────────────────────────────────────────────────
   sw.js — офлайн-оболочка (работает на https, например GitHub Pages)
   Firebase-запросы не кэшируем: они всегда идут в сеть.
   ──────────────────────────────────────────────────────────────── */

var CACHE = 'vmeste-v2';
var SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './config.js',
  './core.js',
  './net.js',
  './ui.js',
  './app.js',
  './icon.svg',
  './icon-maskable.svg'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(
    caches
      .open(CACHE)
      .then(function (c) {
        return Promise.all(
          SHELL.map(function (url) {
            return c.add(url).catch(function () { /* файл мог не существовать */ });
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (k) {
            if (k !== CACHE) return caches.delete(k);
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;

  var url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  /* чужие домены (Firebase, Google) — мимо кэша */
  if (url.origin !== location.origin) return;

  ev.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req)
        .then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) {
              c.put(req, copy).catch(function () {});
            });
          }
          return res;
        })
        .catch(function () {
          return hit || caches.match('./index.html');
        });

      return hit || net;
    })
  );
});
