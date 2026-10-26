// Sentinel 3D: always loads the newest version when online; works fully offline from the copy kept on the device.
var CACHE = "garrison3d-v31";
var SHELL = ["./", "./index.html", "./manifest.json", "./three.min.js", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./logo-64.png", "./fonts/fonts.css", "./fonts/rajdhani-latin-500-normal.woff2", "./fonts/rajdhani-latin-600-normal.woff2", "./fonts/rajdhani-latin-700-normal.woff2", "./fonts/saira-condensed-latin-500-normal.woff2", "./fonts/saira-condensed-latin-700-normal.woff2", "./fonts/ibm-plex-sans-latin-400-normal.woff2", "./fonts/ibm-plex-sans-latin-500-normal.woff2", "./fonts/ibm-plex-sans-latin-600-normal.woff2", "./fonts/ibm-plex-mono-latin-400-normal.woff2", "./fonts/ibm-plex-mono-latin-500-normal.woff2"];
self.addEventListener("install", function (e) { e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL.map(function (u) { return new Request(u, { cache: "reload" }); })); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error("timeout")); }, ms); }); }
self.addEventListener("fetch", function (e) {
  var req = e.request; if (req.method !== "GET") return;
  var url = new URL(req.url); if (url.origin !== self.location.origin) return; if (/icon|\.png$/.test(url.pathname)) return;
  var key = url.origin + url.pathname; if (/\/$/.test(url.pathname)) key += "index.html";
  var isPage = req.mode === "navigate" || /\.html$|\/$|sw\.js$|manifest\.json$/.test(url.pathname);
  var net = fetch(req.url, { cache: isPage ? "no-store" : "no-cache" }).then(function (res) { if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(key, copy); }); } return res; });
  if (isPage) {
    // newest first; fall back to the saved copy when offline or slow
    e.respondWith(Promise.race([net, timeout(4000)]).catch(function () { return caches.match(key).then(function (hit) { return hit || net; }); }));
  } else {
    e.waitUntil(net.catch(function () {}));
    e.respondWith(caches.match(key).then(function (hit) { return hit || net; }).catch(function () { return fetch(req); }));
  }
});
