// Presupuesto vs real por obra. El admin escribe el presupuesto (4 categorías) y el avance; lo real sale solo
// de la nómina (mano de obra) y de Gastos. El dueño lo ve en solo lectura. La base de datos avisa al admin
// cuando una obra llega al 50, 75, 90 y 100 % o cuando una categoría se pasa.
import { api } from "../api.js";
import { t } from "../i18n.js";
import { html, aviso, mensajeError, ocupado } from "../ui.js";

const CATS = [
  { k: "mano_obra", n: "pres.cat_mano_obra", o: "pres.origen_nomina", p: "p_mano_obra", r: "r_mano_obra" },
  { k: "materiales", n: "pres.cat_materiales", o: "pres.origen_gastos", p: "p_materiales", r: "r_materiales" },
  { k: "herramientas", n: "pres.cat_herramientas", o: "pres.origen_gastos", p: "p_herramientas", r: "r_herramientas" },
  { k: "subcontratos", n: "pres.cat_subcontratos", o: "pres.origen_gastos", p: "p_subcontratos", r: "r_subcontratos" },
];
const FORMATO = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd = (n) => FORMATO.format(Math.abs(Number(n) || 0));
const num = (n) => Number(n) || 0;
const suma = (o, campo) => CATS.reduce((a, c) => a + num(o[campo(c)]), 0);

// Estado de una obra: lo gastado contra el presupuesto y contra el avance que dice el admin.
export function estadoObra(o) {
  const pres = suma(o, (c) => c.p), real = suma(o, (c) => c.r);
  if (!o.tiene || pres <= 0) return { pres, real, usado: null, margen: null, sev: "sin", pasadas: [], cerca: [] };
  const usado = (real / pres) * 100;
  const pasadas = CATS.filter((c) => num(o[c.p]) > 0 && num(o[c.r]) > num(o[c.p]));
  const cerca = CATS.filter((c) => num(o[c.p]) > 0 && num(o[c.r]) <= num(o[c.p]) && num(o[c.r]) / num(o[c.p]) >= 0.9);
  const sev = pasadas.length || usado > o.avance + 15 ? "error" : usado > o.avance + 5 || cerca.length ? "aviso" : "ok";
  return { pres, real, usado, margen: pres - real, sev, pasadas, cerca };
}
const ETQ = { error: "pres.est_revisar", aviso: "pres.est_atencion", ok: "pres.est_bien", sin: "pres.est_sin" };
const PILD = { error: "pildora-error", aviso: "pildora-aviso", ok: "pildora-ok", sin: "" };

const pildora = (e) => html`<span class="pildora ${PILD[e.sev]}">${t(ETQ[e.sev])}</span>`;
// Llenado = gastado; marca vertical = avance de la obra.
const barra = (o, e) => html`<div class="pres-barra pres-${e.sev}" role="img" aria-label="${e.usado === null ? t("pres.est_sin") : t("pres.usado", { n: Math.round(e.usado) }) + ", " + t("pres.avance_n", { n: o.avance })}">
  <i style="width:${e.usado === null ? 0 : Math.min(100, e.usado)}%"></i>${e.usado === null ? "" : html`<u style="left:${o.avance}%"></u>`}</div>`;

export async function vistaPresupuestos(el, ctx) {
  const esAdmin = ctx.roles.includes("admin");
  let obras = []; let sel = null;

  const cargar = async () => {
    obras = await api.rpc("presupuesto_resumen", {});
    if (!obras.some((o) => o.proyecto_id === sel)) sel = obras[0]?.proyecto_id || null;
    pintar();
  };

  const filaTabla = (o) => {
    const e = estadoObra(o);
    return html`<tr class="pres-fila ${o.proyecto_id === sel ? "sel" : ""}" data-obra="${o.proyecto_id}" tabindex="0">
      <th scope="row">${o.proyecto}</th>
      <td class="num">${e.pres ? usd(e.pres) : "—"}</td><td class="num">${usd(e.real)}</td>
      <td class="pres-uso"><div class="pres-uso-t"><span class="mono">${e.usado === null ? "—" : t("pres.usado", { n: Math.round(e.usado) })}</span><span class="sub">${e.usado === null ? "" : t("pres.avance_n", { n: o.avance })}</span></div>${barra(o, e)}</td>
      <td class="num ${e.margen !== null && e.margen < 0 ? "pres-rojo" : ""}">${e.margen === null ? "—" : (e.margen < 0 ? "−" : "") + usd(e.margen)}</td>
      <td>${pildora(e)}</td></tr>`;
  };

  const tarjeta = (o) => {
    const e = estadoObra(o);
    return html`<button type="button" class="pres-card pres-card-${e.sev}" data-obra="${o.proyecto_id}" aria-pressed="${o.proyecto_id === sel}">
      <div class="pres-card-cab"><b>${o.proyecto}</b>${pildora(e)}</div>
      ${barra(o, e)}
      <div class="pres-cifras">
        <div><span class="sub">${t("pres.h_pres")}</span><b>${e.pres ? usd(e.pres) : "—"}</b></div>
        <div><span class="sub">${t("pres.h_gastado")}</span><b>${usd(e.real)}</b></div>
        <div><span class="sub">${e.margen !== null && e.margen < 0 ? t("pres.pasado") : t("pres.queda")}</span><b class="${e.margen === null ? "" : e.margen < 0 ? "pres-rojo" : "pres-verde"}">${e.margen === null ? "—" : usd(e.margen)}</b></div>
      </div>
      <span class="sub">${e.usado === null ? t("pres.agrega") : t("pres.usado", { n: Math.round(e.usado) }) + " · " + t("pres.avance_n", { n: o.avance })}</span></button>`;
  };

  const detalle = () => {
    const o = obras.find((x) => x.proyecto_id === sel);
    if (!o) return "";
    const e = estadoObra(o);
    const alertas = [
      ...e.pasadas.map((c) => t("pres.alerta_pasado", { cat: t(c.n), n: usd(num(o[c.r]) - num(o[c.p])) })),
      ...e.cerca.map((c) => t("pres.alerta_cerca", { cat: t(c.n), n: Math.round((num(o[c.r]) / num(o[c.p])) * 100) })),
    ];
    return html`<section class="tarjeta pres-detalle" id="pres-detalle" aria-label="${o.proyecto}">
      <div class="pres-det-cab"><div><h2>${o.proyecto}</h2><span class="sub">${t("pres.avance_n", { n: o.avance })}</span></div>
        <div class="pres-tot"><span class="sub">${t("pres.gastado_de", { total: e.pres ? usd(e.pres) : t("pres.sin_pres") })}</span><b class="mono">${usd(e.real)}</b>${pildora(e)}</div></div>
      ${alertas.length ? html`<div class="pres-alerta ${e.pasadas.length ? "pres-alerta-rojo" : ""}" role="status">${alertas.join(". ")}.</div>` : ""}
      <div class="pres-cats">${CATS.map((c) => {
        const pr = num(o[c.p]), re = num(o[c.r]), u = pr ? (re / pr) * 100 : null;
        const sev = u === null ? "sin" : u > 100 ? "error" : u >= 90 ? "aviso" : "ok";
        return html`<div class="pres-cat"><div class="pres-cat-t"><b>${t(c.n)}</b><span class="sub">${t(c.o)}</span></div>
          <div class="pres-barra pres-${sev}"><i style="width:${u === null ? 0 : Math.min(100, u)}%"></i></div>
          <div class="pres-cat-n"><span class="mono">${t("pres.de", { gastado: usd(re), presupuesto: pr ? usd(pr) : t("pres.sin_pres") })}</span>
            ${pr ? html`<span class="${re > pr ? "pres-rojo" : "pres-verde"}">${re > pr ? t("pres.te_pasaste", { n: usd(re - pr) }) : t("pres.quedan", { n: usd(pr - re) })}</span>` : ""}</div></div>`;
      })}</div>
      <p class="nota">${t("pres.nota_mo")}</p>
      ${esAdmin ? html`<form class="form pres-form" id="pres-form" novalidate>
        <h3>${t("pres.f_titulo")}</h3>
        <div class="pres-campos">${CATS.map((c) => html`<div class="campo"><label for="pf-${c.k}">${t(c.n)}</label>
          <input id="pf-${c.k}" name="${c.k}" type="number" inputmode="decimal" min="0" step="50" placeholder="0" value="${num(o[c.p]) || ""}"></div>`)}</div>
        <div class="campo"><label for="pf-avance">${t("pres.f_avance")}: <b class="mono" id="pf-av-n">${o.avance}%</b></label>
          <input id="pf-avance" name="avance" type="range" min="0" max="100" step="5" value="${o.avance}"></div>
        <p class="nota" id="pf-total">${t("pres.f_total", { n: usd(e.pres) })}</p>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones"><button type="submit" class="btn btn-pri">${t("pres.guardar")}</button></div>
        <p class="nota">${t("pres.nota_aviso")}</p>
      </form>` : html`<p class="nota">${t("pres.nota_aviso")}</p>`}
    </section>`;
  };

  const pintar = () => {
    const con = obras.map((o) => ({ o, e: estadoObra(o) })).filter((x) => x.e.sev !== "sin");
    const pres = con.reduce((a, x) => a + x.e.pres, 0), real = con.reduce((a, x) => a + x.e.real, 0);
    const revisar = con.filter((x) => x.e.sev === "error").length;
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("pres.titulo")}</h1>${esAdmin ? "" : html`<span class="pildora">${t("dueno.solo_lectura")}</span>`}</div>
      <div class="kpis">
        <div class="kpi"><span class="sub">${t("pres.k_pres")}</span><span class="num">${usd(pres)}</span></div>
        <div class="kpi"><span class="sub">${t("pres.k_gastado")}</span><span class="num">${usd(real)}</span></div>
        <div class="kpi"><span class="sub">${t("pres.k_queda")}</span><span class="num ${pres - real < 0 ? "rojo" : ""}">${pres - real < 0 ? "−" : ""}${usd(pres - real)}</span></div>
        <div class="kpi"><span class="sub">${t("pres.k_revisar")}</span><span class="num ${revisar ? "rojo" : ""}">${revisar}</span></div>
      </div>
      <div class="pres-leyenda"><span class="pres-l-gasto">${t("pres.leyenda_gasto")}</span><span class="pres-l-avance">${t("pres.leyenda_avance")}</span></div>
      ${obras.length === 0 ? html`<div class="vacio">${t("pres.vacio")}</div>` : html`
        <div class="tabla-caja pres-tabla"><table class="tabla"><thead><tr>
          <th>${t("pres.h_obra")}</th><th class="num">${t("pres.h_pres")}</th><th class="num">${t("pres.h_gastado")}</th>
          <th>${t("pres.h_uso")}</th><th class="num">${t("pres.h_queda")}</th><th>${t("pres.h_estado")}</th></tr></thead>
          <tbody>${obras.map(filaTabla)}</tbody></table></div>
        <div class="pres-tarjetas">${obras.map(tarjeta)}</div>`}
      ${detalle()}`);
  };

  const elegir = (id) => { sel = id; pintar(); el.querySelector("#pres-detalle")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); };
  el.addEventListener("click", (ev) => { const b = ev.target.closest("[data-obra]"); if (b) elegir(b.dataset.obra); });
  el.addEventListener("keydown", (ev) => { const b = ev.target.closest("tr[data-obra]"); if (b && ev.key === "Enter") elegir(b.dataset.obra); });
  el.addEventListener("input", (ev) => {
    const f = ev.target.closest("#pres-form");
    if (!f) return;
    if (ev.target.name === "avance") f.querySelector("#pf-av-n").textContent = `${f.avance.value}%`;
    f.querySelector("#pf-total").textContent = t("pres.f_total", { n: usd(CATS.reduce((a, c) => a + num(f[c.k].value), 0)) });
  });
  el.addEventListener("submit", async (ev) => {
    const f = ev.target.closest("#pres-form");
    if (!f) return;
    ev.preventDefault();
    const err = f.querySelector(".error-form");
    err.hidden = true;
    const v = {}; let malo = false;
    CATS.forEach((c) => { const n = f[c.k].value.trim() === "" ? 0 : Number(f[c.k].value); if (!Number.isFinite(n) || n < 0) malo = true; v[c.k] = n; });
    if (malo) { err.hidden = false; err.textContent = t("pres.f_invalido"); return; }
    try {
      await ocupado(f.querySelector("[type=submit]"), () => api.rpc("guardar_presupuesto", {
        p_proyecto: sel, p_mano_obra: v.mano_obra, p_materiales: v.materiales, p_herramientas: v.herramientas,
        p_subcontratos: v.subcontratos, p_avance: Number(f.avance.value),
      }));
      aviso(t("pres.guardado"));
      await cargar();
    } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
  });

  await cargar();
}
