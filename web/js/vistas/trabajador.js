// Vistas del trabajador: Reloj, Mis horas, Mi pago.
import { api, ApiError } from "../api.js";
import { crearMarca, encolar, enviarMarca, descartar, pendientes, leerCola, sincronizar, alCambiarCola } from "../cola.js";
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

// Colores de las tarjetas de proyecto (variables de app.css).
const COLORES = ["--acento", "--arcilla-osc", "--verde", "--gris"];

// Tiempo desde la entrada como H:MM:SS, como el reloj que corre en la tarjeta.
function cronometro(entrada) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(entrada)) / 1000));
  const d2 = (n) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${d2(Math.floor((s % 3600) / 60))}:${d2(s % 60)}`;
}

// ---------------------------------------------------------------------------
// Reloj
// ---------------------------------------------------------------------------
export async function vistaReloj(el, ctx) {
  const yo = ctx.perfil.id;
  const emp = ctx.empresa;
  // Cada turno y cada proyecto usa los ajustes de su propia compañía (horas extra, almuerzo, GPS).
  const ajustesDe = (id) => ctx.ajustes[id] || emp;
  const multi = ctx.empresas.length > 1;
  const nombreEmpresa = (id) => ctx.empresas.find((e) => e.id === id)?.nombre || "";
  // Con señal se baja todo y se guarda una copia; sin señal se usa la copia y las marcas se guardan en el teléfono.
  const traer = async () => {
    const semana = await semanaActual();
    const { desde, hasta } = rangoSemana(semana, emp.zona_horaria);
    const [asignados, turnosSemana, tarifas, avisos, abiertos] = await Promise.all([
      api.sel("proyecto_trabajadores", `select=proyecto_id,proyectos(id,nombre,activo,empresa_id)&perfil_id=eq.${yo}`),
      api.sel("turnos", `select=id,proyecto_id,entrada,salida,estado,proyectos(nombre,empresa_id)&perfil_id=eq.${yo}&entrada=gte.${desde}&entrada=lt.${hasta}&order=entrada.asc`),
      api.sel("tarifas", `select=empresa_id,monto_hora,vigente_desde&perfil_id=eq.${yo}`),
      api.sel("notificaciones", `select=id,tipo,datos,creado_en&perfil_id=eq.${yo}&leida=eq.false&tipo=eq.cambio_tarifa&order=creado_en.desc`),
      // Un turno abierto de una semana anterior también cuenta.
      api.sel("turnos", `select=id,proyecto_id,entrada,proyectos(nombre,empresa_id)&perfil_id=eq.${yo}&salida=is.null`),
    ]);
    return { semana, asignados, turnosSemana, tarifas, avisos, abiertos, guardado_en: new Date().toISOString() };
  };
  const llaveCopia = `obrapay.reloj.${yo}`;
  // Si había marcas por enviar, se intenta enviarlas primero (sin esperar más de unos segundos).
  if (pendientes(yo).length) await Promise.race([sincronizar(yo).catch(() => {}), new Promise((r) => setTimeout(r, 5000))]);
  let datos;
  let sinSenal = false;
  try {
    datos = await traer();
    try { localStorage.setItem(llaveCopia, JSON.stringify(datos)); } catch { /* nada */ }
  } catch (e) {
    let copia = null;
    try { copia = JSON.parse(localStorage.getItem(llaveCopia)); } catch { /* nada */ }
    if (!(e instanceof ApiError && e.status === 0) || !copia) throw e;
    datos = copia;
    sinSenal = true;
  }
  const { asignados, tarifas, avisos } = datos;
  const proyectos = asignados.map((a) => a.proyectos).filter((p) => p && p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre));

  // Estado actual = datos del servidor + marcas guardadas en el teléfono que el servidor todavía no tiene.
  const calcular = () => {
    let abierto = datos.abiertos[0] || null;
    const turnos = [...datos.turnosSemana];
    const guardadoEn = new Date(datos.guardado_en || 0).getTime();
    const marcas = leerCola(yo).filter((m) => m.estado === "pendiente" || (sinSenal && m.estado === "enviada" && new Date(m.enviada_en || 0).getTime() > guardadoEn));
    marcas.forEach((m) => {
      if (m.tipo === "entrada") {
        abierto = { id: `local-${m.clave}`, proyecto_id: m.proyecto_id, entrada: m.hora, proyectos: { nombre: m.proyecto_nombre, empresa_id: m.empresa_id } };
      } else if (abierto) {
        turnos.push({ id: `local-${m.clave}`, proyecto_id: abierto.proyecto_id, entrada: abierto.entrada, salida: m.hora, estado: "por_aprobar", proyectos: abierto.proyectos });
        abierto = null;
      }
    });
    let reg = 0; let extra = 0; let ganado = 0;
    const porProyecto = new Map();
    turnos.forEach((tu) => {
      const eid = tu.proyectos?.empresa_id;
      const m = minutosTurno(tu.entrada, tu.salida, ajustesDe(eid));
      reg += m.reg; extra += m.extra;
      porProyecto.set(tu.proyecto_id, (porProyecto.get(tu.proyecto_id) || 0) + m.reg + m.extra);
      const tar = vigente(tarifas.filter((x) => !eid || x.empresa_id === eid), fechaLocal(tu.entrada), "monto_hora") || 0;
      ganado += ((m.reg + m.extra) / 60) * tar;
    });
    return { abierto, reg, extra, ganado, porProyecto };
  };
  let estado = calcular();
  let elegido = estado.abierto ? estado.abierto.proyecto_id : (proyectos.length === 1 ? proyectos[0].id : null);
  try { const g = localStorage.getItem("obrapay.proyecto"); if (!estado.abierto && g && proyectos.some((p) => p.id === g)) elegido = g; } catch { /* nada */ }

  const marcasVisibles = () => leerCola(yo).filter((m) => m.estado !== "enviada" || new Date(m.enviada_en || 0).getTime() > Date.now() - 2 * 3600 * 1000);
  const pintar = () => {
    const { abierto, reg, extra, ganado, porProyecto } = estado;
    const ahora = new Date().toISOString();
    const cola = marcasVisibles();
    const nPend = cola.filter((m) => m.estado === "pendiente").length;
    el.innerHTML = String(html`
      ${sinSenal ? html`<div class="banner banner-aviso" role="status">${crudo(ICONO.alerta)}<span>${t("reloj.sin_senal")}</span></div>`
        : nPend ? html`<div class="banner banner-aviso" role="status">${crudo(ICONO.alerta)}<span>${t("reloj.por_enviar_n", { n: nPend })}</span></div>` : ""}
      ${avisos.map((a) => html`<div class="banner banner-ok" role="status">
        ${crudo(ICONO.arriba)}<span>${crudo(t("aviso.tarifa", { antes: dinero(a.datos.antes), despues: dinero(a.datos.despues), desde: fmtDia(a.datos.desde, { day: "numeric", month: "long" }) }))}</span>
        <button type="button" class="btn-texto" data-leido="${a.id}">${t("comun.entendido")}</button></div>`)}

      <section class="tarjeta reloj-tarjeta ${abierto ? "en-turno" : ""}" aria-live="polite">
        <div>
          <div class="estado-turno ${abierto ? "en-turno" : ""}"><span class="punto"></span>${abierto ? t("reloj.trabajando") : t("reloj.fuera")}</div>
          <div class="nombre-turno">${abierto ? (abierto.proyectos?.nombre || "") : t("reloj.no_trabajando")}</div>
        </div>
        <div class="hora-grande" aria-live="off">${abierto ? cronometro(abierto.entrada) : fmtHora(ahora)}</div>
        <div class="transcurrido">${abierto ? html`${t("reloj.entrada_a", { hora: fmtHora(abierto.entrada) })} · ` : ""}${fmtDia(hoyLocal(), { weekday: "long", day: "numeric", month: "long" })} · ${t("reloj.cierra")}</div>
        ${abierto
          ? html`<button type="button" id="marcar" class="btn btn-reloj salida">${crudo(ICONO.reloj)} ${t("reloj.marcar_salida")}</button>`
          : proyectos.length ? html`<div class="pequeno">${t("reloj.toca_proyecto")}</div>` : ""}
      </section>

      ${proyectos.length === 0 && !abierto
        ? html`<div class="vacio">${t("reloj.sin_proyectos")}</div>`
        : html`
        <fieldset class="lista-proyectos" ${abierto ? html`disabled` : ""}>
          <legend><h2>${t("reloj.proyecto")}</h2></legend>
          <div class="rejilla-opciones">
          ${proyectos.map((p, i) => {
            const corriendo = abierto && abierto.proyecto_id === p.id;
            const marcado = p.id === elegido;
            return html`
            <label class="opcion-proyecto ${marcado ? "elegido" : ""} ${corriendo ? "corriendo" : ""}">
              <input type="radio" name="proyecto" value="${p.id}" ${marcado ? html`checked` : ""}>
              <span class="marca-color" style="background: var(${COLORES[i % COLORES.length]})"></span>
              <span class="nombre">${p.nombre}</span>
              ${multi ? html`<span class="sub">${nombreEmpresa(p.empresa_id)}</span>` : ""}
              <span class="sub">${t("reloj.semana")} · <span class="mono">${horas(porProyecto.get(p.id) || 0)}</span></span>
              <span class="tocar">${corriendo ? t("reloj.en_curso") : marcado ? t("reloj.elegido") : t("reloj.tocar")}</span>
            </label>`;
          })}
          </div>
        </fieldset>
        ${abierto ? "" : html`<button type="button" id="marcar" class="btn btn-reloj" ${!elegido ? html`disabled` : ""}>
          ${crudo(ICONO.reloj)} ${t("reloj.marcar_entrada")}
        </button>`}
        <p class="nota">${ajustesDe(proyectos.find((p) => p.id === elegido)?.empresa_id).gps_activo ? html`${crudo(ICONO.ubicacion)} ${t("reloj.gps_nota")} · ` : ""}${t("reloj.cambiar_nota")}</p>`}

      ${cola.length ? html`<section class="tarjeta desglose" aria-label="${t("reloj.pendientes_t")}">
        <h2 class="etiqueta">${t("reloj.pendientes_t")}</h2>
        ${cola.map((m) => html`<div class="linea marca-cola">
          <span>${m.tipo === "entrada" ? t("reloj.entrada_corta") : t("reloj.salida_corta")} · ${m.proyecto_nombre || ""} · <span class="mono">${fmtHora(m.hora)}</span></span>
          <span class="pildora ${m.estado === "enviada" ? "pildora-ok" : m.estado === "error" ? "pildora-error" : "pildora-aviso"}">${t(`reloj.estado_${m.estado}`)}</span>
          ${m.estado === "error" ? html`<span class="nota alerta">${m.error} · ${t("reloj.error_marca_nota")}</span><button type="button" class="btn-texto" data-descartar="${m.clave}">${t("reloj.descartar")}</button>` : ""}
        </div>`)}
        <p class="nota">${t("reloj.diferida_nota")}</p>
      </section>` : ""}

      <section class="resumen-semana">
        <div><div class="sub">${t("reloj.semana")}</div><div class="num">${horas(reg + extra)}</div></div>
        <div><div class="sub">${t("reloj.extra")}</div><div class="num">${horas(extra)}</div></div>
        <div><div class="sub">${t("reloj.ganado")}</div><div class="num verde">${dinero(ganado)}</div></div>
      </section>
      <p class="nota">${t("reloj.estimado")}</p>`);
  };
  pintar();

  const reloj = setInterval(() => {
    const h = el.querySelector(".hora-grande");
    if (h) h.textContent = estado.abierto ? cronometro(estado.abierto.entrada) : fmtHora(new Date().toISOString());
  }, 1000);
  alSalirDeVista(() => clearInterval(reloj));

  // Cuando las marcas guardadas se envían, se vuelve a cargar con los datos reales del servidor.
  let habiaPendientes = pendientes(yo).length > 0;
  const quitarOyente = alCambiarCola(() => {
    const hay = pendientes(yo).length > 0;
    if (habiaPendientes && !hay && !leerCola(yo).some((m) => m.estado === "pendiente")) { habiaPendientes = false; recargarVista(); return; }
    habiaPendientes = hay;
    estado = calcular();
    pintar();
  });
  alSalirDeVista(quitarOyente);

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
    const descarte = ev.target.closest("[data-descartar]");
    if (descarte) { descartar(yo, descarte.dataset.descartar); return; }
    const boton = ev.target.closest("#marcar");
    if (!boton) return;
    const abierto = estado.abierto;
    if (abierto && !(await confirmar(t("reloj.confirmar_salida_t"), t("reloj.confirmar_salida", { proyecto: abierto.proyectos?.nombre || "" }), { boton: t("reloj.marcar_salida") }))) return;
    try {
      let guardada = false;
      await ocupado(boton, async () => {
        let pos = { lat: null, lng: null };
        const proy = abierto ? abierto.proyectos : proyectos.find((p) => p.id === elegido);
        if (ajustesDe(proy?.empresa_id).gps_activo) pos = await ubicacion();
        const marca = crearMarca({
          tipo: abierto ? "salida" : "entrada",
          proyecto_id: abierto ? abierto.proyecto_id : elegido,
          proyecto_nombre: proy?.nombre || "",
          empresa_id: proy?.empresa_id || null,
          lat: pos.lat, lng: pos.lng,
        });
        // Si ya hay marcas esperando, esta va detrás para conservar el orden.
        if (pendientes(yo).length) { encolar(yo, marca); guardada = true; sincronizar(yo).catch(() => {}); return; }
        try {
          await enviarMarca(marca, false);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 0)) throw e;
          // Sin señal: se guarda con la hora de ahora y la misma clave (si el servidor la recibió, no se duplica).
          encolar(yo, marca);
          guardada = true;
        }
      });
      if (guardada) { aviso(t("reloj.guardada_sin_senal"), "info"); return; }
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
  const ajustesDe = (id) => ctx.ajustes[id] || emp;
  const multi = ctx.empresas.length > 1;
  const nombreEmpresa = (id) => ctx.empresas.find((e) => e.id === id)?.nombre || "";
  // Las semanas de las compañías tienen las mismas fechas: se muestra una por fecha de inicio.
  const todas = await listaSemanas(24);
  const semanas = [];
  todas.forEach((s) => { if (!semanas.some((u) => u.inicio === s.inicio)) semanas.push(s); });
  let semana = semanas.find((s) => s.estado === "abierta") || semanas[0];

  const cargar = async () => {
    const { desde, hasta } = rangoSemana(semana, emp.zona_horaria);
    const turnos = await api.sel("turnos", `select=id,entrada,salida,estado,cierre_automatico,corregido,proyectos(nombre,empresa_id)&perfil_id=eq.${yo}&entrada=gte.${desde}&entrada=lt.${hasta}&order=entrada.asc`);
    const porDia = new Map();
    let totReg = 0; let totExtra = 0;
    turnos.forEach((tu) => {
      const dia = fechaLocal(tu.entrada);
      const m = minutosTurno(tu.entrada, tu.salida, ajustesDe(tu.proyectos?.empresa_id));
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
                <div class="fuerte">${tu.proyectos?.nombre || ""}${multi ? html` · <span class="sub">${nombreEmpresa(tu.proyectos?.empresa_id)}</span>` : ""}</div>
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
// Recibo de pago imprimible (se guarda como PDF desde el diálogo de impresión del teléfono o la computadora).
const redondo = (n) => Math.round(Number(n || 0) * 100) / 100;
// Un solo recibo por semana, con todas las compañías: días, lugares y horas por lugar.
export function recibo(filas, turnos, semana, ctx, trab = ctx.perfil) {
  const multi = filas.length > 1;
  const ajustesDe = (id) => ctx.ajustes[id] || ctx.empresa;
  const tarifaDe = (id) => Number(filas.find((f) => f.empresa_id === id)?.tarifa || 0);
  const nombreEmp = (id) => filas.find((f) => f.empresa_id === id)?.empresa || ctx.empresas.find((e) => e.id === id)?.nombre || "";
  const cerrados = turnos.filter((tu) => tu.salida && ["aprobado", "aprobado_admin"].includes(tu.estado));
  const pendientes = turnos.filter((tu) => tu.salida && tu.estado === "por_aprobar").length;
  const rows = cerrados.map((tu) => {
    const emp = tu.proyectos?.empresa_id;
    return { ...tu, emp, dia: fechaLocal(tu.entrada), lugar: tu.proyectos?.nombre || "", m: minutosTurno(tu.entrada, tu.salida, ajustesDe(emp)) };
  });
  const dias = [...new Set(rows.map((r) => r.dia))];
  const totMin = filas.reduce((a, f) => a + f.minutos_reg + f.minutos_extra, 0);
  const bruto = filas.reduce((a, f) => a + Number(f.bruto), 0);
  const neto = filas.reduce((a, f) => a + Number(f.neto), 0);
  const aporteNib = filas.reduce((a, f) => a + Number(f.nib_empleador || 0), 0);
  const aporteNhip = filas.reduce((a, f) => a + Number(f.nhip_empleador || 0), 0);
  const viernes = fmtDia(sumarDias(semana.fin, 2), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const estados = [...new Set(filas.map((f) => f.estado_semana))];
  const estado = estados.includes("abierta") ? t("recibo.provisional") : estados.every((e) => e === "pagada") ? t("recibo.pagada") : t("recibo.cerrada");
  const provisional = estados.includes("abierta");
  const numero = `RP-${String(semana.inicio).replace(/-/g, "")}-${String(trab.id).slice(0, 4).toUpperCase()}`;
  const hoy = fmtDia(hoyLocal(), { day: "numeric", month: "long", year: "numeric" });

  // Detalle por día y lugar
  const filasDia = dias.map((d) => {
    const l = rows.filter((r) => r.dia === d);
    const sub = l.reduce((a, r) => a + r.m.reg + r.m.extra, 0);
    return html`${l.map((r, i) => html`<tr>
        <td class="fecha">${i === 0 ? fmtDia(d, { weekday: "short", day: "numeric", month: "short" }) : ""}</td>
        <td>${r.lugar}${multi ? html` <span class="sub">· ${nombreEmp(r.emp)}</span>` : ""}</td>
        <td class="mono">${fmtHora(r.entrada)} – ${fmtHora(r.salida)}</td>
        <td class="der mono">${horas(r.m.reg)}</td>
        <td class="der mono ${r.m.extra ? "extra" : ""}">${r.m.extra ? horas(r.m.extra) : "–"}</td></tr>`)}
      ${l.length > 1 ? html`<tr class="sub-dia"><td></td><td colspan="2">${t("recibo.total_dia")}</td><td class="der mono" colspan="2">${horas(sub)}</td></tr>` : ""}`;
  });

  // Horas por lugar
  const lugares = [];
  rows.forEach((r) => {
    let l = lugares.find((x) => x.lugar === r.lugar && x.emp === r.emp);
    if (!l) { l = { lugar: r.lugar, emp: r.emp, dias: new Set(), reg: 0, extra: 0 }; lugares.push(l); }
    l.dias.add(r.dia); l.reg += r.m.reg; l.extra += r.m.extra;
  });
  lugares.sort((a, b) => a.lugar.localeCompare(b.lugar));
  const importe = (l) => {
    const f = filas.find((x) => x.empresa_id === l.emp);
    const p = (f?.proyectos || []).find((x) => x.proyecto === l.lugar);
    return p ? Number(p.bruto) : redondo(((l.reg + l.extra) / 60) * tarifaDe(l.emp));
  };

  // Ingresos y descuentos (uno por compañía, porque tarifa y porcentajes son de cada una)
  const bloque = (f) => {
    const reg = redondo((f.minutos_reg / 60) * f.tarifa);
    const ext = redondo(f.bruto - reg);
    const nib = Number(f.nib_empleado || 0); const nhip = Number(f.nhip_empleado || 0); const pre = Number(f.prestamo || 0);
    return html`<section class="rec-seccion">
      ${multi ? html`<div class="rec-cia">${f.empresa}</div>` : ""}
      <div class="rec-dos">
        <div><div class="etq">${t("recibo.ingresos")}</div><table><tbody>
          <tr><td>${t("recibo.normales", { h: horas(f.minutos_reg), tarifa: dinero(f.tarifa) })}</td><td class="der mono">${dinero(reg)}</td></tr>
          <tr><td>${t("recibo.extra", { h: horas(f.minutos_extra), tarifa: dinero(f.tarifa) })}</td><td class="der mono">${dinero(ext)}</td></tr>
          <tr class="tot"><td>${t("pago.bruto")}</td><td class="der mono">${dinero(f.bruto)}</td></tr></tbody></table></div>
        <div><div class="etq">${t("recibo.descuentos")}</div><table><tbody>
          <tr><td>NIB</td><td class="der mono">−${dinero(nib)}</td></tr>
          <tr><td>NHIP</td><td class="der mono">−${dinero(nhip)}</td></tr>
          <tr><td>${t("pago.prestamo")}</td><td class="der mono">−${dinero(pre)}</td></tr>
          <tr class="tot"><td>${t("recibo.total_desc")}</td><td class="der mono">−${dinero(nib + nhip + pre)}</td></tr></tbody></table></div>
      </div>
      ${multi ? html`<div class="linea fuerte rec-neto-cia"><span>${t("recibo.neto")} · ${f.empresa}</span><span class="mono">${dinero(f.neto)}</span></div>` : ""}
    </section>`;
  };

  return html`
    <article class="recibo-hoja">
      <header class="rec-banda">
        <div><div class="rec-emp">${filas.map((f) => f.empresa).join(" · ")}</div><div class="rec-sub">${t("recibo.titulo")}</div></div>
        <div class="rec-doc"><b>${t("recibo.titulo_corto")}</b>${t("recibo.numero")} ${numero}<br><span class="rec-sello">${estado}</span></div>
      </header>
      <div class="rec-cuerpo">
        <div class="rec-ficha">
          <div><span class="etq">${t("recibo.trabajador")}</span><b>${trab.nombre}</b></div>
          <div><span class="etq">${t("recibo.periodo")}</span><b>${fmtSemana(semana)}</b></div>
          <div><span class="etq">${t("recibo.fecha_pago")}</span><b>${viernes}</b></div>
          <div>${multi ? html`<span class="etq">${t("recibo.companias")}</span><b>${filas.length}</b>` : html`<span class="etq">${t("recibo.tarifa_hora")}</span><b class="mono">${dinero(filas[0].tarifa)}</b>`}</div>
        </div>
        <div class="rec-resumen">
          <div><span class="etq">${t("recibo.dias_trab")}</span><b>${dias.length}</b></div>
          <div><span class="etq">${t("recibo.horas_pagadas")}</span><b>${horas(totMin)}</b></div>
          <div><span class="etq">${t("pago.bruto")}</span><b>${dinero(bruto)}</b></div>
          <div class="rec-resumen-neto"><span class="etq">${t("recibo.neto")}</span><b>${dinero(neto)}</b></div>
        </div>
        ${rows.length ? html`
        <section class="rec-seccion">
          <div class="etq">${t("recibo.detalle")}</div>
          <table><thead><tr><th>${t("recibo.dia")}</th><th>${t("recibo.lugar")}</th><th>${t("recibo.entrada_salida")}</th><th class="der">${t("recibo.col_normales")}</th><th class="der">${t("recibo.col_extra")}</th></tr></thead>
          <tbody>${filasDia}</tbody></table>
        </section>
        <section class="rec-seccion">
          <div class="etq">${t("recibo.por_lugar")}</div>
          <table><thead><tr><th>${t("recibo.lugar")}</th><th class="der">${t("recibo.dias")}</th><th class="der">${t("recibo.col_normales")}</th><th class="der">${t("recibo.col_extra")}</th><th class="der">${t("recibo.importe")}</th></tr></thead>
          <tbody>${lugares.map((l) => html`<tr><td>${l.lugar}${multi ? html` <span class="sub">· ${nombreEmp(l.emp)}</span>` : ""}</td><td class="der mono">${l.dias.size}</td><td class="der mono">${horas(l.reg)}</td><td class="der mono">${l.extra ? horas(l.extra) : "–"}</td><td class="der mono">${dinero(importe(l))}</td></tr>`)}
          <tr class="tot"><td>${t("recibo.total")}</td><td class="der mono">${dias.length}</td><td class="der mono">${horas(lugares.reduce((a, l) => a + l.reg, 0))}</td><td class="der mono">${horas(lugares.reduce((a, l) => a + l.extra, 0))}</td><td class="der mono">${dinero(lugares.reduce((a, l) => a + importe(l), 0))}</td></tr></tbody></table>
        </section>` : ""}
        ${filas.map(bloque)}
        <div class="rec-neto"><span class="etq">${t("recibo.neto")}</span><b>${dinero(neto)}</b></div>
        <div class="rec-pie"><span>${t("recibo.aporte", { nib: dinero(aporteNib), nhip: dinero(aporteNhip) })}</span><span>${t("recibo.generado", { fecha: hoy })}</span></div>
        ${pendientes ? html`<p class="nota">${t("recibo.pendientes", { n: pendientes })}</p>` : ""}
        ${provisional ? html`<p class="nota">${t("recibo.nota_provisional")}</p>` : ""}
      </div>
    </article>`;
}

// Pone las hojas en un contenedor de impresión, abre el diálogo de imprimir y lo limpia al terminar.
export function imprimirHojas(el, hojas) {
  el.querySelector("#recibo-imp")?.remove();
  const caja = document.createElement("div");
  caja.id = "recibo-imp"; caja.className = "solo-impresion";
  caja.innerHTML = hojas.map(String).join("");
  el.appendChild(caja);
  document.body.classList.add("imp-recibo");
  window.addEventListener("afterprint", () => { document.body.classList.remove("imp-recibo"); caja.remove(); }, { once: true });
  window.print();
}

export async function vistaMiPago(el, ctx) {
  const yo = ctx.perfil.id;
  const todas = await listaSemanas(52);
  // Las semanas de las compañías tienen las mismas fechas: se muestra una por fecha de inicio.
  const unicas = [];
  todas.forEach((s) => { if (!unicas.some((u) => u.inicio === s.inicio)) unicas.push(s); });
  let semana = unicas.find((s) => s.estado !== "abierta") || unicas[0];
  const multi = ctx.empresas.length > 1;
  const nombreEmpresa = (id) => ctx.empresas.find((e) => e.id === id)?.nombre || "";
  const [prestamos, historial] = await Promise.all([
    prestamosConSaldo(yo),
    api.sel("notificaciones", `select=datos,creado_en&perfil_id=eq.${yo}&tipo=eq.cambio_tarifa&order=creado_en.desc&limit=3`),
  ]);

  const bloque = (f) => {
    const viernes = fmtDia(sumarDias(semana.fin, 2), { weekday: "long", day: "numeric", month: "long" }); // pago: miércoles de cierre + 2
    const estadoTexto = f.estado_semana === "abierta" ? t("pago.en_curso")
      : f.estado_semana === "cerrada" ? t("pago.cerrada", { dia: viernes }) : t("pago.pagada");
    return html`
      ${multi ? html`<div class="titulo-vista"><span class="pildora pildora-info">${f.empresa}</span><span class="sub">${estadoTexto}</span></div>` : ""}
      <section class="tarjeta desglose">
        <div class="linea"><span>${t("pago.tarifa")}</span><span class="mono">${dinero(f.tarifa)}</span></div>
        <div class="linea"><span>${t("pago.horas", { reg: horas(f.minutos_reg), extra: horas(f.minutos_extra) })}</span><span class="mono">${horas(f.minutos_reg + f.minutos_extra)}</span></div>
        <div class="linea fuerte"><span>${t("pago.bruto")}</span><span class="mono">${dinero(f.bruto)}</span></div>
        <hr>
        <div class="linea rojo"><span>${t("pago.seguro")}</span><span class="mono">−${dinero(f.seguro)}</span></div>
        <div class="linea rojo"><span>${t("pago.prestamo")}</span><span class="mono">−${dinero(f.prestamo)}</span></div>
        <hr>
        <div class="linea total"><span>${t("pago.neto_corto")}</span><span class="mono">${dinero(f.neto)}</span></div>
      </section>
      ${f.proyectos.length ? html`<section class="tarjeta desglose">
        <h2 class="etiqueta">${t("pago.por_proyecto")}</h2>
        ${f.proyectos.map((p) => html`<div class="linea"><span>${p.proyecto} · ${horas(p.minutos)}</span><span class="mono">${dinero(p.bruto)}</span></div>`)}
      </section>` : ""}`;
  };

  const cargar = async () => {
    const { desde, hasta } = rangoSemana(semana, ctx.empresa.zona_horaria);
    const [filas, turnos] = await Promise.all([
      api.rpc("mi_pago", { p_inicio: semana.inicio }),
      api.sel("turnos", `select=id,entrada,salida,estado,proyectos(nombre,empresa_id)&perfil_id=eq.${yo}&entrada=gte.${desde}&entrada=lt.${hasta}&order=entrada.asc`),
    ]);
    const neto = filas.reduce((a, f) => a + Number(f.neto), 0);
    const estados = [...new Set(filas.map((f) => f.estado_semana))];
    const viernes = fmtDia(sumarDias(semana.fin, 2), { weekday: "long", day: "numeric", month: "long" });
    const estadoTexto = estados.length !== 1 ? "" : estados[0] === "abierta" ? t("pago.en_curso")
      : estados[0] === "cerrada" ? t("pago.cerrada", { dia: viernes }) : t("pago.pagada");
    const activos = prestamos.filter((p) => p.activo && p.saldo > 0);
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("pago.titulo")}</h1>${selectorSemana(unicas, semana)}</div>
      ${historial.length ? html`<div class="banner banner-ok">${crudo(ICONO.arriba)}<span>${crudo(t("aviso.tarifa", { antes: dinero(historial[0].datos.antes), despues: dinero(historial[0].datos.despues), desde: fmtDia(historial[0].datos.desde, { day: "numeric", month: "long" }) }))}</span></div>` : ""}
      <section class="tarjeta oscura">
        <div class="sub">${multi ? t("pago.total_cias") : t("pago.neto")}${estadoTexto ? ` · ${estadoTexto}` : ""}</div>
        <div class="monto-grande">${dinero(neto)}</div>
        <div class="sub">${t("comun.semana")} ${fmtSemana(semana)}</div>
      </section>
      ${!filas.length ? html`<div class="vacio">${t(multi ? "pago.sin_cia" : "pago.vacio")}</div>` : filas.map(bloque)}
      ${activos.length ? html`<section class="tarjeta desglose">
        <h2 class="etiqueta">${t("pago.prestamos")}</h2>
        ${activos.map((p) => html`<div class="linea"><span>${multi ? `${nombreEmpresa(p.empresa_id)} · ` : ""}${t("pago.prestamo_de", { monto: dinero(p.monto_total), fecha: fmtDia(p.fecha, { day: "numeric", month: "short" }) })}</span><span class="mono">${t("pago.saldo", { saldo: dinero(p.saldo) })}</span></div>`)}
      </section>` : ""}
      ${filas.length ? html`<button type="button" id="recibo-pdf" class="btn btn-sec">${t("recibo.descargar")}</button>` : ""}
      <p class="nota">${t("pago.nota")}</p>
      <div id="recibo-imp" class="solo-impresion">${filas.length ? recibo(filas, turnos, semana, ctx) : ""}</div>
      ${multi ? html`<p class="nota">${t("pago.cia_nota")}</p>` : ""}`);
    el.querySelector("#recibo-pdf")?.addEventListener("click", () => {
      document.body.classList.add("imp-recibo");
      window.addEventListener("afterprint", () => document.body.classList.remove("imp-recibo"), { once: true });
      window.print();
    });
    el.querySelector("#semana").addEventListener("change", (ev) => {
      semana = unicas.find((s) => s.id === ev.target.value);
      cargar().catch((e) => aviso(mensajeError(e), "error"));
    });
  };
  await cargar();
}
