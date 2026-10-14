// Gastos (admin y supervisor) y resumen de solo lectura de todas las compañías (dueño y admin).
import { api } from "../api.js";
import { t } from "../i18n.js";
import {
  html, dinero, fmtDia, hoyLocal, nombreMes, aviso, mensajeError, ocupado, abrirModal, cerrarModal, datosFormulario,
} from "../ui.js";

const CATEGORIAS = ["materiales", "herramientas", "poliza", "transporte", "subcontrato", "otros"];

// ---------------------------------------------------------------------------
// Gastos de la compañía activa
// ---------------------------------------------------------------------------
export async function vistaGastos(el, ctx) {
  const esAdmin = ctx.roles.includes("admin");
  const yo = ctx.perfil.id;
  const emp = ctx.empresa.id;

  const cargarProyectos = async () => {
    if (esAdmin) {
      return api.sel("proyectos", `select=id,nombre&empresa_id=eq.${emp}&activo=eq.true&order=nombre.asc`);
    }
    const filas = await api.sel("proyecto_supervisores", `select=proyectos(id,nombre,activo)&perfil_id=eq.${yo}&empresa_id=eq.${emp}`);
    return filas.map((f) => f.proyectos).filter((p) => p && p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre));
  };

  const cargar = async () => {
    const [proyectos, gastos] = await Promise.all([
      cargarProyectos(),
      api.sel("gastos", "select=id,proyecto_id,categoria,monto,fecha,descripcion,proveedor,anulado,anulado_motivo,proyectos(nombre)&order=fecha.desc,creado_en.desc&limit=100"),
    ]);
    const hoy = hoyLocal();
    el.innerHTML = String(html`
      <div class="titulo-vista"><h1>${t("gastos.titulo")}</h1></div>
      <section class="tarjeta">
        <h2>${t("gastos.nuevo")}</h2>
        ${!esAdmin && !proyectos.length ? html`<div class="vacio">${t("gastos.sin_proyectos")}</div>` : html`
        <form class="form" id="form-gasto" novalidate>
          <div class="campo"><label for="g-proyecto">${t("gastos.proyecto")}</label>
            <select id="g-proyecto" name="proyecto">
              ${esAdmin ? html`<option value="">${t("gastos.general")}</option>` : ""}
              ${proyectos.map((p) => html`<option value="${p.id}">${p.nombre}</option>`)}
            </select></div>
          <div class="campo"><label for="g-categoria">${t("gastos.categoria")}</label>
            <select id="g-categoria" name="categoria">${CATEGORIAS.map((c) => html`<option value="${c}">${t(`gastos.cat_${c}`)}</option>`)}</select></div>
          <div class="dos-col">
            <div class="campo"><label for="g-monto">${t("gastos.monto")}</label><input id="g-monto" name="monto" type="number" min="0.01" step="0.01" inputmode="decimal" required></div>
            <div class="campo"><label for="g-fecha">${t("gastos.fecha")}</label><input id="g-fecha" name="fecha" type="date" value="${hoy}" required></div>
          </div>
          <div class="campo"><label for="g-proveedor">${t("gastos.proveedor")}</label><input id="g-proveedor" name="proveedor" maxlength="80" autocomplete="off"></div>
          <div class="campo"><label for="g-desc">${t("gastos.descripcion")}</label><input id="g-desc" name="descripcion" maxlength="200" autocomplete="off"></div>
          <p class="error-form" role="alert" hidden></p>
          <button type="submit" class="btn btn-pri btn-grande">${t("gastos.guardar")}</button>
        </form>`}
        ${esAdmin ? "" : html`<p class="nota">${t("gastos.nota_sup")}</p>`}
      </section>
      <section class="seccion">
        <h2>${t(esAdmin ? "gastos.lista_admin" : "gastos.lista_sup")}</h2>
        ${gastos.length ? html`<div class="tabla-caja" role="region" aria-label="${t("gastos.titulo")}" tabindex="0">
          <table class="tabla"><thead><tr>
            <th scope="col">${t("gastos.fecha")}</th><th scope="col">${t("gastos.proyecto")}</th><th scope="col">${t("gastos.categoria")}</th>
            <th scope="col">${t("gastos.proveedor")}</th><th scope="col" class="num">${t("gastos.monto")}</th>
            <th scope="col"><span class="oculto">${t("comun.acciones")}</span></th></tr></thead>
            <tbody>${gastos.map((g) => html`<tr class="${g.anulado ? "inactivo" : ""}">
              <td>${fmtDia(g.fecha, { day: "numeric", month: "short" })}</td>
              <td>${g.proyectos?.nombre || t("gastos.general")}</td>
              <td>${t(`gastos.cat_${g.categoria}`)}${g.descripcion ? html`<div class="sub">${g.descripcion}</div>` : ""}</td>
              <td>${g.proveedor || ""}</td>
              <td class="num mono">${dinero(g.monto)}</td>
              <td>${g.anulado ? html`<span class="pildora" title="${g.anulado_motivo || ""}">${t("gastos.anulado")}</span>`
                : esAdmin ? html`<button type="button" class="btn btn-sec btn-chico" data-anular="${g.id}">${t("gastos.anular")}</button>` : ""}</td>
            </tr>`)}</tbody></table></div>` : html`<div class="vacio">${t("gastos.vacio")}</div>`}
      </section>`);
  };

  el.addEventListener("submit", async (ev) => {
    if (ev.target.id !== "form-gasto") return;
    ev.preventDefault();
    const f = ev.target;
    const err = f.querySelector(".error-form");
    const fallo = (m) => { err.hidden = false; err.textContent = m; };
    const v = datosFormulario(f);
    const monto = Number(v.monto);
    if (!v.monto || Number.isNaN(monto) || monto <= 0) return fallo(t("gastos.monto_invalido"));
    if (!esAdmin && !v.proyecto) return fallo(t("gastos.falta_proyecto"));
    try {
      await ocupado(f.querySelector("[type=submit]"), () => api.rpc("registrar_gasto", {
        p_proyecto: v.proyecto || null, p_categoria: v.categoria, p_monto: monto, p_fecha: v.fecha,
        p_descripcion: v.descripcion || null, p_proveedor: v.proveedor || null,
      }));
      aviso(t("gastos.guardado"));
      await cargar();
    } catch (e) { fallo(mensajeError(e)); }
  });

  el.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-anular]");
    if (!b) return;
    const id = b.dataset.anular;
    const d = abrirModal(t("gastos.anular"), html`
      <form class="form" novalidate>
        <div class="campo"><label for="a-motivo">${t("gastos.motivo")}</label><input id="a-motivo" name="motivo" required maxlength="200" autocomplete="off"></div>
        <p class="error-form" role="alert" hidden></p>
        <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
          <button type="submit" class="btn btn-peligro">${t("gastos.anular")}</button></div>
      </form>`);
    const f = d.querySelector("form");
    f.addEventListener("submit", async (e2) => {
      e2.preventDefault();
      const err = f.querySelector(".error-form");
      try {
        await ocupado(f.querySelector("[type=submit]"), () => api.rpc("anular_gasto", { p_id: id, p_motivo: f.motivo.value }));
        cerrarModal(); aviso(t("gastos.anulado_ok")); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  });

  await cargar();
}

// ---------------------------------------------------------------------------
// Las compañías: solo lectura, siempre separadas por compañía
// ---------------------------------------------------------------------------
const COLUMNAS = [
  ["mano_obra", "comp.mano_obra"],
  ["seguros", "comp.seguros"],
  ["materiales", "comp.materiales"],
  ["herramientas", "comp.herramientas"],
  ["otros", "comp.otros"],
];
const GRUPO = {
  mano_obra: "mano_obra", nib_empleador: "seguros", nhip_empleador: "seguros",
  materiales: "materiales", herramientas: "herramientas", poliza: "otros", transporte: "otros", subcontrato: "otros", otros: "otros",
};

function ultimosMeses(n = 12) {
  const hoy = hoyLocal();
  let [y, m] = hoy.split("-").map(Number);
  const lista = [];
  for (let i = 0; i < n; i++) {
    lista.push({ y, m, clave: `${y}-${String(m).padStart(2, "0")}` });
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return lista;
}
function rangoMes({ y, m }) {
  const pad = (x) => String(x).padStart(2, "0");
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${y}-${pad(m)}-01`, hasta: `${y}-${pad(m)}-${pad(ultimo)}` };
}

export async function vistaCompanias(el, ctx) {
  const meses = ultimosMeses(12);
  let mes = meses[0];
  const color = (i) => (i % 2 === 0 ? "pildora-info" : "pildora-aviso");

  const cargar = async () => {
    const { desde, hasta } = rangoMes(mes);
    const [filas, equipo] = await Promise.all([
      api.rpc("resumen_empresas", { p_desde: desde, p_hasta: hasta }),
      api.rpc("equipo_empresas", {}),
    ]);
    const porEmpresa = ctx.empresas.map((e, i) => {
      const propias = filas.filter((f) => f.empresa_id === e.id);
      const proyectos = new Map();
      propias.forEach((f) => {
        const clave = f.proyecto_id || "_";
        if (!proyectos.has(clave)) proyectos.set(clave, { nombre: f.proyecto || t("comp.sin_proyecto"), val: {} });
        const col = GRUPO[f.concepto] || "otros";
        const p = proyectos.get(clave);
        p.val[col] = (p.val[col] || 0) + Number(f.monto);
      });
      const lista = [...proyectos.values()].map((p) => ({ ...p, total: Object.values(p.val).reduce((a, b) => a + b, 0) }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
      const eq = equipo.filter((f) => f.empresa_id === e.id);
      const tot = eq.find((f) => f.tipo === "total") || {};
      const sinAsignar = (eq.find((f) => f.tipo === "sin_asignar") || {}).trabajadores || 0;
      const porProyecto = eq.filter((f) => f.tipo === "proyecto").sort((a, b) => a.nombre.localeCompare(b.nombre));
      const porSupervisor = eq.filter((f) => f.tipo === "supervisor").sort((a, b) => a.nombre.localeCompare(b.nombre));
      return { ...e, i, lista, total: lista.reduce((a, p) => a + p.total, 0), tot, sinAsignar, porProyecto, porSupervisor };
    });
    const suma = porEmpresa.reduce((a, e) => a + e.total, 0);
    el.innerHTML = String(html`
      <div class="titulo-vista">
        <div><div class="sobre">${t("comp.sobre")}</div><h1>${t("comp.titulo")}</h1></div>
        <div class="acciones">
          <span class="pildora">${t("dueno.solo_lectura")}</span>
          <label class="selector-semana"><span class="oculto">${t("comp.mes")}</span>
            <select id="mes" aria-label="${t("comp.mes")}">
              ${meses.map((x) => html`<option value="${x.clave}" ${x.clave === mes.clave ? html`selected` : ""}>${nombreMes(x.m)} ${x.y}</option>`)}
            </select></label>
        </div>
      </div>
      <div class="kpis">
        ${porEmpresa.map((e) => html`<div class="kpi"><div class="sub"><span class="pildora ${color(e.i)}">${e.nombre}</span></div>
          <div class="num verde">${dinero(e.total)}</div><div class="sub">${t("comp.pagado")}</div></div>`)}
        <div class="kpi"><div class="sub">${t("comp.suma")}</div><div class="num">${dinero(suma)}</div><div class="sub">${t("comp.suma_nota")}</div></div>
      </div>
      ${porEmpresa.map((e) => html`
        <section class="seccion">
          <h2>${t("comp.por_proyecto", { empresa: e.nombre })}</h2>
          ${e.lista.length ? html`<div class="tabla-caja" role="region" aria-label="${e.nombre}" tabindex="0">
            <table class="tabla"><thead><tr>
              <th scope="col">${t("comp.proyecto")}</th>
              ${COLUMNAS.map(([, k]) => html`<th scope="col" class="num">${t(k)}</th>`)}
              <th scope="col" class="num">${t("comp.total")}</th></tr></thead>
              <tbody>${e.lista.map((p) => html`<tr>
                <th scope="row">${p.nombre}</th>
                ${COLUMNAS.map(([c]) => html`<td class="num mono">${p.val[c] ? dinero(p.val[c]) : "—"}</td>`)}
                <td class="num mono fuerte">${dinero(p.total)}</td></tr>`)}</tbody></table></div>` : html`<div class="vacio">${t("comp.vacio")}</div>`}
        </section>
        <section class="seccion">
          <h2>${t("comp.equipo", { empresa: e.nombre })}</h2>
          <div class="kpis">
            <div class="kpi"><div class="sub">${t("comp.eq_trabajadores")}</div><div class="num">${e.tot.trabajadores || 0}</div></div>
            <div class="kpi"><div class="sub">${t("comp.eq_supervisores")}</div><div class="num">${e.tot.supervisores || 0}</div></div>
            <div class="kpi"><div class="sub">${t("comp.eq_proyectos")}</div><div class="num">${e.tot.proyectos || 0}</div></div>
            <div class="kpi"><div class="sub">${t("comp.eq_sin_asignar")}</div><div class="num">${e.sinAsignar}</div></div>
          </div>
          ${e.porProyecto.length ? html`<div class="tabla-caja" role="region" aria-label="${t("comp.eq_col_proyecto")} · ${e.nombre}" tabindex="0">
            <table class="tabla"><thead><tr><th scope="col">${t("comp.eq_col_proyecto")}</th>
              <th scope="col" class="num">${t("comp.eq_col_trab")}</th><th scope="col" class="num">${t("comp.eq_col_sup")}</th></tr></thead>
              <tbody>${e.porProyecto.map((p) => html`<tr><th scope="row">${p.nombre}</th>
                <td class="num mono">${p.trabajadores}</td><td class="num mono">${p.supervisores}</td></tr>`)}</tbody></table></div>` : ""}
          ${e.porSupervisor.length ? html`<div class="tabla-caja" role="region" aria-label="${t("comp.eq_col_supervisor")} · ${e.nombre}" tabindex="0">
            <table class="tabla"><thead><tr><th scope="col">${t("comp.eq_col_supervisor")}</th>
              <th scope="col" class="num">${t("comp.eq_col_proys")}</th><th scope="col" class="num">${t("comp.eq_col_acargo")}</th></tr></thead>
              <tbody>${e.porSupervisor.map((p) => html`<tr><th scope="row">${p.nombre}</th>
                <td class="num mono">${p.proyectos}</td><td class="num mono">${p.trabajadores}</td></tr>`)}</tbody></table></div>` : html`<div class="vacio">${t("comp.eq_sin_sup")}</div>`}
        </section>`)}
      <p class="nota">${t("comp.nota")} ${t("comp.eq_nota")}</p>`);
    el.querySelector("#mes").addEventListener("change", (ev) => {
      mes = meses.find((x) => x.clave === ev.target.value);
      cargar().catch((e) => aviso(mensajeError(e), "error"));
    });
  };
  await cargar();
}
