// Vencimientos de documentos: permiso de trabajo, licencia de construcción y licencia de conducir.
// (El seguro, la inspección y el registro de cada vehículo viven en la pantalla Vehículos.)
// El admin guarda la fecha y el archivo; la base de datos avisa cada día desde que empieza la ventana hasta que se renueve.
import { api } from "../api.js";
import { t } from "../i18n.js";
import { subirDocumento, mensajeArchivo } from "../archivos.js";
import {
  html, crudo, fmtDia, hoyLocal, sumarDias, aviso, mensajeError, ocupado, abrirModal, cerrarModal, confirmar, ICONO,
} from "../ui.js";

// Cuántos días antes empieza el aviso (igual que la base de datos).
export const TIPOS = {
  permiso_trabajo: { n: "venc.t_permiso", ventana: 90, persona: true },
  licencia_construccion: { n: "venc.t_construccion", ventana: 90, persona: false },
  licencia_conducir: { n: "venc.t_conducir", ventana: 30, persona: true },
};
const dif = (a, b) => Math.round((Date.UTC(...b.split("-").map((x, i) => (i === 1 ? Number(x) - 1 : Number(x)))) - Date.UTC(...a.split("-").map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))))) / 86400000);
const fecha = (d) => fmtDia(d, { day: "numeric", month: "short", year: "numeric" });

export async function vistaVencimientos(el, ctx) {
  const esAdmin = ctx.roles.includes("admin");
  const hoy = hoyLocal(ctx.empresa.zona_horaria);
  let docs = []; let personas = []; let filtro = "todos"; let sel = null;

  const dias = (d) => dif(hoy, d.vence);
  const estado = (d) => { const n = dias(d); return n < 0 ? "error" : n <= TIPOS[d.tipo].ventana ? "aviso" : "ok"; };
  const ETQ = { error: "venc.estado_vencido", aviso: "venc.estado_renovar", ok: "venc.estado_vigente" };
  const quien = (d) => {
    if (TIPOS[d.tipo].persona) return personas.find((p) => p.id === d.perfil_id)?.nombre || "—";
    return d.titulo || (d.tipo === "licencia_construccion" ? ctx.empresa.nombre : "—");
  };
  const faltan = (d) => { const n = dias(d); return n < 0 ? t("venc.hace", { n: -n }) : n === 0 ? t("venc.hoy") : t("venc.faltan", { n }); };

  const cargar = async () => {
    let todos;
    [todos, personas] = await Promise.all([
      api.sel("documentos", "select=*&activo=eq.true&order=vence.asc"),
      api.sel("perfiles", "select=id,nombre,roles&activo=eq.true&order=nombre.asc"),
    ]);
    docs = todos.filter((d) => TIPOS[d.tipo]);
    pintar();
  };

  const tarjeta = (d) => html`
    <button type="button" class="doc-item doc-${estado(d)}" data-doc="${d.id}" aria-pressed="${sel === d.id}">
      <div><div class="fuerte">${quien(d)}</div><div class="sub">${t(TIPOS[d.tipo].n)} · ${t("venc.vence_el", { fecha: fecha(d.vence) })}</div></div>
      <div class="doc-dias"><span class="mono fuerte">${faltan(d)}</span><span class="pildora pildora-${estado(d)}">${t(ETQ[estado(d)])}</span></div>
    </button>`;

  const detalle = () => {
    const d = docs.find((x) => x.id === sel);
    if (!d) return "";
    const ventana = TIPOS[d.tipo].ventana;
    return html`
      <section class="tarjeta doc-detalle" id="doc-detalle">
        <div class="turno-cab"><div><div class="sub">${t(TIPOS[d.tipo].n)}</div><h2 class="doc-nombre">${quien(d)}</h2></div>
          <span class="pildora pildora-${estado(d)}">${t(ETQ[estado(d)])} · ${faltan(d)}</span></div>
        <div class="doc-datos">
          <div><span class="sub">${t("venc.f_numero")}</span><b class="mono">${d.numero || "—"}</b></div>
          <div><span class="sub">${t("venc.f_vence")}</span><b>${fecha(d.vence)}</b></div>
        </div>
        <div class="doc-archivo"><div class="doc-ext">${d.archivo_nombre ? d.archivo_nombre.split(".").pop().toUpperCase().slice(0, 4) : "—"}</div>
          <div class="doc-arch-txt"><b>${d.archivo_nombre || t("venc.sin_archivo")}</b></div>
          ${d.archivo_path ? html`<button type="button" class="btn btn-sec btn-chico" data-accion="ver">${t("venc.ver")}</button>` : ""}</div>
        <p class="nota">${t("venc.nota_aviso", { fecha: fecha(sumarDias(d.vence, -ventana)) })}</p>
        <div class="acciones">
          ${esAdmin ? html`<button type="button" class="btn btn-pri btn-chico" data-accion="renovar">${t("venc.renovar")}</button>
            <button type="button" class="btn btn-sec btn-chico" data-accion="editar">${t("venc.editar")}</button>
            <button type="button" class="btn btn-sec btn-chico" data-accion="quitar">${t("venc.quitar")}</button>` : ""}
          <button type="button" class="btn btn-sec btn-chico" data-accion="cerrar">${t("venc.cerrar")}</button>
        </div>
      </section>`;
  };

  const pintar = () => {
    const lista = docs.filter((d) => filtro === "todos" || d.tipo === filtro);
    const grupo = (est, titulo) => {
      const l = lista.filter((d) => estado(d) === est);
      return l.length ? html`<section class="doc-grupo"><h2 class="etiqueta">${t(titulo)} · ${l.length}</h2>${l.map(tarjeta)}</section>` : "";
    };
    const cuenta = (est) => docs.filter((d) => estado(d) === est).length;
    const tab = (id, texto) => html`<button type="button" class="seg ${filtro === id ? "activo" : ""}" data-filtro="${id}" aria-pressed="${filtro === id}">${texto}</button>`;
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("venc.titulo")}</h1>
        <div class="acciones">${esAdmin ? html`<button type="button" class="btn btn-pri" id="agregar">${crudo(ICONO.mas)} ${t("venc.agregar")}</button>` : ""}</div></div>
      <div class="kpis">
        <div class="kpi"><span class="sub">${t("venc.vencidos")}</span><span class="num rojo">${cuenta("error")}</span></div>
        <div class="kpi"><span class="sub">${t("venc.por_renovar")}</span><span class="num">${cuenta("aviso")}</span></div>
        <div class="kpi"><span class="sub">${t("venc.vigentes")}</span><span class="num">${cuenta("ok")}</span></div>
        <div class="kpi"><span class="sub">${t("venc.total")}</span><span class="num">${docs.length}</span></div>
      </div>
      <div class="segmentos" role="group" aria-label="${t("venc.f_tipo")}">
        ${tab("todos", t("venc.todos"))}${Object.entries(TIPOS).map(([k, v]) => tab(k, t(v.n)))}
      </div>
      ${detalle()}
      ${docs.length === 0 ? html`<div class="vacio">${t("venc.vacio")}</div>` : ""}
      ${grupo("error", "venc.vencidos")}${grupo("aviso", "venc.por_renovar")}${grupo("ok", "venc.vigentes")}`);
  };

  const subir = (archivo) => subirDocumento(ctx, archivo);
  const msj = mensajeArchivo;

  const formulario = (doc) => {
    const editar = !!doc;
    const d = abrirModal(editar ? t("venc.editar") : t("venc.agregar"), html`
      <form class="form" novalidate>
        <div class="campo"><label for="dc-tipo">${t("venc.f_tipo")}</label>
          <select id="dc-tipo" name="tipo" required>${Object.entries(TIPOS).map(([k, v]) => html`<option value="${k}" ${doc?.tipo === k ? html`selected` : ""}>${t(v.n)}</option>`)}</select></div>
        <div class="campo" id="dc-c-persona"><label for="dc-persona">${t("venc.f_trabajador")}</label>
          <select id="dc-persona" name="perfil"><option value="">—</option>
            ${personas.filter((p) => p.roles.some((r) => ["trabajador", "supervisor"].includes(r))).map((p) => html`<option value="${p.id}" ${doc?.perfil_id === p.id ? html`selected` : ""}>${p.nombre}</option>`)}</select></div>
        <div class="campo" id="dc-c-titulo"><label for="dc-titulo" id="dc-l-titulo">${t("venc.f_titulo_construccion")}</label>
          <input id="dc-titulo" name="titulo" maxlength="120" value="${doc?.titulo || ""}"></div>
        <div class="dos-col">
          <div class="campo"><label for="dc-numero">${t("venc.f_numero")}</label><input id="dc-numero" name="numero" maxlength="60" value="${doc?.numero || ""}"></div>
          <div class="campo"><label for="dc-vence">${t("venc.f_vence")}</label><input id="dc-vence" name="vence" type="date" required value="${doc?.vence || ""}"></div>
        </div>
        <div class="campo"><label for="dc-archivo">${t("venc.f_archivo")}</label>
          <input id="dc-archivo" name="archivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp">
          ${doc?.archivo_nombre ? html`<span class="sub">${doc.archivo_nombre}</span>` : ""}</div>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("venc.guardar")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    const ajustar = () => {
      const tp = TIPOS[f.tipo.value];
      d.querySelector("#dc-c-persona").hidden = !tp.persona;
      d.querySelector("#dc-c-titulo").hidden = tp.persona;
    };
    f.tipo.addEventListener("change", ajustar);
    ajustar();
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector(".error-form");
      const tp = TIPOS[f.tipo.value];
      if (!f.vence.value || (tp.persona && !f.perfil.value)) {
        err.hidden = false; err.textContent = t("venc.faltan_datos"); return;
      }
      try {
        await ocupado(f.querySelector("[type=submit]"), async () => {
          const a = await subir(f.archivo.files[0]);
          const id = await api.rpc("guardar_documento", {
            p_id: doc?.id || null, p_tipo: f.tipo.value, p_perfil: tp.persona ? f.perfil.value : null,
            p_titulo: tp.persona ? null : f.titulo.value.trim() || null, p_numero: f.numero.value.trim() || null,
            p_vence: f.vence.value, p_archivo_path: a.ruta || null, p_archivo_nombre: a.nombre || null,
          });
          sel = id;
        });
        cerrarModal(); aviso(t("comun.guardado")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = msj(e); }
    });
  };

  const renovar = (doc) => {
    const d = abrirModal(t("venc.renovar_t", { nombre: quien(doc) }), html`
      <form class="form" novalidate>
        <p class="texto-modal">${t(TIPOS[doc.tipo].n)} · ${t("venc.vence_el", { fecha: fecha(doc.vence) })}</p>
        <div class="dos-col">
          <div class="campo"><label for="rn-vence">${t("venc.f_nueva_fecha")}</label><input id="rn-vence" name="vence" type="date" required min="${sumarDias(doc.vence, 1)}"></div>
          <div class="campo"><label for="rn-numero">${t("venc.f_numero")}</label><input id="rn-numero" name="numero" maxlength="60" value="${doc.numero || ""}"></div>
        </div>
        <div class="campo"><label for="rn-archivo">${t("venc.f_archivo")}</label>
          <input id="rn-archivo" name="archivo" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"></div>
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
          const a = await subir(f.archivo.files[0]);
          sel = await api.rpc("renovar_documento", {
            p_id: doc.id, p_vence: f.vence.value, p_numero: f.numero.value.trim() || null,
            p_archivo_path: a.ruta || null, p_archivo_nombre: a.nombre || null,
          });
        });
        cerrarModal(); aviso(t("venc.renovado")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = msj(e); }
    });
  };

  el.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    try {
      if (b.dataset.filtro) { filtro = b.dataset.filtro; pintar(); return; }
      if (b.dataset.doc) { sel = b.dataset.doc; pintar(); el.querySelector("#doc-detalle")?.scrollIntoView({ block: "nearest" }); return; }
      if (b.id === "agregar") { formulario(null); return; }
      const doc = docs.find((x) => x.id === sel);
      if (!b.dataset.accion || !doc) return;
      if (b.dataset.accion === "cerrar") { sel = null; pintar(); }
      if (b.dataset.accion === "editar") formulario(doc);
      if (b.dataset.accion === "renovar") renovar(doc);
      if (b.dataset.accion === "ver") {
        await ocupado(b, async () => { window.open(await api.urlArchivo("documentos", doc.archivo_path), "_blank", "noopener"); });
      }
      if (b.dataset.accion === "quitar") {
        if (!(await confirmar(t("venc.quitar_t"), t("venc.quitar_txt"), { peligro: true, boton: t("venc.quitar") }))) return;
        await api.rpc("quitar_documento", { p_id: doc.id });
        sel = null; aviso(t("comun.guardado")); await cargar();
      }
    } catch (e) { aviso(mensajeError(e), "error"); }
  });
  await cargar();
}
