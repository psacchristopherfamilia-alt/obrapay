// Gasolina por vehículo y conductor. El conductor asignado (o el admin) registra el total y sube el recibo (obligatorio);
// cuenta al instante. Quien la registró puede corregirla; solo el admin la quita. El dueño solo ve.
// Se muestra dentro de Vehículos: reporte para admin/dueño y "mis cargas" para el conductor.
import { api } from "../api.js";
import { t } from "../i18n.js";
import { html, fmtDia, hoyLocal, nombreMes, aviso, mensajeError, ocupado, abrirModal, cerrarModal, confirmar, crudo, ICONO } from "../ui.js";
import { subirDocumento, mensajeArchivo } from "../archivos.js";

const FMT0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const FMT2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd0 = (n) => FMT0.format(Number(n) || 0);
const usd2 = (n) => FMT2.format(Number(n) || 0);
const mi = (n) => Number(n).toLocaleString("en-US");
const num = (v) => (String(v).trim() === "" ? null : Number(v));
const fecha = (d) => fmtDia(d, { day: "numeric", month: "short" });
const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------- cálculos (puros) ----------
// Costo por milla: por vehículo, con las cargas que traen millas del odómetro. La primera carga marca el punto de
// partida; lo que se gastó después cubre las millas recorridas hasta la última lectura.
export function costoPorMilla(cargas) {
  const porVeh = new Map();
  for (const c of cargas) {
    if (c.millas === null || c.millas === undefined) continue;
    if (!porVeh.has(c.vehiculo_id)) porVeh.set(c.vehiculo_id, []);
    porVeh.get(c.vehiculo_id).push(c);
  }
  let costo = 0; let millas = 0;
  for (const lista of porVeh.values()) {
    if (lista.length < 2) continue;
    lista.sort((a, b) => a.millas - b.millas || a.fecha.localeCompare(b.fecha));
    const dm = lista[lista.length - 1].millas - lista[0].millas;
    if (dm <= 0) continue;
    costo += lista.slice(1).reduce((a, c) => a + Number(c.total), 0);
    millas += dm;
  }
  return millas > 0 ? costo / millas : null;
}
export const sumaPor = (cargas, clave) => {
  const m = new Map();
  for (const c of cargas) m.set(c[clave], (m.get(c[clave]) || 0) + Number(c.total));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
// Últimos n meses terminando en el mes de "hoy" ("2026-10" → ["2026-07", ..., "2026-10"]).
export function ultimosMeses(hoy, n) {
  let [a, m] = hoy.slice(0, 7).split("-").map(Number);
  const r = [];
  for (let i = 0; i < n; i++) { r.unshift(`${a}-${String(m).padStart(2, "0")}`); m -= 1; if (m === 0) { m = 12; a -= 1; } }
  return r;
}
const nombreDeMes = (ym) => mayus(nombreMes(Number(ym.slice(5, 7))));

// ---------- formulario (registrar o corregir) ----------
function formulario(ctx, { vehiculos, vehiculo, carga, esAdmin }, despues) {
  const hoy = hoyLocal(ctx.empresa.zona_horaria);
  const fijo = vehiculo || null;
  const d = abrirModal(carga ? t("gas.corregir_t") : t("gas.registrar_t"), html`
    <form class="form" novalidate>
      ${carga ? "" : fijo ? "" : html`<div class="campo"><label for="gs-veh">${t("gas.f_vehiculo")}</label>
        <select id="gs-veh" name="vehiculo">${vehiculos.map((v) => html`<option value="${v.id}">${v.nombre}${v.placa ? ` · ${v.placa}` : ""}</option>`)}</select></div>`}
      <div class="campo"><label for="gs-total">${t("gas.f_total")}</label>
        <input id="gs-total" name="total" type="number" inputmode="decimal" min="0" step="0.01" required placeholder="0.00" value="${carga ? carga.total : ""}"></div>
      <div class="campo"><label for="gs-recibo">${carga ? t("gas.f_recibo_nuevo") : t("gas.f_recibo")}</label>
        <input id="gs-recibo" name="recibo" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" ${carga ? "" : "required"}></div>
      <div class="campo"><label for="gs-millas">${t("gas.f_millas")}</label>
        <input id="gs-millas" name="millas" type="number" inputmode="numeric" min="0" step="1" value="${carga?.millas ?? ""}"></div>
      <p class="nota">${t("gas.nota_millas")}</p>
      <div class="campo"><label for="gs-fecha">${t("gas.f_fecha")}</label>
        <input id="gs-fecha" name="fecha" type="date" required max="${hoy}" value="${carga ? carga.fecha : hoy}"></div>
      <p class="error-form" role="alert" hidden></p>
      <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
        <button type="submit" class="btn btn-pri">${t("gas.guardar")}</button></div>
    </form>`);
  const f = d.querySelector("form");
  const falla = (m) => { const e = f.querySelector(".error-form"); e.hidden = false; e.textContent = m; };
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    f.querySelector(".error-form").hidden = true;
    const total = num(f.total.value);
    const veh = carga ? vehiculos.find((v) => v.id === carga.vehiculo_id) : fijo || vehiculos.find((v) => v.id === f.vehiculo?.value);
    const millas = num(f.millas.value);
    const archivo = f.recibo.files[0];
    if (total === null || !(total > 0)) return falla(t("gas.falta_total"));
    if (!carga && !archivo) return falla(t("gas.falta_recibo"));
    if (millas !== null && (!Number.isInteger(millas) || millas < 0)) return falla(t("gas.millas_invalida"));
    if (!carga && millas !== null && !esAdmin && veh && millas < veh.millas) return falla(t("gas.millas_menor", { n: mi(veh.millas) }));
    if (!f.fecha.value || f.fecha.value > hoy) return falla(t("gas.fecha_futura"));
    try {
      await ocupado(f.querySelector("[type=submit]"), async () => {
        const a = await subirDocumento(ctx, archivo, "gasolina");
        if (carga) {
          await api.rpc("corregir_gasolina", { p_id: carga.id, p_total: total, p_fecha: f.fecha.value, p_millas: millas, p_recibo_path: a.ruta || null, p_recibo_nombre: a.nombre || null });
        } else {
          await api.rpc("registrar_gasolina", { p_vehiculo: veh.id, p_total: total, p_recibo_path: a.ruta, p_recibo_nombre: a.nombre, p_millas: millas, p_fecha: f.fecha.value });
        }
      });
      cerrarModal(); aviso(carga ? t("gas.corregida") : t("gas.guardado")); await despues();
    } catch (e) { falla(mensajeArchivo(e)); }
  });
}

async function verRecibo(boton, ruta) {
  await ocupado(boton, async () => { window.open(await api.urlArchivo("documentos", ruta), "_blank", "noopener"); });
}

// ---------- montar ----------
// vehiculo: pantalla del conductor (sus cargas de ese vehículo). Sin vehiculo: reporte de admin o dueño.
export async function montarGasolina(box, ctx, { vehiculo = null, soloLectura = false, alCambiar = null } = {}) {
  const esAdmin = ctx.roles.includes("admin");
  const hoy = hoyLocal(ctx.empresa.zona_horaria);
  const mesActual = hoy.slice(0, 7);
  let cargas = []; let vehs = []; let personas = [];

  const cargar = async (notificar = false) => {
    const desde = `${ultimosMeses(hoy, 4)[0]}-01`;
    const pedidos = [api.sel("vehiculo_gasolina", `select=*&activo=eq.true&fecha=gte.${desde}&order=fecha.desc,creado_en.desc`)];
    if (!vehiculo) pedidos.push(api.sel("vehiculos", "select=*&activo=eq.true&order=nombre.asc"), api.sel("perfiles", "select=id,nombre&order=nombre.asc"));
    const r = await Promise.all(pedidos);
    cargas = vehiculo ? r[0].filter((c) => c.vehiculo_id === vehiculo.id) : r[0];
    if (!vehiculo) { vehs = r[1]; personas = r[2]; }
    pintar();
    if (notificar && alCambiar) await alCambiar();
  };
  const nVeh = (id) => vehs.find((v) => v.id === id)?.nombre || "—";
  const nPer = (id) => personas.find((p) => p.id === id)?.nombre || "—";
  const abrirForm = (carga) => formulario(ctx, { vehiculos: vehs, vehiculo, carga, esAdmin }, () => cargar(true));

  const filaCarga = (c, conVeh) => html`<tr>
    <td>${fecha(c.fecha)}</td>${conVeh ? html`<td>${nVeh(c.vehiculo_id)}</td><td>${nPer(c.perfil_id)}</td>` : ""}
    <td class="num">${usd2(c.total)}${c.editado_en ? html` <span class="sub">· ${t("gas.marca_corregida")}</span>` : ""}</td>
    <td class="num">${c.millas === null ? "—" : mi(c.millas)}</td>
    <td class="gas-acc"><button type="button" class="btn btn-sec btn-chico" data-gas-ver="${c.id}">${t("gas.ver_recibo")}</button>
      ${soloLectura ? "" : html`<button type="button" class="btn btn-sec btn-chico" data-gas-editar="${c.id}">${t("venc.editar")}</button>`}
      ${esAdmin && !soloLectura ? html`<button type="button" class="btn btn-sec btn-chico" data-gas-quitar="${c.id}">${t("venc.quitar")}</button>` : ""}</td></tr>`;

  const tabla = (lista, conVeh) => html`<div class="tabla-caja"><table class="tabla gas-tabla"><thead><tr>
    <th>${t("gas.h_fecha")}</th>${conVeh ? html`<th>${t("gas.h_vehiculo")}</th><th>${t("gas.h_conductor")}</th>` : ""}
    <th class="num">${t("gas.h_total")}</th><th class="num">${t("gas.h_millas")}</th><th>${t("gas.h_recibo")}</th></tr></thead>
    <tbody>${lista.map((c) => filaCarga(c, conVeh))}</tbody></table></div>`;

  const barras = (lista, nombre) => {
    if (!lista.length) return html`<p class="sub">${t("gas.vacio_mes")}</p>`;
    const max = lista[0][1];
    return html`<div class="gas-barras">${lista.map(([id, v]) => html`<div><div class="gas-barra-t"><b>${nombre(id)}</b><span class="mono">${usd2(v)}</span></div>
      <div class="veh-barra"><i class="b-ok" style="width:${(v / max) * 100}%"></i></div></div>`)}</div>`;
  };

  const pintarConductor = () => {
    const mias = cargas.slice(0, 8);
    box.innerHTML = String(html`<div class="gas-conductor">
      <div class="gas-cab"><h2 class="etiqueta">${t("gas.mis_cargas")}</h2>
        <button type="button" class="btn btn-pri" data-gas-nueva>${crudo(ICONO.mas)} ${t("gas.registrar")}</button></div>
      ${mias.length ? tabla(mias, false) : html`<p class="sub">${t("gas.mi_vacio")}</p>`}</div>`);
  };

  const pintarReporte = () => {
    const delMes = cargas.filter((c) => c.fecha.startsWith(mesActual));
    const totalMes = delMes.reduce((a, c) => a + Number(c.total), 0);
    const cpm = costoPorMilla(delMes);
    const meses = ultimosMeses(hoy, 4);
    const totales = meses.map((m) => cargas.filter((c) => c.fecha.startsWith(m)).reduce((a, c) => a + Number(c.total), 0));
    const maxMes = Math.max(...totales, 1);
    const mesTxt = nombreDeMes(mesActual);
    box.innerHTML = String(html`<div class="gas-reporte">
      <div class="gas-cab"><h2 class="etiqueta">${t("gas.titulo")}</h2>
        ${soloLectura || !vehs.length ? "" : html`<button type="button" class="btn btn-pri" data-gas-nueva>${crudo(ICONO.mas)} ${t("gas.registrar")}</button>`}</div>
      <div class="kpis">
        <div class="kpi"><span class="sub">${t("gas.k_gasto", { mes: mesTxt })}</span><span class="num">${usd0(totalMes)}</span></div>
        <div class="kpi"><span class="sub">${t("gas.k_cargas")}</span><span class="num">${delMes.length}</span></div>
        <div class="kpi"><span class="sub">${t("gas.k_promedio")}</span><span class="num">${delMes.length ? usd2(totalMes / delMes.length) : "—"}</span></div>
        <div class="kpi"><span class="sub">${t("gas.k_milla")}</span><span class="num">${cpm === null ? "—" : usd2(cpm)}</span></div>
      </div>
      <p class="nota">${t("gas.nota_milla")}</p>
      ${cargas.length === 0 ? html`<div class="vacio">${t("gas.vacio")}</div>` : html`
        <div class="gas-dos">
          <section class="tarjeta"><h2 class="etiqueta">${t("gas.por_vehiculo", { mes: mesTxt })}</h2>${barras(sumaPor(delMes, "vehiculo_id"), nVeh)}</section>
          <section class="tarjeta"><h2 class="etiqueta">${t("gas.por_conductor", { mes: mesTxt })}</h2>${barras(sumaPor(delMes, "perfil_id"), nPer)}</section>
        </div>
        <section class="tarjeta"><h2 class="etiqueta">${t("gas.por_mes")}</h2>
          <div class="gas-meses">${meses.map((m, i) => html`<div class="gas-mes ${m === mesActual ? "ahora" : ""}"><b class="mono">${usd0(totales[i])}</b>
            <i style="height:${Math.max(4, (totales[i] / maxMes) * 100)}%"></i><span>${nombreDeMes(m).slice(0, 3)}</span></div>`)}</div></section>
        <section class="tarjeta"><h2 class="etiqueta">${t("gas.recientes")}</h2>${tabla(cargas.slice(0, 15), true)}</section>`}
    </div>`);
  };
  const pintar = () => (vehiculo ? pintarConductor() : pintarReporte());

  box.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    try {
      if (d.gasNueva !== undefined) abrirForm(null);
      const c = cargas.find((x) => x.id === (d.gasVer || d.gasEditar || d.gasQuitar));
      if (c && d.gasVer) await verRecibo(b, c.recibo_path);
      if (c && d.gasEditar) abrirForm(c);
      if (c && d.gasQuitar) {
        if (!(await confirmar(t("gas.quitar_t"), t("gas.quitar_txt"), { peligro: true, boton: t("venc.quitar") }))) return;
        await api.rpc("quitar_gasolina", { p_id: c.id });
        aviso(t("comun.guardado")); await cargar(true);
      }
    } catch (e) { aviso(mensajeError(e), "error"); }
  });
  await cargar();
}
