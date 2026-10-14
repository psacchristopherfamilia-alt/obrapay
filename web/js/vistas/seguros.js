// Seguros de ley (NIB y NHIP): remesa mensual, permisos sin registro NHIP, salario mínimo y tasas.
// Admin edita; dueño solo lee. Usa lo que ya existe en la base: tasas_estatutarias, reporte_remesa, pendientes_registro_nhip,
// cambiar_tasa_estatutaria y actualizar_datos_estatutarios (migración 20261013000006).
import { api } from "../api.js";
import { t } from "../i18n.js";
import {
  html, crudo, dinero, fmtDia, hoyLocal, nombreMes, aviso, mensajeError, ocupado, abrirModal, cerrarModal, ICONO,
} from "../ui.js";
import { crearXlsx, descargar } from "../xlsx.js";

const AGENCIAS = ["NIB", "NHIP"];
const r2 = (n) => Math.round(Number(n) * 100) / 100;

export async function vistaSeguros(el, ctx) {
  const hoy = hoyLocal();
  const esAdmin = ctx.roles.includes("admin");
  let anio = Number(hoy.slice(0, 4));
  let mes = Number(hoy.slice(5, 7));
  let remesa = []; let pendientes = []; let tasas = []; let perfiles = []; let tarifas = [];

  const tasaVigente = (ag) => tasas.filter((x) => x.agencia === ag && x.vigente_desde <= hoy)
    .sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : -1))[0];
  const tarifaVigente = (id) => tarifas.filter((x) => x.perfil_id === id && x.vigente_desde <= hoy)
    .sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : -1))[0];
  const suma = (campo) => remesa.reduce((a, x) => a + Number(x[campo] || 0), 0);
  const resumen = () => AGENCIAS.map((ag) => {
    const k = ag.toLowerCase();
    return {
      agencia: ag, empleado: suma(`${k}_empleado`), empleador: suma(`${k}_empleador`), total: suma(`${k}_total`),
      trabajadores: remesa.filter((x) => Number(x[`base_${k}`]) > 0).length, vence: remesa[0]?.[`vence_${k}`],
    };
  });

  const cargar = async () => {
    [remesa, pendientes, tasas, perfiles, tarifas] = await Promise.all([
      api.rpc("reporte_remesa", { p_anio: anio, p_mes: mes }),
      api.rpc("pendientes_registro_nhip"),
      api.sel("tasas_estatutarias", "select=*&order=vigente_desde.desc"),
      api.sel("perfiles", "select=id,nombre,roles,activo,numero_nib,numero_nhip,permiso_trabajo_aprobado&activo=eq.true&order=nombre"),
      api.sel("tarifas", "select=perfil_id,monto_hora,vigente_desde"),
    ]);
    perfiles = perfiles.filter((p) => p.roles.includes("trabajador"));
    pintar();
  };

  const pintar = () => {
    const anios = []; for (let a = 2026; a <= Number(hoy.slice(0, 4)) + 1; a++) anios.push(a);
    const minimo = Number(ctx.empresa.salario_minimo_hora || 0);
    const bajos = perfiles.map((p) => ({ nombre: p.nombre, tarifa: tarifaVigente(p.id)?.monto_hora }))
      .filter((x) => x.tarifa !== undefined && Number(x.tarifa) < minimo);
    const res = resumen();
    const fecha = (d) => fmtDia(d, { day: "numeric", month: "short", year: "numeric" });
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("seg.titulo")}</h1></div>
      <p class="nota">${t("seg.nota")}</p>

      <section class="tarjeta"><div class="titulo-vista"><h2>${t("seg.remesa")}</h2>
        <div class="acciones">
          <label><span class="oculto">${t("rep.mes")}</span><select id="mes" aria-label="${t("rep.mes")}">${Array.from({ length: 12 }, (_, i) => i + 1).map((m) => html`<option value="${m}" ${m === mes ? html`selected` : ""}>${nombreMes(m)}</option>`)}</select></label>
          <label><span class="oculto">${t("rep.anio")}</span><select id="anio" aria-label="${t("rep.anio")}">${anios.map((a) => html`<option ${a === anio ? html`selected` : ""}>${a}</option>`)}</select></label>
          <button type="button" class="btn btn-ok" id="excel" ${remesa.length ? "" : html`disabled`}>${crudo(ICONO.descarga)} ${t("comun.excel")}</button>
        </div></div>
        ${remesa.length ? html`<div class="tabla-caja" tabindex="0" role="region" aria-label="${t("seg.remesa")}"><table class="tabla">
          <thead><tr><th scope="col">${t("seg.agencia")}</th><th scope="col" class="num">${t("seg.empleado")}</th><th scope="col" class="num">${t("seg.empleador")}</th>
            <th scope="col" class="num">${t("seg.total")}</th><th scope="col" class="num">${t("seg.trabajadores")}</th><th scope="col">${t("seg.vence")}</th></tr></thead>
          <tbody>${res.map((x) => html`<tr><th scope="row">${x.agencia}</th><td class="num mono">${dinero(x.empleado)}</td><td class="num mono">${dinero(x.empleador)}</td>
            <td class="num mono fuerte">${dinero(x.total)}</td><td class="num mono">${x.trabajadores}</td>
            <td>${x.vence ? fecha(x.vence) : "—"}</td></tr>`)}</tbody></table></div>
          <h3 class="etiqueta">${t("seg.detalle")}</h3>
          <div class="tabla-caja" tabindex="0" role="region" aria-label="${t("seg.detalle")}"><table class="tabla">
          <thead><tr><th scope="col">${t("col.trabajador")}</th><th scope="col" class="num">${t("seg.base_nib")}</th><th scope="col" class="num">NIB</th>
            <th scope="col" class="num">${t("seg.base_nhip")}</th><th scope="col" class="num">NHIP</th></tr></thead>
          <tbody>${remesa.map((x) => html`<tr><th scope="row">${x.nombre}</th><td class="num mono">${dinero(x.base_nib)}</td><td class="num mono">${dinero(x.nib_total)}</td>
            <td class="num mono">${dinero(x.base_nhip)}</td><td class="num mono">${dinero(x.nhip_total)}</td></tr>`)}</tbody></table></div>`
          : html`<p class="vacio">${t("seg.remesa_vacia")}</p>`}
      </section>

      <section class="tarjeta"><h2>${t("seg.brecha")}</h2><p class="nota">${t("seg.brecha_nota")}</p>
        ${pendientes.length ? html`<div class="tabla-caja" tabindex="0" role="region" aria-label="${t("seg.brecha")}"><table class="tabla">
          <thead><tr><th scope="col">${t("col.trabajador")}</th><th scope="col">${t("seg.permiso")}</th><th scope="col" class="num">${t("seg.semanas")}</th><th scope="col" class="num">${t("seg.acumulado")}</th></tr></thead>
          <tbody>${pendientes.map((b) => html`<tr><th scope="row">${b.nombre}</th>
            <td>${fecha(b.permiso_trabajo_aprobado)}</td><td class="num mono">${b.semanas}</td>
            <td class="num mono rojo">${dinero(b.nhip_acumulado)}</td></tr>`)}</tbody></table></div>`
          : html`<p class="vacio">${t("seg.brecha_vacia")}</p>`}</section>

      <section class="tarjeta"><h2>${t("seg.minimo")}</h2>
        <p class="nota">${minimo ? t("seg.minimo_valor", { minimo: dinero(minimo) }) : ""}</p>
        ${bajos.length ? html`<ul class="historial">${bajos.map((b) => html`<li><span>${b.nombre}</span><span class="mono rojo">${dinero(b.tarifa)}/h</span></li>`)}</ul>`
          : html`<p class="vacio">${t("seg.minimo_vacia")}</p>`}</section>

      <section class="tarjeta"><h2>${t("seg.tasas")}</h2>
        <div class="tabla-caja" tabindex="0" role="region" aria-label="${t("seg.tasas")}"><table class="tabla">
          <thead><tr><th scope="col">${t("seg.agencia")}</th><th scope="col" class="num">${t("seg.pct_empleado")}</th><th scope="col" class="num">${t("seg.pct_empleador")}</th>
            <th scope="col" class="num">${t("seg.tope")}</th><th scope="col" class="num">${t("seg.dia")}</th><th scope="col">${t("seg.desde")}</th>${esAdmin ? html`<th scope="col"><span class="oculto">${t("comun.acciones")}</span></th>` : ""}</tr></thead>
          <tbody>${AGENCIAS.map((ag) => { const x = tasaVigente(ag); return x ? html`<tr><th scope="row">${ag}</th><td class="num mono">${Number(x.tasa_empleado)}%</td><td class="num mono">${Number(x.tasa_empleador)}%</td>
            <td class="num mono">${dinero(x.tope_mensual)}</td><td class="num mono">${x.dia_vencimiento}</td>
            <td>${fecha(x.vigente_desde)}</td>
            ${esAdmin ? html`<td><button type="button" class="btn btn-sec btn-chico" data-tasa="${ag}">${t("seg.cambiar")}</button></td>` : ""}</tr>` : ""; })}</tbody></table></div>
      </section>

      <section class="tarjeta"><h2>${t("seg.trabajadores_datos")}</h2><p class="nota">${t("seg.nota_datos")}</p>
        <div class="tabla-caja" tabindex="0" role="region" aria-label="${t("seg.trabajadores_datos")}"><table class="tabla">
          <thead><tr><th scope="col">${t("col.trabajador")}</th><th scope="col">${t("seg.nib_num")}</th><th scope="col">${t("seg.nhip_num")}</th><th scope="col">${t("seg.permiso")}</th>${esAdmin ? html`<th scope="col"><span class="oculto">${t("comun.acciones")}</span></th>` : ""}</tr></thead>
          <tbody>${perfiles.map((p) => html`<tr><th scope="row">${p.nombre}</th>
            <td class="mono">${p.numero_nib || "—"}</td><td class="mono">${p.numero_nhip || "—"}</td>
            <td>${p.permiso_trabajo_aprobado ? fecha(p.permiso_trabajo_aprobado) : "—"}</td>
            ${esAdmin ? html`<td><button type="button" class="btn btn-sec btn-chico" data-datos="${p.id}">${t("seg.editar")}</button></td>` : ""}</tr>`)}</tbody></table></div>
      </section>`);
  };

  const modalTasa = (ag) => {
    const x = tasaVigente(ag) || {};
    const d = abrirModal(t("seg.cambiar_tasa", { agencia: ag }), html`
      <form class="form" novalidate>
        <div class="dos-col">
          <div class="campo"><label for="s-emp">${t("seg.pct_empleado")}</label><input id="s-emp" name="emp" type="number" step="0.01" min="0" max="100" required value="${x.tasa_empleado ?? 0}" inputmode="decimal"></div>
          <div class="campo"><label for="s-er">${t("seg.pct_empleador")}</label><input id="s-er" name="er" type="number" step="0.01" min="0" max="100" required value="${x.tasa_empleador ?? 0}" inputmode="decimal"></div>
        </div>
        <div class="dos-col">
          <div class="campo"><label for="s-tope">${t("seg.tope")}</label><input id="s-tope" name="tope" type="number" step="0.01" min="0.01" required value="${x.tope_mensual ?? ""}" inputmode="decimal"></div>
          <div class="campo"><label for="s-dia">${t("seg.dia")}</label><input id="s-dia" name="dia" type="number" step="1" min="1" max="28" required value="${x.dia_vencimiento ?? 15}" inputmode="numeric"></div>
        </div>
        <div class="campo"><label for="s-desde">${t("seg.desde")}</label><input id="s-desde" name="desde" type="date" required value="${hoy}"></div>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("comun.guardar")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector(".error-form");
      const emp = Number(f.emp.value); const er = Number(f.er.value); const dia = Number(f.dia.value);
      const tope = Number(f.tope.value);
      if (Number.isNaN(emp) || Number.isNaN(er) || emp < 0 || er < 0 || emp > 100 || er > 100 || !(dia >= 1 && dia <= 28) || !(tope > 0)) {
        err.hidden = false; err.textContent = t("seg.valor_invalido"); return;
      }
      try {
        await ocupado(f.querySelector("[type=submit]"), () => api.rpc("cambiar_tasa_estatutaria", {
          p_agencia: ag, p_desde: f.desde.value, p_tasa_empleado: emp, p_tasa_empleador: er, p_tope_mensual: tope, p_dia_vencimiento: dia }));
        cerrarModal(); aviso(t("comun.guardado")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  const modalDatos = (perfilId) => {
    const p = perfiles.find((x) => x.id === perfilId);
    const d = abrirModal(p.nombre, html`
      <form class="form" novalidate>
        <div class="dos-col">
          <div class="campo"><label for="d-nib">${t("seg.nib_num")}</label><input id="d-nib" name="nib" maxlength="40" value="${p.numero_nib || ""}"></div>
          <div class="campo"><label for="d-nhip">${t("seg.nhip_num")}</label><input id="d-nhip" name="nhip" maxlength="40" value="${p.numero_nhip || ""}"></div>
        </div>
        <div class="campo"><label for="d-perm">${t("seg.permiso")}</label><input id="d-perm" name="perm" type="date" value="${p.permiso_trabajo_aprobado || ""}"></div>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-pri">${t("comun.guardar")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector(".error-form");
      try {
        await ocupado(f.querySelector("[type=submit]"), () => api.rpc("actualizar_datos_estatutarios", {
          p_perfil: perfilId, p_numero_nib: f.nib.value, p_numero_nhip: f.nhip.value, p_permiso_aprobado: f.perm.value || null }));
        cerrarModal(); aviso(t("comun.guardado")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };

  el.addEventListener("change", (ev) => {
    if (ev.target.id === "mes") mes = Number(ev.target.value);
    if (ev.target.id === "anio") anio = Number(ev.target.value);
    if (ev.target.id === "mes" || ev.target.id === "anio") cargar().catch((e) => aviso(mensajeError(e), "error"));
  });
  el.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.dataset.tasa) modalTasa(b.dataset.tasa);
    if (b.dataset.datos) modalDatos(b.dataset.datos);
    if (b.id === "excel") {
      const res = resumen();
      descargar(crearXlsx([
        { nombre: t("seg.remesa"), columnas: [{ titulo: t("seg.agencia"), ancho: 14 }, { titulo: t("seg.empleado"), tipo: "dinero" },
          { titulo: t("seg.empleador"), tipo: "dinero" }, { titulo: t("seg.total"), tipo: "dinero" }, { titulo: t("seg.trabajadores"), tipo: "numero" }, { titulo: t("seg.vence"), ancho: 14 }],
          filas: res.map((x) => [x.agencia, r2(x.empleado), r2(x.empleador), r2(x.total), x.trabajadores, x.vence || ""]) },
        { nombre: t("seg.detalle_excel"), columnas: [{ titulo: t("col.trabajador"), ancho: 26 }, { titulo: t("seg.nib_num"), ancho: 16 }, { titulo: t("seg.nhip_num"), ancho: 16 },
          { titulo: t("seg.base_nib"), tipo: "dinero" }, { titulo: `NIB ${t("seg.empleado")}`, tipo: "dinero" }, { titulo: `NIB ${t("seg.empleador")}`, tipo: "dinero" },
          { titulo: t("seg.base_nhip"), tipo: "dinero" }, { titulo: `NHIP ${t("seg.empleado")}`, tipo: "dinero" }, { titulo: `NHIP ${t("seg.empleador")}`, tipo: "dinero" }],
          filas: remesa.map((x) => [x.nombre, x.numero_nib || "", x.numero_nhip || "", r2(x.base_nib), r2(x.nib_empleado), r2(x.nib_empleador),
            r2(x.base_nhip), r2(x.nhip_empleado), r2(x.nhip_empleador)]) },
      ]), `remesa_${anio}-${String(mes).padStart(2, "0")}.xlsx`);
    }
  });
  await cargar();
}
