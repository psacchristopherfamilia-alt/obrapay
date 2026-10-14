// Arranque, sesión, menú por rol y enrutador.
import { api } from "./api.js";
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

const raiz = document.getElementById("app");
export const ctx = { perfil: null, empresa: null, roles: [] };

// Rutas: [ruta, clave de texto, roles que la ven, función de la vista]
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
  ["reportes", "nav.reportes", ["admin", "dueno"], vistaReportes],
  ["seguros", "nav.seguros", ["admin", "dueno"], vistaSeguros],
  ["ajustes", "nav.ajustes", ["admin"], vistaAjustes],
];
const rutasDe = (roles) => RUTAS.filter(([, , r]) => r.some((x) => roles.includes(x)));
const esGerencia = () => ctx.roles.includes("admin") || ctx.roles.includes("dueno");

let limpiezas = [];
export function alSalirDeVista(f) { limpiezas.push(f); }
function limpiar() { limpiezas.forEach((f) => { try { f(); } catch { /* nada */ } }); limpiezas = []; }

async function cargarContexto() {
  const yo = api.sesion().user_id;
  const [perfiles, empresas] = await Promise.all([
    api.sel("perfiles", `select=id,empresa_id,usuario,nombre,oficio,roles,idioma,activo,debe_cambiar_clave&id=eq.${yo}`),
    api.sel("empresas", "select=*"),
  ]);
  const perfil = perfiles[0];
  if (!perfil || !perfil.activo) throw new Error(t("err.inactivo"));
  ctx.perfil = perfil;
  ctx.empresa = empresas[0];
  ctx.roles = perfil.roles || [];
  fijarIdioma(perfil.idioma);
  fijarZona(ctx.empresa.zona_horaria);
}

function selectorIdioma(id) {
  return html`<label class="idioma"><span class="oculto">${t("comun.idioma")}</span>
    <select id="${id}" aria-label="${t("comun.idioma")}">
      ${IDIOMAS.map(([c, n]) => html`<option value="${c}" ${c === idioma() ? html`selected` : ""}>${n}</option>`)}
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
        <div><div class="marca-app">ObraPay</div><p class="hola">${t("comun.hola", { nombre: ctx.perfil.nombre.split(" ")[0] })} · ${ctx.empresa.nombre}</p></div>
        <div class="cab-acciones">
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
      await api.salir();
      ctx.perfil = null;
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
  raiz.querySelector("#idioma-app").addEventListener("change", async (ev) => {
    const nuevo = ev.target.value;
    fijarIdioma(nuevo);
    ctx.perfil.idioma = nuevo;
    try { await api.rpc("cambiar_idioma", { p_idioma: nuevo }); } catch { /* se guarda la próxima vez */ }
    mostrar();
  });
  const el = raiz.querySelector("#vista");
  el.innerHTML = `<div class="esqueleto"><div></div><div></div><div></div></div>`;
  try {
    await vista(el, ctx);
  } catch (e) {
    if (!api.sesion()) return;
    el.innerHTML = String(html`<div class="error-vista" role="alert"><p>${mensajeError(e)}</p>
      <button type="button" class="btn btn-sec" id="reintentar">${t("comun.reintentar")}</button></div>`);
    el.querySelector("#reintentar").addEventListener("click", mostrar);
  }
}

export function recargarVista() { mostrar(); }

function iniciar() { ctx.perfil = null; mostrar(); }

api.alSalir(() => { ctx.perfil = null; ctx.roles = []; limpiar(); mostrar(); aviso(t("comun.sesion_cerrada"), "info"); });
window.addEventListener("hashchange", mostrar);
window.addEventListener("unhandledrejection", (ev) => { aviso(mensajeError(ev.reason), "error"); });
mostrar();
