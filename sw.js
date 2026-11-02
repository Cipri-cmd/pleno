// Service worker mínimo: permite instalar la app y abrir la última versión sin conexión.
const C = "pleno-v26", SHELL = ["/", "/index.html", "/styles.css", "/lib.js", "/app.js", "/icon.svg"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("pleno-") && key !== C).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).then((r) => { const k = r.clone(); caches.open(C).then((c) => c.put(e.request, k)); return r; }).catch(() => caches.match(e.request)));
});
self.addEventListener("push", (event) => {
  let payload = {};
  if (event.data) {
    try { payload = event.data.json(); }
    catch { payload = { body: event.data.text() }; }
  }
  if (!payload || typeof payload !== "object") payload = { body: String(payload) };
  const title = String(payload.title || "PLENO").slice(0, 80);
  const options = {
    body: String(payload.body || "Hay novedades en tu liga.").slice(0, 240),
    icon: "/icon.svg",
    badge: "/icon.svg",
    tag: String(payload.tag || "pleno-update").slice(0, 100),
    renotify: Boolean(payload.renotify),
    data: { url: typeof payload.url === "string" ? payload.url : "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target;
  try { target = new URL(event.notification.data?.url || "/", self.location.origin); }
  catch { target = new URL("/", self.location.origin); }
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) return existing.navigate(target.href).then(() => existing.focus());
    return self.clients.openWindow(target.href);
  }));
});
