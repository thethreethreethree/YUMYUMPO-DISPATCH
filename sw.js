// YUMYUMPO Dispatch — service worker
// Strategy: network-first for HTML (so updates ship instantly),
// stale-while-revalidate for CSS/JS, cache-first for images.
const VERSION = "v1.0.0";
const HTML_CACHE  = `html-${VERSION}`;
const ASSET_CACHE = `asset-${VERSION}`;
const IMG_CACHE   = `img-${VERSION}`;

self.addEventListener("install", e => { self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.endsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache Supabase API/realtime/auth traffic.
  if (url.hostname.includes("supabase.co") || url.hostname.includes("supabase.in")) return;

  const accept = req.headers.get("accept") || "";
  if (accept.includes("text/html")) {
    e.respondWith(networkFirst(req, HTML_CACHE));
  } else if (/\.(css|js|mjs)$/.test(url.pathname)) {
    e.respondWith(staleWhileRevalidate(req, ASSET_CACHE));
  } else if (/\.(png|jpg|jpeg|webp|svg|gif|ico)$/.test(url.pathname) || url.hostname.includes("images.unsplash.com") || url.hostname.includes("placehold.co") || url.hostname.includes("i.pravatar.cc")) {
    e.respondWith(cacheFirst(req, IMG_CACHE));
  }
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    return cached || Response.error();
  }
}
async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const networkPromise = fetch(req).then(res => { cache.put(req, res.clone()); return res; }).catch(() => null);
  return cached || (await networkPromise) || Response.error();
}
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try { const res = await fetch(req); cache.put(req, res.clone()); return res; }
  catch { return Response.error(); }
}

// Web Push (optional — only fires if you've wired a push provider).
self.addEventListener("push", (e) => {
  if (!e.data) return;
  let payload = {};
  try { payload = e.data.json(); } catch { payload = { title: e.data.text() }; }
  e.waitUntil(self.registration.showNotification(payload.title || "YUMYUMPO Dispatch", {
    body: payload.body || "",
    icon: payload.icon || "https://placehold.co/192x192/FFD000/111111?text=Y",
    badge: "https://placehold.co/96x96/FFD000/111111?text=Y",
    data: payload.data || {},
    tag: payload.tag || "dispatch-" + Date.now(),
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    for (const c of clients) { if (c.url.includes(url) && "focus" in c) return c.focus(); }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  }));
});
