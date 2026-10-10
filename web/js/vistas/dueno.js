// Vista del dueño: resumen de solo lectura.
import { api } from "../api.js";
import { t } from "../i18n.js";
import { html, crudo, dinero, fmtSemana, fmtDia, aviso, mensajeError, ICONO } from "../ui.js";
import { listaSemanas, semanaPorDefecto, prestamosConSaldo } from "../datos.js";
import { datosNomina, kpis, barrasProyectos, tablaNomina, exportarNomina } from "./admin.js";
import { selectorSemana } from "./trabajador.js";

export async function vistaResumen(el, ctx) {
  const semanas = await listaSemanas(26);
  let semana = semanaPorDefecto(semanas);
  const prestamos = await prestamosConSaldo();
  const porCobrar = prestamos.filter((p) => p.activo).reduce((s, p) => s + Math.max(0, p.saldo), 0);
  let datos = null;

  const cargar = async () => {
    // Tendencia: las últimas 4 semanas hasta la elegida.
    const i = semanas.findIndex((s) => s.id === semana.id);
    const ultimas = semanas.slice(i, i + 4).reverse();
    const [d, ...previas] = await Promise.all([
      datosNomina(semana),
      ...ultimas.map((s) => api.rpc("nomina_semana", { p_semana: s.id })),
    ]);
    datos = d;
    const serie = ultimas.map((s, k) => ({ semana: s, bruto: previas[k].reduce((a, f) => a + Number(f.bruto), 0) }));
    const max = Math.max(...serie.map((x) => x.bruto), 1);
    const anterior = serie.length > 1 ? serie[serie.length - 2].bruto : null;
    const cambio = anterior ? ((d.tot.bruto - anterior) / anterior) * 100 : null;

    el.innerHTML = String(html`
      <div class="titulo-vista">
        <div><div class="sobre">${t("dueno.sobre")}</div><h1>${t("dueno.titulo")}</h1></div>
        <div class="acciones">
          <span class="pildora">${t("dueno.solo_lectura")}</span>
          ${selectorSemana(semanas, semana)}
          <button type="button" class="btn btn-sec" id="excel" ${d.filas.length ? "" : html`disabled`}>${crudo(ICONO.descarga)} ${t("comun.excel")}</button>
        </div>
      </div>
      ${kpis(d, semana)}
      <div class="kpis dos">
        <div class="kpi"><div class="sub">${t("dueno.cambio")}</div>
          <div class="num">${cambio === null ? "—" : `${cambio >= 0 ? "+" : "−"}${Math.abs(cambio).toFixed(1)}%`}</div>
          <div class="sub">${t("dueno.vs_anterior")}</div></div>
        <div class="kpi"><div class="sub">${t("prest.por_cobrar")}</div><div class="num rojo">${dinero(porCobrar)}</div>
          <div class="sub">${t("dueno.prestamos_activos", { n: prestamos.filter((p) => p.activo && p.saldo > 0).length })}</div></div>
      </div>
      <div class="dos-paneles">
        <section class="tarjeta"><h2>${t("dueno.tendencia")}</h2>
          <div class="columnas" role="img" aria-label="${t("dueno.tendencia")}: ${serie.map((x) => `${fmtSemana(x.semana)} ${dinero(x.bruto)}`).join("; ")}">
            ${serie.map((x) => html`<div class="columna">
              <div class="mono pequeno">${dinero(x.bruto)}</div>
              <div class="col-barra ${x.semana.id === semana.id ? "actual" : ""}" style="height:${Math.max(4, (x.bruto / max) * 160).toFixed(0)}px"></div>
              <div class="sub">${fmtDia(x.semana.inicio, { day: "numeric", month: "short" })}</div>
            </div>`)}
          </div></section>
        <section class="tarjeta"><h2>${t("nomina.por_proyecto")}</h2>${barrasProyectos(d.porProyecto)}</section>
      </div>
      <section class="tarjeta"><h2>${t("nomina.por_trabajador")}</h2>
        ${d.filas.length ? tablaNomina(d) : html`<p class="vacio">${t("nomina.vacia")}</p>`}</section>
      <p class="nota">${t("dueno.nota", { semana: fmtSemana(semana), estado: t(`semana.${semana.estado}`) })}</p>`);
  };

  el.addEventListener("change", (ev) => {
    if (ev.target.id === "semana") {
      semana = semanas.find((s) => s.id === ev.target.value);
      cargar().catch((e) => aviso(mensajeError(e), "error"));
    }
  });
  el.addEventListener("click", (ev) => {
    if (ev.target.closest("#excel") && datos) exportarNomina(datos, semana, ctx.empresa);
  });
  await cargar();
}
