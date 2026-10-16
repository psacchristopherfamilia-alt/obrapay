// Costo por vehículo: seguro + gasolina + mantenimiento (servicios con costo), por semana (jueves a miércoles) o por mes.
// Admin y dueño ven; solo el admin cambia el costo del seguro. Nada se reparte por obra.
import { api } from "../api.js";
import { t } from "../i18n.js";
import { html, fmtDia, hoyLocal, sumarDias, nombreMes, aviso, mensajeError, ocupado, abrirModal, cerrarModal } from "../ui.js";

const FMT2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const FMT0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = (n) => FMT2.format(Number(n) || 0);
const usd0 = (n) => FMT0.format(Number(n) || 0);
const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const PAGOS_AL_ANIO = { mensual: 12, trimestral: 4, anual: 1 };

// ---------- cálculos (puros) ----------
const dia = (ymd) => Date.parse(`${ymd}T00:00:00Z`) / 86400000;
const diasEntre = (a, b) => Math.round(dia(b) - dia(a));

// La semana va de jueves a miércoles (igual que la nómina).
export function inicioSemana(ymd) {
  const dow = new Date(`${ymd}T00:00:00Z`).getUTCDay(); // 0 = domingo … 4 = jueves
  return sumarDias(ymd, -((dow - 4 + 7) % 7));
}
export const seguroAnual = (s) => Number(s.monto) * PAGOS_AL_ANIO[s.frecuencia];
export const seguroPorMes = (s) => seguroAnual(s) / 12;

function diasEnMes(ym) { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

// Seguro que cae en [ini, fin]. Mes completo = un doceavo del año; semana = 7 días del año; el primer periodo se prorratea.
export function seguroEnPeriodo(s, p) {
  if (!s || s.desde > p.fin) return 0;
  const cubiertos = diasEntre(s.desde > p.ini ? s.desde : p.ini, p.fin) + 1;
  const total = diasEntre(p.ini, p.fin) + 1;
  if (p.tipo === "mes") return (seguroPorMes(s) * cubiertos) / total;
  return (seguroAnual(s) / 365) * cubiertos;
}

// Periodo `offset` (0 = el actual, -1 = el anterior…) como { tipo, ini, fin }.
export function periodo(hoy, tipo, offset = 0) {
  if (tipo === "semana") {
    const ini = sumarDias(inicioSemana(hoy), 7 * offset);
    return { tipo, ini, fin: sumarDias(ini, 6) };
  }
  const [y, m] = hoy.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1 + offset, 1));
  const ym = `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}`;
  return { tipo, ini: `${ym}-01`, fin: `${ym}-${String(diasEnMes(ym)).padStart(2, "0")}`, ym, mes: f.getUTCMonth() + 1, anio: f.getUTCFullYear() };
}

const enPeriodo = (f, p) => f >= p.ini && f <= p.fin;
// Costos de un conjunto de vehículos en un periodo.
export function costosPeriodo({ ids, gas, servicios, seguros }, p) {
  const sel = new Set(ids);
  const g = gas.filter((x) => sel.has(x.vehiculo_id) && enPeriodo(x.fecha, p)).reduce((a, x) => a + Number(x.total), 0);
  const m = servicios.filter((x) => sel.has(x.vehiculo_id) && x.costo !== null && x.costo !== undefined && enPeriodo(x.fecha, p)).reduce((a, x) => a + Number(x.costo), 0);
  const s = seguros.filter((x) => sel.has(x.vehiculo_id)).reduce((a, x) => a + seguroEnPeriodo(x, p), 0);
  return { seguro: s, gasolina: g, mantenimiento: m, total: s + g + m };
}

// ---------- pantalla ----------
export async function montarCostos(box, ctx, { soloLectura = false } = {}) {
  const hoy = hoyLocal(ctx.empresa.zona_horaria);
  let vehs = []; let gas = []; let servicios = []; let seguros = [];
  let sel = "todos"; let tipo = "semana"; let off = 0;

  const cargar = async () => {
    const desde = sumarDias(hoy, -400);
    [vehs, gas, servicios, seguros] = await Promise.all([
      api.sel("vehiculos", "select=*&activo=eq.true&order=nombre.asc"),
      api.sel("vehiculo_gasolina", `select=vehiculo_id,fecha,total&activo=eq.true&fecha=gte.${desde}`),
      api.sel("vehiculo_servicios", `select=vehiculo_id,fecha,costo&fecha=gte.${desde}`),
      api.sel("vehiculo_seguro_costo", "select=*"),
    ]);
    if (sel !== "todos" && !vehs.some((v) => v.id === sel)) sel = "todos";
    pintar();
  };

  const nombrePeriodo = (p) => (p.tipo === "mes"
    ? `${mayus(nombreMes(p.mes))} ${p.anio}`
    : `${fmtDia(p.ini, { day: "numeric", month: "short" })} – ${fmtDia(p.fin, { day: "numeric", month: "short" })}`);
  const corto = (p) => (p.tipo === "mes" ? mayus(nombreMes(p.mes)).slice(0, 3) : fmtDia(p.ini, { day: "numeric", month: "short" }));

  const formulario = (v, actual) => {
    const d = abrirModal(t("cos.seg_titulo"), html`
      <form class="form" novalidate>
        <p class="sub">${v.nombre}</p>
        <p class="error-form" role="alert" hidden></p>
        <div class="campo"><label for="cs-monto">${t("cos.f_monto")}</label>
          <input id="cs-monto" name="monto" type="number" inputmode="decimal" min="0" step="0.01" value="${actual ? actual.monto : ""}" placeholder="0.00"></div>
        <div class="campo"><label for="cs-frec">${t("cos.f_frec")}</label>
          <select id="cs-frec" name="frec">${["mensual", "trimestral", "anual"].map((f) => html`<option value="${f}" ${actual?.frecuencia === f || (!actual && f === "anual") ? "selected" : ""}>${t(`cos.f_${f}`)}</option>`)}</select></div>
        <div class="campo"><label for="cs-desde">${t("cos.f_desde")}</label>
          <input id="cs-desde" name="desde" type="date" required value="${actual ? actual.desde : hoy}"></div>
        <p class="sub" id="cs-equiv"></p>
        <div class="acciones-modal">
          ${actual ? html`<button type="button" class="btn btn-sec" data-quitar-seg>${t("cos.quitar_seguro")}</button>` : ""}
          <button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("cos.guardar")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    const falla = (m) => { const e = f.querySelector(".error-form"); e.hidden = false; e.textContent = m; };
    const equiv = () => {
      const m = Number(f.monto.value);
      d.querySelector("#cs-equiv").textContent = m > 0 ? t("cos.f_equiv", { mes: usd2(seguroPorMes({ monto: m, frecuencia: f.frec.value })) }) : "";
    };
    f.addEventListener("input", equiv); equiv();
    const guardar = async (monto, frec, desde) => {
      await api.rpc("guardar_seguro_vehiculo", { p_vehiculo: v.id, p_monto: monto, p_frecuencia: frec, p_desde: desde });
      cerrarModal(); aviso(t("comun.guardado")); await cargar();
    };
    d.querySelector("[data-quitar-seg]")?.addEventListener("click", async (ev) => {
      try { await ocupado(ev.currentTarget, () => guardar(0, null, null)); } catch (e) { falla(mensajeError(e)); }
    });
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      f.querySelector(".error-form").hidden = true;
      const monto = Number(f.monto.value);
      if (!(monto > 0)) return falla(t("cos.falta_monto"));
      if (!f.desde.value) return falla(t("cos.falta_desde"));
      try { await ocupado(f.querySelector("[type=submit]"), () => guardar(monto, f.frec.value, f.desde.value)); } catch (e) { falla(mensajeError(e)); }
    });
  };

  const pintar = () => {
    if (!vehs.length) { box.innerHTML = String(html`<div class="vacio">${t("cos.sin_vehiculos")}</div>`); return; }
    const ids = sel === "todos" ? vehs.map((v) => v.id) : [sel];
    const datos = { ids, gas, servicios, seguros };
    const p = periodo(hoy, tipo, off);
    const c = costosPeriodo(datos, p);
    const N = tipo === "semana" ? 6 : 4;
    const hist = Array.from({ length: N }, (_, i) => periodo(hoy, tipo, off - (N - 1 - i)));
    const totales = hist.map((x) => costosPeriodo(datos, x).total);
    const maxH = Math.max(...totales, 1);
    const v = vehs.find((x) => x.id === sel);
    const seg = v ? seguros.find((x) => x.vehiculo_id === v.id) : null;
    const parte = (valor, clave, color) => (c.total > 0 ? html`<i style="width:${(valor / c.total) * 100}%;background:var(${color})" title="${t(clave)}"></i>` : "");
    const fila = (clave, valor, color) => html`<div class="cos-fila"><span><span class="cos-punto" style="background:var(${color})"></span>${t(clave)}</span><b class="mono">${usd2(valor)}</b></div>`;
    const chip = (id, txt) => html`<button type="button" class="chip-v ${sel === id ? "activo" : ""}" data-cos-veh="${id}" aria-pressed="${sel === id}">${txt}</button>`;
    const modo = (id, txt) => html`<button type="button" class="seg ${tipo === id ? "activo" : ""}" data-cos-tipo="${id}" aria-pressed="${tipo === id}">${txt}</button>`;
    const porVeh = sel === "todos" ? vehs.map((x) => [x, costosPeriodo({ ...datos, ids: [x.id] }, p)]).sort((a, b) => b[1].total - a[1].total) : [];

    box.innerHTML = String(html`<div class="cos">
      <div class="cos-chips">${chip("todos", t("cos.todos"))}${vehs.map((x) => chip(x.id, x.nombre))}</div>
      <section class="tarjeta">
        <div class="cos-cab"><h2 class="etiqueta">${t("cos.titulo")}</h2>
          <div class="segmentos" role="group" aria-label="${t("cos.titulo")}">${modo("semana", t("cos.semana"))}${modo("mes", t("cos.mes"))}</div></div>
        <div class="cos-nav"><button type="button" class="btn btn-sec btn-chico" data-cos-nav="-1" aria-label="${t("cos.ant")}">‹</button>
          <b>${nombrePeriodo(p)}</b>
          <button type="button" class="btn btn-sec btn-chico" data-cos-nav="1" aria-label="${t("cos.sig")}" ${off >= 0 ? "disabled" : ""}>›</button></div>
        <div class="cos-dos">
          <div>
            <div class="sub">${t(tipo === "semana" ? "cos.total_semana" : "cos.total_mes")}</div>
            <div class="cos-total mono">${usd2(c.total)}</div>
            <div class="cos-barra">${parte(c.seguro, "cos.seguro", "--cos-seg")}${parte(c.gasolina, "cos.gasolina", "--cos-gas")}${parte(c.mantenimiento, "cos.mant", "--cos-man")}</div>
            ${fila("cos.seguro", c.seguro, "--cos-seg")}${fila("cos.gasolina", c.gasolina, "--cos-gas")}${fila("cos.mant", c.mantenimiento, "--cos-man")}
          </div>
          <div>
            <div class="sub">${t(tipo === "semana" ? "cos.hist_sem" : "cos.hist_mes", { n: N })}</div>
            <div class="cos-hist">${hist.map((x, i) => html`<div class="${i === N - 1 ? "ahora" : ""}"><b class="mono">${usd0(totales[i])}</b>
              <i style="height:${Math.max(4, (totales[i] / maxH) * 100)}%"></i><span>${corto(x)}</span></div>`)}</div>
          </div>
        </div>
      </section>
      ${sel === "todos" ? html`<section class="tarjeta"><h2 class="etiqueta">${t("cos.por_vehiculo")}</h2>
        <div class="tabla-caja" role="region" aria-label="${t("cos.por_vehiculo")}" tabindex="0"><table class="tabla cos-tabla">
          <thead><tr><th scope="col">${t("cos.h_vehiculo")}</th><th scope="col" class="num">${t("cos.seguro")}</th><th scope="col" class="num">${t("cos.gasolina")}</th><th scope="col" class="num">${t("cos.mant")}</th><th scope="col" class="num">${t("cos.h_total")}</th></tr></thead>
          <tbody>${porVeh.map(([x, k]) => html`<tr><td><button type="button" class="enlace" data-cos-veh="${x.id}">${x.nombre}</button></td>
            <td class="num mono">${usd2(k.seguro)}</td><td class="num mono">${usd2(k.gasolina)}</td><td class="num mono">${usd2(k.mantenimiento)}</td><td class="num mono"><b>${usd2(k.total)}</b></td></tr>`)}</tbody></table></div>
        <p class="nota">${t("cos.nota_flota")}</p></section>` : html`<section class="tarjeta">
        <div class="cos-cab"><h2 class="etiqueta">${t("cos.seg_titulo")}</h2>
          ${soloLectura ? "" : html`<button type="button" class="btn btn-sec btn-chico" data-cos-seg>${seg ? t("venc.editar") : t("cos.agregar_seguro")}</button>`}</div>
        ${seg ? html`<div class="cos-fila"><span>${t("cos.seg_cuesta", { monto: usd2(seg.monto), frec: t(`cos.f_${seg.frecuencia}`).toLowerCase() })}</span><b class="mono">${usd2(seguroPorMes(seg))} / ${t("cos.mes").toLowerCase()}</b></div>
          <p class="sub">${t("cos.seg_info", { anual: usd2(seguroAnual(seg)), fecha: fmtDia(seg.desde, { day: "numeric", month: "short", year: "numeric" }) })}</p>`
          : html`<p class="sub">${t("cos.seg_sin")}</p>`}</section>`}
      <p class="nota">${t("cos.nota")} ${t("aj.semana_fija")}</p>
    </div>`);
  };

  box.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.cosVeh) { sel = d.cosVeh; pintar(); }
    else if (d.cosTipo) { tipo = d.cosTipo; off = 0; pintar(); }
    else if (d.cosNav) { off = Math.min(0, Math.max(tipo === "semana" ? -52 : -12, off + Number(d.cosNav))); pintar(); }
    else if (d.cosSeg !== undefined) {
      const v = vehs.find((x) => x.id === sel);
      if (v) formulario(v, seguros.find((x) => x.vehiculo_id === v.id) || null);
    }
  });
  try { await cargar(); } catch (e) { aviso(mensajeError(e), "error"); }
}
