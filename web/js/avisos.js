// Avisos del admin dentro de la app: remesas por vencer, semana por cerrar, turnos sin aprobar y topes de seguro.
// Los crea la base de datos cada día (avisar_remesas / avisar_pendientes); aquí solo se leen y se marcan como leídos.
import { api } from "./api.js";
import { t } from "./i18n.js";
import { html, esc, crudo, dinero, fmtDia, ICONO } from "./ui.js";

const TIPOS = ["remesa_por_vencer", "semana_por_cerrar", "turnos_sin_aprobar", "tope_seguro", "documento_por_vencer", "mantenimiento_vehiculo", "presupuesto_umbral", "presupuesto_categoria"];
const DOC_TIPOS = {
  permiso_trabajo: "venc.t_permiso", licencia_construccion: "venc.t_construccion", licencia_conducir: "venc.t_conducir",
  seguro_vehiculo: "venc.t_seguro", inspeccion_vehiculo: "venc.t_inspeccion", registro_vehiculo: "venc.t_registro",
};
const usd0 = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(n) || 0);
const fecha = (d) => fmtDia(d, { day: "numeric", month: "short" });

function texto(a) {
  const d = a.datos || {};
  switch (a.tipo) {
    case "remesa_por_vencer":
      return [Number(d.dias) === 0 ? t("aviso.remesa_hoy", { agencia: d.agencia, total: dinero(d.total) })
        : t("aviso.remesa_pronto", { agencia: d.agencia, fecha: fecha(d.vence), total: dinero(d.total) }), "seguros"];
    case "semana_por_cerrar": return [t("aviso.semana_cierre", { inicio: fecha(d.inicio), fin: fecha(d.fin) }), "nomina"];
    case "turnos_sin_aprobar": return [t("aviso.turnos_sin_aprobar", { n: d.n }), "turnos"];
    case "tope_seguro": return [t("aviso.tope_seguro", { nombre: esc(d.nombre), agencia: d.agencia }), "seguros"];
    case "documento_por_vencer": {
      const n = Number(d.dias);
      const x = { doc: t(DOC_TIPOS[d.doc_tipo] || "venc.titulo"), quien: esc(d.quien), n: Math.abs(n), fecha: fecha(d.vence) };
      return [t(n < 0 ? "aviso.doc_vencido" : n === 0 ? "aviso.doc_hoy" : n === 1 ? "aviso.doc_manana" : "aviso.doc_vence", x), d.vehiculo ? "vehiculos" : "vencimientos"];
    }
    case "mantenimiento_vehiculo": {
      // Avisa por fecha (dias) o por millas, según cuál llegó primero.
      const x = { servicio: esc(d.servicio), quien: esc(d.quien) };
      if (d.por === "millas") {
        const m = Number(d.millas);
        return [t(m < 0 ? "aviso.mant_mi_atraso" : "aviso.mant_mi", { ...x, n: Math.abs(m).toLocaleString("en-US") }), "vehiculos"];
      }
      const n = Number(d.dias);
      return [t(n < 0 ? "aviso.mant_atraso" : n === 0 ? "aviso.mant_hoy" : n === 1 ? "aviso.mant_manana" : "aviso.mant_dias", { ...x, n: Math.abs(n) }), "vehiculos"];
    }
    case "presupuesto_umbral": {
      const x = { obra: esc(d.obra), usado: d.usado, gastado: usd0(d.gastado), presupuesto: usd0(d.presupuesto) };
      return [t(Number(d.nivel) >= 100 ? "aviso.pres_100" : "aviso.pres_nivel", x), "presupuestos"];
    }
    case "presupuesto_categoria":
      return [t("aviso.pres_cat", { obra: esc(d.obra), categoria: t(`pres.cat_${d.categoria}`), exceso: usd0(d.exceso) }), "presupuestos"];
    default: return null;
  }
}

export async function pintarAvisos(el, ctx) {
  if (!ctx.roles.includes("admin")) return;
  let lista = [];
  try {
    lista = await api.sel("notificaciones", `select=id,tipo,datos,creado_en&perfil_id=eq.${ctx.perfil.id}&leida=eq.false&order=creado_en.desc&limit=30`);
  } catch { return; }
  lista = lista.filter((a) => TIPOS.includes(a.tipo));
  if (!lista.length) return;
  const caja = document.createElement("div");
  caja.className = "avisos-admin";
  caja.setAttribute("role", "region");
  caja.setAttribute("aria-label", t("aviso.titulo"));
  caja.innerHTML = String(html`${lista.map((a) => { const x = texto(a); return html`<div class="banner banner-aviso" role="status" data-aviso="${a.id}">
    ${crudo(ICONO.arriba)}<span><a href="#/${x[1]}">${crudo(x[0])}</a></span>
    <button type="button" class="btn-texto" data-leido="${a.id}">${t("comun.entendido")}</button></div>`; })}`);
  el.prepend(caja);
  caja.addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-leido]");
    if (!b) return;
    b.disabled = true;
    try {
      await api.actualizar("notificaciones", `id=eq.${b.dataset.leido}`, { leida: true });
      b.closest("[data-aviso]").remove();
      if (!caja.children.length) caja.remove();
    } catch { b.disabled = false; }
  });
}
