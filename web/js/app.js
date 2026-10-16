// Arranque, sesión, menú por rol y enrutador.
import { api, ApiError } from "./api.js";
import { vigilar } from "./cola.js";
import { t, fijarIdioma, idioma, IDIOMAS } from "./i18n.js";
import { html, esc, crudo, aviso, mensajeError, fijarZona, ICONO, ocupado, cerrarModal } from "./ui.js";
import { vistaEntrar, vistaCambiarClave } from "./vistas/acceso.js";
import { vistaReloj, vistaMisHoras, vistaMiPago } from "./vistas/trabajador.js";
import { vistaAprobar } from "./vistas/supervisor.js";
import {
  vistaNomina, vistaTurnos, vistaTrabajadores, vistaProyectos, vistaPrestamos, vistaReportes, vistaAjustes,
} from "./vistas/admin.js";
import { vistaResumen } from "./vistas/dueno.js";
import { vistaSeguros } from "./vistas/seguros.js";
import { vistaVencimientos } from "./vistas/vencimientos.js";
import { vistaVehiculos } from "./vistas/vehiculos.js";
import { vistaContador } from "./vistas/contador.js";
import { vistaGastos, vistaCompanias } from "./vistas/companias.js";
import { vistaHerramientas } from "./vistas/herramientas.js";
import { pintarAvisos } from "./avisos.js";

const raiz = document.getElementById("app");
export const ctx = { perfil: null, empresa: null, empresas: [], ajustes: {}, roles: [], tieneVehiculo: false };

// Rutas: [ruta, clave de texto, roles que la ven, función de la vista, solo con varias compañías, condición extra]
const RUTAS = [
  ["reloj", "nav.reloj", ["trabajador"], vistaReloj],
  ["horas", "nav.horas", ["trabajador"], vistaMisHoras],
  ["pago", "nav.pago", ["trabajador"], vistaMiPago],
  ["aprobar", "nav.aprobar", ["supervisor"], vistaAprobar],
  ["resumen", "nav.resumen", ["dueno"], vistaResumen],
  ["nomina", "nav.nomina", ["admin"], vistaNomina],
  ["turnos", "nav.turnos", ["admin"], vistaTurnos],
  ["trabajadores", "nav.trabajadores", ["admin"], vistaTrabajadores],
  ["proyectos", "nav.proyectos", ["admin"], vistaProyectos],
  ["prestamos", "nav.prestamos", ["admin"], vistaPrestamos],
  ["gastos", "nav.gastos", ["admin", "supervisor"], vistaGastos],
  ["herramientas", "nav.herramientas", ["admin", "supervisor", "dueno"], vistaHerramientas],
  ["companias", "nav.companias", ["admin", "dueno"], vistaCompanias, true],
  ["reportes", "nav.reportes", ["admin", "dueno"], vistaReportes],
  ["seguros", "nav.seguros", ["admin", "dueno"], vistaSeguros],
  ["vehiculos", "nav.vehiculos", ["admin", "dueno"], vistaVehiculos],
  ["mivehiculo", "nav.mi_vehiculo", ["trabajador", "supervisor"], vistaVehiculos, false, () => ctx.tieneVehiculo && !esGerencia()],
  ["vencimientos", "nav.vencimientos", ["admin", "dueno"], vistaVencimientos],
  ["contador", "nav.contador", ["admin", "dueno"], vistaContador],
  ["ajustes", "nav.ajustes", ["admin"], vistaAjustes],
];
const rutasDe = (roles) => RUTAS.filter(([, , r, , multi, cond]) => r.some((x) => roles.includes(x)) && (!multi || ctx.empresas.length > 1) && (!cond || cond()));
const esGerencia = () => ctx.roles.includes("admin") || ctx.roles.includes("dueno");

let limpiezas = [];
export function alSalirDeVista(f) { limpiezas.push(f); }
function limpiar() { limpiezas.forEach((f) => { try { f(); } catch { /* nada */ } }); limpiezas = []; }

// Copia del contexto para abrir la app sin señal (solo trabajadores marcan sin conexión).
const llaveCtx = (yo) => `obrapay.ctx.${yo}`;
function guardarCtx(yo) {
  try { localStorage.setItem(llaveCtx(yo), JSON.stringify({ perfil: ctx.perfil, empresa: ctx.empresa, empresas: ctx.empresas, ajustes: ctx.ajustes, tieneVehiculo: ctx.tieneVehiculo })); } catch { /* nada */ }
}
function cargarCtxGuardado(yo) {
  try {
    const c = JSON.parse(localStorage.getItem(llaveCtx(yo)));
    if (!c?.perfil || c.perfil.id !== yo) return false;
    ctx.perfil = c.perfil; ctx.empresa = c.empresa; ctx.empresas = c.empresas || []; ctx.ajustes = c.ajustes || {}; ctx.tieneVehiculo = !!c.tieneVehiculo;
    ctx.roles = c.perfil.roles || [];
    fijarIdioma(c.perfil.idioma);
    fijarZona(c.empresa?.zona_horaria);
    return true;
  } catch { return false; }
}

async function cargarContexto() {
  const yo = api.sesion().user_id;
  try {
    await cargarContextoRed(yo);
    guardarCtx(yo);
  } catch (e) {
    if (e instanceof ApiError && e.status === 0 && cargarCtxGuardado(yo)) return;
    throw e;
  }
}

async function cargarContextoRed(yo) {
  const [perfiles, empresas, misEmpresas, ajustes] = await Promise.all([
    api.sel("perfiles", `select=id,empresa_id,usuario,nombre,oficio,roles,idioma,activo,debe_cambiar_clave&id=eq.${yo}`),
    api.sel("empresas", "select=*"),
    api.rpc("mis_empresas"),
    api.rpc("mis_ajustes_empresas"),
  ]);
  const perfil = perfiles[0];
  if (!perfil || !perfil.activo) throw new Error(t("err.inactivo"));
  ctx.perfil = perfil;
  ctx.empresa = empresas[0];
  ctx.empresas = misEmpresas || [];
  ctx.ajustes = Object.fromEntries((ajustes || []).map((x) => [x.empresa_id, x]));
  ctx.roles = perfil.roles || [];
  // Quien maneja un vehículo asignado ve "Mi vehículo" para actualizar las millas.
  ctx.tieneVehiculo = false;
  if (!esGerencia() && ctx.roles.some((r) => ["trabajador", "supervisor"].includes(r))) {
    try { ctx.tieneVehiculo = (await api.sel("vehiculos", "select=id&activo=eq.true&limit=1")).length > 0; } catch { /* sin vehículos todavía */ }
  }
  fijarIdioma(perfil.idioma);
  fijarZona(ctx.empresa.zona_horaria);
}

function selectorIdioma(id) {
  return html`<label class="idioma"><span class="oculto">${t("comun.idioma")}</span>
    <select id="${id}" aria-label="${t("comun.idioma")}">
      ${IDIOMAS.map(([c, n]) => html`<option value="${c}" ${c === idioma() ? html`selected` : ""}>${n}</option>`)}
    </select></label>`;
}

// Con más de una compañía, quien tiene acceso elige con cuál trabaja; se guarda en el servidor.
// Quien solo es trabajador no elige compañía: el Reloj y sus horas muestran todos sus proyectos y cada turno cuenta en la compañía de su proyecto.
const soloTrabajador = () => ctx.roles.every((r) => r === "trabajador");
function selectorEmpresa() {
  if (ctx.empresas.length < 2 || soloTrabajador()) return "";
  return html`<label class="idioma"><span class="oculto">${t("emp.compania")}</span>
    <select id="empresa-app" aria-label="${t("emp.compania")}">
      ${ctx.empresas.map((e) => html`<option value="${e.id}" ${e.id === ctx.empresa.id ? html`selected` : ""}>${e.nombre}</option>`)}
    </select></label>`;
}

function marco(rutaActual) {
  const rutas = rutasDe(ctx.roles);
  const escritorio = esGerencia();
  const enlaces = rutas.map(([r, clave]) => html`<a href="#/${r}" class="nav-item ${r === rutaActual ? "activo" : ""}" ${r === rutaActual ? html`aria-current="page"` : ""}>${t(clave)}</a>`);
  if (escritorio) {
    return html`
      <div class="escritorio">
        <div class="lateral">
          <header class="lateral-cab">
            <div class="marca">ObraPay<span>${ctx.empresa.nombre}</span></div>
            <div class="lateral-pie">
              <div class="quien">${ctx.perfil.nombre}<span>${ctx.roles.map((r) => t(`rol.${r}`)).join(" · ")}</span></div>
              ${selectorEmpresa()}
              ${selectorIdioma("idioma-app")}
              <button type="button" class="btn btn-fantasma btn-chico" id="salir">${crudo(ICONO.salir)} ${t("comun.salir")}</button>
            </div>
          </header>
          <nav class="nav-lista" aria-label="${t("comun.menu")}">${enlaces}</nav>
        </div>
        <main id="vista" class="contenido" tabindex="-1"></main>
      </div>`;
  }
  return html`
    <div class="movil">
      <header class="cabecera">
        <div><div class="marca-app">ObraPay</div><p class="hola">${t("comun.hola", { nombre: ctx.perfil.nombre.split(" ")[0] })}${ctx.empresas.length < 2 ? ` · ${ctx.empresa.nombre}` : ""}</p></div>
        <div class="cab-acciones">
          ${selectorEmpresa()}
          ${selectorIdioma("idioma-app")}
          <button type="button" class="btn-icono" id="salir" aria-label="${t("comun.salir")}">${crudo(ICONO.salir)}</button>
        </div>
      </header>
      ${rutas.length > 1 ? html`<nav class="tabs" aria-label="${t("comun.menu")}" style="grid-template-columns: repeat(${rutas.length}, minmax(0, 1fr))">
        ${rutas.map(([r, clave]) => html`<a href="#/${r}" class="tab ${r === rutaActual ? "activo" : ""}" ${r === rutaActual ? html`aria-current="page"` : ""}>${t(clave)}</a>`)}
      </nav>` : ""}
      <main id="vista" class="contenido-movil" tabindex="-1"></main>
    </div>`;
}

async function mostrar() {
  limpiar();
  cerrarModal();
  if (!api.sesion()) { vistaEntrar(raiz, iniciar); return; }
  if (!ctx.perfil) {
    raiz.innerHTML = `<div class="cargando-pantalla"><span class="girando grande"></span></div>`;
    try { await cargarContexto(); } catch (e) {
      ctx.perfil = null;
      if (e instanceof ApiError && e.status === 0) {
        // Sin señal y sin datos guardados: no se cierra la sesión, se ofrece reintentar.
        raiz.innerHTML = String(html`<div class="error-vista" role="alert"><p>${mensajeError(e)}</p>
          <button type="button" class="btn btn-sec" id="reintentar">${t("comun.reintentar")}</button></div>`);
        raiz.querySelector("#reintentar").addEventListener("click", mostrar);
        return;
      }
      await api.salir();
      vistaEntrar(raiz, iniciar, mensajeError(e));
      return;
    }
  }
  if (ctx.perfil.debe_cambiar_clave) { vistaCambiarClave(raiz, ctx, () => { ctx.perfil.debe_cambiar_clave = false; mostrar(); }); return; }

  const rutas = rutasDe(ctx.roles);
  if (!rutas.length) { raiz.innerHTML = `<p class="vacio">${esc(t("err.sin_rol"))}</p>`; return; }
  let ruta = location.hash.replace(/^#\/?/, "").split("?")[0];
  const encontrada = rutas.find(([r]) => r === ruta);
  if (!encontrada) {
    ruta = rutas[0][0];
    history.replaceState(null, "", `#/${ruta}`);
  }
  const [, clave, , vista] = rutas.find(([r]) => r === ruta);
  document.title = `${t(clave)} · ObraPay`;
  raiz.innerHTML = String(marco(ruta));
  raiz.querySelector("#salir").addEventListener("click", async (ev) => {
    await ocupado(ev.currentTarget, () => api.salir());
  });
  raiz.querySelector("#empresa-app")?.addEventListener("change", async (ev) => {
    try {
      await api.rpc("elegir_empresa", { p_empresa: ev.target.value });
      ctx.perfil = null; // se vuelve a cargar todo con la compañía elegida
      mostrar();
    } catch (e) { aviso(mensajeError(e), "error"); ev.target.value = ctx.empresa.id; }
  });
  raiz.querySelector("#idioma-app").addEventListener("change", async (ev) => {
    const nuevo = ev.target.value;
    fijarIdioma(nuevo);
    ctx.perfil.idioma = nuevo;
    try { await api.rpc("cambiar_idioma", { p_idioma: nuevo }); } catch { /* se guarda la próxima vez */ }
    mostrar();
  });
  if (ctx.roles.includes("trabajador")) vigilar(ctx.perfil.id);
  const el = raiz.querySelector("#vista");
  el.innerHTML = `<div class="esqueleto"><div></div><div></div><div></div></div>`;
  try {
    await vista(el, ctx);
    try { await pintarAvisos(el, ctx); } catch { /* sin señal: los avisos esperan */ }
  } catch (e) {
    if (!api.sesion()) return;
    el.innerHTML = String(html`<div class="error-vista" role="alert"><p>${mensajeError(e)}</p>
      <button type="button" class="btn btn-sec" id="reintentar">${t("comun.reintentar")}</button></div>`);
    el.querySelector("#reintentar").addEventListener("click", mostrar);
  }
}

export function recargarVista() { mostrar(); }

function iniciar() { ctx.perfil = null; mostrar(); }

api.alSalir(() => { try { if (ctx.perfil) localStorage.removeItem(llaveCtx(ctx.perfil.id)); } catch { /* nada */ } ctx.perfil = null; ctx.roles = []; ctx.empresas = []; limpiar(); mostrar(); aviso(t("comun.sesion_cerrada"), "info"); });
window.addEventListener("hashchange", mostrar);
window.addEventListener("unhandledrejection", (ev) => { aviso(mensajeError(ev.reason), "error"); });
mostrar();

// Permite abrir la app sin señal.
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => { /* sin soporte: la app funciona igual con señal */ }); });
}
