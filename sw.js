// Sirve la app desde caché al instante y actualiza los recursos en segundo plano.
const C = "pleno-v41", SHELL = ["/", "/index.html", "/manifest.webmanifest", "/styles.css?v=39", "/lib.js?v=33", "/app.js?v=40", "/icon.svg", "/icon-192.svg", "/icon-512.svg"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("pleno-") && key !== C).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  const refresh = fetch(e.request).then((response) => {
    if (response.status === 200 && response.type === "basic") {
      return caches.open(C).then((cache) => cache.put(e.request, response.clone())).then(() => response);
    }
    return response;
  });
  e.waitUntil(refresh.catch((error) => console.warn("No se pudo actualizar la caché de PLENO:", error)));
  e.respondWith(caches.match(e.request).then((cached) => cached || refresh));
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
