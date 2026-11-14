/* 点卯 · Service Worker
 * 版本号与 index.html 的 ?v= 同步递增：改完代码改这里的一行即可
 */
var VERSION = '20261114b';
var CACHE = 'dianmao-' + VERSION;
var V = '?v=' + VERSION;

/* 首次安装即预缓存全部静态资源（带版本号，与 index.html 一致） */
var CORE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css' + V,
  './js/store.js' + V,
  './js/lane.js' + V,
  './js/remind.js' + V,
  './js/view-editor.js' + V,
  './js/view-day.js' + V,
  './js/view-month.js' + V,
  './js/app.js' + V,
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return Promise.all(CORE.map(function (u) {
        return c.add(new Request(u, { cache: 'reload' })).catch(function () { });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE && k.indexOf('dianmao-') === 0) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;

  // 页面导航：先网络，失败回落到缓存的 index.html
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) {
          return r || caches.match('./');
        });
      })
    );
    return;
  }

  // 静态资源：缓存优先，未命中则取回并存入（带 ?v= 的 URL 天然按版本隔离）
  e.respondWith(
    caches.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return hit || Response.error();
      });
    })
  );
});
