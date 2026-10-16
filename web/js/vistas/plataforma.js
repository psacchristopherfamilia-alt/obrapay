// Panel del dueño de la plataforma: sus clientes y compañías, cobro fijo por compañía, suspensión por falta de pago,
// entrar a ayudar a una compañía y el asistente de alta (dueño, compañía, trabajadores, obras y vehículos).
import { api } from "../api.js";
import { t } from "../i18n.js";
import { html, esc, crudo, dinero, hoyLocal, sumarDias, fmtDia, aviso, mensajeError, ocupado, abrirModal, cerrarModal, confirmar, ICONO } from "../ui.js";
import { recargarVista } from "../app.js";
import { logoHtml, reducirLogo, variablesDeMarca, nombreMarca } from "../marca.js";
import { leerXlsx, trabajadoresDeFilas, COLUMNAS_FECHA } from "../leer-xlsx.js";

const dias = (ymd, hoy) => Math.round((Date.parse(`${ymd}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 864e5);
const masUnMes = (ymd) => { const [a, m, d] = ymd.split("-").map(Number); const f = new Date(Date.UTC(a, m, Math.min(d, 28))); return f.toISOString().slice(0, 10); };

const nuevoAlta = () => ({
  paso: 0, error: "",
  cliente: "", dueno: { nombre: "", telefono: "", email: "" },
  empresa: { nombre: "", licencia: "", direccion: "", precio: "500", vence: masUnMes(hoyLocal()) },
  admin: { modo: "nuevo", nombre: "", perfil_id: "" },
  duenoUsuario: { crear: false, nombre: "" },
  trab: [], obras: [{ nombre: "", direccion: "", presupuesto: "" }], vehiculos: [{ nombre: "", placa: "", tipo: "camioneta", conductor: "" }],
  empresaId: null, clienteId: null, resultado: null,
});

export async function vistaPlataforma(el, ctx) {
  let filas = []; let clientes = []; let admins = [];
  let modo = "panel"; // panel | alta | resultado
  let d = nuevoAlta();

  const cargar = async () => { filas = await api.rpc("plataforma_panel", {}); };
  const cargarAlta = async () => { [clientes, admins] = await Promise.all([api.rpc("plataforma_clientes", {}), api.rpc("plataforma_admins", {})]); };

  // ---------- panel ----------
  const estadoDe = (f, hoy) => {
    if (f.suspendida) return { txt: t("plat.est_suspendida"), cls: "pildora-error" };
    if (!f.vence) return { txt: t("plat.est_sin_fecha"), cls: "" };
    const n = dias(f.vence, hoy);
    if (n < 0) return { txt: t("plat.est_vencida", { n: -n }), cls: "pildora-error" };
    if (n <= 7) return { txt: n === 0 ? t("plat.est_vence_hoy") : t("plat.est_vence_en", { n }), cls: "pildora-aviso" };
    return { txt: t("plat.est_al_dia"), cls: "pildora-ok" };
  };

  const pintarPanel = () => {
    const hoy = hoyLocal();
    const activas = filas.filter((f) => !f.suspendida);
    const porVencer = activas.filter((f) => f.vence && dias(f.vence, hoy) <= 7).length;
    const ingreso = activas.reduce((a, f) => a + Number(f.precio || 0), 0);
    const trabajadores = filas.reduce((a, f) => a + Number(f.trabajadores || 0), 0);
    return html`
      <div class="titulo-vista"><div><h1>${t("plat.titulo")}</h1><p class="sub">${t("plat.sub")}</p></div>
        <button type="button" class="btn btn-pri" data-pl-nueva>${crudo(ICONO.mas)} ${t("plat.nueva")}</button></div>
      <div class="kpis">
        <div class="kpi"><span class="sub">${t("plat.k_activas")}</span><span class="num" data-k="activas">${activas.length}</span></div>
        <div class="kpi"><span class="sub">${t("plat.k_trabajadores")}</span><span class="num">${trabajadores}</span></div>
        <div class="kpi"><span class="sub">${t("plat.k_ingreso")}</span><span class="num" data-k="ingreso">${dinero(ingreso)}</span></div>
        <div class="kpi"><span class="sub">${t("plat.k_por_vencer")}</span><span class="num">${porVencer}</span></div></div>
      ${filas.length ? html`<section class="tarjeta"><h2 class="etiqueta">${t("plat.companias")}</h2>
        <div class="tabla-caja" tabindex="0" role="region" aria-label="${t("plat.companias")}"><table class="tabla plat-tabla">
          <thead><tr><th>${t("plat.c_compania")}</th><th>${t("plat.c_dueno")}</th><th>${t("plat.c_equipo")}</th><th>${t("plat.c_precio")}</th><th>${t("plat.c_vence")}</th><th>${t("plat.c_estado")}</th><th></th></tr></thead>
          <tbody>${filas.map((f) => {
            const e = estadoDe(f, hoy);
            return html`<tr data-empresa="${f.empresa_id}"><td data-l="${t("plat.c_compania")}"><b>${f.nombre}</b>${f.licencia ? html`<div class="sub">${f.licencia}</div>` : ""}</td>
              <td data-l="${t("plat.c_dueno")}">${f.cliente || "—"}${f.telefono ? html`<div class="sub">${f.telefono}</div>` : ""}</td>
              <td class="sub" data-l="${t("plat.c_equipo")}">${t("plat.equipo", { t: f.trabajadores, o: f.obras, v: f.vehiculos })}</td>
              <td class="num" data-l="${t("plat.c_precio")}">${dinero(f.precio)}</td>
              <td data-l="${t("plat.c_vence")}">${f.vence ? fmtDia(f.vence, { day: "numeric", month: "short" }) : "—"}</td>
              <td data-l="${t("plat.c_estado")}"><span class="pildora ${e.cls}">${e.txt}</span></td>
              <td><div class="acciones-fila plat-acc">
                <button type="button" class="btn btn-pri btn-chico" data-pl-pago="${f.empresa_id}">${t("plat.pago")}</button>
                ${f.suspendida
                  ? html`<button type="button" class="btn btn-sec btn-chico" data-pl-activar="${f.empresa_id}">${t("plat.activar")}</button>`
                  : html`<button type="button" class="btn btn-sec btn-chico" data-pl-suspender="${f.empresa_id}">${t("plat.suspender")}</button>`}
                <button type="button" class="btn btn-sec btn-chico" data-pl-asistir="${f.empresa_id}">${t("plat.asistir")}</button>
                <button type="button" class="btn btn-sec btn-chico" data-pl-config="${f.empresa_id}">${t("cfg.boton")}</button>
                <button type="button" class="btn btn-sec btn-chico" data-pl-usuario="${f.empresa_id}">${t("usr.boton")}</button>
                <button type="button" class="btn btn-sec btn-chico" data-pl-editar="${f.empresa_id}">${t("venc.editar")}</button></div></td></tr>`;
          })}</tbody></table></div></section>` : html`<div class="vacio">${t("plat.vacio")}</div>`}`;
  };

  const modalPago = async (f) => {
    let pagos = [];
    try { pagos = await api.rpc("plataforma_pagos", { p_empresa: f.empresa_id }); } catch { /* sin historial */ }
    const dlg = abrirModal(t("plat.pago_t", { nombre: f.nombre }), html`
      <form class="form" novalidate>
        <div class="campo"><label for="pg-monto">${t("plat.pago_monto")}</label>
          <input id="pg-monto" name="monto" type="number" inputmode="decimal" min="0" step="0.01" value="${f.precio}"></div>
        <p class="sub">${t("plat.pago_nota")}</p>
        ${pagos.length ? html`<div><h3 class="etiqueta">${t("plat.pagos_previos")}</h3>
          <ul class="plat-pagos">${pagos.map((p) => html`<li><span>${fmtDia(p.creado_en.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}</span><b>${dinero(p.monto)}</b><span class="sub">→ ${fmtDia(p.vence_despues, { day: "numeric", month: "short" })}</span></li>`)}</ul></div>` : ""}
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("plat.pago_registrar")}</button></div>
      </form>`);
    const form = dlg.querySelector("form");
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const monto = Number(form.monto.value);
      const err = form.querySelector(".error-form");
      if (!(monto >= 0) || form.monto.value === "") { err.hidden = false; err.textContent = t("plat.f_monto"); return; }
      try {
        const nuevo = await ocupado(form.querySelector("[type=submit]"), () => api.rpc("plataforma_pago", { p_empresa: f.empresa_id, p_monto: monto }));
        cerrarModal(); aviso(t("plat.pago_ok", { fecha: fmtDia(nuevo, { day: "numeric", month: "short" }) }));
        await cargar(); pintar();
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  const modalEditar = (f) => {
    const dlg = abrirModal(t("plat.editar_t", { nombre: f.nombre }), html`
      <form class="form" novalidate>
        <h3 class="etiqueta">${t("plat.s_dueno")}</h3>
        <div class="campo"><label for="ed-dn">${t("plat.f_dueno")}</label><input id="ed-dn" name="dn" maxlength="80" value="${f.cliente || ""}" autocomplete="off"></div>
        <div class="campo"><label for="ed-dt">${t("plat.f_telefono")}</label><input id="ed-dt" name="dt" maxlength="40" value="${f.telefono || ""}" autocomplete="off"></div>
        <div class="campo"><label for="ed-de">${t("plat.f_email")}</label><input id="ed-de" name="de" type="email" maxlength="120" value="${f.email || ""}" autocomplete="off"></div>
        <h3 class="etiqueta">${t("plat.s_empresa")}</h3>
        <div class="campo"><label for="ed-en">${t("plat.f_compania")}</label><input id="ed-en" name="en" maxlength="80" value="${f.nombre}" autocomplete="off" required></div>
        <div class="campo"><label for="ed-el">${t("plat.f_licencia")}</label><input id="ed-el" name="el" maxlength="60" value="${f.licencia || ""}" autocomplete="off"></div>
        <div class="campo"><label for="ed-ep">${t("plat.f_precio")}</label><input id="ed-ep" name="ep" type="number" inputmode="decimal" min="0" step="0.01" value="${f.precio}"></div>
        <div class="campo"><label for="ed-ev">${t("plat.f_vence")}</label><input id="ed-ev" name="ev" type="date" value="${f.vence || ""}"></div>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("plat.guardar")}</button></div>
      </form>`);
    const form = dlg.querySelector("form");
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = form.querySelector(".error-form"); err.hidden = true;
      if (!form.en.value.trim()) { err.hidden = false; err.textContent = t("plat.f_falta_compania"); return; }
      if (!form.dn.value.trim()) { err.hidden = false; err.textContent = t("plat.f_falta_dueno"); return; }
      try {
        await ocupado(form.querySelector("[type=submit]"), async () => {
          const cli = await api.rpc("plataforma_guardar_cliente", { p_id: f.cliente_id || null, p_nombre: form.dn.value, p_telefono: form.dt.value, p_email: form.de.value, p_direccion: null, p_notas: null });
          await api.rpc("plataforma_guardar_empresa", { p_id: f.empresa_id, p_cliente: cli, p_nombre: form.en.value, p_licencia: form.el.value, p_direccion: null, p_precio: Number(form.ep.value || 0), p_vence: form.ev.value || null, p_zona: null });
        });
        cerrarModal(); aviso(t("plat.guardada")); await cargar(); pintar();
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  // ---------- configurar compañía: horas extra, turno y marca ----------
  const nombreDia = (n) => fmtDia(`2024-01-0${n}`, { weekday: "long" }); // 2024-01-01 fue lunes
  const VARS_PREV = ["--acento", "--acento-osc", "--acento-suave", "--sobre-acento"];
  const ZONAS = ["America/Grand_Turk", "America/Nassau", "America/New_York", "America/Santo_Domingo", "America/Port-au-Prince", "America/Jamaica", "America/Puerto_Rico"];
  const modalConfig = async (f) => {
    const c = await api.rpc("plataforma_config", { p_empresa: f.empresa_id });
    const st = { color: c.marca_color || null, logo: c.marca_logo || null, nombre: c.marca_nombre || "", tab: "extra" };
    const dlg = abrirModal(t("cfg.titulo", { nombre: f.nombre }), html`
      <form class="form" novalidate>
        <div class="cfg-tabs" role="tablist">
          ${["calendario", "extra", "turno", "marca"].map((k) => html`<button type="button" role="tab" data-cfg-tab="${k}" aria-selected="${k === "calendario"}">${t(`cfg.tab_${k}`)}</button>`)}
        </div>
        <section class="cfg-panel" data-cfg-panel="calendario">
          <div class="cfg-fila">
            <div class="campo"><label for="cf-di">${t("cfg.sem_inicio")}</label>
              <select id="cf-di" name="di">${[1, 2, 3, 4, 5, 6, 7].map((n) => html`<option value="${n}" ${n === Number(c.semana_inicio_dia) ? html`selected` : ""}>${nombreDia(n)}</option>`)}</select></div>
            <div class="campo"><label for="cf-dp">${t("cfg.pago_despues")}</label>
              <input id="cf-dp" name="dp" type="number" inputmode="numeric" min="0" max="13" step="1" value="${Number(c.pago_dias_despues)}"></div>
          </div>
          <div class="cfg-vista" data-cfg-cal></div>
          <p class="sub">${t("cfg.cal_nota")}</p>
        </section>
        <section class="cfg-panel" data-cfg-panel="extra" hidden>
          <div class="campo"><label for="cf-hx">${t("cfg.extra_desde")}</label><input id="cf-hx" name="hx" type="time" value="${c.hora_extra_desde}" required></div>
          <div class="cfg-fila">
            <div class="campo"><label for="cf-mult">${t("cfg.mult")}</label><input id="cf-mult" name="mult" type="number" inputmode="decimal" min="1" max="3" step="0.05" value="${Number(c.extra_multiplicador)}"></div>
            <div class="campo"><label for="cf-md">${t("cfg.mult_desde")}</label><input id="cf-md" name="md" type="date" value="${c.extra_mult_desde || ""}"></div>
          </div>
          <p class="sub">${t("cfg.mult_nota")}</p>
        </section>
        <section class="cfg-panel" data-cfg-panel="turno" hidden>
          <div class="campo"><label for="cf-hc">${t("cfg.cierre")}</label><input id="cf-hc" name="hc" type="time" value="${c.hora_cierre_turno}" required></div>
          <label class="check"><input type="checkbox" name="alm" ${c.almuerzo_inicio ? html`checked` : ""}> ${t("cfg.almuerzo")}</label>
          <div class="cfg-fila" data-cfg-alm>
            <div class="campo"><label for="cf-ai">${t("cfg.alm_ini")}</label><input id="cf-ai" name="ai" type="time" value="${c.almuerzo_inicio || "12:00"}"></div>
            <div class="campo"><label for="cf-af">${t("cfg.alm_fin")}</label><input id="cf-af" name="af" type="time" value="${c.almuerzo_fin || "13:00"}"></div>
          </div>
          <div class="campo"><label for="cf-z">${t("cfg.zona")}</label>
            <input id="cf-z" name="z" list="cf-zonas" value="${c.zona_horaria}" autocomplete="off"><datalist id="cf-zonas">${ZONAS.map((z) => html`<option value="${z}">`)}</datalist></div>
        </section>
        <section class="cfg-panel" data-cfg-panel="marca" hidden>
          <div class="campo"><label for="cf-mn">${t("cfg.marca_nombre")}</label><input id="cf-mn" name="mn" maxlength="60" value="${c.marca_nombre || ""}" placeholder="${f.nombre}" autocomplete="off"></div>
          <div class="campo"><span class="etiqueta">${t("cfg.color")}</span>
            <div class="cfg-color"><input type="color" name="col" value="${c.marca_color || "#0F6468"}" aria-label="${t("cfg.color")}">
              <label class="check"><input type="checkbox" name="colstd" ${c.marca_color ? "" : html`checked`}> ${t("cfg.color_std")}</label></div></div>
          <div class="campo"><span class="etiqueta">${t("cfg.logo")}</span>
            <div class="cfg-marca"><span data-cfg-logo></span>
              <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" aria-label="${t("cfg.logo")}">
              <button type="button" class="btn btn-sec btn-chico" data-cfg-quitar-logo>${t("cfg.quitar_logo")}</button></div>
            <p class="sub">${t("cfg.logo_nota")}</p></div>
          <div><span class="etiqueta">${t("cfg.vista")}</span><div class="cfg-vista" data-cfg-vista></div></div>
        </section>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("plat.guardar")}</button></div>
      </form>`, { ancho: 560 });
    const form = dlg.querySelector("form");
    const err = form.querySelector(".error-form");
    const pintarMarca = () => {
      const m = { nombre: f.nombre, marca_nombre: form.mn.value.trim() || null, marca_color: st.color, marca_logo: st.logo };
      form.querySelector("[data-cfg-logo]").innerHTML = logoHtml({ ...m, marca_nombre: m.marca_nombre || f.nombre });
      const v = variablesDeMarca(st.color, false) || {};
      form.querySelector("[data-cfg-vista]").innerHTML = String(html`${crudo(logoHtml({ ...m, marca_nombre: m.marca_nombre || f.nombre }))}
        <b>${nombreMarca(m)}</b><span class="btn btn-pri btn-chico" ${crudo(v["--acento"] ? `style="background:${v["--acento"]};border-color:${v["--acento"]};color:${v["--sobre-acento"]}"` : "")}>${t("cfg.boton_ej")}</span>`);
      // La vista previa usa el color elegido aunque la app todavía lleve el suyo.
      ["[data-cfg-logo]", "[data-cfg-vista]"].forEach((q) => { const n = form.querySelector(q); VARS_PREV.forEach((k) => (v[k] ? n.style.setProperty(k, v[k]) : n.style.removeProperty(k))); });
      form.querySelector("[data-cfg-quitar-logo]").hidden = !st.logo;
    };
    const verCal = () => {
      const di = Number(form.di.value); const dp = Math.max(0, Math.min(13, Number(form.dp.value || 0)));
      const fin = ((di + 5) % 7) + 1; const pago = ((fin - 1 + dp) % 7) + 1;
      form.querySelector("[data-cfg-cal]").textContent = t("cfg.cal_resumen", { ini: nombreDia(di), fin: nombreDia(fin), pago: nombreDia(pago) });
    };
    form.di.addEventListener("change", verCal); form.dp.addEventListener("input", verCal); verCal();
    const verAlm = () => { form.querySelector("[data-cfg-alm]").hidden = !form.alm.checked; };
    pintarMarca(); verAlm();
    dlg.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-cfg-tab]"); if (!b) return;
      dlg.querySelectorAll("[data-cfg-tab]").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
      dlg.querySelectorAll("[data-cfg-panel]").forEach((p) => { p.hidden = p.dataset.cfgPanel !== b.dataset.cfgTab; });
    });
    form.alm.addEventListener("change", verAlm);
    form.mn.addEventListener("input", pintarMarca);
    form.col.addEventListener("input", () => { st.color = form.col.value; form.colstd.checked = false; pintarMarca(); });
    form.colstd.addEventListener("change", () => { st.color = form.colstd.checked ? null : form.col.value; pintarMarca(); });
    form.querySelector("[data-cfg-quitar-logo]").addEventListener("click", () => { st.logo = null; form.logo.value = ""; pintarMarca(); });
    form.logo.addEventListener("change", async () => {
      const a = form.logo.files[0]; if (!a) return; err.hidden = true;
      try { st.logo = await reducirLogo(a); pintarMarca(); } catch { err.hidden = false; err.textContent = t("cfg.logo_error"); form.logo.value = ""; }
    });
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault(); err.hidden = true;
      const mult = Number(form.mult.value || 1);
      const dp = Number(form.dp.value || 0);
      if (!(Number.isInteger(dp) && dp >= 0 && dp <= 13)) { err.hidden = false; err.textContent = t("cfg.f_pago"); return; }
      if (!(mult >= 1 && mult <= 3)) { err.hidden = false; err.textContent = t("cfg.f_mult"); return; }
      if (mult > 1 && !form.md.value) { err.hidden = false; err.textContent = t("cfg.f_mult_desde"); return; }
      const cambios = {
        hora_extra_desde: form.hx.value, extra_multiplicador: mult, extra_mult_desde: mult > 1 ? form.md.value : null,
        hora_cierre_turno: form.hc.value, almuerzo_inicio: form.alm.checked ? form.ai.value : null, almuerzo_fin: form.alm.checked ? form.af.value : null,
        zona_horaria: form.z.value.trim(), semana_inicio_dia: Number(form.di.value), pago_dias_despues: Number(form.dp.value || 0), marca_nombre: form.mn.value.trim() || null, marca_color: st.color, marca_logo: st.logo,
      };
      try {
        await ocupado(form.querySelector("[type=submit]"), () => api.rpc("plataforma_guardar_config", { p_empresa: f.empresa_id, p_cambios: cambios }));
        cerrarModal(); aviso(t("cfg.guardada"));
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  // ---------- agregar un usuario (dueño o administrador) a una compañía que ya existe ----------
  const modalUsuario = async (f) => {
    let lista = [];
    try { lista = await api.rpc("plataforma_admins", {}); } catch { /* sin lista */ }
    const dlg = abrirModal(t("usr.titulo", { nombre: f.nombre }), html`
      <form class="form" novalidate>
        <div class="campo"><label for="us-tipo">${t("usr.tipo")}</label>
          <select id="us-tipo" name="tipo">
            <option value="dueno">${t("usr.dueno")}</option>
            <option value="admin">${t("usr.admin_nuevo")}</option>
            ${lista.length ? html`<option value="existente">${t("usr.admin_existente")}</option>` : ""}
          </select></div>
        <div data-us-nuevo>
          <div class="campo"><label for="us-nombre">${t("usr.nombre")}</label><input id="us-nombre" name="nombre" maxlength="80" autocomplete="off"></div>
          <div class="campo"><label for="us-usuario">${t("usr.usuario")}</label><input id="us-usuario" name="usuario" maxlength="40" autocomplete="off" placeholder="${t("usr.usuario_ph")}"></div>
        </div>
        <div class="campo" data-us-existente hidden><label for="us-ex">${t("usr.elegir")}</label>
          <select id="us-ex" name="ex">${lista.map((a) => html`<option value="${a.id}">${a.nombre} · ${a.companias || ""}</option>`)}</select></div>
        <p class="sub" data-us-nota>${t("usr.nota_dueno")}</p>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("usr.crear")}</button></div>
      </form>`);
    const form = dlg.querySelector("form");
    const err = form.querySelector(".error-form");
    const ver = () => {
      const ex = form.tipo.value === "existente";
      form.querySelector("[data-us-nuevo]").hidden = ex; form.querySelector("[data-us-existente]").hidden = !ex;
      form.querySelector("[data-us-nota]").textContent = t(form.tipo.value === "dueno" ? "usr.nota_dueno" : "usr.nota_admin");
    };
    form.tipo.addEventListener("change", ver); ver();
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault(); err.hidden = true;
      const tipo = form.tipo.value;
      if (tipo !== "existente" && !form.nombre.value.trim()) { err.hidden = false; err.textContent = t("usr.f_nombre"); return; }
      const cuerpo = { accion: "crear_varios", empresa_id: f.empresa_id, vigente_desde: hoyLocal(), trabajadores: [] };
      const persona = { nombre: form.nombre.value, usuario: form.usuario.value.trim() };
      if (tipo === "dueno") cuerpo.dueno = persona;
      else if (tipo === "admin") cuerpo.admin = persona;
      else cuerpo.admin = { perfil_id: form.ex.value };
      try {
        const r = await ocupado(form.querySelector("[type=submit]"), () => api.funcion("crear-trabajador", cuerpo));
        const x = tipo === "dueno" ? r.dueno : r.admin;
        if (!x || !x.ok) { err.hidden = false; err.textContent = x?.error || t("usr.f_error"); return; }
        const claves = x.clave_temporal ? `${x.usuario} · ${x.clave_temporal}` : "";
        abrirModal(t("usr.listo_t"), html`
          <div class="form">
            <p><b>${x.nombre}</b> · ${t(tipo === "dueno" ? "usr.dueno" : "usr.admin_nuevo")} · ${f.nombre}</p>
            ${claves ? html`<div class="plat-clave mono" data-us-claves>${claves}</div><p class="sub">${t("plat.res_aviso")}</p>`
                     : html`<p class="sub">${t("usr.ya_existia", { usuario: x.usuario })}</p>`}
            <div class="acciones-modal">
              ${claves ? html`<button type="button" class="btn btn-sec" data-us-copiar>${t("plat.res_copiar")}</button>` : ""}
              <button type="button" class="btn btn-pri" data-cerrar>${t("comun.cerrar")}</button></div>
          </div>`);
        const cp = document.querySelector("[data-us-copiar]");
        if (cp) cp.addEventListener("click", async () => { try { await navigator.clipboard.writeText(claves); aviso(t("plat.res_copiado")); } catch { aviso(t("plat.res_no_copio"), "error"); } });
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  // ---------- asistente de alta ----------
  const PASOS = ["plat.p_empresa", "plat.p_trabajadores", "plat.p_obras", "plat.p_vehiculos", "plat.p_revisar"];

  const estadoTrab = (p) => {
    if (!p.errores.length) return { txt: t("plat.t_listo"), cls: "pildora-ok" };
    const m = p.errores.map((x) => t(`plat.e_${x}`)).join(", ");
    return { txt: m, cls: "pildora-error" };
  };
  const revalidar = (p) => {
    const e = [];
    if (!String(p.nombre || "").trim()) e.push("nombre");
    if (!(Number(p.tarifa) > 0)) e.push("tarifa");
    if (p.permiso_vence && !/^\d{4}-\d{2}-\d{2}$/.test(p.permiso_vence)) e.push("permiso");
    if (p.licencia_vence && !/^\d{4}-\d{2}-\d{2}$/.test(p.licencia_vence)) e.push("licencia");
    p.errores = e;
  };

  const pasoEmpresa = () => {
    const existente = clientes.find((c) => c.id === d.cliente);
    return html`
      <div class="form plat-form">
        <div class="campo"><label for="al-cliente">${t("plat.f_cliente")}</label>
          <select id="al-cliente"><option value="">${t("plat.cliente_nuevo")}</option>
            ${clientes.map((c) => html`<option value="${c.id}" ${c.id === d.cliente ? "selected" : ""}>${c.nombre}</option>`)}</select></div>
        ${existente ? html`<p class="sub">${t("plat.cliente_existente", { n: existente.companias })}</p>` : html`
          <div class="campo"><label for="al-dn">${t("plat.f_dueno")}</label><input id="al-dn" data-g="dueno.nombre" maxlength="80" value="${d.dueno.nombre}" autocomplete="off"></div>
          <div class="campo"><label for="al-dt">${t("plat.f_telefono")}</label><input id="al-dt" data-g="dueno.telefono" maxlength="40" value="${d.dueno.telefono}" autocomplete="off"></div>
          <div class="campo"><label for="al-de">${t("plat.f_email")}</label><input id="al-de" data-g="dueno.email" type="email" maxlength="120" value="${d.dueno.email}" autocomplete="off"></div>`}
        <div class="campo"><label for="al-en">${t("plat.f_compania")}</label><input id="al-en" data-g="empresa.nombre" maxlength="80" value="${d.empresa.nombre}" autocomplete="off"></div>
        <div class="campo"><label for="al-el">${t("plat.f_licencia")}</label><input id="al-el" data-g="empresa.licencia" maxlength="60" value="${d.empresa.licencia}" autocomplete="off"></div>
        <div class="campo"><label for="al-ed">${t("plat.f_direccion")}</label><input id="al-ed" data-g="empresa.direccion" maxlength="120" value="${d.empresa.direccion}" autocomplete="off"></div>
        <div class="campo"><label for="al-ep">${t("plat.f_precio")}</label><input id="al-ep" data-g="empresa.precio" type="number" inputmode="decimal" min="0" step="0.01" value="${d.empresa.precio}"></div>
        <div class="campo"><label for="al-ev">${t("plat.f_vence")}</label><input id="al-ev" data-g="empresa.vence" type="date" value="${d.empresa.vence}"></div>
      </div>
      <fieldset class="campo plat-admin"><legend>${t("plat.f_admin")}</legend>
        <label class="plat-radio"><input type="radio" name="al-adm" value="nuevo" ${d.admin.modo === "nuevo" ? "checked" : ""}> ${t("plat.adm_nuevo")}</label>
        ${d.admin.modo === "nuevo" ? html`<input id="al-an" data-g="admin.nombre" placeholder="${t("plat.adm_nombre")}" maxlength="80" value="${d.admin.nombre}" autocomplete="off" aria-label="${t("plat.adm_nombre")}">` : ""}
        <label class="plat-radio"><input type="radio" name="al-adm" value="existente" ${d.admin.modo === "existente" ? "checked" : ""} ${admins.length ? "" : "disabled"}> ${t("plat.adm_existente")}</label>
        ${d.admin.modo === "existente" ? html`<select id="al-ae" aria-label="${t("plat.adm_existente")}"><option value="">${t("plat.adm_elegir")}</option>
          ${admins.map((a) => html`<option value="${a.id}" ${a.id === d.admin.perfil_id ? "selected" : ""}>${a.nombre} · ${a.companias || ""}</option>`)}</select>` : ""}
        <label class="plat-radio"><input type="radio" name="al-adm" value="ninguno" ${d.admin.modo === "ninguno" ? "checked" : ""}> ${t("plat.adm_ninguno")}</label>
      </fieldset>
      <label class="ck plat-ck"><input type="checkbox" id="al-du" ${d.duenoUsuario.crear ? "checked" : ""}> ${t("plat.dueno_usuario")}</label>
      ${d.duenoUsuario.crear ? html`<div class="campo"><label for="al-dun">${t("plat.dueno_usuario_nombre")}</label><input id="al-dun" data-g="duenoUsuario.nombre" maxlength="80" value="${d.duenoUsuario.nombre || (existente ? "" : d.dueno.nombre)}" autocomplete="off"></div>` : ""}`;
  };

  const pasoTrabajadores = () => {
    const malas = d.trab.filter((p) => p.errores.length).length;
    return html`
      <div class="plat-barra">
        <a class="btn btn-sec btn-chico" href="plantilla-trabajadores.xlsx" download>${t("plat.t_plantilla")}</a>
        <label class="btn btn-sec btn-chico plat-subir">${t("plat.t_subir")}<input type="file" id="al-xlsx" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label>
        <button type="button" class="btn btn-sec btn-chico" data-pl-addt>${crudo(ICONO.mas)} ${t("plat.t_agregar")}</button></div>
      <p class="sub">${t("plat.t_ayuda")}</p>
      ${d.trab.length ? html`<div class="plat-lista">${d.trab.map((p, i) => {
        const e = estadoTrab(p);
        return html`<div class="plat-fila-t">
          <input data-l="trab" data-i="${i}" data-c="nombre" value="${p.nombre}" placeholder="${t("plat.t_nombre")}" aria-label="${t("plat.t_nombre")}" autocomplete="off">
          <input data-l="trab" data-i="${i}" data-c="oficio" value="${p.oficio}" placeholder="${t("plat.t_oficio")}" aria-label="${t("plat.t_oficio")}" autocomplete="off">
          <input data-l="trab" data-i="${i}" data-c="tarifa" type="number" inputmode="decimal" min="0" step="0.01" value="${p.tarifa || ""}" placeholder="${t("plat.t_tarifa")}" aria-label="${t("plat.t_tarifa")}">
          <input data-l="trab" data-i="${i}" data-c="telefono" value="${p.telefono}" placeholder="${t("plat.t_telefono")}" aria-label="${t("plat.t_telefono")}" autocomplete="off">
          <span class="pildora ${e.cls}">${e.txt}</span>
          <button type="button" class="btn btn-fantasma btn-chico" data-pl-quitar="trab:${i}" aria-label="${t("venc.quitar")}">✕</button>
          ${(p.nib || p.nhip || p.permiso_vence || p.licencia_vence) ? html`<div class="chips plat-extra">${p.nib ? html`<span class="chip">NIB</span>` : ""}${p.nhip ? html`<span class="chip">NHIP</span>` : ""}${p.permiso_vence ? html`<span class="chip">${t("plat.t_permiso")}</span>` : ""}${p.licencia_vence ? html`<span class="chip">${t("plat.t_licencia")}</span>` : ""}</div>` : ""}
        </div>`;
      })}</div>
      <p class="sub" id="al-resumen-t">${malas ? t("plat.t_con_error", { n: malas }) : t("plat.t_todas_listas", { n: d.trab.length })}</p>` : html`<div class="vacio">${t("plat.t_vacio")}</div>`}
      <p class="sub">${t("plat.t_claves")}</p>`;
  };

  const filaObra = (o, i) => html`<div class="plat-fila-o">
    <input data-l="obras" data-i="${i}" data-c="nombre" value="${o.nombre}" placeholder="${t("plat.o_nombre")}" aria-label="${t("plat.o_nombre")}" autocomplete="off">
    <input data-l="obras" data-i="${i}" data-c="direccion" value="${o.direccion}" placeholder="${t("plat.o_direccion")}" aria-label="${t("plat.o_direccion")}" autocomplete="off">
    <input data-l="obras" data-i="${i}" data-c="presupuesto" type="number" inputmode="decimal" min="0" step="0.01" value="${o.presupuesto}" placeholder="${t("plat.o_presupuesto")}" aria-label="${t("plat.o_presupuesto")}">
    <button type="button" class="btn btn-fantasma btn-chico" data-pl-quitar="obras:${i}" aria-label="${t("venc.quitar")}">✕</button></div>`;
  const TIPOS = ["camioneta", "van", "camion", "remolque", "otro"];
  const filaVeh = (v, i) => html`<div class="plat-fila-v">
    <input data-l="vehiculos" data-i="${i}" data-c="nombre" value="${v.nombre}" placeholder="${t("plat.v_nombre")}" aria-label="${t("plat.v_nombre")}" autocomplete="off">
    <input data-l="vehiculos" data-i="${i}" data-c="placa" value="${v.placa}" placeholder="${t("plat.v_placa")}" aria-label="${t("plat.v_placa")}" autocomplete="off">
    <select data-l="vehiculos" data-i="${i}" data-c="tipo" aria-label="${t("plat.v_tipo")}">${TIPOS.map((x) => html`<option value="${x}" ${v.tipo === x ? "selected" : ""}>${t(`veh.t_${x}`)}</option>`)}</select>
    <select data-l="vehiculos" data-i="${i}" data-c="conductor" aria-label="${t("plat.v_conductor")}"><option value="">${t("plat.v_sin_conductor")}</option>
      ${d.trab.filter((p) => p.nombre.trim()).map((p) => html`<option value="${p.nombre}" ${v.conductor === p.nombre ? "selected" : ""}>${p.nombre}</option>`)}</select>
    <button type="button" class="btn btn-fantasma btn-chico" data-pl-quitar="vehiculos:${i}" aria-label="${t("venc.quitar")}">✕</button></div>`;

  const pasoObras = () => html`<p class="sub">${t("plat.o_ayuda")}</p>
    <div class="plat-lista">${d.obras.map(filaObra)}</div>
    <button type="button" class="btn btn-sec btn-chico" data-pl-add="obras">${crudo(ICONO.mas)} ${t("plat.o_agregar")}</button>`;
  const pasoVehiculos = () => html`<p class="sub">${t("plat.v_ayuda")}</p>
    <div class="plat-lista">${d.vehiculos.map(filaVeh)}</div>
    <button type="button" class="btn btn-sec btn-chico" data-pl-add="vehiculos">${crudo(ICONO.mas)} ${t("plat.v_agregar")}</button>`;

  const obrasValidas = () => d.obras.filter((o) => o.nombre.trim());
  const vehValidos = () => d.vehiculos.filter((v) => v.nombre.trim());

  const pasoRevisar = () => {
    const existente = clientes.find((c) => c.id === d.cliente);
    return html`<div class="plat-resumen">
      <div class="tarjeta"><h2 class="etiqueta">${t("plat.r_compania")}</h2><b>${d.empresa.nombre}</b>
        <div class="sub">${existente ? existente.nombre : d.dueno.nombre} · ${dinero(Number(d.empresa.precio || 0))}${t("plat.r_mes")}</div></div>
      <div class="tarjeta"><h2 class="etiqueta">${t("plat.r_se_creara")}</h2>
        ${t("plat.r_conteo", { t: d.trab.length, o: obrasValidas().length, v: vehValidos().length })}
        <div class="sub">${d.admin.modo === "nuevo" && d.admin.nombre ? t("plat.r_admin_nuevo", { nombre: d.admin.nombre })
          : d.admin.modo === "existente" && d.admin.perfil_id ? t("plat.r_admin_existente", { nombre: admins.find((a) => a.id === d.admin.perfil_id)?.nombre || "" }) : t("plat.r_sin_admin")}</div>
        ${d.duenoUsuario.crear ? html`<div class="sub">${t("plat.r_dueno_usuario", { nombre: d.duenoUsuario.nombre })}</div>` : ""}</div></div>
      <div class="banner banner-aviso"><span>${t("plat.r_nota")}</span></div>`;
  };

  const validarPaso = () => {
    if (d.paso === 0) {
      const existente = clientes.find((c) => c.id === d.cliente);
      if (!existente && !d.dueno.nombre.trim()) return t("plat.f_falta_dueno");
      if (!d.empresa.nombre.trim()) return t("plat.f_falta_compania");
      if (!(Number(d.empresa.precio) >= 0) || d.empresa.precio === "") return t("plat.f_precio_mal");
      if (d.admin.modo === "nuevo" && !d.admin.nombre.trim()) return t("plat.f_falta_admin");
      if (d.admin.modo === "existente" && !d.admin.perfil_id) return t("plat.f_falta_admin_ex");
      if (d.duenoUsuario.crear && !d.duenoUsuario.nombre.trim()) return t("plat.f_falta_dueno_usuario");
    }
    if (d.paso === 1) {
      d.trab.forEach(revalidar);
      if (d.trab.some((p) => p.errores.length)) return t("plat.t_corrige");
    }
    return "";
  };

  const pintarAlta = () => html`
    <div class="titulo-vista"><div><h1>${t("plat.alta_t")}</h1></div>
      <button type="button" class="btn btn-sec" data-pl-cancelar>${t("comun.cancelar")}</button></div>
    <section class="tarjeta plat-asistente">
      <ol class="plat-pasos" aria-label="${t("plat.alta_t")}">${PASOS.map((k, i) => html`<li class="${i === d.paso ? "on" : i < d.paso ? "hecho" : ""}" ${i === d.paso ? html`aria-current="step"` : ""}>${i + 1}. ${t(k)}</li>`)}</ol>
      <h2 class="plat-paso-t">${t(PASOS[d.paso])}</h2>
      <div id="al-cuerpo">${[pasoEmpresa, pasoTrabajadores, pasoObras, pasoVehiculos, pasoRevisar][d.paso]()}</div>
      <p class="error-form" role="alert" id="al-error" ${d.error ? "" : "hidden"}>${d.error}</p>
      <div class="acciones-modal plat-nav">
        <button type="button" class="btn btn-sec" data-pl-atras ${d.paso === 0 ? "disabled" : ""}>← ${t("plat.atras")}</button>
        ${d.paso < PASOS.length - 1
          ? html`<button type="button" class="btn btn-pri" data-pl-sig>${t("plat.siguiente")} →</button>`
          : html`<button type="button" class="btn btn-pri" data-pl-crear>${t("plat.crear")}</button>`}</div>
    </section>`;

  // ---------- resultado (claves para entregar) ----------
  const claves = () => {
    const r = d.resultado; const filas_ = [];
    if (r.admin?.ok && r.admin.clave_temporal) filas_.push([t("plat.rol_admin"), r.admin.nombre, r.admin.usuario, r.admin.clave_temporal]);
    if (r.admin?.ok && r.admin.existente) filas_.push([t("plat.rol_admin"), r.admin.nombre, r.admin.usuario, t("plat.misma_clave")]);
    if (r.dueno?.ok) filas_.push([t("plat.rol_dueno"), r.dueno.nombre, r.dueno.usuario, r.dueno.clave_temporal]);
    for (const x of r.resultados.filter((y) => y.ok)) filas_.push([t("rol.trabajador"), x.nombre, x.usuario, x.clave_temporal]);
    return filas_;
  };
  const csvClaves = () => {
    const cel = (s) => `"${String(s).replace(/"/g, '""')}"`;
    return "﻿" + [[t("plat.r_rol"), t("plat.r_persona"), t("plat.r_usuario"), t("plat.r_clave")], ...claves()].map((f) => f.map(cel).join(",")).join("\r\n");
  };
  const pintarResultado = () => {
    const r = d.resultado; const lista = claves();
    const fallas = r.resultados.filter((x) => !x.ok);
    return html`
      <div class="titulo-vista"><div><h1>${t("plat.res_t", { nombre: d.empresa.nombre })}</h1><p class="sub">${t("plat.res_sub")}</p></div></div>
      <section class="tarjeta plat-claves">
        <div class="banner banner-aviso"><span>${t("plat.res_aviso")}</span></div>
        ${lista.length ? html`<div class="tabla-caja" tabindex="0" role="region" aria-label="${t("plat.res_t", { nombre: d.empresa.nombre })}"><table class="tabla">
          <thead><tr><th>${t("plat.r_rol")}</th><th>${t("plat.r_persona")}</th><th>${t("plat.r_usuario")}</th><th>${t("plat.r_clave")}</th></tr></thead>
          <tbody>${lista.map((f) => html`<tr><td>${f[0]}</td><td>${f[1]}</td><td class="mono">${f[2]}</td><td class="mono">${f[3]}</td></tr>`)}</tbody></table></div>` : html`<p class="sub">${t("plat.res_sin_claves")}</p>`}
        <div class="acciones">
          <button type="button" class="btn btn-sec" data-pl-copiar>${t("plat.res_copiar")}</button>
          <button type="button" class="btn btn-sec" data-pl-csv>${t("plat.res_csv")}</button>
          <button type="button" class="btn btn-sec" data-pl-imprimir>${t("plat.res_imprimir")}</button></div>
      </section>
      ${r.obrasVeh ? html`<p class="sub">${t("plat.res_datos", { o: r.obrasVeh.obras, v: r.obrasVeh.vehiculos })}</p>` : ""}
      ${r.errorDatos ? html`<div class="error-form" role="alert">${t("plat.res_error_datos", { error: r.errorDatos })}</div>` : ""}
      ${fallas.length ? html`<section class="tarjeta"><h2 class="etiqueta">${t("plat.res_fallas")}</h2>
        <ul class="plat-fallas">${fallas.map((x) => html`<li>${t("plat.res_fila", { n: x.fila })} · <b>${x.nombre || "—"}</b>: ${x.error}</li>`)}</ul>
        <p class="sub">${t("plat.res_fallas_ayuda")}</p></section>` : ""}
      <div class="acciones"><button type="button" class="btn btn-pri" data-pl-volver>${t("plat.volver")}</button>
        <button type="button" class="btn btn-sec" data-pl-asistir="${d.empresaId}">${t("plat.asistir")}</button></div>`;
  };

  const crear = async (boton) => {
    d.error = "";
    const existente = clientes.find((c) => c.id === d.cliente);
    await ocupado(boton, async () => {
      if (!d.clienteId) {
        d.clienteId = existente ? existente.id : await api.rpc("plataforma_guardar_cliente", { p_id: null, p_nombre: d.dueno.nombre, p_telefono: d.dueno.telefono, p_email: d.dueno.email, p_direccion: null, p_notas: null });
      }
      if (!d.empresaId) {
        d.empresaId = await api.rpc("plataforma_guardar_empresa", { p_id: null, p_cliente: d.clienteId, p_nombre: d.empresa.nombre, p_licencia: d.empresa.licencia, p_direccion: d.empresa.direccion, p_precio: Number(d.empresa.precio || 0), p_vence: d.empresa.vence || null, p_zona: null });
      }
      const cuerpo = {
        accion: "crear_varios", empresa_id: d.empresaId, vigente_desde: hoyLocal(),
        trabajadores: d.trab.map((p) => ({ nombre: p.nombre, oficio: p.oficio, tarifa: Number(p.tarifa), telefono: p.telefono, nib: p.nib, nhip: p.nhip,
          permiso_numero: p.permiso_numero, permiso_vence: p.permiso_vence, licencia_numero: p.licencia_numero, licencia_vence: p.licencia_vence })),
      };
      if (d.admin.modo === "nuevo") cuerpo.admin = { nombre: d.admin.nombre };
      if (d.admin.modo === "existente") cuerpo.admin = { perfil_id: d.admin.perfil_id };
      if (d.duenoUsuario.crear) cuerpo.dueno = { nombre: d.duenoUsuario.nombre };
      const r = await api.funcion("crear-trabajador", cuerpo);
      // Cada trabajador creado queda con su usuario; los vehículos se ligan por nombre.
      const porNombre = Object.fromEntries((r.resultados || []).filter((x) => x.ok).map((x) => [x.nombre, x.usuario]));
      const res = { resultados: r.resultados || [], admin: r.admin, dueno: r.dueno, obrasVeh: null, errorDatos: "" };
      try {
        res.obrasVeh = await api.rpc("plataforma_alta_datos", {
          p_empresa: d.empresaId,
          p_obras: obrasValidas().map((o) => ({ nombre: o.nombre, direccion: o.direccion, presupuesto: o.presupuesto })),
          p_vehiculos: vehValidos().map((v) => ({ nombre: v.nombre, placa: v.placa, tipo: v.tipo, conductor: porNombre[v.conductor] || "" })),
        });
      } catch (e) { res.errorDatos = mensajeError(e); }
      d.resultado = res;
    }).catch((e) => { d.error = mensajeError(e); });
    if (d.resultado) { modo = "resultado"; await cargar().catch(() => {}); }
    pintar();
  };

  // ---------- general ----------
  const pintar = () => {
    el.innerHTML = String(modo === "alta" ? pintarAlta() : modo === "resultado" ? pintarResultado() : pintarPanel());
  };

  const fijar = (ruta, valor) => {
    const k = ruta.split(".");
    d[k[0]][k[1]] = valor;
  };

  el.addEventListener("input", (ev) => {
    const x = ev.target;
    if (x.dataset.g) fijar(x.dataset.g, x.value);
    else if (x.dataset.l) {
      const fila = d[x.dataset.l][Number(x.dataset.i)];
      if (!fila) return;
      fila[x.dataset.c] = x.dataset.c === "tarifa" && x.dataset.l === "trab" ? x.value : x.value;
      if (x.dataset.l === "trab") {
        revalidar(fila);
        // actualizar solo la etiqueta de estado y el resumen, sin perder el foco del campo
        const pil = x.closest(".plat-fila-t")?.querySelector(".pildora");
        if (pil) { const e = estadoTrab(fila); pil.className = `pildora ${e.cls}`; pil.textContent = e.txt; }
        const malas = d.trab.filter((p) => p.errores.length).length;
        const r = el.querySelector("#al-resumen-t"); if (r) r.textContent = malas ? t("plat.t_con_error", { n: malas }) : t("plat.t_todas_listas", { n: d.trab.length });
      }
    }
  });

  el.addEventListener("change", async (ev) => {
    const x = ev.target;
    try {
      if (x.id === "al-cliente") { d.cliente = x.value; pintar(); }
      else if (x.name === "al-adm") { d.admin.modo = x.value; pintar(); }
      else if (x.id === "al-ae") d.admin.perfil_id = x.value;
      else if (x.id === "al-du") {
        d.duenoUsuario.crear = x.checked;
        // El nombre que se ve en el campo es el del dueño: que también quede guardado.
        if (x.checked && !d.duenoUsuario.nombre.trim() && !clientes.find((c) => c.id === d.cliente)) d.duenoUsuario.nombre = d.dueno.nombre;
        pintar();
      }
      else if (x.id === "al-xlsx") {
        const archivo = x.files?.[0]; if (!archivo) return;
        let personas;
        try {
          const filasX = await leerXlsx(await archivo.arrayBuffer(), { fechas: COLUMNAS_FECHA });
          const r = trabajadoresDeFilas(filasX);
          if (r.error === "titulos") { aviso(t("plat.x_titulos"), "error"); return; }
          if (r.error) { aviso(t("plat.x_vacio"), "error"); return; }
          personas = r.personas;
        } catch { aviso(t("plat.x_no_excel"), "error"); return; }
        d.trab = personas.map((p) => ({ ...p, tarifa: p.tarifa || "" }));
        aviso(t("plat.x_leidas", { n: personas.length }));
        pintar();
      }
    } catch (e) { aviso(mensajeError(e), "error"); }
  });

  el.addEventListener("click", async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    const k = b.dataset;
    try {
      if (k.plNueva !== undefined) { d = nuevoAlta(); await cargarAlta(); modo = "alta"; pintar(); }
      else if (k.plCancelar !== undefined || k.plVolver !== undefined) { modo = "panel"; await cargar(); pintar(); }
      else if (k.plSig !== undefined) { d.error = validarPaso(); if (!d.error) d.paso += 1; pintar(); }
      else if (k.plAtras !== undefined) { d.error = ""; d.paso = Math.max(0, d.paso - 1); pintar(); }
      else if (k.plCrear !== undefined) await crear(b);
      else if (k.plAddt !== undefined) { d.trab.push({ fila: 0, nombre: "", oficio: "", tarifa: "", telefono: "", nib: "", nhip: "", permiso_numero: "", permiso_vence: "", licencia_numero: "", licencia_vence: "", errores: ["nombre", "tarifa"] }); pintar(); }
      else if (k.plAdd) {
        d[k.plAdd].push(k.plAdd === "obras" ? { nombre: "", direccion: "", presupuesto: "" } : { nombre: "", placa: "", tipo: "camioneta", conductor: "" });
        pintar();
      } else if (k.plQuitar) { const [l, i] = k.plQuitar.split(":"); d[l].splice(Number(i), 1); if (!d[l].length && l !== "trab") d[l].push(l === "obras" ? { nombre: "", direccion: "", presupuesto: "" } : { nombre: "", placa: "", tipo: "camioneta", conductor: "" }); pintar(); }
      else if (k.plPago) modalPago(filas.find((f) => f.empresa_id === k.plPago));
      else if (k.plUsuario) await modalUsuario(filas.find((f) => f.empresa_id === k.plUsuario));
      else if (k.plConfig) await modalConfig(filas.find((f) => f.empresa_id === k.plConfig));
      else if (k.plEditar) modalEditar(filas.find((f) => f.empresa_id === k.plEditar));
      else if (k.plSuspender) {
        const f = filas.find((x) => x.empresa_id === k.plSuspender);
        if (!(await confirmar(t("plat.susp_t"), t("plat.susp_txt", { nombre: f.nombre }), { peligro: true, boton: t("plat.suspender") }))) return;
        await api.rpc("plataforma_suspender", { p_empresa: f.empresa_id, p_suspender: true });
        aviso(t("plat.suspendida")); await cargar(); pintar();
      } else if (k.plActivar) {
        await api.rpc("plataforma_suspender", { p_empresa: k.plActivar, p_suspender: false });
        aviso(t("plat.activada")); await cargar(); pintar();
      } else if (k.plAsistir) {
        const nombre = filas.find((x) => x.empresa_id === k.plAsistir)?.nombre || d.empresa.nombre;
        if (!(await confirmar(t("plat.asistir_t"), t("plat.asistir_txt", { nombre }), { boton: t("plat.asistir") }))) return;
        await api.rpc("plataforma_entrar", { p_empresa: k.plAsistir });
        ctx.perfil = null; location.hash = "#/nomina"; recargarVista();
      } else if (k.plCopiar !== undefined) {
        const texto = claves().map((f) => f.join(" · ")).join("\n");
        try { await navigator.clipboard.writeText(texto); aviso(t("plat.res_copiado")); } catch { aviso(t("plat.res_no_copio"), "error"); }
      } else if (k.plCsv !== undefined) {
        const url = URL.createObjectURL(new Blob([csvClaves()], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a"); a.href = url; a.download = `claves-${d.empresa.nombre.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } else if (k.plImprimir !== undefined) window.print();
    } catch (e) { aviso(mensajeError(e), "error"); }
  });

  await cargar();
  pintar();
}
