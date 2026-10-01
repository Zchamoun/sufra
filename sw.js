/* Sufra service worker. Keeps the app working offline and installs updates only when the person taps "Update now".
   Every release changes VERSION (and the ?v= numbers in index.html), which is how phones notice a new version. */
const VERSION = "0.6.3";
const CACHE = "sufra-" + VERSION;
const FILES = [
  "./", "index.html", "manifest.webmanifest",
  "css/sufra.css?v=" + VERSION, "js/app.js?v=" + VERSION,
  "i18n/en.json", "i18n/ar.json", "i18n/fr.json",
  "data/options.json", "data/families.json", "data/sources.json",
  "data/dishes/index.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png"
];

self.addEventListener("install", e => {
  // cache: "reload" skips the browser's saved copies, so the new version gets fresh files. No skipWaiting here:
  // the new version waits until the person chooses to update.
  e.waitUntil(caches.open(CACHE).then(async c => {
    await c.addAll(FILES.map(u => new Request(u, { cache: "reload" })));
    const idx = await (await c.match("data/dishes/index.json")).json(); // every dish file listed there is saved too
    await c.addAll((idx.files || []).map(f => new Request(`data/dishes/${f}.json`, { cache: "reload" })));
  }));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("sufra-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
  if (e.data === "version" && e.ports[0]) e.ports[0].postMessage(VERSION);
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === "navigate") return (await c.match("./")) || (await c.match("index.html"));
      throw err;
    }
  }));
});
