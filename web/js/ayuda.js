// Ayuda por pantalla (botón ?), Centro de ayuda y recorrido guiado. Los textos viven en i18n.js: ay.<ruta>, ay.<ruta>.p (pasos separados por |), ay.<ruta>.o.
import { t } from "./i18n.js";
import { html, crudo, esc, abrirModal } from "./ui.js";

const tiene = (clave) => t(clave) !== clave;
export const hayAyuda = (ruta) => tiene(`ay.${ruta}`);

function cuerpoAyuda(ruta) {
  const pasos = t(`ay.${ruta}.p`).split("|").filter(Boolean);
  const ojo = tiene(`ay.${ruta}.o`) ? t(`ay.${ruta}.o`) : "";
  return html`
    <p class="ayuda-que">${t(`ay.${ruta}`)}</p>
    ${pasos.length ? html`<h3 class="ayuda-sub">${t("ay.pasos")}</h3><ol class="ayuda-pasos">${pasos.map((p) => html`<li>${p}</li>`)}</ol>` : ""}
    ${ojo ? html`<p class="nota-aviso"><strong>${t("ay.ojo")}:</strong> ${ojo}</p>` : ""}`;
}

export function abrirAyuda(ruta, titulo) {
  abrirModal(titulo, html`${cuerpoAyuda(ruta)}
    <div class="acciones"><a class="btn btn-sec" href="#/ayuda" data-cerrar>${t("ay.abrir_centro")}</a></div>`, { ancho: 460 });
}

// Botón flotante ? de la pantalla actual.
export function botonAyuda(ruta) {
  if (ruta === "ayuda" || !hayAyuda(ruta)) return "";
  return String(html`<button type="button" class="btn-ayuda" data-ayuda="${ruta}" aria-label="${t("ay.btn")}" title="${t("ay.btn")}">?</button>`);
}

// Centro de ayuda: todos los temas de las pantallas que esta persona ve.
export async function vistaAyuda(el, ctx) {
  const temas = (ctx.rutas || []).filter(([r]) => r !== "ayuda" && hayAyuda(r)).map(([r, clave]) => ({ r, nombre: t(clave) }));
  el.innerHTML = String(html`
    <div class="titulo-vista"><div><h1>${t("ay.titulo")}</h1><p class="sub">${t("ay.sub")}</p></div></div>
    <section class="tarjeta">
      <div class="campo"><label for="ay-buscar">${t("ay.buscar")}</label><input id="ay-buscar" type="search" autocomplete="off"></div>
      <div id="ay-lista" class="ayuda-lista"></div>
    </section>
    <section class="tarjeta"><h2 class="etiqueta">${t("ay.recorrido_t")}</h2>
      <p>${t("ay.recorrido_txt")}</p>
      <div class="acciones"><button type="button" class="btn btn-sec" data-recorrido>${t("ay.recorrido")}</button></div></section>
    <section class="tarjeta"><h2 class="etiqueta">${t("ay.documentos")}</h2>
      <p><a href="#/terminos">${t("ay.terminos")}</a> · <a href="#/privacidad">${t("ay.privacidad")}</a></p></section>`);
  const lista = el.querySelector("#ay-lista");
  const pintar = (q = "") => {
    const n = q.trim().toLowerCase();
    const vistos = temas.filter((x) => !n || `${x.nombre} ${t(`ay.${x.r}`)} ${t(`ay.${x.r}.p`)}`.toLowerCase().includes(n));
    lista.innerHTML = vistos.length
      ? String(html`${vistos.map((x) => html`<details class="ayuda-tema"><summary>${x.nombre}</summary>${cuerpoAyuda(x.r)}</details>`)}`)
      : String(html`<p class="vacio">${t("ay.vacio")}</p>`);
  };
  pintar();
  el.querySelector("#ay-buscar").addEventListener("input", (ev) => pintar(ev.target.value));
  el.querySelector("[data-recorrido]").addEventListener("click", () => iniciarRecorrido(ctx));
}

// ---------- recorrido guiado ----------
const PASOS = {
  plataforma: ["plataforma", "ayuda"],
  admin: ["trabajadores", "turnos", "nomina", "proyectos", "ayuda"],
  dueno: ["resumen", "reportes", "historial", "ayuda"],
  supervisor: ["aprobar", "cuadrillas", "gastos", "ayuda"],
  trabajador: ["reloj", "horas", "pago", "ayuda"],
};
const llaveTour = (yo) => `obrapay.tour.${yo}`;
const rolDelRecorrido = (ctx) => ["plataforma", "admin", "dueno", "supervisor", "trabajador"].find((r) => ctx.roles.includes(r));

export function pasosDelRecorrido(ctx) {
  const rutas = new Set((ctx.rutas || []).map(([r]) => r));
  return (PASOS[rolDelRecorrido(ctx)] || []).filter((r) => rutas.has(r));
}

export function recorridoPendiente(ctx) {
  if (ctx.asistiendo || document.querySelector(".tour")) return false;
  try { return !localStorage.getItem(llaveTour(ctx.perfil.id)) && pasosDelRecorrido(ctx).length > 0; } catch { return false; }
}

export function iniciarRecorrido(ctx) {
  const pasos = pasosDelRecorrido(ctx);
  if (!pasos.length) return;
  let i = 0;
  document.querySelector(".tour")?.remove();
  const caja = document.createElement("div");
  caja.className = "tour";
  caja.setAttribute("role", "dialog");
  caja.setAttribute("aria-live", "polite");
  document.body.appendChild(caja);
  const quitarResalte = () => document.querySelectorAll(".tour-resalte").forEach((e) => e.classList.remove("tour-resalte"));
  const terminar = () => {
    quitarResalte(); caja.remove();
    try { localStorage.setItem(llaveTour(ctx.perfil.id), "1"); } catch { /* nada */ }
  };
  const pintar = () => {
    const ruta = pasos[i];
    const ultimo = i === pasos.length - 1;
    caja.innerHTML = String(html`
      <p class="tour-paso">${t("tour.paso", { n: i + 1, total: pasos.length })}</p>
      <p class="tour-txt"><strong>${t(`nav.${ruta === "ayuda" ? "ayuda" : ruta}`)}</strong> · ${t(`tour.${ruta}`)}</p>
      <div class="tour-acc">
        <button type="button" class="btn btn-fantasma btn-chico" data-t="saltar">${t("tour.saltar")}</button>
        ${i > 0 ? html`<button type="button" class="btn btn-sec btn-chico" data-t="atras">${t("tour.atras")}</button>` : ""}
        <button type="button" class="btn btn-pri btn-chico" data-t="sig">${ultimo ? t("tour.fin") : t("tour.sig")}</button>
      </div>`);
    if (location.hash !== `#/${ruta}`) location.hash = `#/${ruta}`;
    // La pantalla se redibuja al cambiar la ruta: se marca el menú un instante después.
    setTimeout(() => {
      quitarResalte();
      document.querySelector(`a[href="#/${ruta}"]`)?.classList.add("tour-resalte");
    }, 350);
  };
  caja.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-t]");
    if (!b) return;
    if (b.dataset.t === "saltar") { terminar(); return; }
    if (b.dataset.t === "atras") { i = Math.max(0, i - 1); pintar(); return; }
    if (i >= pasos.length - 1) { terminar(); return; }
    i += 1; pintar();
  });
  pintar();
}
