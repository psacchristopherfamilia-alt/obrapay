// Historial de cambios (quién cambió qué y cuándo) y "Exportar todo". Dueño y administrador ven el de su compañía;
// el dueño de la plataforma lo monta también en su panel (todas las compañías o una).
import { api } from "../api.js";
import { t } from "../i18n.js";
import { html, dinero, fmtDia, fmtFechaHora, aviso, mensajeError, ocupado, hoyLocal, aLocal } from "../ui.js";
import { crearXlsx, descargar } from "../xlsx.js";
import { marcaDe } from "../marca.js";
import { hojasExportacion, nombreExport } from "../exportar.js";

// Grupos para filtrar: cada uno es la lista de tipos de evento que la base guarda.
export const GRUPOS = {
  tarifas: ["cambio_tarifa", "cambio_seguro"],
  semanas: ["semana_cerrada", "semana_reabierta", "semana_pagada", "descuento_ajustado_al_cierre", "prestamo_creado"],
  ley: ["cambio_tasa_estatutaria", "datos_estatutarios", "cambio_salario_minimo"],
  gastos: ["gasto_registrado", "gasto_anulado", "gasolina_registrada", "gasolina_corregida", "gasolina_quitada", "presupuesto_guardado", "seguro_vehiculo_guardado"],
  config: ["config_cambiada", "compania_creada", "compania_editada", "compania_suspendida", "compania_activada", "pago_registrado", "alta_datos", "exportar_todo"],
  gente: ["trabajador_recibido", "trabajador_compartido", "trabajador_quitado", "asistente_entro", "asistente_salio",
    "cuadrilla_guardada", "cuadrilla_asignada", "cuadrilla_entrada", "cuadrilla_salida", "cuadrilla_quitada"],
};
const grupoDe = (tipo) => Object.keys(GRUPOS).find((g) => GRUPOS[g].includes(tipo)) || "config";

const EN_DINERO = new Set(["antes", "despues", "ajuste", "monto", "tope_mensual", "total"]);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const rango = (a, b) => `${fmtDia(a, { day: "numeric", month: "short" })} – ${fmtDia(b, { day: "numeric", month: "short" })}`;

// Convierte un evento de la base en frases para leer: { titulo, detalle, grupo }.
export function describir(ev) {
  const d = ev.detalle || {};
  const p = { quien: ev.por || t("hist.sistema"), sobre: ev.sobre || "—", sem: ev.sem_inicio ? rango(ev.sem_inicio, ev.sem_fin) : "—", tipo: ev.tipo };
  for (const [k, v] of Object.entries(d)) {
    if (k in p) continue;
    if (v === null || v === undefined) p[k] = "—";
    else if (typeof v === "number") p[k] = EN_DINERO.has(k) ? dinero(v) : String(v);
    else if (typeof v === "string" && FECHA.test(v)) p[k] = fmtDia(v, { day: "numeric", month: "short", year: "numeric" });
    else if (typeof v === "object") p[k] = Object.entries(v).map(([a, b]) => `${a}: ${b}`).join(" · ");
    else p[k] = String(v);
  }
  const limpio = (s) => s.replace(/\{\w+\}/g, "—");
  const kt = `hist.t_${ev.tipo}`;
  let titulo = t(kt, p);
  if (titulo === kt) titulo = t("hist.t_otro", p);
  const kd = `hist.d_${ev.tipo}`;
  let detalle = t(kd, p);
  if (detalle === kd) detalle = "";
  return { titulo: limpio(titulo), detalle: limpio(detalle), grupo: grupoDe(ev.tipo) };
}

const FILTROS = ["todo", "tarifas", "semanas", "ley", "gastos", "config", "gente"];
const PAGINA = 50;

// Pinta el historial dentro de `raiz`. opciones: { empresaId, todas, selector: [{id, nombre}] }.
export function montarHistorial(raiz, opciones = {}) {
  const st = { filtro: "todo", items: [], hayMas: false, cargando: false, empresaId: opciones.empresaId || null, todas: !!opciones.todas };
  const conSelector = Array.isArray(opciones.selector);

  const pintar = () => {
    raiz.innerHTML = String(html`
      ${conSelector ? html`<div class="campo hist-selector"><label for="hist-cia">${t("hist.compania")}</label>
        <select id="hist-cia"><option value="">${t("hist.todas")}</option>
          ${opciones.selector.map((c) => html`<option value="${c.id}" ${c.id === st.empresaId ? html`selected` : ""}>${c.nombre}</option>`)}</select></div>` : ""}
      <div class="hist-filtros" role="group" aria-label="${t("hist.titulo")}">
        ${FILTROS.map((f) => html`<button type="button" class="chip-v ${st.filtro === f ? "activo" : ""}" data-hist-f="${f}" aria-pressed="${st.filtro === f}">${t(`hist.f_${f}`)}</button>`)}</div>
      ${st.items.length ? html`<ul class="hist-lista">${st.items.map((ev) => {
        const x = describir(ev);
        return html`<li class="hist-ev"><span class="hist-pto g-${x.grupo}" aria-hidden="true"></span>
          <div class="hist-txt"><div class="hist-tit">${x.titulo}</div>
            ${x.detalle ? html`<div class="sub">${x.detalle}</div>` : ""}
            ${st.todas ? html`<div class="sub">${ev.empresa}</div>` : ""}</div>
          <time class="hist-fecha sub" datetime="${ev.creado_en}">${fmtFechaHora(ev.creado_en)}</time></li>`;
      })}</ul>` : html`<p class="vacio">${st.cargando ? t("hist.cargando") : t("hist.vacio")}</p>`}
      <div class="acciones">
        ${st.hayMas ? html`<button type="button" class="btn btn-sec" data-hist-mas>${t("hist.mas")}</button>` : ""}
        ${st.items.length ? html`<button type="button" class="btn btn-sec" data-hist-excel>${t("hist.excel")}</button>` : ""}</div>`);
  };

  const cargar = async (desdeCero) => {
    if (st.cargando) return;
    st.cargando = true;
    if (desdeCero) { st.items = []; st.hayMas = false; pintar(); }
    try {
      const args = { p_tipos: st.filtro === "todo" ? null : GRUPOS[st.filtro], p_antes: desdeCero ? null : st.items[st.items.length - 1]?.creado_en ?? null, p_limite: PAGINA };
      if (st.todas) args.p_todas = true; else if (st.empresaId) args.p_empresa = st.empresaId;
      const filas = await api.rpc("historial", args);
      st.items = desdeCero ? filas : st.items.concat(filas);
      st.hayMas = filas.length === PAGINA;
    } catch (e) { aviso(mensajeError(e), "error"); } finally { st.cargando = false; pintar(); }
  };

  const excel = () => {
    const filas = st.items.map((ev) => { const x = describir(ev); return [aLocal(ev.creado_en).replace("T", " "), ...(st.todas ? [ev.empresa] : []), ev.por || t("hist.sistema"), x.titulo, x.detalle]; });
    const columnas = [{ titulo: t("hist.c_fecha"), ancho: 18 }, ...(st.todas ? [{ titulo: t("hist.c_compania"), ancho: 24 }] : []),
      { titulo: t("hist.c_quien"), ancho: 22 }, { titulo: t("hist.c_que"), ancho: 60 }, { titulo: t("hist.c_detalle"), ancho: 50 }];
    descargar(crearXlsx([{ nombre: t("hist.titulo"), columnas, filas }], opciones.empresa ? marcaDe(opciones.empresa, hoyLocal()) : null), `obrapay-historial_${hoyLocal()}.xlsx`);
  };

  raiz.addEventListener("click", (ev) => {
    const f = ev.target.closest("[data-hist-f]");
    if (f) { st.filtro = f.dataset.histF; cargar(true); return; }
    if (ev.target.closest("[data-hist-mas]")) { cargar(false); return; }
    if (ev.target.closest("[data-hist-excel]")) excel();
  });
  raiz.addEventListener("change", (ev) => {
    if (ev.target.id !== "hist-cia") return;
    st.empresaId = ev.target.value || null; st.todas = !st.empresaId; cargar(true);
  });

  pintar();
  return cargar(true);
}

// ---------- pantalla del dueño y del administrador ----------
export async function vistaHistorial(el, ctx) {
  el.innerHTML = String(html`
    <div class="titulo-vista"><div><h1>${t("hist.titulo")}</h1><p class="sub">${t("hist.sub")}</p></div></div>
    <section class="tarjeta"><h2 class="etiqueta">${t("hist.datos_t")}</h2>
      <p>${t("hist.datos_txt")}</p>
      <div class="acciones"><button type="button" class="btn btn-pri" data-exportar-todo>${t("hist.exportar")}</button></div></section>
    <section class="tarjeta"><div data-hist></div></section>`);
  el.querySelector("[data-exportar-todo]").addEventListener("click", async (ev) => {
    try {
      await ocupado(ev.currentTarget, async () => {
        const v = await api.rpc("exportar_todo", {});
        descargar(crearXlsx(hojasExportacion(v), marcaDe(ctx.empresa, `${t("hist.exportar")} · ${hoyLocal()}`)), nombreExport(ctx.empresa?.nombre, hoyLocal()));
      });
      aviso(t("hist.exportado"));
    } catch (e) { aviso(mensajeError(e), "error"); }
  });
  await montarHistorial(el.querySelector("[data-hist]"), { empresa: ctx.empresa });
}
