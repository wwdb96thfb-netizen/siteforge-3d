// SiteForge 3D app shell: opens from the copy kept on the device (works offline); updates are fetched quietly in the background.
var CACHE = "garrison3d-v2";
var SHELL = ["./", "./index.html", "./manifest.json", "./three.min.js", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: "no-cache" }); })); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf("garrison3d-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener("fetch", function (e) {
  var req = e.request; if (req.method !== "GET") return;
  var url = new URL(req.url); if (url.origin !== self.location.origin) return;
  var key = new Request(url.origin + url.pathname);
  var net = fetch(req.url, { cache: "no-cache" }).then(function (res) { if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(key, copy); }); } return res; });
  e.waitUntil(net.catch(function () {}));
  e.respondWith(caches.match(key).then(function (hit) { return hit || (/\/$/.test(url.pathname) ? caches.match(url.origin + url.pathname + "index.html") : null); }).then(function (hit) { return hit || net; }).catch(function () { return caches.match("./index.html"); }));
});
