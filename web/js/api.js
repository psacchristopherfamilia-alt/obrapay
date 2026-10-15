// Cliente mínimo de Supabase (Auth + REST + RPC + Edge Functions) con fetch, sin dependencias.
import { SUPABASE_URL, SUPABASE_KEY, DOMINIO_INTERNO } from "../config.js";

const LLAVE_SESION = "obrapay.sesion";
let sesion = leerSesion();
const oyentes = new Set();

function leerSesion() {
  try { return JSON.parse(localStorage.getItem(LLAVE_SESION)); } catch { return null; }
}
function guardarSesion(s) {
  sesion = s;
  try {
    if (s) localStorage.setItem(LLAVE_SESION, JSON.stringify(s));
    else localStorage.removeItem(LLAVE_SESION);
  } catch { /* modo privado: la sesión vive solo en memoria */ }
  if (!s) oyentes.forEach((f) => f());
}
function normalizar(d) {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    user_id: d.user?.id,
  };
}

export class ApiError extends Error {
  constructor(mensaje, status, codigo) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

async function pedir(ruta, { method = "GET", body, auth = true, headers = {} } = {}) {
  if (auth) await asegurarToken();
  const h = { apikey: SUPABASE_KEY, ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (auth && sesion) h.Authorization = `Bearer ${sesion.access_token}`;
  let r;
  try {
    r = await fetch(SUPABASE_URL + ruta, {
      method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
      signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined,
    });
  } catch {
    throw new ApiError("sin_conexion", 0);
  }
  const texto = await r.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  if (!r.ok) {
    const msg = (datos && (datos.message || datos.error_description || datos.msg || datos.error)) || `HTTP ${r.status}`;
    if (r.status === 401 && auth) guardarSesion(null);
    throw new ApiError(String(msg), r.status, datos && (datos.code || datos.error_code));
  }
  return datos;
}

let refrescando = null;
async function asegurarToken() {
  if (!sesion) throw new ApiError("no_sesion", 401);
  if (sesion.expires_at * 1000 - Date.now() > 60_000) return;
  if (!refrescando) {
    refrescando = (async () => {
      try {
        const d = await pedir("/auth/v1/token?grant_type=refresh_token", {
          method: "POST", body: { refresh_token: sesion.refresh_token }, auth: false,
        });
        guardarSesion(normalizar(d));
      } catch (e) {
        // Sin señal no se pierde la sesión: se vuelve a intentar cuando haya conexión.
        if (!(e instanceof ApiError && e.status === 0)) guardarSesion(null);
        throw e;
      }
    })().finally(() => { refrescando = null; });
  }
  return refrescando;
}

const enc = encodeURIComponent;

export const api = {
  sesion: () => sesion,
  alSalir: (f) => oyentes.add(f),

  async entrar(usuario, clave) {
    const email = `${usuario.trim().toLowerCase()}@${DOMINIO_INTERNO}`;
    const d = await pedir("/auth/v1/token?grant_type=password", {
      method: "POST", body: { email, password: clave }, auth: false,
    });
    guardarSesion(normalizar(d));
  },
  async salir() {
    try { await pedir("/auth/v1/logout", { method: "POST" }); } catch { /* da igual */ }
    guardarSesion(null);
  },
  async cambiarClave(nueva) {
    await pedir("/auth/v1/user", { method: "PUT", body: { password: nueva } });
    await api.rpc("confirmar_clave_cambiada");
  },

  rpc: (fn, args = {}) => pedir(`/rest/v1/rpc/${fn}`, { method: "POST", body: args }),
  sel: (tabla, qs = "") => pedir(`/rest/v1/${tabla}?${qs}`),
  insertar: (tabla, filas) => pedir(`/rest/v1/${tabla}`, {
    method: "POST", body: filas, headers: { Prefer: "return=representation" },
  }),
  actualizar: (tabla, qs, cambios) => pedir(`/rest/v1/${tabla}?${qs}`, {
    method: "PATCH", body: cambios, headers: { Prefer: "return=representation" },
  }),
  quitar: (tabla, qs) => pedir(`/rest/v1/${tabla}?${qs}`, { method: "DELETE" }),
  funcion: (nombre, cuerpo) => pedir(`/functions/v1/${nombre}`, { method: "POST", body: cuerpo }),
  enc,
};
