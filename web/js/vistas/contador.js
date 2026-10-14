// Reporte para el contador: se elige la compañía y la semana o el mes en pantalla y se descargan los Excel
// (NIB en el formato del formulario INS.007, NHIP y pagado por proyecto). Admin y dueño; solo el admin edita los datos del empleador.
import { api } from "../api.js";
import { t } from "../i18n.js";
import {
  html, fmtDia, hoyLocal, nombreMes, aviso, mensajeError, ocupado, abrirModal, cerrarModal, datosFormulario,
} from "../ui.js";
import { crearXlsx, descargar } from "../xlsx.js";
import { hojasNibMes, hojasNibSemana, hojasNhip, hojasProyectos, nombreArchivo } from "../contador.js";

const ultimoDia = (anio, mes) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();
const dosDig = (n) => String(n).padStart(2, "0");

export async function vistaContador(el, ctx) {
  const esAdmin = ctx.roles.includes("admin");
  const hoy = hoyLocal();
  const estado = {
    empresa: ctx.empresa.id, modo: "semana", semana: "", anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)),
  };
  let semanas = []; let emp = null;

  const nombreEmpresa = () => ctx.empresas.find((e) => e.id === estado.empresa)?.nombre || ctx.empresa.nombre;
  const cerradas = () => semanas.filter((s) => ["cerrada", "pagada"].includes(s.estado));
  const semanaElegida = () => semanas.find((s) => s.semana_id === estado.semana);

  const cargar = async () => {
    [semanas, [emp]] = await Promise.all([
      api.rpc("reporte_semanas", { p_empresa: estado.empresa }),
      api.rpc("datos_empleador", { p_empresa: estado.empresa }),
    ]);
    if (!cerradas().some((s) => s.semana_id === estado.semana)) estado.semana = cerradas()[0]?.semana_id || "";
    pintar();
  };

  const rango = () => {
    if (estado.modo === "semana") { const s = semanaElegida(); return s ? [s.pago, s.pago] : null; }
    return [`${estado.anio}-${dosDig(estado.mes)}-01`, `${estado.anio}-${dosDig(estado.mes)}-${dosDig(ultimoDia(estado.anio, estado.mes))}`];
  };

  const pintar = () => {
    const anios = []; for (let a = 2026; a <= Number(hoy.slice(0, 4)) + 1; a++) anios.push(a);
    const lista = cerradas();
    const faltan = !emp.nib_registro || !emp.direccion;
    const fmt = (d) => fmtDia(d, { day: "numeric", month: "short", year: "numeric" });
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("cont.titulo")}</h1></div>
      <p class="nota">${t("cont.nota")}</p>

      <section class="tarjeta">
        <div class="form">
          ${ctx.empresas.length > 1 ? html`<div class="campo"><label for="c-emp">${t("cont.empresa")}</label>
            <select id="c-emp">${ctx.empresas.map((e) => html`<option value="${e.id}" ${e.id === estado.empresa ? html`selected` : ""}>${e.nombre}</option>`)}</select></div>` : ""}
          <div class="campo"><label for="c-modo">${t("cont.periodo")}</label>
            <select id="c-modo"><option value="semana" ${estado.modo === "semana" ? html`selected` : ""}>${t("cont.una_semana")}</option>
              <option value="mes" ${estado.modo === "mes" ? html`selected` : ""}>${t("cont.un_mes")}</option></select></div>
          ${estado.modo === "semana" ? html`
            <div class="campo"><label for="c-sem">${t("cont.semana")}</label>
              ${lista.length ? html`<select id="c-sem">${lista.map((s) => html`<option value="${s.semana_id}" ${s.semana_id === estado.semana ? html`selected` : ""}>${fmt(s.inicio)} – ${fmt(s.fin)} · ${t("cont.pago")} ${fmt(s.pago)}</option>`)}</select>`
                : html`<p class="nota">${t("cont.sin_semanas")}</p>`}</div>` : html`
            <div class="dos-col">
              <div class="campo"><label for="c-mes">${t("rep.mes")}</label><select id="c-mes">${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => html`<option value="${m}" ${m === estado.mes ? html`selected` : ""}>${nombreMes(m)}</option>`)}</select></div>
              <div class="campo"><label for="c-anio">${t("rep.anio")}</label><select id="c-anio">${anios.map((a) => html`<option ${a === estado.anio ? html`selected` : ""}>${a}</option>`)}</select></div>
            </div>
            <p class="nota">${t("cont.nota_mes")}</p>`}
        </div>
      </section>

      <section class="tarjeta">
        <div class="titulo-vista"><h2>${t("cont.archivos")}</h2></div>
        <div class="acciones" style="flex-wrap:wrap;gap:.5rem">
          <button type="button" class="btn btn-pri" data-bajar="nib">${t("cont.bajar_nib")}</button>
          <button type="button" class="btn btn-pri" data-bajar="nhip">${t("cont.bajar_nhip")}</button>
          <button type="button" class="btn btn-pri" data-bajar="proy">${t("cont.bajar_proy")}</button>
        </div>
        <p class="nota">${estado.modo === "mes" ? t("cont.nota_nib_mes") : t("cont.nota_nib_semana")}</p>
      </section>

      <section class="tarjeta">
        <div class="titulo-vista"><h2>${t("cont.empleador")}</h2>
          ${esAdmin ? html`<button type="button" class="btn btn-sec btn-chico" id="editar-emp">${t("cont.editar")}</button>` : ""}</div>
        ${faltan ? html`<p class="nota">${t("cont.faltan_datos")}</p>` : ""}
        <dl class="lista-simple">
          <div><dt>${t("cont.nib_registro")}</dt><dd>${emp.nib_registro || "—"}</dd></div>
          <div><dt>${t("cont.nib_seguro")}</dt><dd>${emp.nib_seguro || "—"}</dd></div>
          <div><dt>${t("cont.direccion")}</dt><dd>${emp.direccion || "—"}</dd></div>
          <div><dt>${t("cont.apartado")}</dt><dd>${emp.apartado || "—"}</dd></div>
          <div><dt>${t("cont.telefono")}</dt><dd>${emp.telefono || "—"}</dd></div>
        </dl>
      </section>`);
  };

  const modalEmpleador = () => {
    const d = abrirModal(t("cont.empleador"), html`
      <form class="form" novalidate>
        <div class="campo"><label for="e-reg">${t("cont.nib_registro")}</label><input id="e-reg" name="reg" maxlength="40" value="${emp.nib_registro || ""}"></div>
        <div class="campo"><label for="e-seg">${t("cont.nib_seguro")}</label><input id="e-seg" name="seg" maxlength="40" value="${emp.nib_seguro || ""}"></div>
        <div class="campo"><label for="e-dir">${t("cont.direccion")}</label><input id="e-dir" name="dir" maxlength="160" value="${emp.direccion || ""}"></div>
        <div class="dos-col">
          <div class="campo"><label for="e-apt">${t("cont.apartado")}</label><input id="e-apt" name="apt" maxlength="40" value="${emp.apartado || ""}"></div>
          <div class="campo"><label for="e-tel">${t("cont.telefono")}</label><input id="e-tel" name="tel" maxlength="40" value="${emp.telefono || ""}" inputmode="tel"></div>
        </div>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("comun.guardar")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector(".error-form");
      const v = datosFormulario(f);
      try {
        await ocupado(f.querySelector("[type=submit]"), () => api.rpc("guardar_datos_empleador", {
          p_empresa: estado.empresa, p_nib_registro: v.reg, p_nib_seguro: v.seg, p_direccion: v.dir, p_apartado: v.apt, p_telefono: v.tel }));
        cerrarModal(); aviso(t("comun.guardado")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  const bajar = async (cual) => {
    const r = rango();
    if (!r) { aviso(t("cont.sin_semanas"), "error"); return; }
    const [desde, hasta] = r;
    const esMes = estado.modo === "mes";
    const s = semanaElegida();
    const etiqueta = esMes ? `${estado.anio}-${dosDig(estado.mes)}` : `${s.inicio}`;
    const params = { p_empresa: estado.empresa, p_desde: desde, p_hasta: hasta };
    let hojas; let prefijo;
    if (cual === "proy") {
      hojas = hojasProyectos(await api.rpc("reporte_proyectos_pagados", params)); prefijo = "pagado-por-proyecto";
    } else {
      const filas = await api.rpc("reporte_seguros", params);
      if (!filas.length) { aviso(t("cont.vacio"), "error"); return; }
      if (cual === "nhip") { hojas = hojasNhip(emp, filas); prefijo = "nhip"; }
      else if (esMes) {
        const ab = await api.rpc("reporte_altas_bajas", { p_empresa: estado.empresa, p_anio: estado.anio, p_mes: estado.mes });
        hojas = hojasNibMes(emp, estado.anio, estado.mes, filas, ab.filter((x) => x.tipo === "alta"), ab.filter((x) => x.tipo === "baja")); prefijo = "nib-ins007";
      } else { hojas = hojasNibSemana(emp, s, filas); prefijo = "nib"; }
      const sinNib = new Set(filas.filter((f) => !(cual === "nhip" ? f.numero_nhip : f.numero_nib)).map((f) => f.perfil_id)).size;
      if (sinNib) aviso(t("cont.sin_numero", { n: sinNib }), "ok");
    }
    descargar(crearXlsx(hojas), nombreArchivo(prefijo, nombreEmpresa(), etiqueta));
  };

  el.addEventListener("change", (ev) => {
    const id = ev.target.id;
    if (id === "c-emp") { estado.empresa = ev.target.value; estado.semana = ""; cargar().catch((e) => aviso(mensajeError(e), "error")); return; }
    if (id === "c-modo") estado.modo = ev.target.value;
    else if (id === "c-sem") estado.semana = ev.target.value;
    else if (id === "c-mes") estado.mes = Number(ev.target.value);
    else if (id === "c-anio") estado.anio = Number(ev.target.value);
    else return;
    pintar();
  });
  el.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.id === "editar-emp") modalEmpleador();
    if (b.dataset.bajar) ocupado(b, () => bajar(b.dataset.bajar)).catch((e) => aviso(mensajeError(e), "error"));
  });
  await cargar();
}
