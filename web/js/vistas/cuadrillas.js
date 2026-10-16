// Cuadrillas: un atajo encima de los trabajadores (que siguen siendo individuales).
// Admin y supervisor arman cuadrillas, las asignan a una obra y marcan entrada y salida de varios a la vez.
// Los turnos siguen la aprobación normal y quedan marcados con quién los marcó.
import { api } from "../api.js";
import { t } from "../i18n.js";
import { html, crudo, fmtHora, aLocal, deLocal, aviso, mensajeError, ocupado, abrirModal, cerrarModal, confirmar, ICONO } from "../ui.js";

export async function vistaCuadrillas(el, ctx) {
  const esAdmin = ctx.roles.includes("admin");
  const yo = ctx.perfil.id;
  let pestana = esAdmin ? "gestionar" : "marcar";
  let cuadrillas = []; let trabajadores = []; let obras = []; let supervisores = [];
  // Marcar
  let obra = null; let estado = []; let elegidos = new Set(); let horaManual = false; let horaValor = "";

  const cargarObras = async () => {
    if (esAdmin) obras = (await api.sel("proyectos", "select=id,nombre&activo=eq.true&order=nombre.asc"));
    else obras = (await api.sel("proyecto_supervisores", `select=proyectos(id,nombre,activo)&perfil_id=eq.${yo}`)).map((x) => x.proyectos).filter((p) => p && p.activo);
    if (!obras.some((o) => o.id === obra)) obra = obras[0]?.id || null;
  };
  const cargarEstado = async () => {
    estado = obra ? await api.rpc("cuadrilla_estado", { p_proyecto: obra }) : [];
    elegidos = new Set(estado.filter((x) => x.asignado).map((x) => x.perfil_id));
  };
  const cargarGestion = async () => {
    const pedidos = [api.rpc("cuadrillas_lista", {}), api.rpc("trabajadores_cuadrilla", {})];
    if (esAdmin) pedidos.push(api.sel("perfiles", "select=id,nombre,roles&activo=eq.true&order=nombre.asc"));
    const r = await Promise.all(pedidos);
    cuadrillas = r[0]; trabajadores = r[1];
    if (esAdmin) supervisores = r[2].filter((p) => p.roles.includes("supervisor"));
  };

  // ---------- gestionar ----------
  const tarjetaCuadrilla = (c) => html`<article class="tarjeta cua-card">
    <div class="cua-cab"><h3 class="fuerte">${c.nombre}</h3><span class="pildora">${t("cua.personas", { n: c.miembros.length })}</span></div>
    <div class="sub">${c.supervisor ? t("cua.supervisor", { nombre: c.supervisor }) : t("cua.sin_supervisor")}</div>
    <div class="chips cua-miembros">${c.miembros.length ? c.miembros.map((m) => html`<span class="chip">${m.nombre}</span>`) : html`<span class="sub">${t("cua.sin_miembros")}</span>`}</div>
    <div class="acciones">
      <button type="button" class="btn btn-sec btn-chico" data-cua-editar="${c.id}">${t("venc.editar")}</button>
      <button type="button" class="btn btn-sec btn-chico" data-cua-asignar="${c.id}">${t("cua.asignar")}</button>
      <button type="button" class="btn btn-sec btn-chico" data-cua-quitar="${c.id}">${t("venc.quitar")}</button></div></article>`;

  const pintarGestion = () => {
    const libres = trabajadores.filter((x) => !x.cuadrilla_id);
    return html`<div class="cua-gestion">
      <div class="cua-cab"><p class="sub">${t("cua.una_sola")}</p>
        <button type="button" class="btn btn-pri" data-cua-nueva>${crudo(ICONO.mas)} ${t("cua.nueva")}</button></div>
      ${cuadrillas.length ? html`<div class="cua-grid">${cuadrillas.map(tarjetaCuadrilla)}</div>` : html`<div class="vacio">${t("cua.vacio")}</div>`}
      <section class="tarjeta"><h2 class="etiqueta">${t("cua.sin_cuadrilla")}</h2>
        <div class="chips">${libres.length ? libres.map((x) => html`<span class="chip">${x.nombre}</span>`) : html`<span class="sub">${t("cua.todos_tienen")}</span>`}</div></section>
    </div>`;
  };

  const formulario = (c) => {
    const sel = new Set((c?.miembros || []).map((m) => m.id));
    const d = abrirModal(c ? t("cua.editar_t") : t("cua.nueva"), html`
      <form class="form" novalidate>
        <div class="campo"><label for="cu-nombre">${t("cua.f_nombre")}</label>
          <input id="cu-nombre" name="nombre" maxlength="60" required value="${c ? c.nombre : ""}" autocomplete="off"></div>
        ${esAdmin ? html`<div class="campo"><label for="cu-sup">${t("cua.f_supervisor")}</label>
          <select id="cu-sup" name="supervisor"><option value="">${t("cua.sin_supervisor")}</option>
            ${supervisores.map((s) => html`<option value="${s.id}" ${c?.supervisor_id === s.id ? "selected" : ""}>${s.nombre}</option>`)}</select></div>` : ""}
        <fieldset class="campo cua-lista"><legend>${t("cua.f_trabajadores")}</legend>
          ${trabajadores.map((x) => {
            const otra = x.cuadrilla_id && x.cuadrilla_id !== c?.id;
            const bloqueado = otra && !esAdmin && !cuadrillas.some((k) => k.id === x.cuadrilla_id);
            return html`<label class="cua-fila ${bloqueado ? "off" : ""}"><input type="checkbox" value="${x.perfil_id}" data-otra="${otra ? x.cuadrilla : ""}" ${sel.has(x.perfil_id) ? "checked" : ""} ${bloqueado ? "disabled" : ""}>
              <span class="cua-n">${x.nombre}</span>${otra ? html`<span class="pildora pildora-aviso">${t("cua.en_otra", { nombre: x.cuadrilla })}</span>` : ""}</label>`;
          })}</fieldset>
        <p class="nota alerta" id="cu-mover" hidden></p>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("cua.guardar")}</button></div>
      </form>`, { ancho: 520 });
    const f = d.querySelector("form");
    const falla = (m) => { const e = f.querySelector(".error-form"); e.hidden = false; e.textContent = m; };
    f.addEventListener("change", (ev) => {
      const cb = ev.target; const aviso_ = d.querySelector("#cu-mover");
      if (cb.type === "checkbox" && cb.checked && cb.dataset.otra) {
        aviso_.hidden = false;
        aviso_.textContent = t("cua.mover_aviso", { persona: cb.closest("label").querySelector(".cua-n").textContent, cuadrilla: cb.dataset.otra });
      } else aviso_.hidden = true;
    });
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      f.querySelector(".error-form").hidden = true;
      const nombre = f.nombre.value.trim();
      if (!nombre) return falla(t("cua.falta_nombre"));
      const miembros = [...f.querySelectorAll(".cua-lista input:checked")].map((x) => x.value);
      try {
        await ocupado(f.querySelector("[type=submit]"), () => api.rpc("guardar_cuadrilla", {
          p_id: c?.id || null, p_nombre: nombre, p_supervisor: esAdmin ? (f.supervisor.value || null) : null, p_miembros: miembros,
        }));
        cerrarModal(); aviso(t("cua.guardada")); await recargar();
      } catch (e) { falla(mensajeError(e)); }
    });
  };

  const asignar = (c) => {
    if (!obras.length) { aviso(t("cua.sin_obras"), "error"); return; }
    const d = abrirModal(t("cua.asignar_t", { nombre: c.nombre }), html`
      <form class="form" novalidate>
        <div class="campo"><label for="ca-obra">${t("cua.f_obra")}</label>
          <select id="ca-obra" name="obra">${obras.map((o) => html`<option value="${o.id}">${o.nombre}</option>`)}</select></div>
        <p class="sub">${t("cua.asignar_nota")}</p>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("cua.asignar")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      try {
        const n = await ocupado(f.querySelector("[type=submit]"), () => api.rpc("asignar_cuadrilla_proyecto", { p_cuadrilla: c.id, p_proyecto: f.obra.value }));
        cerrarModal(); aviso(n ? t("cua.asignada", { n }) : t("cua.asignada_nada"));
        if (pestana === "marcar") { await cargarEstado(); }
      } catch (e) { const er = f.querySelector(".error-form"); er.hidden = false; er.textContent = mensajeError(e); }
    });
  };

  // ---------- marcar ----------
  const grupos = () => {
    const mapa = new Map();
    for (const x of estado) {
      const clave = x.cuadrilla_id || "_";
      if (!mapa.has(clave)) mapa.set(clave, { nombre: x.cuadrilla || t("cua.grupo_obra"), gente: [] });
      mapa.get(clave).gente.push(x);
    }
    return [...mapa.values()];
  };
  const estadoDe = (x) => {
    if (x.turno_id && x.turno_proyecto === obra) return { clave: "dentro", txt: t("cua.est_en_turno", { hora: fmtHora(x.entrada) }), cls: "pildora-ok" };
    if (x.turno_id) return { clave: "otra", txt: t("cua.est_otra_obra"), cls: "pildora-aviso" };
    if (!x.asignado) return { clave: "no_asignado", txt: t("cua.est_no_asignado"), cls: "pildora-aviso" };
    return { clave: "libre", txt: t("cua.est_sin_marcar"), cls: "" };
  };
  const conteos = () => {
    let entrada = 0; let salida = 0;
    for (const x of estado) {
      if (!elegidos.has(x.perfil_id)) continue;
      const e = estadoDe(x).clave;
      if (e === "libre") entrada += 1; else if (e === "dentro") salida += 1;
    }
    return { entrada, salida };
  };

  const pintarMarcar = () => {
    if (!obras.length) return html`<div class="vacio">${t("cua.sin_obras")}</div>`;
    const c = conteos();
    const sinAsignar = estado.filter((x) => !x.asignado && x.cuadrilla_id);
    return html`<div class="cua-marcar">
      <div class="campo"><label for="cm-obra">${t("cua.f_obra")}</label>
        <select id="cm-obra">${obras.map((o) => html`<option value="${o.id}" ${o.id === obra ? "selected" : ""}>${o.nombre}</option>`)}</select></div>
      ${sinAsignar.length ? html`<div class="banner banner-aviso">${t("cua.faltan_en_obra", { n: sinAsignar.length })}
        <div class="acciones">${[...new Set(sinAsignar.map((x) => x.cuadrilla_id))].map((id) => {
          const q = cuadrillas.find((k) => k.id === id);
          return q ? html`<button type="button" class="btn btn-sec btn-chico" data-cua-aqui="${id}">${t("cua.asignar_aqui", { nombre: q.nombre })}</button>` : "";
        })}</div></div>` : ""}
      ${estado.length ? grupos().map((g) => html`<section class="tarjeta"><h2 class="etiqueta">${g.nombre}</h2>
        <div class="cua-personas">${g.gente.map((x) => {
          const e = estadoDe(x);
          const apagado = e.clave === "no_asignado" || e.clave === "otra";
          return html`<label class="cua-persona ${elegidos.has(x.perfil_id) && !apagado ? "" : "off"}">
            <input type="checkbox" data-cua-p="${x.perfil_id}" ${elegidos.has(x.perfil_id) ? "checked" : ""} ${apagado ? "disabled" : ""}>
            <span class="cua-n">${x.nombre}</span><span class="pildora ${e.cls}">${e.txt}</span></label>`;
        })}</div></section>`) : html`<div class="vacio">${t("cua.sin_gente")}</div>`}
      <div class="cua-hora">${horaManual
        ? html`<div class="campo"><label for="cm-hora">${t("cua.hora_f")}</label><input id="cm-hora" type="datetime-local" value="${horaValor || aLocal(new Date().toISOString())}" max="${aLocal(new Date().toISOString())}">
            <button type="button" class="btn btn-sec btn-chico" data-cua-ahora>${t("cua.hora_usar_ahora")}</button></div>`
        : html`<span class="sub">${t("cua.hora_ahora")}</span> <button type="button" class="btn btn-sec btn-chico" data-cua-hora>${t("cua.cambiar_hora")}</button>`}</div>
      <div class="cua-botones">
        <button type="button" class="btn btn-pri btn-grande" data-cua-marcar="entrada" ${c.entrada ? "" : "disabled"}>${t("cua.marcar_entrada", { n: c.entrada })}</button>
        <button type="button" class="btn btn-sec btn-grande" data-cua-marcar="salida" ${c.salida ? "" : "disabled"}>${t("cua.marcar_salida", { n: c.salida })}</button></div>
      <p class="nota">${t("cua.nota")}</p>
      <div id="cm-resultado" aria-live="polite"></div>
    </div>`;
  };

  const marcar = async (boton, tipo) => {
    const ids = estado.filter((x) => elegidos.has(x.perfil_id) && estadoDe(x).clave === (tipo === "entrada" ? "libre" : "dentro")).map((x) => x.perfil_id);
    if (!ids.length) { aviso(t("cua.sin_seleccion"), "error"); return; }
    const inp = el.querySelector("#cm-hora");
    const hora = horaManual && inp?.value ? deLocal(inp.value) : null;
    const r = await ocupado(boton, () => (tipo === "entrada"
      ? api.rpc("marcar_entrada_por", { p_proyecto: obra, p_perfiles: ids, p_hora: hora })
      : api.rpc("marcar_salida_por", { p_perfiles: ids, p_hora: hora })));
    aviso(t("cua.resultado", { n: r.marcados }));
    horaManual = false; horaValor = "";
    const omitidos = r.omitidos || [];
    await cargarEstado();
    pintar();
    if (omitidos.length) {
      el.querySelector("#cm-resultado").innerHTML = String(html`<div class="banner banner-aviso"><b>${t("cua.omitidos")}</b>
        <ul>${omitidos.map((o) => html`<li>${o.nombre}: ${o.motivo}</li>`)}</ul></div>`);
    }
  };

  // ---------- general ----------
  const pintar = () => {
    const tab = (id, txt) => html`<button type="button" class="seg ${pestana === id ? "activo" : ""}" data-cua-tab="${id}" aria-pressed="${pestana === id}">${txt}</button>`;
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("cua.titulo")}</h1></div>
      <div class="segmentos" role="group" aria-label="${t("cua.titulo")}">${tab("marcar", t("cua.tab_marcar"))}${tab("gestionar", t("cua.tab_gestionar"))}</div>
      ${pestana === "marcar" ? pintarMarcar() : pintarGestion()}`);
  };
  const recargar = async () => { await cargarGestion(); await cargarEstado(); pintar(); };

  el.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    try {
      if (d.cuaTab) { pestana = d.cuaTab; pintar(); }
      else if (d.cuaNueva !== undefined) formulario(null);
      else if (d.cuaEditar) formulario(cuadrillas.find((x) => x.id === d.cuaEditar));
      else if (d.cuaAsignar) asignar(cuadrillas.find((x) => x.id === d.cuaAsignar));
      else if (d.cuaQuitar) {
        const c = cuadrillas.find((x) => x.id === d.cuaQuitar);
        if (!(await confirmar(t("cua.quitar_t"), t("cua.quitar_txt", { nombre: c.nombre }), { peligro: true, boton: t("venc.quitar") }))) return;
        await api.rpc("quitar_cuadrilla", { p_id: c.id });
        aviso(t("cua.quitada")); await recargar();
      } else if (d.cuaAqui) {
        const n = await ocupado(b, () => api.rpc("asignar_cuadrilla_proyecto", { p_cuadrilla: d.cuaAqui, p_proyecto: obra }));
        aviso(n ? t("cua.asignada", { n }) : t("cua.asignada_nada"));
        await cargarEstado(); pintar();
      } else if (d.cuaHora !== undefined) { horaManual = true; pintar(); }
      else if (d.cuaAhora !== undefined) { horaManual = false; horaValor = ""; pintar(); }
      else if (d.cuaMarcar) await marcar(b, d.cuaMarcar);
    } catch (e) { aviso(mensajeError(e), "error"); }
  });
  el.addEventListener("change", async (ev) => {
    const x = ev.target;
    try {
      if (x.id === "cm-obra") { obra = x.value; await cargarEstado(); pintar(); }
      else if (x.id === "cm-hora") horaValor = x.value;
      else if (x.dataset.cuaP) { if (x.checked) elegidos.add(x.dataset.cuaP); else elegidos.delete(x.dataset.cuaP); pintar(); }
    } catch (e) { aviso(mensajeError(e), "error"); }
  });

  try { await cargarObras(); await cargarGestion(); await cargarEstado(); pintar(); } catch (e) { aviso(mensajeError(e), "error"); }
}
