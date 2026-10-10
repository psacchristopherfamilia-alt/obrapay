// Vistas del trabajador: Reloj, Mis horas, Mi pago.
import { api } from "../api.js";
import { t } from "../i18n.js";
import {
  html, crudo, dinero, horas, fmtHora, fmtDia, fmtSemana, fechaLocal, hoyLocal, minutosTurno, sumarDias,
  aviso, mensajeError, ocupado, ICONO, confirmar,
} from "../ui.js";
import { semanaActual, listaSemanas, rangoSemana, vigente, prestamosConSaldo } from "../datos.js";
import { alSalirDeVista, recargarVista } from "../app.js";

const PILDORA = {
  abierto: ["pildora-info", "estado.abierto"],
  por_aprobar: ["pildora-aviso", "estado.por_aprobar"],
  aprobado: ["pildora-ok", "estado.aprobado"],
  aprobado_admin: ["pildora-aviso", "estado.aprobado_admin"],
};
export const pildora = (estado) => html`<span class="pildora ${PILDORA[estado][0]}">${t(PILDORA[estado][1])}</span>`;

function ubicacion() {
  return new Promise((resolver, rechazar) => {
    if (!navigator.geolocation) { rechazar(new Error(t("reloj.sin_gps"))); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolver({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => rechazar(new Error(t("reloj.gps_denegado"))),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

// ---------------------------------------------------------------------------
// Reloj
// ---------------------------------------------------------------------------
export async function vistaReloj(el, ctx) {
  const yo = ctx.perfil.id;
  const emp = ctx.empresa;
  const semana = await semanaActual();
  const { desde, hasta } = rangoSemana(semana, emp.zona_horaria);
  const [asignados, turnosSemana, tarifas, avisos] = await Promise.all([
    api.sel("proyecto_trabajadores", `select=proyecto_id,proyectos(id,nombre,activo)&perfil_id=eq.${yo}`),
    api.sel("turnos", `select=id,proyecto_id,entrada,salida,estado,proyectos(nombre)&perfil_id=eq.${yo}&entrada=gte.${desde}&entrada=lt.${hasta}&order=entrada.asc`),
    api.sel("tarifas", `select=monto_hora,vigente_desde&perfil_id=eq.${yo}`),
    api.sel("notificaciones", `select=id,tipo,datos,creado_en&perfil_id=eq.${yo}&leida=eq.false&order=creado_en.desc`),
  ]);
  // Un turno abierto de una semana anterior también cuenta.
  const abiertos = await api.sel("turnos", `select=id,proyecto_id,entrada,proyectos(nombre)&perfil_id=eq.${yo}&salida=is.null`);
  const abierto = abiertos[0] || null;
  const proyectos = asignados.map((a) => a.proyectos).filter((p) => p && p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre));

  let elegido = abierto ? abierto.proyecto_id : (proyectos.length === 1 ? proyectos[0].id : null);
  try { const g = localStorage.getItem("obrapay.proyecto"); if (!abierto && g && proyectos.some((p) => p.id === g)) elegido = g; } catch { /* nada */ }

  let reg = 0; let extra = 0; let ganado = 0;
  turnosSemana.forEach((tu) => {
    const m = minutosTurno(tu.entrada, tu.salida, emp);
    reg += m.reg; extra += m.extra;
    const tar = vigente(tarifas, fechaLocal(tu.entrada), "monto_hora") || 0;
    ganado += ((m.reg + m.extra) / 60) * tar;
  });

  const pintar = () => {
    const ahora = new Date().toISOString();
    el.innerHTML = String(html`
      ${avisos.map((a) => html`<div class="banner banner-ok" role="status">
        ${crudo(ICONO.arriba)}<span>${crudo(t("aviso.tarifa", { antes: dinero(a.datos.antes), despues: dinero(a.datos.despues), desde: fmtDia(a.datos.desde, { day: "numeric", month: "long" }) }))}</span>
        <button type="button" class="btn-texto" data-leido="${a.id}">${t("comun.entendido")}</button></div>`)}

      <section class="tarjeta reloj-tarjeta" aria-live="polite">
        <div class="sub">${fmtDia(hoyLocal(), { weekday: "long", day: "numeric", month: "long" })} · ${t("reloj.cierra")}</div>
        <div class="hora-grande">${fmtHora(ahora)}</div>
        ${abierto
          ? html`<div class="estado-turno en-turno"><span class="punto"></span>${t("reloj.en_turno", { hora: fmtHora(abierto.entrada), proyecto: abierto.proyectos?.nombre || "" })}</div>
                 <div class="transcurrido">${t("reloj.llevas", { tiempo: horas((Date.now() - new Date(abierto.entrada)) / 60000) })}</div>`
          : html`<div class="estado-turno"><span class="punto"></span>${t("reloj.fuera")}</div>`}
      </section>

      ${proyectos.length === 0 && !abierto
        ? html`<div class="vacio">${t("reloj.sin_proyectos")}</div>`
        : html`
        <fieldset class="lista-proyectos" ${abierto ? html`disabled` : ""}>
          <legend class="etiqueta">${t("reloj.proyecto")}</legend>
          ${proyectos.map((p) => html`
            <label class="opcion-proyecto ${p.id === elegido ? "elegido" : ""}">
              <input type="radio" name="proyecto" value="${p.id}" ${p.id === elegido ? html`checked` : ""}>
              <span>${p.nombre}</span>
            </label>`)}
        </fieldset>
        <button type="button" id="marcar" class="btn btn-reloj ${abierto ? "salida" : ""}" ${!abierto && !elegido ? html`disabled` : ""}>
          ${crudo(ICONO.reloj)} ${abierto ? t("reloj.marcar_salida") : t("reloj.marcar_entrada")}
        </button>
        <p class="nota centro">${emp.gps_activo ? html`${crudo(ICONO.ubicacion)} ${t("reloj.gps_nota")} · ` : ""}${t("reloj.cambiar_nota")}</p>`}

      <section class="tarjeta resumen-semana">
        <div><div class="sub">${t("reloj.semana")}</div><div class="num">${horas(reg + extra)}</div></div>
        <div><div class="sub">${t("reloj.extra")}</div><div class="num">${horas(extra)}</div></div>
        <div><div class="sub">${t("reloj.ganado")}</div><div class="num verde">${dinero(ganado)}</div></div>
      </section>
      <p class="nota">${t("reloj.estimado")}</p>`);
  };
  pintar();

  const reloj = setInterval(() => {
    const h = el.querySelector(".hora-grande");
    const tr = el.querySelector(".transcurrido");
    if (h) h.textContent = fmtHora(new Date().toISOString());
    if (tr && abierto) tr.textContent = t("reloj.llevas", { tiempo: horas((Date.now() - new Date(abierto.entrada)) / 60000) });
  }, 20000);
  alSalirDeVista(() => clearInterval(reloj));

  el.addEventListener("change", (ev) => {
    if (ev.target.name === "proyecto") {
      elegido = ev.target.value;
      try { localStorage.setItem("obrapay.proyecto", elegido); } catch { /* nada */ }
      pintar();
    }
  });
  el.addEventListener("click", async (ev) => {
    const leido = ev.target.closest("[data-leido]");
    if (leido) {
      await api.actualizar("notificaciones", `id=eq.${leido.dataset.leido}`, { leida: true });
      avisos.splice(avisos.findIndex((a) => a.id === leido.dataset.leido), 1);
      pintar();
      return;
    }
    const boton = ev.target.closest("#marcar");
    if (!boton) return;
    if (abierto && !(await confirmar(t("reloj.confirmar_salida_t"), t("reloj.confirmar_salida", { proyecto: abierto.proyectos?.nombre || "" }), { boton: t("reloj.marcar_salida") }))) return;
    try {
      await ocupado(boton, async () => {
        let pos = { lat: null, lng: null };
        if (emp.gps_activo) pos = await ubicacion();
        if (abierto) await api.rpc("marcar_salida", { p_lat: pos.lat, p_lng: pos.lng });
        else await api.rpc("marcar_entrada", { p_proyecto: elegido, p_lat: pos.lat, p_lng: pos.lng });
      });
      aviso(abierto ? t("reloj.salida_ok") : t("reloj.entrada_ok"));
      recargarVista();
    } catch (e) { aviso(mensajeError(e), "error"); }
  });
}

// ---------------------------------------------------------------------------
// Mis horas
// ---------------------------------------------------------------------------
export function selectorSemana(semanas, elegida) {
  return html`<label class="selector-semana"><span class="oculto">${t("comun.semana")}</span>
    <select id="semana" aria-label="${t("comun.semana")}">
      ${semanas.map((s) => html`<option value="${s.id}" ${s.id === elegida.id ? html`selected` : ""}>${fmtSemana(s)} · ${t(`semana.${s.estado}`)}</option>`)}
    </select></label>`;
}

export async function vistaMisHoras(el, ctx) {
  const yo = ctx.perfil.id;
  const emp = ctx.empresa;
  const semanas = await listaSemanas(12);
  let semana = semanas.find((s) => s.estado === "abierta") || semanas[0];

  const cargar = async () => {
    const { desde, hasta } = rangoSemana(semana, emp.zona_horaria);
    const turnos = await api.sel("turnos", `select=id,entrada,salida,estado,cierre_automatico,corregido,proyectos(nombre)&perfil_id=eq.${yo}&entrada=gte.${desde}&entrada=lt.${hasta}&order=entrada.asc`);
    const porDia = new Map();
    let totReg = 0; let totExtra = 0;
    turnos.forEach((tu) => {
      const dia = fechaLocal(tu.entrada);
      const m = minutosTurno(tu.entrada, tu.salida, emp);
      totReg += m.reg; totExtra += m.extra;
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia).push({ ...tu, m });
    });
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("horas.titulo")}</h1>${selectorSemana(semanas, semana)}</div>
      ${turnos.length === 0 ? html`<div class="vacio">${t("horas.vacio")}</div>` : ""}
      ${[...porDia.entries()].map(([dia, lista]) => html`
        <section class="tarjeta dia">
          <h2>${fmtDia(dia)}</h2>
          ${lista.map((tu) => html`
            <div class="fila-turno">
              <div>
                <div class="fuerte">${tu.proyectos?.nombre || ""}</div>
                <div class="mono pequeno">${fmtHora(tu.entrada)} – ${tu.salida ? fmtHora(tu.salida) : "…"} · ${horas(tu.m.reg)}${tu.m.extra ? html` + ${horas(tu.m.extra)} ${t("horas.extra")}` : ""}</div>
                ${tu.cierre_automatico ? html`<div class="nota alerta">${crudo(ICONO.alerta)} ${t("horas.cierre_auto")}</div>` : ""}
                ${tu.corregido ? html`<div class="nota">${t("horas.corregido")}</div>` : ""}
              </div>
              ${pildora(tu.estado)}
            </div>`)}
        </section>`)}
      ${turnos.length ? html`<div class="total-linea"><span>${t("horas.total")}</span><span class="mono">${horas(totReg)}${totExtra ? html` + ${horas(totExtra)} ${t("horas.extra")}` : ""}</span></div>
        <p class="nota">${t("horas.nota_almuerzo")}</p>` : ""}`);
    el.querySelector("#semana").addEventListener("change", (ev) => {
      semana = semanas.find((s) => s.id === ev.target.value);
      cargar().catch((e) => aviso(mensajeError(e), "error"));
    });
  };
  await cargar();
}

// ---------------------------------------------------------------------------
// Mi pago
// ---------------------------------------------------------------------------
export async function vistaMiPago(el, ctx) {
  const yo = ctx.perfil.id;
  const semanas = await listaSemanas(26);
  let semana = semanas.find((s) => s.estado !== "abierta") || semanas[0];
  const [tarifas, prestamos, historial] = await Promise.all([
    api.sel("tarifas", `select=monto_hora,vigente_desde&perfil_id=eq.${yo}&order=vigente_desde.desc`),
    prestamosConSaldo(yo),
    api.sel("notificaciones", `select=datos,creado_en&perfil_id=eq.${yo}&tipo=eq.cambio_tarifa&order=creado_en.desc&limit=3`),
  ]);

  const cargar = async () => {
    const [filas, proyectos] = await Promise.all([
      api.rpc("nomina_semana", { p_semana: semana.id }),
      api.rpc("nomina_semana_proyectos", { p_semana: semana.id }),
    ]);
    const n = filas[0];
    const tarifa = vigente(tarifas, semana.fin, "monto_hora");
    const viernes = fmtDia(sumarDias(semana.fin, 2), { weekday: "long", day: "numeric", month: "long" }); // pago: miércoles de cierre + 2
    const estadoTexto = semana.estado === "abierta" ? t("pago.en_curso")
      : semana.estado === "cerrada" ? t("pago.cerrada", { dia: viernes }) : t("pago.pagada");
    const activos = prestamos.filter((p) => p.activo && p.saldo > 0);
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("pago.titulo")}</h1>${selectorSemana(semanas, semana)}</div>
      ${historial.length ? html`<div class="banner banner-ok">${crudo(ICONO.arriba)}<span>${crudo(t("aviso.tarifa", { antes: dinero(historial[0].datos.antes), despues: dinero(historial[0].datos.despues), desde: fmtDia(historial[0].datos.desde, { day: "numeric", month: "long" }) }))}</span></div>` : ""}
      <section class="tarjeta oscura">
        <div class="sub">${t("pago.neto")} · ${estadoTexto}</div>
        <div class="monto-grande">${dinero(n ? n.neto : 0)}</div>
        <div class="sub">${t("comun.semana")} ${fmtSemana(semana)}</div>
      </section>
      ${!n ? html`<div class="vacio">${t("pago.vacio")}</div>` : html`
      <section class="tarjeta desglose">
        <div class="linea"><span>${t("pago.tarifa")}</span><span class="mono">${dinero(tarifa)}</span></div>
        <div class="linea"><span>${t("pago.horas", { reg: horas(n.minutos_reg), extra: horas(n.minutos_extra) })}</span><span class="mono">${horas(n.minutos_reg + n.minutos_extra)}</span></div>
        <div class="linea fuerte"><span>${t("pago.bruto")}</span><span class="mono">${dinero(n.bruto)}</span></div>
        <hr>
        <div class="linea rojo"><span>${t("pago.seguro", { pct: Number(n.seguro_pct) })}</span><span class="mono">−${dinero(n.seguro)}</span></div>
        <div class="linea rojo"><span>${t("pago.prestamo")}</span><span class="mono">−${dinero(n.prestamo)}</span></div>
        <hr>
        <div class="linea total"><span>${t("pago.neto_corto")}</span><span class="mono">${dinero(n.neto)}</span></div>
      </section>
      ${proyectos.length ? html`<section class="tarjeta desglose">
        <h2 class="etiqueta">${t("pago.por_proyecto")}</h2>
        ${proyectos.map((p) => html`<div class="linea"><span>${p.proyecto} · ${horas(p.minutos_reg + p.minutos_extra)}</span><span class="mono">${dinero(p.bruto)}</span></div>`)}
      </section>` : ""}`}
      ${activos.length ? html`<section class="tarjeta desglose">
        <h2 class="etiqueta">${t("pago.prestamos")}</h2>
        ${activos.map((p) => html`<div class="linea"><span>${t("pago.prestamo_de", { monto: dinero(p.monto_total), fecha: fmtDia(p.fecha, { day: "numeric", month: "short" }) })}</span><span class="mono">${t("pago.saldo", { saldo: dinero(p.saldo) })}</span></div>`)}
      </section>` : ""}
      <p class="nota">${t("pago.nota")}</p>`);
    el.querySelector("#semana").addEventListener("change", (ev) => {
      semana = semanas.find((s) => s.id === ev.target.value);
      cargar().catch((e) => aviso(mensajeError(e), "error"));
    });
  };
  await cargar();
}

