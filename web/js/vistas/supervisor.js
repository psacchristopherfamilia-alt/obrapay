// Aprobación y corrección de turnos (supervisor; el admin reutiliza los mismos componentes).
import { api } from "../api.js";
import { t } from "../i18n.js";
import {
  html, crudo, horas, fmtHora, fmtDia, fechaLocal, minutosTurno, aLocal, deLocal,
  aviso, mensajeError, ocupado, abrirModal, cerrarModal, datosFormulario, ICONO,
} from "../ui.js";
import { P_TURNO } from "../datos.js";
import { pildora } from "./trabajador.js";

const CAMPOS = `select=id,perfil_id,proyecto_id,entrada,salida,estado,fuera_de_area,cierre_automatico,corregido,marca_diferida,marcado_por,semana_id,${P_TURNO},proyectos(nombre)`;

export function alertasTurno(tu) {
  const a = [];
  if (tu.cierre_automatico) a.push(t("turno.olvido"));
  if (tu.fuera_de_area) a.push(t("turno.fuera_area"));
  if (tu.marca_diferida) a.push(t("turno.diferida"));
  return a;
}

export function tarjetaTurno(tu, emp, { yo, puedeAprobar = true, confirmaAdmin = true } = {}) {
  const m = tu.salida ? minutosTurno(tu.entrada, tu.salida, emp) : null;
  const alertas = alertasTurno(tu);
  const propio = tu.perfil_id === yo;
  const pendiente = tu.estado === "por_aprobar" || tu.estado === "aprobado_admin";
  return html`
    <article class="tarjeta turno" data-turno="${tu.id}">
      <div class="turno-cab">
        <div class="fuerte">${tu.perfiles?.nombre || ""}</div>
        <div class="mono">${m ? horas(m.reg + m.extra) : "…"}</div>
      </div>
      <div class="pequeno">${fmtDia(fechaLocal(tu.entrada), { weekday: "short", day: "numeric", month: "short" })} · ${fmtHora(tu.entrada)} – ${tu.salida ? fmtHora(tu.salida) : t("turno.en_curso")} · ${tu.proyectos?.nombre || ""}</div>
      ${m && m.extra ? html`<div class="pequeno">${t("turno.incluye_extra", { extra: horas(m.extra) })}</div>` : ""}
      ${alertas.map((a) => html`<div class="nota alerta">${crudo(ICONO.alerta)} ${a}</div>`)}
      ${tu.marcado_por && tu.marcado_por !== tu.perfil_id ? html`<div class="nota">${t("turno.marcado_sup")}</div>` : ""}
      ${tu.corregido ? html`<div class="nota">${t("horas.corregido")}</div>` : ""}
      <div class="turno-pie">
        ${pildora(tu.estado)}
        ${puedeAprobar && pendiente && !propio && tu.salida && !tu.semana_id ? html`
          <div class="acciones">
            <button type="button" class="btn btn-sec btn-chico" data-corregir="${tu.id}">${t("turno.corregir")}</button>
            ${tu.estado === "por_aprobar" || (tu.estado === "aprobado_admin" && confirmaAdmin) ? html`<button type="button" class="btn btn-ok btn-chico" data-aprobar="${tu.id}">${t(tu.estado === "aprobado_admin" ? "turno.confirmar" : "turno.aprobar")}</button>` : ""}
          </div>` : ""}
      </div>
    </article>`;
}

export function abrirCorreccion(tu, alGuardar) {
  const d = abrirModal(t("turno.corregir_t", { nombre: tu.perfiles?.nombre || "" }), html`
    <form id="form-corregir" class="form" novalidate>
      <p class="pequeno">${tu.proyectos?.nombre || ""}${tu.cierre_automatico ? html` · <span class="alerta">${t("turno.olvido")}</span>` : ""}</p>
      <div class="dos-col">
        <div class="campo"><label for="c-entrada">${t("turno.entrada")}</label>
          <input id="c-entrada" name="entrada" type="datetime-local" required value="${aLocal(tu.entrada)}"></div>
        <div class="campo"><label for="c-salida">${t("turno.salida")}</label>
          <input id="c-salida" name="salida" type="datetime-local" required value="${tu.salida ? aLocal(tu.salida) : ""}"></div>
      </div>
      <div class="campo"><label for="c-motivo">${t("turno.motivo")}</label>
        <input id="c-motivo" name="motivo" required maxlength="200" placeholder="${t("turno.motivo_ej")}"></div>
      <p class="error-form" role="alert" hidden></p>
      <div class="acciones-modal">
        <button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
        <button type="submit" class="btn btn-pri">${t("turno.guardar_aprobar")}</button>
      </div>
    </form>`);
  const form = d.querySelector("form");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = datosFormulario(form);
    const err = form.querySelector(".error-form");
    if (!f.entrada || !f.salida || !f.motivo.trim()) { err.hidden = false; err.textContent = t("turno.faltan"); return; }
    try {
      await ocupado(form.querySelector("[type=submit]"), () => api.rpc("corregir_turno", {
        p_id: tu.id, p_entrada: deLocal(f.entrada), p_salida: deLocal(f.salida), p_motivo: f.motivo.trim(),
      }));
      cerrarModal();
      aviso(t("turno.corregido_ok"));
      alGuardar();
    } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
  });
}

// Maneja clics de aprobar/corregir/aprobar-todo dentro de un contenedor.
export function conectarAcciones(el, obtenerTurnos, recargar) {
  el.addEventListener("click", async (ev) => {
    const ap = ev.target.closest("[data-aprobar]");
    const co = ev.target.closest("[data-corregir]");
    const todo = ev.target.closest("[data-aprobar-todo]");
    try {
      if (ap) {
        await ocupado(ap, () => api.rpc("aprobar_turnos", { p_ids: [ap.dataset.aprobar] }));
        aviso(t("turno.aprobado_ok"));
        await recargar();
      } else if (co) {
        const tu = obtenerTurnos().find((x) => x.id === co.dataset.corregir);
        if (tu) abrirCorreccion(tu, recargar);
      } else if (todo) {
        const ids = JSON.parse(todo.dataset.aprobarTodo);
        if (!ids.length) return;
        const n = await ocupado(todo, () => api.rpc("aprobar_turnos", { p_ids: ids }));
        aviso(t("turno.aprobados_n", { n }));
        await recargar();
      }
    } catch (e) { aviso(mensajeError(e), "error"); }
  });
}

// ---------------------------------------------------------------------------
// Vista del supervisor
// ---------------------------------------------------------------------------
export async function vistaAprobar(el, ctx) {
  const yo = ctx.perfil.id;
  const emp = ctx.empresa;
  let pendientes = [];
  const misProyectos = await api.sel("proyecto_supervisores", `select=proyectos(id,nombre,activo)&perfil_id=eq.${yo}`);

  const cargar = async () => {
    const [pend, enCurso] = await Promise.all([
      api.sel("turnos", `${CAMPOS}&estado=in.(por_aprobar,aprobado_admin)&semana_id=is.null&perfil_id=neq.${yo}&order=entrada.asc`),
      api.sel("turnos", `${CAMPOS}&salida=is.null&perfil_id=neq.${yo}&order=entrada.asc`),
    ]);
    pendientes = pend;
    const sinAlerta = pend.filter((x) => x.estado === "por_aprobar" && !alertasTurno(x).length).map((x) => x.id);
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("aprobar.titulo")}</h1><span class="contador">${t("aprobar.pendientes", { n: pend.length })}</span></div>
      <div class="chips">${misProyectos.map((p) => p.proyectos).filter(Boolean).map((p) => html`<span class="chip">${p.nombre}</span>`)}</div>
      <div class="banner banner-aviso">${t("aprobar.cierre")}</div>
      ${pend.length === 0 ? html`<div class="vacio">${t("aprobar.vacio")}</div>` : pend.map((tu) => tarjetaTurno(tu, emp, { yo }))}
      ${sinAlerta.length ? html`<button type="button" class="btn btn-pri btn-grande" data-aprobar-todo="${JSON.stringify(sinAlerta)}">${t("aprobar.todo", { n: sinAlerta.length })}</button>` : ""}
      ${enCurso.length ? html`<h2 class="etiqueta seccion">${t("aprobar.en_turno", { n: enCurso.length })}</h2>
        ${enCurso.map((tu) => tarjetaTurno(tu, emp, { yo, puedeAprobar: false }))}` : ""}`);
  };
  conectarAcciones(el, () => pendientes, cargar);
  await cargar();
}
