// Cola de marcas hechas sin conexión: se guardan en el teléfono con su hora real y se envían solas al volver la señal.
import { api, ApiError } from "./api.js";

const llave = (yo) => `obrapay.cola.${yo}`;
const oyentes = new Set();
let enCurso = false;
let vigilando = false;

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function leerCola(yo) {
  try {
    const l = JSON.parse(localStorage.getItem(llave(yo)));
    return Array.isArray(l) ? l : (memoria.get(yo) || []);
  } catch { return memoria.get(yo) || []; }
}
function guardar(yo, lista) {
  try { localStorage.setItem(llave(yo), JSON.stringify(lista)); } catch { /* modo privado: la cola vive solo mientras la página está abierta */ memoria.set(yo, lista); }
  oyentes.forEach((f) => { try { f(); } catch { /* nada */ } });
}
const memoria = new Map();

export const pendientes = (yo) => leerCola(yo).filter((x) => x.estado === "pendiente");
export const alCambiarCola = (f) => { oyentes.add(f); return () => oyentes.delete(f); };

// Crea una marca con su clave de reintento y la hora real del teléfono. Si se da `clave` y `hora`, se reutilizan (la marca ya se intentó enviar).
export function crearMarca({ tipo, proyecto_id = null, proyecto_nombre = "", empresa_id = null, lat = null, lng = null }) {
  return { clave: uuid(), tipo, proyecto_id, proyecto_nombre, empresa_id, lat, lng, hora: new Date().toISOString(), estado: "pendiente", error: null };
}
export function encolar(yo, marca) {
  const l = leerCola(yo);
  l.push({ ...marca, estado: "pendiente", error: null });
  guardar(yo, l);
}
export function descartar(yo, clave) {
  guardar(yo, leerCola(yo).filter((x) => x.clave !== clave));
}

export function enviarMarca(marca, conHora) {
  const extra = conHora ? { p_hora: marca.hora } : {};
  if (marca.tipo === "entrada") return api.rpc("marcar_entrada", { p_proyecto: marca.proyecto_id, p_lat: marca.lat, p_lng: marca.lng, p_clave: marca.clave, ...extra });
  return api.rpc("marcar_salida", { p_lat: marca.lat, p_lng: marca.lng, p_clave: marca.clave, ...extra });
}

// Envía en orden las marcas pendientes. Se detiene si no hay señal; un error del servidor deja la marca en "error" para que la persona la vea.
export async function sincronizar(yo) {
  if (enCurso || !api.sesion()) return 0;
  enCurso = true;
  let enviadas = 0;
  try {
    for (;;) {
      const lista = leerCola(yo);
      const marca = lista.find((x) => x.estado === "pendiente");
      if (!marca) break;
      try {
        await enviarMarca(marca, true);
        marca.estado = "enviada";
        marca.enviada_en = new Date().toISOString();
        enviadas++;
      } catch (e) {
        if (e instanceof ApiError && (e.status === 0 || e.status === 401 || e.status >= 500)) break;
        marca.estado = "error";
        marca.error = String(e?.message || e);
      }
      guardar(yo, lista);
    }
  } finally {
    enCurso = false;
    // Las enviadas se muestran un rato y luego se limpian.
    const limite = Date.now() - 6 * 3600 * 1000;
    const lista = leerCola(yo);
    const limpia = lista.filter((x) => !(x.estado === "enviada" && new Date(x.enviada_en || 0).getTime() < limite));
    if (limpia.length !== lista.length) guardar(yo, limpia);
  }
  return enviadas;
}

// Reintenta al volver la señal, al volver a la app y cada 30 segundos mientras haya pendientes.
export function vigilar(yo) {
  if (vigilando) return;
  vigilando = true;
  const probar = () => { if (pendientes(yo).length) sincronizar(yo).catch(() => {}); };
  window.addEventListener("online", probar);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") probar(); });
  setInterval(probar, 30000);
  probar();
}
