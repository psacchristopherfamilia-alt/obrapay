// Deja abrir ObraPay sin señal: guarda la app en el teléfono. Los datos nunca se guardan aquí (van directo a Supabase).
const VERSION = "obrapay-v1";
const NUCLEO = [
  "./", "index.html", "config.js", "manifest.webmanifest", "icono.svg", "icono-192.png", "icono-512.png",
  "css/app.css",
  "js/api.js", "js/app.js", "js/avisos.js", "js/cola.js", "js/contador.js", "js/datos.js", "js/i18n.js", "js/ui.js", "js/xlsx.js",
  "js/vistas/acceso.js", "js/vistas/admin.js", "js/vistas/companias.js", "js/vistas/contador.js", "js/vistas/dueno.js",
  "js/vistas/herramientas.js", "js/vistas/seguros.js", "js/vistas/supervisor.js", "js/vistas/trabajador.js",
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => Promise.all(NUCLEO.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (ev) => {
  ev.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const mismo = url.origin === self.location.origin;
  const fuentes = /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!mismo && !fuentes) return; // Supabase y todo lo demás va directo a la red
  if (fuentes) {
    // Las tipografías se muestran del teléfono y se actualizan en segundo plano.
    ev.respondWith(caches.open(VERSION).then(async (c) => {
      const guardada = await c.match(req);
      const red = fetch(req).then((r) => { c.put(req, r.clone()); return r; }).catch(() => guardada);
      return guardada || red;
    }));
    return;
  }
  // Con señal siempre se descarga la versión nueva; sin señal se usa la guardada.
  ev.respondWith(fetch(req).then((r) => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(req, copia)); }
    return r;
  }).catch(async () => (await caches.match(req)) || (req.mode === "navigate" ? caches.match("index.html") : Response.error())));
});
