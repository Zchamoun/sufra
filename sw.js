/* Sufra service worker (stable: this file should not need to change between releases).
   It serves the app from a saved copy, so Sufra works offline. Which saved copy is in use is
   recorded in "sufra-meta". A new version is only downloaded and switched to when the person
   taps "Update now" in the app. Closing or reopening the app never changes the version. */
const META = "sufra-meta";

async function current() {
  const r = await (await caches.open(META)).match("current");
  return r ? (await r.text()) : null;
}
async function setCurrent(v) { await (await caches.open(META)).put("current", new Response(v)); }
async function latestInfo() {
  const r = await fetch("version.json", { cache: "no-store" });
  if (!r.ok) throw new Error("version.json " + r.status);
  return r.json();
}
async function download(info) { // saves every file of a version; throws if any file is missing
  const c = await caches.open("sufra-" + info.version);
  await c.addAll(info.files.map(u => new Request(u, { cache: "reload" })));
}
async function dropOld(keep) {
  for (const k of await caches.keys()) if (k.startsWith("sufra-") && k !== META && k !== "sufra-" + keep) await caches.delete(k);
}

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    if (!(await current())) { // first time on this phone: save the version that is online now
      const info = await latestInfo();
      await download(info);
      await setCurrent(info.version);
    }
    await self.skipWaiting(); // safe: switching this file never changes which version is shown
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => { const v = await current(); if (v) await dropOld(v); await self.clients.claim(); })());
});

self.addEventListener("message", e => {
  const port = e.ports && e.ports[0];
  if (!port) return;
  if (e.data === "version") { current().then(v => port.postMessage(v)); return; }
  if (e.data === "update") { // only ever started by the "Update now" button
    (async () => {
      try {
        const info = await latestInfo();
        await download(info);
        await setCurrent(info.version);
        await dropOld(info.version);
        port.postMessage({ ok: true, version: info.version });
      } catch (err) { port.postMessage({ ok: false }); }
    })();
  }
});

self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.endsWith("/version.json")) return; // always asked from the internet
  e.respondWith((async () => {
    const v = await current();
    if (v) {
      const c = await caches.open("sufra-" + v);
      const hit = await c.match(req) || (req.mode === "navigate" ? (await c.match("./")) || (await c.match("index.html")) : null);
      if (hit) return hit;
    }
    return fetch(req);
  })());
});
