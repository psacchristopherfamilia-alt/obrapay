// Utilidades de interfaz: plantillas seguras, formatos, zonas horarias, modales y avisos.
import { t, idioma, FECHAS_HT } from "./i18n.js";

// ---------- plantillas ----------
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

// html`...${valor}...` escapa todo valor salvo los creados con crudo() u otras plantillas html.
class Crudo { constructor(s) { this.s = s; } toString() { return this.s; } }
export const crudo = (s) => new Crudo(s);
export function html(partes, ...valores) {
  let out = partes[0];
  valores.forEach((v, i) => {
    if (Array.isArray(v)) out += v.map((x) => (x instanceof Crudo ? x.s : esc(x))).join("");
    else if (v instanceof Crudo) out += v.s;
    else if (v === null || v === undefined || v === false) out += "";
    else out += esc(v);
    out += partes[i + 1];
  });
  return new Crudo(out);
}

// ---------- números ----------
// Para kreyòl se usa el formato de hora de en-US y los nombres de FECHAS_HT.
const LOCALE = () => (idioma() === "es" ? "es-US" : "en-US");
export const dinero = (n) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 2,
}).format(Number(n || 0));
export function horas(min) {
  const m = Math.round(Number(min || 0));
  const h = Math.floor(Math.abs(m) / 60);
  const r = Math.abs(m) % 60;
  const signo = m < 0 ? "−" : "";
  if (h === 0) return `${signo}${r} min`;
  return r ? `${signo}${h} h ${r} min` : `${signo}${h} h`;
}
export const horasDecimal = (min) => Math.round((Number(min || 0) / 60) * 100) / 100;

// ---------- fechas en la zona de la empresa ----------
let ZONA = "America/Grand_Turk";
export const fijarZona = (z) => { ZONA = z || ZONA; };
export const zona = () => ZONA;

function partes(fecha, tz = ZONA) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(fecha);
  const o = {};
  p.forEach(({ type, value }) => { o[type] = value; });
  return { y: +o.year, m: +o.month, d: +o.day, hh: +o.hour, mm: +o.minute, ss: +o.second };
}
const pad = (n) => String(n).padStart(2, "0");

// "2026-10-08T07:00" en la zona → ISO UTC
export function deLocal(valor, tz = ZONA) {
  const [f, h = "00:00"] = valor.split("T");
  const [y, m, d] = f.split("-").map(Number);
  const [hh, mm] = h.split(":").map(Number);
  const deseado = Date.UTC(y, m - 1, d, hh, mm);
  let adivina = deseado;
  for (let i = 0; i < 2; i++) {
    const p = partes(new Date(adivina), tz);
    const visto = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
    adivina += deseado - visto;
  }
  return new Date(adivina).toISOString();
}
export function aLocal(iso, tz = ZONA) {
  const p = partes(new Date(iso), tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mm)}`;
}
export const fechaLocal = (iso, tz = ZONA) => aLocal(iso, tz).slice(0, 10);
export function hoyLocal(tz = ZONA) { return fechaLocal(new Date().toISOString(), tz); }

export const fmtHora = (iso) => new Intl.DateTimeFormat(LOCALE(), {
  timeZone: ZONA, hour: "numeric", minute: "2-digit",
}).format(new Date(iso));
export const fmtFechaHora = (iso) => `${fmtDia(fechaLocal(iso), { weekday: "short", day: "numeric", month: "short" })}, ${fmtHora(iso)}`;
// fecha "YYYY-MM-DD" (sin hora) → texto
export function fmtDia(ymd, opciones = { weekday: "long", day: "numeric", month: "short" }) {
  const [y, m, d] = ymd.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  if (idioma() === "ht") {
    const partesHt = [];
    if (opciones.weekday) partesHt.push((opciones.weekday === "long" ? FECHAS_HT.dias : FECHAS_HT.diasCortos)[fecha.getUTCDay()]);
    if (opciones.day) partesHt.push(String(d));
    if (opciones.month) partesHt.push((opciones.month === "long" ? FECHAS_HT.meses : FECHAS_HT.mesesCortos)[m - 1]);
    if (opciones.year) partesHt.push(String(y));
    return partesHt.join(" ");
  }
  return new Intl.DateTimeFormat(LOCALE(), { timeZone: "UTC", ...opciones }).format(fecha);
}
export function nombreMes(m) {
  if (idioma() === "ht") return FECHAS_HT.meses[m - 1];
  return new Intl.DateTimeFormat(LOCALE(), { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, m - 1, 1)));
}
export function sumarDias(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d + n));
  return `${f.getUTCFullYear()}-${pad(f.getUTCMonth() + 1)}-${pad(f.getUTCDate())}`;
}
export const fmtSemana = (s) => `${fmtDia(s.inicio, { weekday: "short", day: "numeric", month: "short" })} – ${fmtDia(s.fin, { weekday: "short", day: "numeric", month: "short" })}`;

// ---------- minutos pagables de un turno (espejo de la regla de la base de datos) ----------
// Regular = antes de hora_extra_desde; extra = después; el almuerzo (12–1) no se paga.
function minutosDesdeHora(hhmm) { const [h, m] = String(hhmm).split(":").map(Number); return h * 60 + m; }
function cruce(e, s, a, b) { return Math.max(0, Math.min(s, b) - Math.max(e, a)); }
export function minutosTurno(entradaIso, salidaIso, emp) {
  const aMin = (iso) => {
    const p = partes(new Date(iso), emp.zona_horaria);
    return Math.floor(Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm) / 60000);
  };
  const e = aMin(entradaIso);
  const s = aMin(salidaIso || new Date().toISOString());
  if (s <= e) return { reg: 0, extra: 0 };
  const hx = minutosDesdeHora(emp.hora_extra_desde);
  const ai = emp.almuerzo_inicio ? minutosDesdeHora(emp.almuerzo_inicio) : null;
  const af = emp.almuerzo_fin ? minutosDesdeHora(emp.almuerzo_fin) : null;
  let regBruto = 0; let almReg = 0; let almExtra = 0;
  for (let d = Math.floor(e / 1440) * 1440; d <= s; d += 1440) {
    regBruto += cruce(e, s, d, d + hx);
    if (ai !== null) {
      almReg += cruce(e, s, d + ai, d + Math.min(af, hx));
      almExtra += cruce(e, s, d + Math.max(ai, hx), d + af);
    }
  }
  return { reg: regBruto - almReg, extra: (s - e - regBruto) - almExtra };
}

// ---------- avisos (toast) ----------
export function aviso(mensaje, tipo = "ok") {
  let zonaAvisos = document.getElementById("avisos");
  if (!zonaAvisos) {
    zonaAvisos = document.createElement("div");
    zonaAvisos.id = "avisos";
    zonaAvisos.setAttribute("role", "status");
    zonaAvisos.setAttribute("aria-live", "polite");
    document.body.appendChild(zonaAvisos);
  }
  const el = document.createElement("div");
  el.className = `aviso aviso-${tipo}`;
  el.textContent = mensaje;
  zonaAvisos.appendChild(el);
  setTimeout(() => el.classList.add("sale"), 3800);
  setTimeout(() => el.remove(), 4300);
}

// Convierte errores de la base de datos en mensajes para la persona.
export function mensajeError(e) {
  const m = String(e?.message || e || "");
  if (m === "sin_conexion") return t("err.conexion");
  if (/Invalid login credentials/i.test(m)) return t("err.credenciales");
  if (/permission denied|No tienes permiso/i.test(m)) return t("err.permiso");
  if (/Password should be|password.*characters|weak/i.test(m)) return t("err.clave_debil");
  if (/JWT|no_sesion|Refresh Token|session_not_found|refresh_token_not_found/i.test(m)) return t("err.sesion");
  return m.length > 180 ? t("err.general") : m;
}

// ---------- modal ----------
// abre un <dialog>; contenido = html`...`; devuelve el elemento. Se cierra con cerrarModal().
export function abrirModal(titulo, contenido, { ancho = 480 } = {}) {
  cerrarModal();
  const d = document.createElement("dialog");
  d.className = "modal";
  d.style.maxWidth = `${ancho}px`;
  d.setAttribute("aria-labelledby", "modal-titulo");
  d.innerHTML = String(html`
    <div class="modal-cab">
      <h2 id="modal-titulo">${titulo}</h2>
      <button type="button" class="btn-icono" data-cerrar aria-label="${t("comun.cerrar")}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </div>
    <div class="modal-cuerpo">${contenido}</div>`);
  d.addEventListener("click", (ev) => {
    if (ev.target === d || ev.target.closest("[data-cerrar]")) cerrarModal();
  });
  d.addEventListener("close", () => d.remove());
  document.body.appendChild(d);
  d.showModal();
  const primero = d.querySelector("input:not([type=hidden]), select, textarea");
  if (primero) primero.focus();
  return d;
}
export function cerrarModal() {
  document.querySelectorAll("dialog.modal").forEach((d) => { if (d.open) d.close(); d.remove(); });
}

// Pide confirmación con un modal; resuelve true/false.
export function confirmar(titulo, texto, { boton = t("comun.confirmar"), peligro = false } = {}) {
  return new Promise((resolver) => {
    const d = abrirModal(titulo, html`
      <p class="texto-modal">${texto}</p>
      <div class="acciones-modal">
        <button type="button" class="btn btn-sec" data-no>${t("comun.cancelar")}</button>
        <button type="button" class="btn ${peligro ? "btn-peligro" : "btn-pri"}" data-si>${boton}</button>
      </div>`);
    let respondido = false;
    d.querySelector("[data-si]").addEventListener("click", () => { respondido = true; cerrarModal(); resolver(true); });
    d.querySelector("[data-no]").addEventListener("click", () => { respondido = true; cerrarModal(); resolver(false); });
    d.addEventListener("close", () => { if (!respondido) resolver(false); });
  });
}

// Botón ocupado mientras corre una acción.
export async function ocupado(boton, accion) {
  if (!boton) return accion();
  const antes = boton.innerHTML;
  boton.disabled = true;
  boton.setAttribute("aria-busy", "true");
  boton.innerHTML = `<span class="girando" aria-hidden="true"></span>${esc(boton.textContent.trim())}`;
  try { return await accion(); } finally {
    if (boton.isConnected) { boton.disabled = false; boton.removeAttribute("aria-busy"); boton.innerHTML = antes; }
  }
}

export function datosFormulario(form) {
  const o = {};
  new FormData(form).forEach((v, k) => {
    if (k in o) o[k] = [].concat(o[k], v); else o[k] = v;
  });
  return o;
}

export const ICONO = {
  reloj: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  alerta: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 9v4"/><path d="M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>',
  arriba: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>',
  descarga: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/></svg>',
  salir: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/></svg>',
  mas: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  ubicacion: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
};
