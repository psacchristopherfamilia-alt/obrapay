// Vehículos: ficha, conductor asignado, millas, documentos (seguro, inspección, registro) y planes de mantenimiento
// por millas o por fecha (avisa lo que ocurra primero). El admin edita; el dueño solo ve; el conductor asignado
// ve su vehículo y actualiza las millas. La base de datos avisa al admin cada día.
import { api } from "../api.js";
import { t } from "../i18n.js";
import {
  html, crudo, fmtDia, hoyLocal, fechaLocal, sumarDias, aviso, mensajeError, ocupado, abrirModal, cerrarModal, confirmar, ICONO,
} from "../ui.js";
import { subirDocumento, mensajeArchivo } from "../archivos.js";
import { montarGasolina } from "./gasolina.js";
import { montarCostos } from "./costos.js";

// Documentos del vehículo y cuántos días antes empieza el aviso (igual que la base de datos).
export const DOCS = { seguro_vehiculo: "veh.d_seguro", inspeccion_vehiculo: "veh.d_inspeccion", registro_vehiculo: "veh.d_registro" };
const VENT_DOC = 30;
const VENT_FECHA = 15; // mantenimiento por fecha
const VENT_MILLAS = 500; // mantenimiento por millas
const TIPOS = ["camioneta", "van", "camion", "remolque", "otro"];
const ORD = { error: 3, aviso: 2, ok: 1 };

const fecha = (d) => fmtDia(d, { day: "numeric", month: "short", year: "numeric" });
const mi = (n) => Number(n).toLocaleString("en-US");
const dif = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const peor = (lista) => lista.reduce((p, s) => (ORD[s] > ORD[p] ? s : p), "ok");
const pildora = (sev, texto) => html`<span class="pildora pildora-${sev}">${texto}</span>`;
const numero = (v) => (String(v).trim() === "" ? null : Number(v));
const textoDias = (n) => (n < 0 ? t("venc.hace", { n: -n }) : n === 0 ? t("venc.hoy") : t("venc.faltan", { n }));

function estadoDoc(d, hoy) {
  const n = dif(hoy, d.vence);
  return { n, sev: n < 0 ? "error" : n <= VENT_DOC ? "aviso" : "ok", txt: textoDias(n) };
}

// Plan de mantenimiento: por días (desde el último servicio), por millas, o ambos. Manda lo que ocurra primero.
function estadoPlan(p, v, hoy) {
  const fechaProx = p.cada_dias ? sumarDias(p.ultimo_fecha, p.cada_dias) : null;
  const millasProx = p.cada_millas ? p.ultimo_millas + p.cada_millas : null;
  const d = fechaProx ? dif(hoy, fechaProx) : null;
  const m = millasProx !== null ? millasProx - v.millas : null;
  const sev = (d !== null && d < 0) || (m !== null && m < 0) ? "error"
    : (d !== null && d <= VENT_FECHA) || (m !== null && m <= VENT_MILLAS) ? "aviso" : "ok";
  const rd = d === null ? Infinity : d / p.cada_dias;
  const rm = m === null ? Infinity : m / p.cada_millas;
  const por = rd <= rm ? "fecha" : "millas";
  const txt = por === "fecha" ? textoDias(d) : m < 0 ? t("veh.pasado_mi", { n: mi(-m) }) : t("veh.faltan_mi", { n: mi(m) });
  return { d, m, sev, por, txt, fechaProx, millasProx, ratio: Math.min(rd, rm) };
}
const textoCada = (p) => (p.cada_millas && p.cada_dias ? t("veh.plan_cada_ambos", { millas: mi(p.cada_millas), dias: p.cada_dias })
  : p.cada_millas ? t("veh.plan_cada_millas", { millas: mi(p.cada_millas) }) : t("veh.plan_cada_dias", { dias: p.cada_dias }));

// ---------- millas (admin y conductor asignado) ----------
function modalMillas(v, { admin }, despues) {
  const d = abrirModal(t("veh.millas_t", { nombre: v.nombre }), html`
    <form class="form" novalidate>
      <p class="texto-modal">${t("veh.millas_txt", { n: mi(v.millas) })}</p>
      <div class="campo"><label for="mi-millas">${t("veh.f_millas_nuevas")}</label>
        <input id="mi-millas" name="millas" type="number" inputmode="numeric" min="${admin ? 0 : v.millas}" step="1" required value="${v.millas}"></div>
      <p class="error-form" role="alert" hidden></p>
      <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
        <button type="submit" class="btn btn-pri">${t("veh.guardar")}</button></div>
    </form>`);
  const f = d.querySelector("form");
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = f.querySelector(".error-form");
    const n = numero(f.millas.value);
    if (n === null || !Number.isInteger(n) || n < 0) { err.hidden = false; err.textContent = t("veh.millas_invalida"); return; }
    if (!admin && n < v.millas) { err.hidden = false; err.textContent = t("veh.millas_menor", { n: mi(v.millas) }); return; }
    try {
      await ocupado(f.querySelector("[type=submit]"), () => api.rpc("actualizar_millas", { p_vehiculo: v.id, p_millas: n }));
      cerrarModal(); aviso(t("veh.millas_ok")); await despues();
    } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
  });
}

const datosVehiculo = (v) => html`${[v.anio, t(`veh.t_${v.tipo}`)].filter(Boolean).join(" · ")}`;

// ---------- pantalla del conductor ----------
async function miVehiculo(el, ctx) {
  const hoy = hoyLocal(ctx.empresa.zona_horaria);
  let vehs = []; let planes = [];
  const cargar = async () => {
    [vehs, planes] = await Promise.all([
      api.sel("vehiculos", "select=*&activo=eq.true&order=nombre.asc"),
      api.sel("vehiculo_planes", "select=*&activo=eq.true&order=nombre.asc"),
    ]);
    pintar();
  };
  const tarjeta = (v) => {
    const ps = planes.filter((p) => p.vehiculo_id === v.id).map((p) => ({ p, e: estadoPlan(p, v, hoy) }));
    return html`<section class="tarjeta veh-mio">
      <div class="veh-cab"><div><div class="fuerte">${v.nombre}</div><div class="sub">${datosVehiculo(v)}${v.marca ? html` · ${v.marca} ${v.modelo || ""}` : ""}</div></div>
        ${v.placa ? html`<span class="veh-placa">${v.placa}</span>` : ""}</div>
      <div class="veh-millas"><div><span class="sub">${t("veh.millas_actuales")}</span><b class="mono">${t("veh.millas", { n: mi(v.millas) })}</b>
        <span class="sub">${t("veh.actualizado", { fecha: fecha(fechaLocal(v.millas_en, ctx.empresa.zona_horaria)) })}</span></div>
        <button type="button" class="btn btn-pri" data-millas="${v.id}">${t("veh.act_millas")}</button></div>
      <h2 class="etiqueta">${t("veh.mantenimiento")}</h2>
      ${ps.length ? html`<div class="veh-lista">${ps.map(({ p, e }) => html`<div class="veh-fila">
        <div><div class="fuerte">${p.nombre}</div><div class="sub">${textoCada(p)}</div></div>${pildora(e.sev, e.txt)}</div>`)}</div>`
        : html`<p class="sub">${t("veh.mi_sin_planes")}</p>`}
      <div class="veh-gas" data-gas-v="${v.id}"></div>
    </section>`;
  };
  const pintar = () => {
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("veh.mi_titulo")}</h1></div>
      <p class="nota">${t("veh.mi_nota")}</p>
      ${vehs.length ? vehs.map(tarjeta) : html`<div class="vacio">${t("veh.mi_vacio")}</div>`}`);
    vehs.forEach((v) => {
      const caja = el.querySelector(`[data-gas-v="${v.id}"]`);
      if (caja) montarGasolina(caja, ctx, { vehiculo: v, alCambiar: cargar }).catch(() => {});
    });
  };
  el.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-millas]");
    if (!b) return;
    const v = vehs.find((x) => x.id === b.dataset.millas);
    if (v) modalMillas(v, { admin: false }, cargar);
  });
  await cargar();
}

// ---------- flota (admin edita, dueño ve) ----------
async function flota(el, ctx) {
  const esAdmin = ctx.roles.includes("admin");
  const hoy = hoyLocal(ctx.empresa.zona_horaria);
  let vehs = []; let planes = []; let docs = []; let personas = []; let servicios = [];
  let filtro = "todos"; let sel = null; let sub = "docs"; let seccion = "flota";
  const urls = new Map();

  const cargar = async () => {
    const [v, p, d, pe] = await Promise.all([
      api.sel("vehiculos", "select=*&activo=eq.true&order=nombre.asc"),
      api.sel("vehiculo_planes", "select=*&activo=eq.true&order=nombre.asc"),
      api.sel("documentos", "select=*&activo=eq.true&order=vence.asc"),
      api.sel("perfiles", "select=id,nombre,roles&activo=eq.true&order=nombre.asc"),
    ]);
    vehs = v; planes = p; docs = d.filter((x) => DOCS[x.tipo]); personas = pe;
    if (sel && !vehs.some((x) => x.id === sel)) sel = null;
    if (sel && sub === "hist") servicios = await api.sel("vehiculo_servicios", `select=*&vehiculo_id=eq.${sel}&order=fecha.desc`);
    pintar();
  };

  const conductor = (v) => personas.find((p) => p.id === v.conductor_id)?.nombre || null;
  const docDe = (v, tipo) => docs.find((d) => d.vehiculo_id === v.id && d.tipo === tipo);
  const resumen = (v) => {
    const ds = Object.keys(DOCS).map((tipo) => { const d = docDe(v, tipo); return { tipo, d, e: d ? estadoDoc(d, hoy) : null }; });
    const ps = planes.filter((p) => p.vehiculo_id === v.id).map((p) => ({ p, e: estadoPlan(p, v, hoy) }));
    const critico = ps.slice().sort((a, b) => ORD[b.e.sev] - ORD[a.e.sev] || a.e.ratio - b.e.ratio)[0] || null;
    const sev = peor([...ds.filter((x) => x.e).map((x) => x.e.sev), ...ps.map((x) => x.e.sev)]);
    return { ds, ps, critico, sev };
  };

  const tarjeta = (v) => {
    const r = resumen(v);
    return html`<button type="button" class="veh-card veh-${r.sev}" data-veh="${v.id}" aria-pressed="${sel === v.id}">
      <div class="veh-cab"><div><div class="fuerte">${v.nombre}</div><div class="sub">${datosVehiculo(v)}</div></div>
        ${v.placa ? html`<span class="veh-placa">${v.placa}</span>` : ""}</div>
      <div class="veh-filas">
        ${r.ds.map((x) => html`<div><span>${t(DOCS[x.tipo])}</span>${x.e ? pildora(x.e.sev, x.e.txt) : html`<span class="pildora">${t("veh.sin_registrar")}</span>`}</div>`)}
        <div><span>${t("veh.mantenimiento")}</span>${r.critico ? pildora(r.critico.e.sev, r.critico.e.txt) : html`<span class="pildora">—</span>`}</div>
      </div>
      <div class="veh-pie"><span>${conductor(v) || t("veh.sin_conductor")}</span><span class="mono">${t("veh.millas", { n: mi(v.millas) })}</span></div>
    </button>`;
  };

  const filaDoc = (v, x) => {
    const nombre = t(DOCS[x.tipo]);
    if (!x.d) {
      return html`<div class="veh-fila"><div><div class="fuerte">${nombre}</div><div class="sub">${t("veh.sin_registrar")}</div></div>
        ${esAdmin ? html`<button type="button" class="btn btn-sec btn-chico" data-doc-nuevo="${x.tipo}">${t("veh.agregar_doc")}</button>` : ""}</div>`;
    }
    return html`<div class="veh-fila veh-fila-doc">
      <div><div class="fuerte">${nombre} ${pildora(x.e.sev, x.e.txt)}</div>
        <div class="sub">${t("venc.f_numero")} <span class="mono">${x.d.numero || "—"}</span> · ${t("venc.vence_el", { fecha: fecha(x.d.vence) })}</div>
        <div class="sub mono">${x.d.archivo_nombre || t("venc.sin_archivo")}</div></div>
      <div class="acciones">
        ${x.d.archivo_path ? html`<button type="button" class="btn btn-sec btn-chico" data-doc-ver="${x.d.id}">${t("venc.ver")}</button>` : ""}
        ${esAdmin ? html`<button type="button" class="btn btn-pri btn-chico" data-doc-renovar="${x.d.id}">${t("venc.renovar")}</button>
          <button type="button" class="btn btn-sec btn-chico" data-doc-editar="${x.d.id}">${t("venc.editar")}</button>` : ""}
      </div></div>`;
  };

  const barra = (pct, sev) => html`<div class="veh-barra"><i class="b-${sev}" style="width:${Math.round(Math.min(100, Math.max(0, pct)))}%"></i></div>`;
  const filaPlan = ({ p, e }) => html`<div class="veh-fila veh-fila-plan">
    <div><div class="fuerte">${p.nombre} ${pildora(e.sev, e.txt)}</div><div class="sub">${textoCada(p)}</div></div>
    ${esAdmin ? html`<div class="acciones">
      <button type="button" class="btn btn-pri btn-chico" data-plan-servicio="${p.id}">${t("veh.registrar_servicio")}</button>
      <button type="button" class="btn btn-sec btn-chico" data-plan-editar="${p.id}">${t("venc.editar")}</button>
      <button type="button" class="btn btn-sec btn-chico" data-plan-quitar="${p.id}">${t("venc.quitar")}</button></div>` : ""}
    <div class="veh-barras">
      ${e.d !== null ? html`<div><span class="sub">${t("veh.por_fecha", { fecha: fecha(e.fechaProx) })}</span>${barra(100 - (e.d / p.cada_dias) * 100, e.sev)}
        <span class="sub mono">${e.d < 0 ? t("veh.dias_atraso", { n: -e.d }) : t("veh.dias_rest", { n: e.d })}</span></div>` : ""}
      ${e.m !== null ? html`<div><span class="sub">${t("veh.por_millas", { millas: mi(e.millasProx) })}</span>${barra(100 - (e.m / p.cada_millas) * 100, e.sev)}
        <span class="sub mono">${e.m < 0 ? t("veh.mi_atraso", { n: mi(-e.m) }) : t("veh.mi_rest", { n: mi(e.m) })}</span></div>` : ""}
    </div></div>`;

  const detalle = () => {
    const v = vehs.find((x) => x.id === sel);
    if (!v) return "";
    const r = resumen(v);
    const critico = r.critico;
    let cuerpo;
    if (sub === "docs") cuerpo = html`<div class="veh-lista">${r.ds.map((x) => filaDoc(v, x))}</div>`;
    else if (sub === "mant") {
      cuerpo = html`<div class="veh-lista">
        ${r.ps.length ? r.ps.map(filaPlan) : html`<p class="sub">${t("veh.sin_planes")}</p>`}
        ${esAdmin ? html`<button type="button" class="btn btn-sec btn-chico" style="align-self:flex-start" data-plan-nuevo>${crudo(ICONO.mas)} ${t("veh.agregar_plan")}</button>` : ""}</div>`;
    } else {
      cuerpo = servicios.length ? html`<div class="tabla-caja" role="region" aria-label="${t("veh.tab_hist")}" tabindex="0"><table class="tabla">
        <thead><tr><th scope="col">${t("veh.h_fecha")}</th><th scope="col">${t("veh.h_servicio")}</th><th scope="col" class="num">${t("veh.h_millas")}</th><th scope="col" class="num">${t("veh.h_costo")}</th><th scope="col">${t("veh.h_notas")}</th></tr></thead>
        <tbody>${servicios.map((s) => html`<tr><td>${fecha(s.fecha)}</td><td>${s.nombre}</td><td class="num mono">${mi(s.millas)}</td>
          <td class="num mono">${s.costo === null || s.costo === undefined ? "—" : `$${Number(s.costo).toFixed(2)}`}</td><td>${s.notas || ""}</td></tr>`)}</tbody></table></div>`
        : html`<p class="sub">${t("veh.sin_historial")}</p>`;
    }
    const tab = (id, txt) => html`<button type="button" class="seg ${sub === id ? "activo" : ""}" data-sub="${id}" aria-pressed="${sub === id}">${txt}</button>`;
    return html`<section class="tarjeta veh-detalle" id="veh-detalle" aria-label="${v.nombre}">
      <div class="turno-cab"><div><h2 class="doc-nombre">${v.nombre} ${v.placa ? html`<span class="veh-placa">${v.placa}</span>` : ""}</h2>
        <div class="sub">${[v.anio, v.marca, v.modelo].filter(Boolean).join(" ")} · ${t(`veh.t_${v.tipo}`)}${v.vin ? html` · ${t("veh.vin")} <span class="mono">${v.vin}</span>` : ""}</div></div>
        ${pildora(r.sev, t(r.sev === "error" ? "veh.est_vencido" : r.sev === "aviso" ? "veh.est_por_vencer" : "veh.est_al_dia"))}</div>
      ${v.foto_path ? html`<img class="veh-foto" alt="" data-foto="${v.foto_path}" hidden>` : ""}
      <div class="doc-datos">
        <div><span class="sub">${t("veh.conductor")}</span><b>${conductor(v) || t("veh.sin_conductor")}</b></div>
        <div><span class="sub">${t("veh.millas_actuales")}</span><b class="mono">${t("veh.millas", { n: mi(v.millas) })}</b></div>
        <div><span class="sub">${t("veh.proximo")}</span><b>${critico ? html`${critico.p.nombre} · ${critico.e.txt}` : "—"}</b></div>
      </div>
      <div class="acciones">
        ${esAdmin ? html`<button type="button" class="btn btn-pri btn-chico" data-accion="millas">${t("veh.act_millas")}</button>
          <button type="button" class="btn btn-sec btn-chico" data-accion="editar">${t("venc.editar")}</button>
          <button type="button" class="btn btn-sec btn-chico" data-accion="quitar">${t("venc.quitar")}</button>` : ""}
        <button type="button" class="btn btn-sec btn-chico" data-accion="cerrar">${t("venc.cerrar")}</button>
      </div>
      <div class="segmentos" role="group" aria-label="${v.nombre}">${tab("docs", t("veh.tab_docs"))}${tab("mant", t("veh.tab_mant"))}${tab("hist", t("veh.tab_hist"))}</div>
      ${cuerpo}
      <p class="nota">${t("veh.nota_aviso")}</p>
    </section>`;
  };

  const tabsSeccion = () => html`<div class="segmentos" role="group" aria-label="${t("veh.titulo")}">
    <button type="button" class="seg ${seccion === "flota" ? "activo" : ""}" data-seccion="flota" aria-pressed="${seccion === "flota"}">${t("gas.seccion_flota")}</button>
    <button type="button" class="seg ${seccion === "gas" ? "activo" : ""}" data-seccion="gas" aria-pressed="${seccion === "gas"}">${t("gas.titulo")}</button>
    <button type="button" class="seg ${seccion === "costos" ? "activo" : ""}" data-seccion="costos" aria-pressed="${seccion === "costos"}">${t("cos.seccion")}</button></div>`;

  const pintar = () => {
    if (seccion === "costos") {
      el.innerHTML = String(html`<div class="titulo-vista"><h1>${t("veh.titulo")}</h1>${esAdmin ? "" : html`<span class="pildora">${t("dueno.solo_lectura")}</span>`}</div>
        ${tabsSeccion()}<div id="cos-box"></div>`);
      montarCostos(el.querySelector("#cos-box"), ctx, { soloLectura: !esAdmin }).catch((e) => aviso(mensajeError(e), "error"));
      return;
    }
    if (seccion === "gas") {
      el.innerHTML = String(html`<div class="titulo-vista"><h1>${t("veh.titulo")}</h1>${esAdmin ? "" : html`<span class="pildora">${t("dueno.solo_lectura")}</span>`}</div>
        ${tabsSeccion()}<div id="gas-box"></div>`);
      montarGasolina(el.querySelector("#gas-box"), ctx, {
        soloLectura: !esAdmin,
        alCambiar: async () => { vehs = await api.sel("vehiculos", "select=*&activo=eq.true&order=nombre.asc"); },
      }).catch((e) => aviso(mensajeError(e), "error"));
      return;
    }
    const res = vehs.map(resumen);
    const cuenta = (s) => res.filter((x) => x.sev === s).length;
    const lista = vehs.filter((v) => filtro === "todos" || resumen(v).sev !== "ok");
    const tabF = (id, txt) => html`<button type="button" class="seg ${filtro === id ? "activo" : ""}" data-filtro="${id}" aria-pressed="${filtro === id}">${txt}</button>`;
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("veh.titulo")}</h1>
        <div class="acciones">${esAdmin ? html`<button type="button" class="btn btn-pri" id="agregar">${crudo(ICONO.mas)} ${t("veh.agregar")}</button>` : html`<span class="pildora">${t("dueno.solo_lectura")}</span>`}</div></div>
      ${tabsSeccion()}
      <div class="kpis">
        <div class="kpi"><span class="sub">${t("veh.total")}</span><span class="num">${vehs.length}</span></div>
        <div class="kpi"><span class="sub">${t("veh.k_vencido")}</span><span class="num rojo">${cuenta("error")}</span></div>
        <div class="kpi"><span class="sub">${t("veh.est_por_vencer")}</span><span class="num">${cuenta("aviso")}</span></div>
        <div class="kpi"><span class="sub">${t("veh.est_al_dia")}</span><span class="num">${cuenta("ok")}</span></div>
      </div>
      <div class="segmentos" role="group" aria-label="${t("veh.titulo")}">${tabF("todos", t("veh.f_todos"))}${tabF("alertas", t("veh.f_alertas"))}</div>
      ${vehs.length === 0 ? html`<div class="vacio">${t("veh.vacio")}</div>`
        : lista.length === 0 ? html`<div class="vacio">${t("veh.sin_alertas")}</div>`
        : html`<div class="veh-flota">${lista.map(tarjeta)}</div>`}
      ${detalle()}`);
    const img = el.querySelector("[data-foto]");
    if (img) {
      const ruta = img.dataset.foto;
      const poner = (u) => { if (img.isConnected) { img.src = u; img.hidden = false; } };
      if (urls.has(ruta)) poner(urls.get(ruta));
      else api.urlArchivo("documentos", ruta).then((u) => { urls.set(ruta, u); poner(u); }).catch(() => img.remove());
    }
  };

  // ----- formularios -----
  const formVehiculo = (v) => {
    const d = abrirModal(v ? t("veh.editar_t") : t("veh.nuevo_t"), html`
      <form class="form" novalidate>
        <div class="campo"><label for="vh-nombre">${t("veh.f_nombre")}</label><input id="vh-nombre" name="nombre" maxlength="80" required value="${v?.nombre || ""}"></div>
        <div class="dos-col">
          <div class="campo"><label for="vh-placa">${t("veh.f_placa")}</label><input id="vh-placa" name="placa" maxlength="20" autocapitalize="characters" value="${v?.placa || ""}"></div>
          <div class="campo"><label for="vh-tipo">${t("veh.f_tipo")}</label>
            <select id="vh-tipo" name="tipo">${TIPOS.map((k) => html`<option value="${k}" ${(v?.tipo || "camioneta") === k ? html`selected` : ""}>${t(`veh.t_${k}`)}</option>`)}</select></div>
        </div>
        <div class="dos-col">
          <div class="campo"><label for="vh-marca">${t("veh.f_marca")}</label><input id="vh-marca" name="marca" maxlength="40" value="${v?.marca || ""}"></div>
          <div class="campo"><label for="vh-modelo">${t("veh.f_modelo")}</label><input id="vh-modelo" name="modelo" maxlength="40" value="${v?.modelo || ""}"></div>
        </div>
        <div class="dos-col">
          <div class="campo"><label for="vh-anio">${t("veh.f_anio")}</label><input id="vh-anio" name="anio" type="number" inputmode="numeric" min="1950" max="2100" value="${v?.anio || ""}"></div>
          <div class="campo"><label for="vh-vin">${t("veh.f_vin")}</label><input id="vh-vin" name="vin" maxlength="30" autocapitalize="characters" value="${v?.vin || ""}"></div>
        </div>
        <div class="campo"><label for="vh-cond">${t("veh.f_conductor")}</label>
          <select id="vh-cond" name="conductor"><option value="">${t("veh.f_sin_conductor")}</option>
            ${personas.filter((p) => p.roles.some((r) => ["trabajador", "supervisor"].includes(r))).map((p) => html`<option value="${p.id}" ${v?.conductor_id === p.id ? html`selected` : ""}>${p.nombre}</option>`)}</select></div>
        ${v ? "" : html`<div class="campo"><label for="vh-millas">${t("veh.f_millas")}</label><input id="vh-millas" name="millas" type="number" inputmode="numeric" min="0" step="1" value="0"></div>`}
        <div class="campo"><label for="vh-foto">${t("veh.f_foto")}</label>
          <input id="vh-foto" name="foto" type="file" accept="image/jpeg,image/png,image/webp">
          ${v?.foto_nombre ? html`<span class="sub">${v.foto_nombre}</span>` : ""}</div>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("veh.guardar")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector(".error-form");
      if (!f.nombre.value.trim()) { err.hidden = false; err.textContent = t("veh.faltan_datos"); return; }
      try {
        await ocupado(f.querySelector("[type=submit]"), async () => {
          const a = await subirDocumento(ctx, f.foto.files[0]);
          sel = await api.rpc("guardar_vehiculo", {
            p_id: v?.id || null, p_nombre: f.nombre.value.trim(), p_placa: f.placa.value.trim() || null, p_tipo: f.tipo.value,
            p_marca: f.marca.value.trim() || null, p_modelo: f.modelo.value.trim() || null, p_anio: numero(f.anio.value),
            p_vin: f.vin.value.trim() || null, p_conductor: f.conductor.value || null,
            p_millas: v ? null : numero(f.millas.value) ?? 0, p_foto_path: a.ruta || null, p_foto_nombre: a.nombre || null,
          });
          if (!v) sub = "docs";
        });
        cerrarModal(); aviso(t("comun.guardado")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeArchivo(e); }
    });
  };

  const formDoc = (v, tipo, doc) => {
    const d = abrirModal(t("veh.doc_t", { doc: t(DOCS[tipo]), nombre: v.nombre }), html`
      <form class="form" novalidate>
        <div class="dos-col">
          <div class="campo"><label for="vd-numero">${t("venc.f_numero")}</label><input id="vd-numero" name="numero" maxlength="60" value="${doc?.numero || ""}"></div>
          <div class="campo"><label for="vd-vence">${t("venc.f_vence")}</label><input id="vd-vence" name="vence" type="date" required value="${doc?.vence || ""}"></div>
        </div>
        <div class="campo"><label for="vd-archivo">${t("venc.f_archivo")}</label>
          <input id="vd-archivo" name="archivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp">
          ${doc?.archivo_nombre ? html`<span class="sub">${doc.archivo_nombre}</span>` : ""}</div>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("venc.guardar")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector(".error-form");
      if (!f.vence.value) { err.hidden = false; err.textContent = t("venc.faltan_datos"); return; }
      try {
        await ocupado(f.querySelector("[type=submit]"), async () => {
          const a = await subirDocumento(ctx, f.archivo.files[0]);
          await api.rpc("guardar_documento", {
            p_id: doc?.id || null, p_tipo: tipo, p_perfil: null, p_titulo: null, p_numero: f.numero.value.trim() || null,
            p_vence: f.vence.value, p_archivo_path: a.ruta || null, p_archivo_nombre: a.nombre || null, p_vehiculo: v.id,
          });
        });
        cerrarModal(); aviso(t("comun.guardado")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeArchivo(e); }
    });
  };

  const renovarDoc = (v, doc) => {
    const d = abrirModal(t("venc.renovar_t", { nombre: `${t(DOCS[doc.tipo])} · ${v.nombre}` }), html`
      <form class="form" novalidate>
        <p class="texto-modal">${t("venc.vence_el", { fecha: fecha(doc.vence) })}</p>
        <div class="dos-col">
          <div class="campo"><label for="vr-vence">${t("venc.f_nueva_fecha")}</label><input id="vr-vence" name="vence" type="date" required min="${sumarDias(doc.vence, 1)}"></div>
          <div class="campo"><label for="vr-numero">${t("venc.f_numero")}</label><input id="vr-numero" name="numero" maxlength="60" value="${doc.numero || ""}"></div>
        </div>
        <div class="campo"><label for="vr-archivo">${t("venc.f_archivo")}</label>
          <input id="vr-archivo" name="archivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></div>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("venc.renovar")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector(".error-form");
      if (!f.vence.value || f.vence.value <= doc.vence) { err.hidden = false; err.textContent = t("venc.fecha_posterior"); return; }
      try {
        await ocupado(f.querySelector("[type=submit]"), async () => {
          const a = await subirDocumento(ctx, f.archivo.files[0]);
          await api.rpc("renovar_documento", {
            p_id: doc.id, p_vence: f.vence.value, p_numero: f.numero.value.trim() || null,
            p_archivo_path: a.ruta || null, p_archivo_nombre: a.nombre || null,
          });
        });
        cerrarModal(); aviso(t("venc.renovado")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeArchivo(e); }
    });
  };

  const formPlan = (v, plan) => {
    const d = abrirModal(plan ? t("veh.plan_editar_t") : t("veh.plan_nuevo_t"), html`
      <form class="form" novalidate>
        <div class="campo"><label for="pl-nombre">${t("veh.f_servicio")}</label><input id="pl-nombre" name="nombre" maxlength="80" required value="${plan?.nombre || ""}"></div>
        <div class="dos-col">
          <div class="campo"><label for="pl-millas">${t("veh.f_cada_millas")}</label><input id="pl-millas" name="millas" type="number" inputmode="numeric" min="1" step="1" value="${plan?.cada_millas || ""}"></div>
          <div class="campo"><label for="pl-dias">${t("veh.f_cada_dias")}</label><input id="pl-dias" name="dias" type="number" inputmode="numeric" min="1" step="1" value="${plan?.cada_dias || ""}"></div>
        </div>
        <p class="nota">${t("veh.plan_nota")}</p>
        <div class="dos-col">
          <div class="campo"><label for="pl-ult-fecha">${t("veh.f_ultimo_fecha")}</label><input id="pl-ult-fecha" name="ult_fecha" type="date" max="${hoy}" value="${plan?.ultimo_fecha || hoy}"></div>
          <div class="campo"><label for="pl-ult-millas">${t("veh.f_ultimo_millas")}</label><input id="pl-ult-millas" name="ult_millas" type="number" inputmode="numeric" min="0" step="1" value="${plan ? plan.ultimo_millas : v.millas}"></div>
        </div>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("veh.guardar")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector(".error-form");
      const cm = numero(f.millas.value); const cd = numero(f.dias.value);
      if (!f.nombre.value.trim()) { err.hidden = false; err.textContent = t("veh.faltan_datos"); return; }
      if (cm === null && cd === null) { err.hidden = false; err.textContent = t("veh.plan_faltan"); return; }
      try {
        await ocupado(f.querySelector("[type=submit]"), () => api.rpc("guardar_plan", {
          p_id: plan?.id || null, p_vehiculo: v.id, p_nombre: f.nombre.value.trim(), p_cada_millas: cm, p_cada_dias: cd,
          p_ultimo_fecha: f.ult_fecha.value || null, p_ultimo_millas: numero(f.ult_millas.value),
        }));
        cerrarModal(); aviso(t("comun.guardado")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  const formServicio = (v, plan) => {
    const d = abrirModal(t("veh.servicio_t", { nombre: plan.nombre }), html`
      <form class="form" novalidate>
        <div class="dos-col">
          <div class="campo"><label for="sv-fecha">${t("veh.f_fecha")}</label><input id="sv-fecha" name="fecha" type="date" required max="${hoy}" value="${hoy}"></div>
          <div class="campo"><label for="sv-millas">${t("veh.f_millas_servicio")}</label><input id="sv-millas" name="millas" type="number" inputmode="numeric" min="0" step="1" required value="${v.millas}"></div>
        </div>
        <div class="campo"><label for="sv-costo">${t("veh.f_costo")}</label><input id="sv-costo" name="costo" type="number" inputmode="decimal" min="0" step="0.01"></div>
        <div class="campo"><label for="sv-notas">${t("veh.f_notas")}</label><input id="sv-notas" name="notas" maxlength="200"></div>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("veh.registrar_servicio")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector(".error-form");
      const m = numero(f.millas.value);
      if (!f.fecha.value || m === null || m < 0) { err.hidden = false; err.textContent = t("veh.servicio_faltan"); return; }
      try {
        await ocupado(f.querySelector("[type=submit]"), () => api.rpc("registrar_servicio", {
          p_plan: plan.id, p_fecha: f.fecha.value, p_millas: m, p_costo: numero(f.costo.value), p_notas: f.notas.value.trim() || null,
        }));
        cerrarModal(); aviso(t("veh.servicio_ok")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  // ----- clics -----
  el.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    try {
      const d = b.dataset;
      if (d.seccion) { seccion = d.seccion; sel = null; pintar(); return; }
      if (d.filtro) { filtro = d.filtro; pintar(); return; }
      if (d.veh) { sel = d.veh; sub = "docs"; pintar(); el.querySelector("#veh-detalle")?.scrollIntoView({ block: "nearest" }); return; }
      if (b.id === "agregar") { formVehiculo(null); return; }
      if (d.sub) {
        sub = d.sub;
        if (sub === "hist") servicios = await api.sel("vehiculo_servicios", `select=*&vehiculo_id=eq.${sel}&order=fecha.desc`);
        pintar(); return;
      }
      const v = vehs.find((x) => x.id === sel);
      if (!v) return;
      if (d.accion === "cerrar") { sel = null; pintar(); }
      if (d.accion === "editar") formVehiculo(v);
      if (d.accion === "millas") modalMillas(v, { admin: true }, cargar);
      if (d.accion === "quitar") {
        if (!(await confirmar(t("veh.quitar_t"), t("veh.quitar_txt"), { peligro: true, boton: t("venc.quitar") }))) return;
        await api.rpc("quitar_vehiculo", { p_id: v.id });
        sel = null; aviso(t("comun.guardado")); await cargar();
      }
      if (d.docNuevo) formDoc(v, d.docNuevo, null);
      const doc = d.docVer || d.docRenovar || d.docEditar ? docs.find((x) => x.id === (d.docVer || d.docRenovar || d.docEditar)) : null;
      if (doc && d.docEditar) formDoc(v, doc.tipo, doc);
      if (doc && d.docRenovar) renovarDoc(v, doc);
      if (doc && d.docVer) await ocupado(b, async () => { window.open(await api.urlArchivo("documentos", doc.archivo_path), "_blank", "noopener"); });
      if (d.planNuevo !== undefined) formPlan(v, null);
      const plan = d.planEditar || d.planServicio || d.planQuitar ? planes.find((x) => x.id === (d.planEditar || d.planServicio || d.planQuitar)) : null;
      if (plan && d.planEditar) formPlan(v, plan);
      if (plan && d.planServicio) formServicio(v, plan);
      if (plan && d.planQuitar) {
        if (!(await confirmar(t("veh.quitar_plan_t"), t("veh.quitar_plan_txt"), { peligro: true, boton: t("venc.quitar") }))) return;
        await api.rpc("quitar_plan", { p_id: plan.id });
        aviso(t("comun.guardado")); await cargar();
      }
    } catch (e) { aviso(mensajeError(e), "error"); }
  });
  await cargar();
}

export async function vistaVehiculos(el, ctx) {
  if (ctx.roles.includes("admin") || ctx.roles.includes("dueno")) return flota(el, ctx);
  return miVehiculo(el, ctx);
}
