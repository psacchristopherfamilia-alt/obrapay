// Vistas del administrador.
import { api } from "../api.js";
import { t } from "../i18n.js";
import {
  html, crudo, dinero, horas, horasDecimal, fmtSemana, fmtDia, hoyLocal, sumarDias, zona, nombreMes,
  aviso, mensajeError, ocupado, abrirModal, cerrarModal, confirmar, datosFormulario, ICONO,
} from "../ui.js";
import { crearXlsx, descargar } from "../xlsx.js";
import {
  listaSemanas, semanaActual, semanaPorDefecto, rangoSemana, vigente, prestamosConSaldo, P_TURNO,
} from "../datos.js";
import { tarjetaTurno, conectarAcciones, alertasTurno } from "./supervisor.js";
import { selectorSemana, recibo, imprimirHojas } from "./trabajador.js";
import { recargarVista } from "../app.js";

// ---------------------------------------------------------------------------
// Piezas compartidas con la vista del dueño
// ---------------------------------------------------------------------------
export async function datosNomina(semana) {
  const [filas, proyectos] = await Promise.all([
    api.rpc("nomina_semana", { p_semana: semana.id }),
    api.rpc("nomina_semana_proyectos", { p_semana: semana.id }),
  ]);
  const tot = filas.reduce((a, f) => ({
    reg: a.reg + f.minutos_reg, extra: a.extra + f.minutos_extra, bruto: a.bruto + Number(f.bruto),
    seguro: a.seguro + Number(f.seguro), prestamo: a.prestamo + Number(f.prestamo), neto: a.neto + Number(f.neto),
  }), { reg: 0, extra: 0, bruto: 0, seguro: 0, prestamo: 0, neto: 0 });
  const porProyecto = new Map();
  proyectos.forEach((p) => {
    const x = porProyecto.get(p.proyecto_id) || { nombre: p.proyecto, minutos: 0, bruto: 0, personas: new Set() };
    x.minutos += p.minutos_reg + p.minutos_extra;
    x.bruto += Number(p.bruto);
    x.personas.add(p.perfil_id);
    porProyecto.set(p.proyecto_id, x);
  });
  return { filas, proyectos, tot, porProyecto: [...porProyecto.values()].sort((a, b) => b.bruto - a.bruto) };
}

export function kpis(d, semana) {
  return html`
    <div class="kpis">
      <div class="kpi"><div class="sub">${t("nomina.horas")}</div><div class="num">${horas(d.tot.reg + d.tot.extra)}</div>
        <div class="sub">${t("nomina.de_extra", { extra: horas(d.tot.extra) })}</div></div>
      <div class="kpi"><div class="sub">${t("nomina.bruto")}</div><div class="num">${dinero(d.tot.bruto)}</div>
        <div class="sub">${t("nomina.personas", { n: d.filas.length })}</div></div>
      <div class="kpi"><div class="sub">${t("nomina.descuentos")}</div><div class="num rojo">${dinero(d.tot.seguro + d.tot.prestamo)}</div>
        <div class="sub">${t("nomina.desglose_desc", { seguro: dinero(d.tot.seguro), prestamo: dinero(d.tot.prestamo) })}</div></div>
      <div class="kpi oscuro"><div class="sub">${t("nomina.neto")}</div><div class="num">${dinero(d.tot.neto)}</div>
        <div class="sub">${t("nomina.pago_dia", { dia: fmtDia(sumarDias(semana.fin, 2), { weekday: "long", day: "numeric", month: "short" }) })}</div></div>
    </div>`;
}

export function barrasProyectos(porProyecto) {
  if (!porProyecto.length) return html`<p class="nota">${t("nomina.sin_proyectos")}</p>`;
  const max = Math.max(...porProyecto.map((p) => p.bruto), 1);
  return html`<div class="barras">${porProyecto.map((p) => html`
    <div class="barra-fila">
      <div class="barra-cab"><span class="fuerte">${p.nombre}</span><span class="mono">${dinero(p.bruto)}</span></div>
      <div class="barra-fondo"><div class="barra" style="width:${Math.max(2, (p.bruto / max) * 100).toFixed(1)}%"></div></div>
      <div class="sub">${p.personas ? t("nomina.proy_detalle", { horas: horas(p.minutos), n: p.personas.size }) : horas(p.minutos)}</div>
    </div>`)}</div>`;
}

export function tablaNomina(d, { recibos = false } = {}) {
  return html`
    <div class="tabla-caja" role="region" aria-label="${t("nomina.tabla")}" tabindex="0">
      <table class="tabla">
        <thead><tr>
          <th scope="col">${t("col.trabajador")}</th><th scope="col">${t("col.oficio")}</th>
          <th scope="col" class="num">${t("col.tarifa")}</th><th scope="col" class="num">${t("col.horas")}</th>
          <th scope="col" class="num">${t("col.extra")}</th><th scope="col" class="num">${t("col.bruto")}</th>
          <th scope="col" class="num">${t("col.seguro")}</th><th scope="col" class="num">${t("col.prestamo")}</th>
          <th scope="col" class="num">${t("col.neto")}</th><th scope="col">${t("col.estado")}</th>${recibos ? html`<th scope="col">${t("recibo.uno")}</th>` : ""}
        </tr></thead>
        <tbody>${d.filas.map((f) => html`<tr>
          <th scope="row">${f.nombre}</th><td>${f.oficio || ""}</td>
          <td class="num mono">${dinero(f.tarifa)}</td><td class="num mono">${horasDecimal(f.minutos_reg + f.minutos_extra)}</td>
          <td class="num mono">${horasDecimal(f.minutos_extra)}</td><td class="num mono">${dinero(f.bruto)}</td>
          <td class="num mono rojo">${dinero(f.seguro)}</td><td class="num mono rojo">${dinero(f.prestamo)}</td>
          <td class="num mono fuerte">${dinero(f.neto)}</td>
          <td>${f.con_aprobacion_admin ? html`<span class="pildora pildora-aviso">${t("estado.con_admin")}</span>` : html`<span class="pildora pildora-ok">${t("estado.aprobado")}</span>`}</td>
          ${recibos ? html`<td><button type="button" class="btn btn-sec btn-chico" data-recibo="${f.perfil_id}">${t("recibo.uno")}</button></td>` : ""}
        </tr>`)}</tbody>
        ${d.filas.length ? html`<tfoot><tr>
          <th scope="row">${t("col.total")}</th><td></td><td></td>
          <td class="num mono">${horasDecimal(d.tot.reg + d.tot.extra)}</td><td class="num mono">${horasDecimal(d.tot.extra)}</td>
          <td class="num mono">${dinero(d.tot.bruto)}</td><td class="num mono">${dinero(d.tot.seguro)}</td>
          <td class="num mono">${dinero(d.tot.prestamo)}</td><td class="num mono">${dinero(d.tot.neto)}</td><td></td>
        </tr></tfoot>` : ""}
      </table>
    </div>`;
}

export function exportarNomina(d, semana, empresa) {
  const r2 = (n) => Math.round(Number(n) * 100) / 100;
  const hojaNomina = {
    nombre: t("excel.nomina"),
    columnas: [
      { titulo: t("col.trabajador"), ancho: 26 }, { titulo: t("col.oficio"), ancho: 16 },
      { titulo: t("col.tarifa"), tipo: "dinero" }, { titulo: t("col.horas_reg"), tipo: "horas" },
      { titulo: t("col.extra"), tipo: "horas" }, { titulo: t("col.horas"), tipo: "horas" },
      { titulo: t("col.bruto"), tipo: "dinero" },
      { titulo: t("col.seguro"), tipo: "dinero" }, { titulo: t("col.prestamo"), tipo: "dinero" },
      { titulo: t("col.neto"), tipo: "dinero" }, { titulo: t("col.estado"), ancho: 22 },
    ],
    filas: d.filas.map((f) => [
      f.nombre, f.oficio || "", r2(f.tarifa), horasDecimal(f.minutos_reg), horasDecimal(f.minutos_extra),
      horasDecimal(f.minutos_reg + f.minutos_extra), r2(f.bruto), r2(f.seguro), r2(f.prestamo), r2(f.neto),
      f.con_aprobacion_admin ? t("estado.con_admin") : t("estado.aprobado"),
    ]),
  };
  const total = [t("col.total"), "", null, horasDecimal(d.tot.reg), horasDecimal(d.tot.extra), horasDecimal(d.tot.reg + d.tot.extra),
    r2(d.tot.bruto), r2(d.tot.seguro), r2(d.tot.prestamo), r2(d.tot.neto), ""];
  total.__total = true;
  hojaNomina.filas.push(total);
  const hojaProyectos = {
    nombre: t("excel.por_proyecto"),
    columnas: [{ titulo: t("col.proyecto"), ancho: 28 }, { titulo: t("col.trabajador"), ancho: 26 },
      { titulo: t("col.horas_reg"), tipo: "horas" }, { titulo: t("col.extra"), tipo: "horas" }, { titulo: t("col.bruto"), tipo: "dinero" }],
    filas: d.proyectos.map((p) => [p.proyecto, (d.filas.find((f) => f.perfil_id === p.perfil_id) || {}).nombre || "",
      horasDecimal(p.minutos_reg), horasDecimal(p.minutos_extra), r2(p.bruto)]),
  };
  const hojaInfo = {
    nombre: t("excel.info"),
    columnas: [{ titulo: t("excel.campo"), ancho: 22 }, { titulo: t("excel.valor"), ancho: 40 }],
    filas: [
      [t("excel.empresa"), empresa.nombre], [t("comun.semana"), `${semana.inicio} – ${semana.fin}`],
      [t("col.estado"), t(`semana.${semana.estado}`)], [t("excel.dia_pago"), sumarDias(semana.fin, 2)],
      [t("excel.generado"), new Date().toISOString()],
    ],
  };
  descargar(crearXlsx([hojaNomina, hojaProyectos, hojaInfo]), `nomina_${semana.inicio}_${semana.fin}.xlsx`);
}

function pasosCiclo(semana) {
  const paso = (hecho, actual, titulo, sub) => html`<div class="paso ${hecho ? "hecho" : ""} ${actual ? "actual" : ""}">
    <div class="paso-estado">${hecho ? "✓ " : actual ? "● " : ""}${sub}</div><div class="fuerte">${titulo}</div></div>`;
  const cerrada = semana.estado !== "abierta";
  const pagada = semana.estado === "pagada";
  return html`<div class="ciclo">
    ${paso(cerrada, !cerrada, t("ciclo.cierre"), fmtDia(semana.fin, { weekday: "short", day: "numeric", month: "short" }) + " 11:59 p.m.")}
    ${paso(cerrada, false, t("ciclo.reporte"), fmtDia(sumarDias(semana.fin, 1), { weekday: "short", day: "numeric", month: "short" }))}
    ${paso(pagada, cerrada && !pagada, t("ciclo.revisar"), t("ciclo.admin"))}
    ${paso(pagada, false, t("ciclo.pago"), fmtDia(sumarDias(semana.fin, 2), { weekday: "short", day: "numeric", month: "short" }))}
  </div>`;
}

// ---------------------------------------------------------------------------
// Nómina de la semana
// ---------------------------------------------------------------------------
// Recibos de pago de los trabajadores de la compañía activa, en una sola impresión (una hoja por trabajador).
async function recibosAdmin(el, ctx, semana, datos, perfilIds, boton) {
  await ocupado(boton, async () => {
    const { desde, hasta } = rangoSemana(semana, ctx.empresa.zona_horaria);
    const [est, turnos] = await Promise.all([
      api.rpc("nomina_semana_estatutario", { p_semana: semana.id }),
      api.sel("turnos", `select=id,perfil_id,entrada,salida,estado,proyectos(nombre,empresa_id)&entrada=gte.${desde}&entrada=lt.${hasta}&order=entrada.asc`),
    ]);
    const hojas = datos.filas.filter((f) => perfilIds.includes(f.perfil_id)).map((f) => {
      const e = est.find((x) => x.perfil_id === f.perfil_id) || {};
      const fila = {
        empresa_id: ctx.empresa.id, empresa: ctx.empresa.nombre, estado_semana: f.estado_semana,
        minutos_reg: f.minutos_reg, minutos_extra: f.minutos_extra, tarifa: f.tarifa, bruto: f.bruto, prestamo: f.prestamo, neto: f.neto,
        nib_empleado: e.nib_empleado, nhip_empleado: e.nhip_empleado, nib_empleador: e.nib_empleador, nhip_empleador: e.nhip_empleador,
        proyectos: datos.proyectos.filter((p) => p.perfil_id === f.perfil_id).map((p) => ({ proyecto: p.proyecto, minutos: p.minutos_reg + p.minutos_extra, bruto: p.bruto })),
      };
      return recibo([fila], turnos.filter((tu) => tu.perfil_id === f.perfil_id), semana, ctx, { id: f.perfil_id, nombre: f.nombre });
    });
    imprimirHojas(el, hojas);
  });
}

export async function vistaNomina(el, ctx) {
  const semanas = await listaSemanas(26);
  let semana = semanaPorDefecto(semanas);
  let datos = null;

  const cargar = async () => {
    datos = await datosNomina(semana);
    const { hasta } = rangoSemana(semana, ctx.empresa.zona_horaria);
    const pendientes = semana.estado === "abierta"
      ? await api.sel("turnos", `select=id&semana_id=is.null&estado=eq.por_aprobar&entrada=lt.${hasta}`)
      : [];
    el.innerHTML = String(html`
      <div class="titulo-vista">
        <div><div class="sobre">${t("comun.semana")} ${fmtSemana(semana)} · ${t(`semana.${semana.estado}`)}</div><h1>${t("nomina.titulo")}</h1></div>
        <div class="acciones">
          ${selectorSemana(semanas, semana)}
          ${pendientes.length ? html`<a class="btn btn-sec" href="#/turnos">${t("nomina.ver_pendientes", { n: pendientes.length })}</a>` : ""}
          ${semana.estado === "abierta" ? html`<button type="button" class="btn btn-sec" id="cerrar">${t("nomina.cerrar")}</button>` : ""}
          ${semana.estado === "cerrada" ? html`<button type="button" class="btn btn-sec" id="reabrir">${t("nomina.reabrir")}</button>
            <button type="button" class="btn btn-pri" id="pagada">${t("nomina.marcar_pagada")}</button>` : ""}
          <button type="button" class="btn btn-ok" id="excel" ${datos.filas.length ? "" : html`disabled`}>${crudo(ICONO.descarga)} ${t("comun.excel")}</button>
          <button type="button" class="btn btn-sec" id="recibos-todos" ${datos.filas.length ? "" : html`disabled`}>${crudo(ICONO.descarga)} ${t("recibo.todos")}</button>
        </div>
      </div>
      ${pasosCiclo(semana)}
      ${semana.estado === "abierta" ? html`<div class="banner banner-aviso">${t("nomina.en_vivo")}</div>` : ""}
      ${kpis(datos, semana)}
      <section class="tarjeta"><h2>${t("nomina.por_trabajador")}</h2>
        ${datos.filas.length ? tablaNomina(datos, { recibos: true }) : html`<p class="vacio">${t("nomina.vacia")}</p>`}</section>
      <section class="tarjeta"><h2>${t("nomina.por_proyecto")}</h2>${barrasProyectos(datos.porProyecto)}</section>`);
  };

  el.addEventListener("change", (ev) => {
    if (ev.target.id === "semana") {
      semana = semanas.find((s) => s.id === ev.target.value);
      cargar().catch((e) => aviso(mensajeError(e), "error"));
    }
  });
  el.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    try {
      if (b.id === "excel") exportarNomina(datos, semana, ctx.empresa);
      if (b.id === "recibos-todos") await recibosAdmin(el, ctx, semana, datos, datos.filas.map((f) => f.perfil_id), b);
      if (b.dataset.recibo) await recibosAdmin(el, ctx, semana, datos, [b.dataset.recibo], b);
      if (b.id === "cerrar") {
        if (!(await confirmar(t("nomina.cerrar_t"), t("nomina.cerrar_txt")))) return;
        await api.rpc("cerrar_semana", { p_semana: semana.id });
        aviso(t("nomina.cerrada_ok"));
        recargarVista();
      }
      if (b.id === "pagada") {
        if (!(await confirmar(t("nomina.pagada_t"), t("nomina.pagada_txt", { neto: dinero(datos.tot.neto) })))) return;
        await api.rpc("marcar_semana_pagada", { p_semana: semana.id });
        aviso(t("nomina.pagada_ok"));
        recargarVista();
      }
      if (b.id === "reabrir") {
        const d = abrirModal(t("nomina.reabrir_t"), html`
          <form class="form" novalidate>
            <p class="texto-modal">${t("nomina.reabrir_txt")}</p>
            <div class="campo"><label for="motivo">${t("turno.motivo")}</label><input id="motivo" name="motivo" required maxlength="200"></div>
            <p class="error-form" role="alert" hidden></p>
            <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
              <button type="submit" class="btn btn-peligro">${t("nomina.reabrir")}</button></div>
          </form>`);
        const f = d.querySelector("form");
        f.addEventListener("submit", async (e2) => {
          e2.preventDefault();
          const err = f.querySelector(".error-form");
          if (!f.motivo.value.trim()) { err.hidden = false; err.textContent = t("turno.faltan"); return; }
          try {
            await ocupado(f.querySelector("[type=submit]"), () => api.rpc("reabrir_semana", { p_semana: semana.id, p_motivo: f.motivo.value.trim() }));
            cerrarModal(); aviso(t("nomina.reabierta_ok")); recargarVista();
          } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
        });
      }
    } catch (e) { aviso(mensajeError(e), "error"); }
  });
  await cargar();
}

// ---------------------------------------------------------------------------
// Horas y turnos
// ---------------------------------------------------------------------------
export async function vistaTurnos(el, ctx) {
  const semanas = await listaSemanas(26);
  let semana = semanas.find((s) => s.estado === "abierta") || semanas[0];
  let filtro = "pendientes";
  let turnos = [];
  const CAMPOS = `select=id,perfil_id,proyecto_id,entrada,salida,estado,fuera_de_area,cierre_automatico,corregido,marca_diferida,marcado_por,semana_id,${P_TURNO},proyectos(nombre)`;

  const cargar = async () => {
    if (filtro === "pendientes") {
      turnos = await api.sel("turnos", `${CAMPOS}&semana_id=is.null&estado=in.(por_aprobar,aprobado_admin)&order=entrada.asc`);
    } else if (filtro === "abiertos") {
      turnos = await api.sel("turnos", `${CAMPOS}&salida=is.null&order=entrada.asc`);
    } else {
      const { desde, hasta } = rangoSemana(semana, ctx.empresa.zona_horaria);
      turnos = await api.sel("turnos", `${CAMPOS}&entrada=gte.${desde}&entrada=lt.${hasta}&order=entrada.asc`);
    }
    const sinAlerta = turnos.filter((x) => x.estado === "por_aprobar" && x.salida && !alertasTurno(x).length).map((x) => x.id);
    const tab = (id, texto) => html`<button type="button" class="seg ${filtro === id ? "activo" : ""}" data-filtro="${id}" aria-pressed="${filtro === id}">${texto}</button>`;
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("turnos.titulo")}</h1>
        <div class="acciones">${filtro === "semana" ? selectorSemana(semanas, semana) : ""}</div></div>
      <div class="segmentos" role="group" aria-label="${t("turnos.filtro")}">
        ${tab("pendientes", t("turnos.pendientes"))}${tab("abiertos", t("turnos.abiertos"))}${tab("semana", t("turnos.semana"))}
      </div>
      <p class="nota">${t("turnos.nota_admin")}</p>
      ${sinAlerta.length && filtro !== "abiertos" ? html`<button type="button" class="btn btn-pri" data-aprobar-todo="${JSON.stringify(sinAlerta)}">${t("aprobar.todo", { n: sinAlerta.length })}</button>` : ""}
      ${turnos.length ? html`<div class="rejilla-turnos">${turnos.map((tu) => tarjetaTurno(tu, ctx.empresa, { yo: ctx.perfil.id, confirmaAdmin: false }))}</div>`
        : html`<div class="vacio">${t("turnos.vacio")}</div>`}`);
  };
  el.addEventListener("click", (ev) => {
    const f = ev.target.closest("[data-filtro]");
    if (f) { filtro = f.dataset.filtro; cargar().catch((e) => aviso(mensajeError(e), "error")); }
  });
  el.addEventListener("change", (ev) => {
    if (ev.target.id === "semana") { semana = semanas.find((s) => s.id === ev.target.value); cargar().catch((e) => aviso(mensajeError(e), "error")); }
  });
  conectarAcciones(el, () => turnos, cargar);
  await cargar();
}

// ---------------------------------------------------------------------------
// Trabajadores y tarifas
// ---------------------------------------------------------------------------
const ROLES = ["trabajador", "supervisor", "admin", "dueno"];
function sugerirUsuario(nombre) {
  const p = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim().split(/\s+/);
  if (!p[0]) return "";
  return (p.length > 1 ? `${p[0]}.${p[p.length - 1]}` : p[0]).slice(0, 40);
}

function mostrarCredenciales(usuario, clave, titulo) {
  const d = abrirModal(titulo, html`
    <p class="texto-modal">${t("trab.entregar")}</p>
    <div class="credenciales">
      <div><span class="sub">${t("acceso.usuario")}</span><div class="mono grande">${usuario}</div></div>
      <div><span class="sub">${t("trab.clave_temporal")}</span><div class="mono grande">${clave}</div></div>
    </div>
    <p class="nota">${t("trab.cambiara")}</p>
    <div class="acciones-modal">
      <button type="button" class="btn btn-sec" id="copiar">${t("trab.copiar")}</button>
      <button type="button" class="btn btn-pri" data-cerrar>${t("comun.listo")}</button>
    </div>`);
  d.querySelector("#copiar").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(`${t("acceso.usuario")}: ${usuario}\n${t("trab.clave_temporal")}: ${clave}\n${location.origin}${location.pathname}`);
      aviso(t("trab.copiado"));
    } catch { aviso(t("trab.no_copia"), "error"); }
  });
}

export async function vistaTrabajadores(el, ctx) {
  let perfiles = []; let tarifas = [];
  const otras = ctx.empresas.filter((e) => e.id !== ctx.empresa.id); // las demás compañías de este administrador
  const hoy = hoyLocal();

  const cargar = async () => {
    [perfiles, tarifas] = await Promise.all([
      api.sel("perfiles", "select=id,usuario,nombre,oficio,roles,activo,debe_cambiar_clave&order=activo.desc,nombre.asc"),
      api.sel("tarifas", "select=perfil_id,monto_hora,vigente_desde"),
    ]);
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("trab.titulo")}</h1>
        <div class="acciones"><button type="button" class="btn btn-pri" id="nuevo">${crudo(ICONO.mas)} ${t("trab.nuevo")}</button></div></div>
      <div class="tabla-caja" role="region" aria-label="${t("trab.titulo")}" tabindex="0">
        <table class="tabla">
          <thead><tr><th scope="col">${t("col.nombre")}</th><th scope="col">${t("acceso.usuario")}</th><th scope="col">${t("col.oficio")}</th>
            <th scope="col">${t("col.roles")}</th><th scope="col" class="num">${t("col.tarifa")}</th>
            <th scope="col">${t("col.estado")}</th><th scope="col"><span class="oculto">${t("comun.acciones")}</span></th></tr></thead>
          <tbody>${perfiles.map((p) => {
            const tar = vigente(tarifas.filter((x) => x.perfil_id === p.id), hoy, "monto_hora");
            const marca = p.roles.includes("trabajador");
            return html`<tr class="${p.activo ? "" : "inactivo"}">
              <th scope="row">${p.nombre}</th><td class="mono">${p.usuario}</td><td>${p.oficio || ""}</td>
              <td>${p.roles.map((r) => t(`rol.${r}`)).join(", ")}</td>
              <td class="num mono">${marca && tar !== null ? dinero(tar) : "—"}</td>
              <td>${p.activo ? (p.debe_cambiar_clave ? html`<span class="pildora pildora-info">${t("trab.pendiente_clave")}</span>` : html`<span class="pildora pildora-ok">${t("trab.activo")}</span>`) : html`<span class="pildora">${t("trab.inactivo")}</span>`}</td>
              <td><div class="acciones-fila">
                ${marca ? html`<button type="button" class="btn btn-sec btn-chico" data-tarifa="${p.id}">${t("trab.tarifa")}</button>` : ""}
                ${p.id !== ctx.perfil.id ? html`<button type="button" class="btn btn-sec btn-chico" data-editar="${p.id}">${t("trab.editar")}</button>` : ""}
                ${otras.length && p.id !== ctx.perfil.id && ctx.roles.includes("admin") ? html`<button type="button" class="btn btn-sec btn-chico" data-compartir="${p.id}">${t("trab.compartir")}</button>
                  <button type="button" class="btn btn-sec btn-chico" data-quitar-cia="${p.id}">${t("trab.quitar_cia")}</button>` : ""}
              </div></td></tr>`;
          })}</tbody>
        </table>
      </div>`);
  };

  const abrirNuevo = () => {
    const d = abrirModal(t("trab.nuevo"), html`
      <form class="form" novalidate>
        <div class="campo"><label for="n-nombre">${t("col.nombre")}</label><input id="n-nombre" name="nombre" required maxlength="80" autocomplete="off"></div>
        <div class="dos-col">
          <div class="campo"><label for="n-usuario">${t("acceso.usuario")}</label><input id="n-usuario" name="usuario" required autocapitalize="none" spellcheck="false" maxlength="40" pattern="[a-z0-9][a-z0-9._\\-]{2,39}"></div>
          <div class="campo"><label for="n-oficio">${t("col.oficio")}</label><input id="n-oficio" name="oficio" maxlength="40" list="oficios">
            <datalist id="oficios">${["Plomero", "Electricista", "Albañil", "Carpintero", "Ayudante", "Pintor", "Soldador", "Operador de maquinaria"].map((o) => html`<option value="${o}"></option>`)}</datalist></div>
        </div>
        <fieldset class="campo"><legend>${t("col.roles")}</legend><div class="checks">
          ${ROLES.map((r) => html`<label class="check"><input type="checkbox" name="roles" value="${r}" ${r === "trabajador" ? html`checked` : ""}> ${t(`rol.${r}`)}</label>`)}
        </div></fieldset>
        <div class="tres-col" id="bloque-pago">
          <div class="campo"><label for="n-tarifa">${t("trab.tarifa_hora")}</label><input id="n-tarifa" name="tarifa" type="number" min="0.01" step="0.01" inputmode="decimal"></div>
          <div class="campo"><label for="n-desde">${t("trab.desde")}</label><input id="n-desde" name="desde" type="date" value="${hoy}"></div>
        </div>
        <div class="campo"><label for="n-idioma">${t("comun.idioma")}</label>
          <select id="n-idioma" name="idioma"><option value="es">Español</option><option value="en">English</option><option value="ht">Kreyòl</option></select></div>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("trab.crear")}</button></div>
      </form>`, { ancho: 560 });
    const f = d.querySelector("form");
    let usuarioTocado = false;
    f.usuario.addEventListener("input", () => { usuarioTocado = true; });
    f.nombre.addEventListener("input", () => { if (!usuarioTocado) f.usuario.value = sugerirUsuario(f.nombre.value); });
    const ajustarPago = () => { d.querySelector("#bloque-pago").hidden = ![...f.querySelectorAll("[name=roles]:checked")].some((c) => c.value === "trabajador"); };
    f.addEventListener("change", ajustarPago);
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const v = datosFormulario(f);
      const roles = [].concat(v.roles || []);
      const err = f.querySelector(".error-form");
      const fallo = (m) => { err.hidden = false; err.textContent = m; };
      if (!v.nombre.trim()) return fallo(t("trab.falta_nombre"));
      if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(v.usuario.trim().toLowerCase())) return fallo(t("trab.usuario_invalido"));
      if (!roles.length) return fallo(t("trab.falta_rol"));
      if (roles.includes("trabajador") && !(Number(v.tarifa) > 0)) return fallo(t("trab.falta_tarifa"));
      try {
        const r = await ocupado(f.querySelector("[type=submit]"), () => api.funcion("crear-trabajador", {
          accion: "crear", usuario: v.usuario.trim().toLowerCase(), nombre: v.nombre.trim(), oficio: v.oficio,
          roles, tarifa: Number(v.tarifa), seguro_pct: 0, vigente_desde: v.desde, idioma: v.idioma,
        }));
        cerrarModal();
        await cargar();
        mostrarCredenciales(r.usuario, r.clave_temporal, t("trab.creado"));
      } catch (e) { fallo(mensajeError(e)); }
    });
  };

  const abrirMonto = (perfil) => {
    const lista = tarifas.filter((x) => x.perfil_id === perfil.id)
      .sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : -1));
    const d = abrirModal(t("trab.cambiar_tarifa", { nombre: perfil.nombre }), html`
      <form class="form" novalidate>
        <div class="dos-col">
          <div class="campo"><label for="m-valor">${t("trab.tarifa_hora")}</label>
            <input id="m-valor" name="valor" type="number" step="0.01" min="0.01" required inputmode="decimal"></div>
          <div class="campo"><label for="m-desde">${t("trab.desde")}</label><input id="m-desde" name="desde" type="date" required value="${hoy}"></div>
        </div>
        <p class="nota">${t("trab.aviso_tarifa")}</p>
        ${lista.length ? html`<h3 class="etiqueta">${t("trab.historial")}</h3><ul class="historial">${lista.map((x) => html`<li><span>${fmtDia(x.vigente_desde, { day: "numeric", month: "short", year: "numeric" })}</span><span class="mono">${dinero(x.monto_hora)}</span></li>`)}</ul>` : ""}
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("comun.guardar")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector(".error-form");
      const valor = Number(f.valor.value);
      if (!f.valor.value || Number.isNaN(valor) || valor <= 0) {
        err.hidden = false; err.textContent = t("trab.valor_invalido"); return;
      }
      try {
        await ocupado(f.querySelector("[type=submit]"), () => api.rpc("cambiar_tarifa", { p_perfil: perfil.id, p_monto: valor, p_desde: f.desde.value }));
        cerrarModal(); aviso(t("comun.guardado")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  const abrirCompartir = (perfil) => {
    const marca = perfil.roles.includes("trabajador");
    const d = abrirModal(t("trab.compartir_titulo", { empresa: otras.length === 1 ? otras[0].nombre : "…" }), html`
      <form class="form" novalidate>
        ${otras.length > 1 ? html`<div class="campo"><label for="c-empresa">${t("emp.compania")}</label>
          <select id="c-empresa" name="empresa">${otras.map((e) => html`<option value="${e.id}">${e.nombre}</option>`)}</select></div>` : html`<input type="hidden" name="empresa" value="${otras[0].id}">`}
        <p class="pequeno">${t("trab.compartir_texto", { nombre: perfil.nombre, empresa: otras.length === 1 ? otras[0].nombre : "…" })}</p>
        ${marca ? html`<div class="campo"><label for="c-tarifa">${t("trab.tarifa_otra", { empresa: otras.length === 1 ? otras[0].nombre : "…" })}</label>
          <input id="c-tarifa" name="tarifa" type="number" min="0.01" step="0.01" inputmode="decimal" required></div>` : ""}
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("trab.compartir_btn")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector(".error-form");
      const tarifa = marca ? Number(f.tarifa.value) : null;
      if (marca && (!f.tarifa.value || Number.isNaN(tarifa) || tarifa <= 0)) {
        err.hidden = false; err.textContent = t("trab.valor_invalido"); return;
      }
      try {
        await ocupado(f.querySelector("[type=submit]"), () => api.rpc("compartir_trabajador", { p_perfil: perfil.id, p_empresa: f.empresa.value, p_tarifa: tarifa }));
        cerrarModal(); aviso(t("trab.compartido")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  const quitarDeAqui = async (perfil) => {
    try {
      if (!(await confirmar(t("trab.quitar_cia"), t("trab.quitar_texto", { nombre: perfil.nombre }), { boton: t("trab.quitar_cia"), peligro: true }))) return;
      await api.rpc("quitar_de_empresa", { p_perfil: perfil.id });
      aviso(t("trab.quitado")); await cargar();
    } catch (e) { aviso(mensajeError(e), "error"); }
  };

  const restablecer = async (p) => {
    try {
      if (!(await confirmar(t("trab.restablecer_t"), t("trab.restablecer_txt", { nombre: p.nombre }), { boton: t("trab.restablecer") }))) return;
      const r = await api.funcion("crear-trabajador", { accion: "restablecer", perfil_id: p.id });
      await cargar();
      mostrarCredenciales(p.usuario, r.clave_temporal, t("trab.clave_nueva"));
    } catch (e) { aviso(mensajeError(e), "error"); }
  };

  const abrirEditar = (perfil) => {
    const d = abrirModal(t("trab.editar_t", { nombre: perfil.nombre }), html`
      <form class="form" novalidate>
        <div class="dos-col">
          <div class="campo"><label for="e-nombre">${t("col.nombre")}</label><input id="e-nombre" name="nombre" required value="${perfil.nombre}" maxlength="80"></div>
          <div class="campo"><label for="e-oficio">${t("col.oficio")}</label><input id="e-oficio" name="oficio" value="${perfil.oficio || ""}" maxlength="40"></div>
        </div>
        <fieldset class="campo"><legend>${t("col.roles")}</legend><div class="checks">
          ${ROLES.map((r) => html`<label class="check"><input type="checkbox" name="roles" value="${r}" ${perfil.roles.includes(r) ? html`checked` : ""}> ${t(`rol.${r}`)}</label>`)}
        </div></fieldset>
        <label class="check"><input type="checkbox" name="activo" value="1" ${perfil.activo ? html`checked` : ""}> ${t("trab.puede_entrar")}</label>
        <p class="nota">${t("trab.nota_rol_trabajador")}</p>
        <div class="acciones">
          <button type="button" class="btn btn-sec btn-chico" data-ir-clave>${t("trab.restablecer")}</button>
        </div>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("comun.guardar")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    d.querySelector("[data-ir-clave]").addEventListener("click", () => restablecer(perfil));
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const v = datosFormulario(f);
      const roles = [].concat(v.roles || []);
      const err = f.querySelector(".error-form");
      if (!v.nombre.trim() || !roles.length) { err.hidden = false; err.textContent = t("trab.falta_rol"); return; }
      const necesitaTarifa = roles.includes("trabajador") && !tarifas.some((x) => x.perfil_id === perfil.id);
      try {
        await ocupado(f.querySelector("[type=submit]"), () => api.actualizar("perfiles", `id=eq.${perfil.id}`, {
          nombre: v.nombre.trim(), oficio: v.oficio.trim() || null, roles, activo: !!v.activo,
        }));
        cerrarModal(); aviso(t("comun.guardado")); await cargar();
        if (necesitaTarifa) abrirMonto({ ...perfil, nombre: v.nombre.trim() });
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  el.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    const buscar = (id) => perfiles.find((p) => p.id === id);
    try {
      if (b.id === "nuevo") abrirNuevo();
      else if (b.dataset.tarifa) abrirMonto(buscar(b.dataset.tarifa));
      else if (b.dataset.compartir) abrirCompartir(buscar(b.dataset.compartir));
      else if (b.dataset.quitarCia) await quitarDeAqui(buscar(b.dataset.quitarCia));
      else if (b.dataset.editar) abrirEditar(buscar(b.dataset.editar));
    } catch (e) { aviso(mensajeError(e), "error"); }
  });
  await cargar();
}

// ---------------------------------------------------------------------------
// Proyectos y supervisores
// ---------------------------------------------------------------------------
export async function vistaProyectos(el, ctx) {
  let proyectos = []; let sup = []; let tra = []; let perfiles = [];
  const emp = ctx.empresa;

  const cargar = async () => {
    [proyectos, sup, tra, perfiles] = await Promise.all([
      api.sel("proyectos", "select=*&order=activo.desc,nombre.asc"),
      api.sel("proyecto_supervisores", "select=proyecto_id,perfil_id"),
      api.sel("proyecto_trabajadores", "select=proyecto_id,perfil_id"),
      api.sel("perfiles", "select=id,nombre,roles,activo&activo=eq.true&order=nombre.asc"),
    ]);
    const nombre = (id) => (perfiles.find((p) => p.id === id) || {}).nombre || "—";
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("proy.titulo")}</h1>
        <div class="acciones"><button type="button" class="btn btn-pri" id="nuevo">${crudo(ICONO.mas)} ${t("proy.nuevo")}</button></div></div>
      ${!proyectos.length ? html`<div class="vacio">${t("proy.vacio")}</div>` : ""}
      <div class="rejilla-proyectos">${proyectos.map((p) => {
        const ss = sup.filter((x) => x.proyecto_id === p.id).map((x) => nombre(x.perfil_id));
        const ts = tra.filter((x) => x.proyecto_id === p.id).map((x) => nombre(x.perfil_id));
        return html`<article class="tarjeta proyecto ${p.activo ? "" : "inactivo"}">
          <div class="turno-cab"><h2>${p.nombre}</h2>${p.activo ? "" : html`<span class="pildora">${t("proy.cerrado")}</span>`}</div>
          ${p.direccion ? html`<div class="pequeno">${p.direccion}</div>` : ""}
          ${emp.gps_activo ? html`<div class="pequeno">${p.lat !== null ? html`${crudo(ICONO.ubicacion)} ${t("proy.gps_si", { radio: p.radio_m })}` : html`<span class="alerta">${t("proy.gps_no")}</span>`}</div>` : ""}
          <div class="sub">${t("proy.supervisores")}</div><div>${ss.length ? ss.join(", ") : html`<span class="alerta">${t("proy.sin_supervisor")}</span>`}</div>
          <div class="sub">${t("proy.trabajadores", { n: ts.length })}</div><div class="pequeno">${ts.join(", ") || "—"}</div>
          <div class="acciones"><button type="button" class="btn btn-sec btn-chico" data-equipo="${p.id}">${t("proy.equipo")}</button>
            <button type="button" class="btn btn-sec btn-chico" data-editar="${p.id}">${t("trab.editar")}</button></div>
        </article>`;
      })}</div>`);
  };

  const abrirProyecto = (p = null) => {
    const d = abrirModal(p ? t("proy.editar_t", { nombre: p.nombre }) : t("proy.nuevo"), html`
      <form class="form" novalidate>
        <div class="campo"><label for="p-nombre">${t("col.nombre")}</label><input id="p-nombre" name="nombre" required maxlength="80" value="${p ? p.nombre : ""}"></div>
        <div class="campo"><label for="p-dir">${t("proy.direccion")}</label><input id="p-dir" name="direccion" maxlength="160" value="${p?.direccion || ""}"></div>
        <div class="tres-col">
          <div class="campo"><label for="p-lat">${t("proy.lat")}</label><input id="p-lat" name="lat" type="number" step="any" value="${p?.lat ?? ""}"></div>
          <div class="campo"><label for="p-lng">${t("proy.lng")}</label><input id="p-lng" name="lng" type="number" step="any" value="${p?.lng ?? ""}"></div>
          <div class="campo"><label for="p-radio">${t("proy.radio")}</label><input id="p-radio" name="radio" type="number" min="20" step="10" value="${p?.radio_m ?? 150}"></div>
        </div>
        <button type="button" class="btn btn-sec btn-chico" id="aqui">${crudo(ICONO.ubicacion)} ${t("proy.usar_ubicacion")}</button>
        ${p ? html`<label class="check"><input type="checkbox" name="activo" value="1" ${p.activo ? html`checked` : ""}> ${t("proy.activo")}</label>` : ""}
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("comun.guardar")}</button></div>
      </form>`, { ancho: 560 });
    const f = d.querySelector("form");
    d.querySelector("#aqui").addEventListener("click", (ev) => {
      if (!navigator.geolocation) return aviso(t("reloj.sin_gps"), "error");
      ocupado(ev.currentTarget, () => new Promise((ok) => navigator.geolocation.getCurrentPosition((pos) => {
        f.lat.value = pos.coords.latitude.toFixed(6); f.lng.value = pos.coords.longitude.toFixed(6); ok();
      }, () => { aviso(t("reloj.gps_denegado"), "error"); ok(); }, { enableHighAccuracy: true, timeout: 15000 })));
    });
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const v = datosFormulario(f);
      const err = f.querySelector(".error-form");
      if (!v.nombre.trim()) { err.hidden = false; err.textContent = t("trab.falta_nombre"); return; }
      const fila = {
        nombre: v.nombre.trim(), direccion: v.direccion.trim() || null,
        lat: v.lat === "" ? null : Number(v.lat), lng: v.lng === "" ? null : Number(v.lng),
        radio_m: Math.max(20, Number(v.radio) || 150),
      };
      try {
        await ocupado(f.querySelector("[type=submit]"), () => (p
          ? api.actualizar("proyectos", `id=eq.${p.id}`, { ...fila, activo: !!v.activo })
          : api.insertar("proyectos", [{ ...fila, empresa_id: emp.id }])));
        cerrarModal(); aviso(t("comun.guardado")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  const abrirEquipo = (p) => {
    const supsActuales = new Set(sup.filter((x) => x.proyecto_id === p.id).map((x) => x.perfil_id));
    const trasActuales = new Set(tra.filter((x) => x.proyecto_id === p.id).map((x) => x.perfil_id));
    const posiblesSup = perfiles.filter((x) => x.roles.includes("supervisor"));
    const posiblesTra = perfiles.filter((x) => x.roles.includes("trabajador"));
    const d = abrirModal(t("proy.equipo_t", { nombre: p.nombre }), html`
      <form class="form" novalidate>
        <fieldset class="campo"><legend>${t("proy.supervisores")}</legend>
          ${posiblesSup.length ? html`<div class="checks columna">${posiblesSup.map((x) => html`<label class="check"><input type="checkbox" name="sup" value="${x.id}" ${supsActuales.has(x.id) ? html`checked` : ""}> ${x.nombre}</label>`)}</div>`
            : html`<p class="nota">${t("proy.sin_supervisores")}</p>`}
        </fieldset>
        <fieldset class="campo"><legend>${t("proy.trabajadores", { n: posiblesTra.length })}</legend>
          <div class="checks columna alto">${posiblesTra.map((x) => html`<label class="check"><input type="checkbox" name="tra" value="${x.id}" ${trasActuales.has(x.id) ? html`checked` : ""}> ${x.nombre}</label>`)}</div>
        </fieldset>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("comun.guardar")}</button></div>
      </form>`, { ancho: 520 });
    const f = d.querySelector("form");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const nuevosSup = new Set([...f.querySelectorAll("[name=sup]:checked")].map((c) => c.value));
      const nuevosTra = new Set([...f.querySelectorAll("[name=tra]:checked")].map((c) => c.value));
      const err = f.querySelector(".error-form");
      const sincronizar = async (tabla, antes, despues) => {
        const agregar = [...despues].filter((id) => !antes.has(id));
        const quitar = [...antes].filter((id) => !despues.has(id));
        if (agregar.length) await api.insertar(tabla, agregar.map((id) => ({ empresa_id: emp.id, proyecto_id: p.id, perfil_id: id })));
        if (quitar.length) await api.quitar(tabla, `proyecto_id=eq.${p.id}&perfil_id=in.(${quitar.join(",")})`);
      };
      try {
        await ocupado(f.querySelector("[type=submit]"), async () => {
          await sincronizar("proyecto_supervisores", supsActuales, nuevosSup);
          await sincronizar("proyecto_trabajadores", trasActuales, nuevosTra);
        });
        cerrarModal(); aviso(t("comun.guardado")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  el.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.id === "nuevo") abrirProyecto();
    else if (b.dataset.editar) abrirProyecto(proyectos.find((p) => p.id === b.dataset.editar));
    else if (b.dataset.equipo) abrirEquipo(proyectos.find((p) => p.id === b.dataset.equipo));
  });
  await cargar();
}

// ---------------------------------------------------------------------------
// Préstamos internos
// ---------------------------------------------------------------------------
export async function vistaPrestamos(el, ctx) {
  let prestamos = []; let semana = null; let nomina = []; let trabajadores = [];

  const cargar = async () => {
    semana = await semanaActual();
    [prestamos, nomina, trabajadores] = await Promise.all([
      prestamosConSaldo(),
      api.rpc("nomina_semana", { p_semana: semana.id }),
      api.sel("perfiles", "select=id,nombre,roles&activo=eq.true&order=nombre.asc"),
    ]);
    const activos = prestamos.filter((p) => p.activo);
    const total = activos.reduce((s, p) => s + p.saldo, 0);
    el.innerHTML = String(html`
      <div class="titulo-vista">
        <div><div class="sobre">${t("prest.semana", { semana: fmtSemana(semana) })}</div><h1>${t("prest.titulo")}</h1></div>
        <div class="acciones"><div class="kpi-mini"><span class="sub">${t("prest.por_cobrar")}</span><span class="num rojo">${dinero(total)}</span></div>
          <button type="button" class="btn btn-pri" id="nuevo">${crudo(ICONO.mas)} ${t("prest.nuevo")}</button></div>
      </div>
      <div class="banner banner-aviso">${t("prest.nota")}</div>
      ${!activos.length ? html`<div class="vacio">${t("prest.vacio")}</div>` : ""}
      ${activos.map((p) => {
        const esta = p.descuentos.find((d) => d.semana_id === semana.id);
        const linea = nomina.find((n) => n.perfil_id === p.perfil_id);
        const pct = Math.min(100, (p.pagado / Number(p.monto_total)) * 100);
        return html`<section class="tarjeta prestamo">
          <div class="turno-cab"><div><h2>${p.perfiles?.nombre || ""}</h2>
            <div class="sub">${t("prest.desde", { fecha: fmtDia(p.fecha, { day: "numeric", month: "short", year: "numeric" }), n: p.descuentos.filter((d) => Number(d.monto) > 0).length })}${p.nota ? ` · ${p.nota}` : ""}</div></div>
            <div class="mono pequeno">${t("prest.bruto_semana", { bruto: dinero(linea ? linea.bruto : 0) })}</div></div>
          <div class="barra-fondo verde"><div class="barra" style="width:${pct.toFixed(1)}%"></div></div>
          <form class="fila-prestamo" data-prestamo="${p.id}" novalidate>
            <div><div class="sub">${t("prest.monto")}</div><div class="mono fuerte">${dinero(p.monto_total)}</div></div>
            <div><div class="sub">${t("prest.pagado")}</div><div class="mono fuerte verde">${dinero(p.pagado)}</div></div>
            <div class="campo"><label for="d-${p.id}">${t("prest.descontar")}</label>
              <input id="d-${p.id}" name="monto" type="number" min="0" step="0.01" inputmode="decimal" value="${esta ? Number(esta.monto).toFixed(2) : ""}" placeholder="0.00"></div>
            <div><div class="sub">${t("prest.saldo")}</div><div class="mono fuerte rojo">${dinero(p.saldo)}</div></div>
            <div class="acciones">
              <button type="submit" class="btn btn-pri btn-chico">${t("comun.guardar")}</button>
              ${p.saldo <= 0 ? html`<button type="button" class="btn btn-sec btn-chico" data-saldado="${p.id}">${t("prest.archivar")}</button>` : ""}
            </div>
          </form>
        </section>`;
      })}`);
  };

  const abrirNuevo = () => {
    const d = abrirModal(t("prest.nuevo"), html`
      <form class="form" novalidate>
        <div class="campo"><label for="pr-perfil">${t("col.trabajador")}</label>
          <select id="pr-perfil" name="perfil" required><option value="">—</option>
            ${trabajadores.filter((x) => x.roles.includes("trabajador")).map((x) => html`<option value="${x.id}">${x.nombre}</option>`)}</select></div>
        <div class="dos-col">
          <div class="campo"><label for="pr-monto">${t("prest.monto")}</label><input id="pr-monto" name="monto" type="number" min="0.01" step="0.01" required inputmode="decimal"></div>
          <div class="campo"><label for="pr-fecha">${t("prest.fecha")}</label><input id="pr-fecha" name="fecha" type="date" value="${hoyLocal()}" required></div>
        </div>
        <div class="campo"><label for="pr-nota">${t("prest.nota_campo")}</label><input id="pr-nota" name="nota" maxlength="120"></div>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("prest.guardar")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector(".error-form");
      if (!f.perfil.value || !(Number(f.monto.value) > 0)) { err.hidden = false; err.textContent = t("prest.faltan"); return; }
      try {
        await ocupado(f.querySelector("[type=submit]"), () => api.rpc("crear_prestamo", {
          p_perfil: f.perfil.value, p_monto: Number(f.monto.value), p_fecha: f.fecha.value, p_nota: f.nota.value.trim() || null,
        }));
        cerrarModal(); aviso(t("comun.guardado")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  el.addEventListener("submit", async (ev) => {
    const f = ev.target.closest("[data-prestamo]");
    if (!f) return;
    ev.preventDefault();
    const monto = f.monto.value === "" ? 0 : Number(f.monto.value);
    if (Number.isNaN(monto) || monto < 0) { aviso(t("trab.valor_invalido"), "error"); return; }
    try {
      await ocupado(f.querySelector("[type=submit]"), () => api.rpc("fijar_descuento_prestamo", {
        p_prestamo: f.dataset.prestamo, p_semana: semana.id, p_monto: monto,
      }));
      aviso(t("prest.descuento_ok")); await cargar();
    } catch (e) { aviso(mensajeError(e), "error"); }
  });
  el.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    try {
      if (b.id === "nuevo") abrirNuevo();
      if (b.dataset.saldado) {
        await api.actualizar("prestamos", `id=eq.${b.dataset.saldado}`, { activo: false });
        aviso(t("comun.guardado")); await cargar();
      }
    } catch (e) { aviso(mensajeError(e), "error"); }
  });
  await cargar();
}

// ---------------------------------------------------------------------------
// Reportes mensuales (admin y dueño)
// ---------------------------------------------------------------------------
export async function vistaReportes(el, ctx) {
  const hoy = hoyLocal();
  let anio = Number(hoy.slice(0, 4));
  let mes = Number(hoy.slice(5, 7));
  let filas = []; let proyectos = [];

  const cargar = async () => {
    [filas, proyectos] = await Promise.all([
      api.rpc("reporte_mensual", { p_anio: anio, p_mes: mes }),
      api.rpc("reporte_mensual_proyectos", { p_anio: anio, p_mes: mes }),
    ]);
    const tot = filas.reduce((a, f) => ({ min: a.min + f.minutos_reg + f.minutos_extra, extra: a.extra + f.minutos_extra,
      bruto: a.bruto + Number(f.bruto), seguro: a.seguro + Number(f.seguro), prestamo: a.prestamo + Number(f.prestamo), neto: a.neto + Number(f.neto) }),
    { min: 0, extra: 0, bruto: 0, seguro: 0, prestamo: 0, neto: 0 });
    const anios = [anio - 1, anio, anio + 1].filter((a) => a >= 2026 && a <= Number(hoy.slice(0, 4)));
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("rep.titulo")}</h1>
        <div class="acciones">
          <label><span class="oculto">${t("rep.mes")}</span><select id="mes" aria-label="${t("rep.mes")}">${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => html`<option value="${m}" ${m === mes ? html`selected` : ""}>${nombreMes(m)}</option>`)}</select></label>
          <label><span class="oculto">${t("rep.anio")}</span><select id="anio" aria-label="${t("rep.anio")}">${(anios.length ? anios : [anio]).map((a) => html`<option ${a === anio ? html`selected` : ""}>${a}</option>`)}</select></label>
          <button type="button" class="btn btn-ok" id="excel" ${filas.length ? "" : html`disabled`}>${crudo(ICONO.descarga)} ${t("comun.excel")}</button>
        </div></div>
      <p class="nota">${t("rep.nota")}</p>
      <div class="kpis">
        <div class="kpi"><div class="sub">${t("nomina.horas")}</div><div class="num">${horas(tot.min)}</div><div class="sub">${t("nomina.de_extra", { extra: horas(tot.extra) })}</div></div>
        <div class="kpi"><div class="sub">${t("nomina.bruto")}</div><div class="num">${dinero(tot.bruto)}</div></div>
        <div class="kpi"><div class="sub">${t("nomina.descuentos")}</div><div class="num rojo">${dinero(tot.seguro + tot.prestamo)}</div></div>
        <div class="kpi oscuro"><div class="sub">${t("nomina.neto")}</div><div class="num">${dinero(tot.neto)}</div></div>
      </div>
      <section class="tarjeta"><h2>${t("rep.por_trabajador")}</h2>
      ${filas.length ? html`<div class="tabla-caja" tabindex="0" role="region" aria-label="${t("rep.por_trabajador")}"><table class="tabla">
        <thead><tr><th scope="col">${t("col.trabajador")}</th><th scope="col" class="num">${t("rep.semanas")}</th><th scope="col" class="num">${t("col.horas")}</th>
          <th scope="col" class="num">${t("col.extra")}</th><th scope="col" class="num">${t("col.bruto")}</th><th scope="col" class="num">${t("col.seguro")}</th>
          <th scope="col" class="num">${t("col.prestamo")}</th><th scope="col" class="num">${t("col.neto")}</th></tr></thead>
        <tbody>${filas.map((f) => html`<tr><th scope="row">${f.nombre}</th><td class="num mono">${f.semanas}</td>
          <td class="num mono">${horasDecimal(f.minutos_reg + f.minutos_extra)}</td><td class="num mono">${horasDecimal(f.minutos_extra)}</td>
          <td class="num mono">${dinero(f.bruto)}</td><td class="num mono rojo">${dinero(f.seguro)}</td><td class="num mono rojo">${dinero(f.prestamo)}</td>
          <td class="num mono fuerte">${dinero(f.neto)}</td></tr>`)}</tbody></table></div>`
        : html`<p class="vacio">${t("rep.vacio")}</p>`}</section>
      <section class="tarjeta"><h2>${t("nomina.por_proyecto")}</h2>
        ${barrasProyectos(proyectos.map((p) => ({ nombre: p.proyecto, bruto: Number(p.bruto), minutos: p.minutos_reg + p.minutos_extra })).sort((a, b) => b.bruto - a.bruto))}</section>`);
  };
  el.addEventListener("change", (ev) => {
    if (ev.target.id === "mes") mes = Number(ev.target.value);
    if (ev.target.id === "anio") anio = Number(ev.target.value);
    if (ev.target.id === "mes" || ev.target.id === "anio") cargar().catch((e) => aviso(mensajeError(e), "error"));
  });
  el.addEventListener("click", (ev) => {
    if (!ev.target.closest("#excel")) return;
    const r2 = (n) => Math.round(Number(n) * 100) / 100;
    const etiqueta = `${anio}-${String(mes).padStart(2, "0")}`;
    descargar(crearXlsx([
      { nombre: t("excel.mensual"), columnas: [{ titulo: t("col.trabajador"), ancho: 26 }, { titulo: t("rep.semanas"), tipo: "numero" },
        { titulo: t("col.horas"), tipo: "horas" }, { titulo: t("col.extra"), tipo: "horas" }, { titulo: t("col.bruto"), tipo: "dinero" },
        { titulo: t("col.seguro"), tipo: "dinero" }, { titulo: t("col.prestamo"), tipo: "dinero" }, { titulo: t("col.neto"), tipo: "dinero" }],
        filas: filas.map((f) => [f.nombre, f.semanas, horasDecimal(f.minutos_reg + f.minutos_extra), horasDecimal(f.minutos_extra), r2(f.bruto), r2(f.seguro), r2(f.prestamo), r2(f.neto)]) },
      { nombre: t("excel.por_proyecto"), columnas: [{ titulo: t("col.proyecto"), ancho: 28 }, { titulo: t("col.horas"), tipo: "horas" },
        { titulo: t("col.extra"), tipo: "horas" }, { titulo: t("col.bruto"), tipo: "dinero" }],
        filas: proyectos.map((p) => [p.proyecto, horasDecimal(p.minutos_reg + p.minutos_extra), horasDecimal(p.minutos_extra), r2(p.bruto)]) },
    ]), `reporte_${etiqueta}.xlsx`);
  });
  await cargar();
}

// ---------------------------------------------------------------------------
// Ajustes de la empresa
// ---------------------------------------------------------------------------
export async function vistaAjustes(el, ctx) {
  const e = ctx.empresa;
  const hhmm = (x) => (x ? String(x).slice(0, 5) : "");
  el.innerHTML = String(html`
    <div class="titulo-vista"><h1>${t("aj.titulo")}</h1></div>
    <form class="tarjeta form ajustes" id="form-ajustes" novalidate>
      <div class="campo"><label for="a-nombre">${t("aj.nombre")}</label><input id="a-nombre" name="nombre" required maxlength="80" value="${e.nombre}"></div>
      <h2 class="etiqueta">${t("aj.horario")}</h2>
      <div class="dos-col">
        <div class="campo"><label for="a-extra">${t("aj.extra_desde")}</label><input id="a-extra" name="hora_extra_desde" type="time" required value="${hhmm(e.hora_extra_desde)}"></div>
        <div class="campo"><label for="a-cierre">${t("aj.cierre_turno")}</label><input id="a-cierre" name="hora_cierre_turno" type="time" required value="${hhmm(e.hora_cierre_turno)}"></div>
      </div>
      <div class="dos-col">
        <div class="campo"><label for="a-ai">${t("aj.almuerzo_ini")}</label><input id="a-ai" name="almuerzo_inicio" type="time" value="${hhmm(e.almuerzo_inicio)}"></div>
        <div class="campo"><label for="a-af">${t("aj.almuerzo_fin")}</label><input id="a-af" name="almuerzo_fin" type="time" value="${hhmm(e.almuerzo_fin)}"></div>
      </div>
      <p class="nota">${t("aj.almuerzo_nota")}</p>
      <h2 class="etiqueta">${t("aj.gps")}</h2>
      <label class="check"><input type="checkbox" name="gps_activo" value="1" ${e.gps_activo ? html`checked` : ""}> ${t("aj.gps_activo")}</label>
      <div class="campo"><label for="a-modo">${t("aj.gps_modo")}</label>
        <select id="a-modo" name="gps_modo"><option value="marcar" ${e.gps_modo === "marcar" ? html`selected` : ""}>${t("aj.modo_marcar")}</option>
          <option value="bloquear" ${e.gps_modo === "bloquear" ? html`selected` : ""}>${t("aj.modo_bloquear")}</option></select></div>
      <p class="nota">${t("aj.zona", { zona: zona() })} · ${t("aj.semana_fija")}</p>
      <p class="error-form" role="alert" hidden></p>
      <div><button type="submit" class="btn btn-pri">${t("comun.guardar")}</button></div>
    </form>`);
  const f = el.querySelector("#form-ajustes");
  f.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const v = datosFormulario(f);
    const err = f.querySelector(".error-form");
    const conAlmuerzo = v.almuerzo_inicio && v.almuerzo_fin;
    if ((v.almuerzo_inicio || v.almuerzo_fin) && (!conAlmuerzo || v.almuerzo_fin <= v.almuerzo_inicio)) {
      err.hidden = false; err.textContent = t("aj.almuerzo_invalido"); return;
    }
    const cambios = {
      nombre: v.nombre.trim(), hora_extra_desde: v.hora_extra_desde, hora_cierre_turno: v.hora_cierre_turno,
      almuerzo_inicio: conAlmuerzo ? v.almuerzo_inicio : null, almuerzo_fin: conAlmuerzo ? v.almuerzo_fin : null,
      gps_activo: !!v.gps_activo, gps_modo: v.gps_modo,
    };
    try {
      const r = await ocupado(f.querySelector("[type=submit]"), () => api.actualizar("empresas", `id=eq.${e.id}`, cambios));
      Object.assign(ctx.empresa, r[0] || cambios);
      err.hidden = true;
      aviso(t("comun.guardado"));
    } catch (e2) { err.hidden = false; err.textContent = mensajeError(e2); }
  });
}
