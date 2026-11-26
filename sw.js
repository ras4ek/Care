/* ────────────────────────────────────────────────────────────────
   sw.js — офлайн-оболочка (работает на https, например GitHub Pages)
   Стратегия: сначала сеть, кэш — только если сети нет.
   Так обновления приложения видны сразу, без «залипших» старых версий.
   Запросы к Firebase не перехватываются.
   ──────────────────────────────────────────────────────────────── */

var CACHE = 'vmeste-v5';
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
  './welcome.jpg',
  './tree.jpg',
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
    fetch(req)
      .then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) {
            c.put(req, copy).catch(function () {});
          });
        }
        return res;
      })
      .catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || caches.match('./index.html');
        });
      })
  );
});
