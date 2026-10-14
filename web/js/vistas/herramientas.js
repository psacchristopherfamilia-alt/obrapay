// Inventario de herramientas por compañía: admin (todo), supervisor (lo que tiene a cargo) y dueño (solo lectura).
import { api } from "../api.js";
import { t } from "../i18n.js";
import {
  html, dinero, fmtFechaHora, aviso, mensajeError, ocupado, abrirModal, cerrarModal, datosFormulario,
} from "../ui.js";

const ESTADOS = ["bueno", "danado", "perdido", "baja"];
const PILDORA = { bueno: "pildora-ok", danado: "pildora-aviso", perdido: "pildora-error", baja: "" };
const MOVS = ["creada", "editada", "a_supervisor", "al_almacen", "a_trabajador", "recibida", "estado", "prestada", "devuelta_a_duena"];

export async function vistaHerramientas(el, ctx) {
  const esAdmin = ctx.roles.includes("admin");
  const esSup = ctx.roles.includes("supervisor");
  const soloLectura = !esAdmin && !esSup;
  const yo = ctx.perfil.id;
  const filtro = { estado: "activas", cargo: "todos", q: "" };
  let filas = [];
  let personas = [];

  const efectiva = (h) => h.empresa_uso_id || h.empresa_id;
  const nombreEmpresa = (h) => h.empresa_uso || h.empresa;
  const soyDuena = (h) => ctx.empresas.some((e) => e.id === h.empresa_id);

  const cargar = async () => {
    [filas, personas] = await Promise.all([
      api.rpc("herramientas_inventario", {}),
      soloLectura ? Promise.resolve([]) : api.rpc("herramientas_personas", {}),
    ]);
    pintar();
  };

  const visibles = () => {
    const q = filtro.q.trim().toLowerCase();
    return filas.filter((h) => {
      if (filtro.estado === "activas" ? h.estado === "baja" : h.estado !== filtro.estado) return false;
      if (filtro.cargo === "ninguno" && (h.supervisor_id || h.trabajador_id)) return false;
      if (filtro.cargo !== "todos" && filtro.cargo !== "ninguno" && h.supervisor_id !== filtro.cargo) return false;
      if (q && !`${h.nombre} ${h.codigo || ""} ${h.supervisor || ""} ${h.trabajador || ""} ${h.proyecto || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  };

  const puedeEncargar = (h) => (esAdmin && h.supervisor_id) || (esSup && h.supervisor_id === yo);
  const puedeEstado = (h) => h.estado !== "baja" && (esAdmin || (esSup && h.supervisor_id === yo));

  const movil = () => window.matchMedia("(max-width: 700px)").matches;
  const botones = (h) => html`<div class="acciones-fila" style="flex-wrap: wrap; ${movil() ? "justify-content: flex-start; margin-top: 8px" : ""}">
      ${esAdmin && !["perdido", "baja"].includes(h.estado) ? html`<button type="button" class="btn btn-sec btn-chico" data-asignar="${h.id}">${t("herr.asignar")}</button>` : ""}
      ${puedeEncargar(h) && !["perdido", "baja"].includes(h.estado) ? html`<button type="button" class="btn btn-sec btn-chico" data-encargar="${h.id}">${t("herr.encargar")}</button>` : ""}
      ${puedeEstado(h) ? html`<button type="button" class="btn btn-sec btn-chico" data-estado="${h.id}">${t("herr.estado")}</button>` : ""}
      ${esAdmin && ctx.empresas.length > 1 && soyDuena(h) && !["perdido", "baja"].includes(h.estado) ? html`<button type="button" class="btn btn-sec btn-chico" data-prestar="${h.id}">${t("herr.compartir")}</button>` : ""}
      ${esAdmin && soyDuena(h) && h.estado !== "baja" ? html`<button type="button" class="btn btn-sec btn-chico" data-editar="${h.id}">${t("herr.editar")}</button>` : ""}
      <button type="button" class="btn btn-fantasma btn-chico" data-historial="${h.id}">${t("herr.historial")}</button>
    </div>`;

  // En pantallas angostas los botones van bajo el nombre para no esconderse al lado de la tabla.
  const fila = (h) => html`<tr class="${h.estado === "baja" ? "inactivo" : ""}">
    <th scope="row">${h.nombre}${h.codigo ? html`<div class="sub mono">${h.codigo}</div>` : ""}
      ${h.empresa_uso_id ? html`<div class="sub"><span class="pildora pildora-info">${t("herr.de", { empresa: h.empresa })}</span></div>` : ""}
      ${movil() ? botones(h) : ""}</th>
    <td><span class="pildora ${PILDORA[h.estado]}">${t(`herr.est_${h.estado}`)}</span></td>
    <td>${h.supervisor ? html`${h.supervisor}${h.trabajador ? html`<div class="sub">→ ${h.trabajador}</div>` : ""}`
      : h.trabajador ? h.trabajador : html`<span class="sub">${t("herr.almacen")}</span>`}</td>
    <td>${h.proyecto || ""}</td>
    <td class="num mono">${h.valor !== null && h.valor !== undefined ? dinero(h.valor) : "—"}</td>
    <td>${movil() ? "" : botones(h)}</td></tr>`;

  const pintar = () => {
    const lista = visibles();
    const supervisores = [...new Map(filas.filter((h) => h.supervisor_id).map((h) => [h.supervisor_id, h.supervisor])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]));
    const empresas = esAdmin || ctx.roles.includes("dueno")
      ? ctx.empresas.map((e) => ({ id: e.id, nombre: e.nombre }))
      : [...new Map(filas.map((h) => [efectiva(h), nombreEmpresa(h)])).entries()].map(([id, nombre]) => ({ id, nombre }));
    const color = (i) => (i % 2 === 0 ? "pildora-info" : "pildora-aviso");
    el.innerHTML = String(html`
      <div class="titulo-vista">
        <div><div class="sobre">${t("herr.sobre")}</div><h1>${t("herr.titulo")}</h1></div>
        <div class="acciones">
          ${soloLectura ? html`<span class="pildora">${t("dueno.solo_lectura")}</span>` : ""}
          ${esAdmin ? html`<button type="button" class="btn btn-pri" id="nueva">${t("herr.nueva")}</button>` : ""}
        </div>
      </div>
      <div class="filtros acciones" style="display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end">
        <label class="selector-semana"><span class="oculto">${t("herr.f_estado")}</span>
          <select id="f-estado" aria-label="${t("herr.f_estado")}">
            <option value="activas" ${filtro.estado === "activas" ? html`selected` : ""}>${t("herr.f_activas")}</option>
            ${ESTADOS.map((s) => html`<option value="${s}" ${filtro.estado === s ? html`selected` : ""}>${t(`herr.est_${s}`)}</option>`)}
          </select></label>
        <label class="selector-semana"><span class="oculto">${t("herr.f_cargo")}</span>
          <select id="f-cargo" aria-label="${t("herr.f_cargo")}">
            <option value="todos">${t("herr.f_todos")}</option>
            <option value="ninguno" ${filtro.cargo === "ninguno" ? html`selected` : ""}>${t("herr.f_sin_asignar")}</option>
            ${supervisores.map(([id, nombre]) => html`<option value="${id}" ${filtro.cargo === id ? html`selected` : ""}>${nombre}</option>`)}
          </select></label>
        <label class="selector-semana"><span class="oculto">${t("herr.buscar")}</span>
          <input id="f-q" type="search" placeholder="${t("herr.buscar")}" value="${filtro.q}" autocomplete="off" style="min-height:36px; padding:4px 10px; font-size:13px"></label>
      </div>
      ${empresas.map((e, i) => {
        const todas = filas.filter((h) => efectiva(h) === e.id && h.estado !== "baja");
        const propias = lista.filter((h) => efectiva(h) === e.id);
        const valor = todas.reduce((a, h) => a + Number(h.valor || 0), 0);
        const n = (s) => todas.filter((h) => h.estado === s).length;
        return html`<section class="seccion">
          <h2>${t("herr.por_empresa", { empresa: e.nombre })}</h2>
          <div class="kpis">
            <div class="kpi"><div class="sub"><span class="pildora ${color(i)}">${e.nombre}</span></div><div class="num">${todas.length}</div><div class="sub">${t("herr.kpi_total")}</div></div>
            <div class="kpi"><div class="sub">${t("herr.kpi_valor")}</div><div class="num">${dinero(valor)}</div></div>
            <div class="kpi"><div class="sub">${t("herr.kpi_buenas")}</div><div class="num verde">${n("bueno")}</div></div>
            <div class="kpi"><div class="sub">${t("herr.kpi_danadas")}</div><div class="num">${n("danado")}</div></div>
            <div class="kpi"><div class="sub">${t("herr.kpi_perdidas")}</div><div class="num">${n("perdido")}</div></div>
          </div>
          ${propias.length ? html`<div class="tabla-caja" role="region" aria-label="${e.nombre}" tabindex="0">
            <table class="tabla"><thead><tr>
              <th scope="col">${t("herr.col_herr")}</th><th scope="col">${t("herr.col_estado")}</th>
              <th scope="col">${t("herr.col_cargo")}</th><th scope="col">${t("herr.col_proy")}</th>
              <th scope="col" class="num">${t("herr.col_valor")}</th><th scope="col"><span class="oculto">${t("comun.acciones")}</span></th></tr></thead>
              <tbody>${propias.map(fila)}</tbody></table></div>`
            : html`<div class="vacio">${t(esAdmin || !esSup ? "herr.vacio" : "herr.vacio_sup")}</div>`}
        </section>`;
      })}
      ${esSup && !esAdmin ? html`<p class="nota">${t("herr.nota_sup")}</p>` : ""}`);
    enlazar();
  };

  const enlazar = () => {
    el.querySelector("#f-estado")?.addEventListener("change", (ev) => { filtro.estado = ev.target.value; pintar(); });
    el.querySelector("#f-cargo")?.addEventListener("change", (ev) => { filtro.cargo = ev.target.value; pintar(); });
    el.querySelector("#f-q")?.addEventListener("input", (ev) => {
      filtro.q = ev.target.value; pintar();
      const q = el.querySelector("#f-q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length);
    });
    el.querySelector("#nueva")?.addEventListener("click", () => formulario(null));
    el.querySelectorAll("[data-editar]").forEach((b) => b.addEventListener("click", () => formulario(buscar(b.dataset.editar))));
    el.querySelectorAll("[data-asignar]").forEach((b) => b.addEventListener("click", () => asignar(buscar(b.dataset.asignar))));
    el.querySelectorAll("[data-encargar]").forEach((b) => b.addEventListener("click", () => encargar(buscar(b.dataset.encargar))));
    el.querySelectorAll("[data-estado]").forEach((b) => b.addEventListener("click", () => estado(buscar(b.dataset.estado))));
    el.querySelectorAll("[data-prestar]").forEach((b) => b.addEventListener("click", () => prestar(buscar(b.dataset.prestar))));
    el.querySelectorAll("[data-historial]").forEach((b) => b.addEventListener("click", () => historial(buscar(b.dataset.historial))));
  };
  const buscar = (id) => filas.find((h) => h.id === id);

  // Envía el formulario de un modal; muestra el error dentro del mismo modal.
  const enviar = (d, accion, mensaje) => {
    const f = d.querySelector("form");
    f.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector(".error-form");
      try {
        await ocupado(f.querySelector("[type=submit]"), () => accion(datosFormulario(f)));
        cerrarModal(); aviso(t(mensaje)); await cargar();
      } catch (e) { err.hidden = false; err.textContent = mensajeError(e); }
    });
  };
  const pie = (boton, peligro = false) => html`<p class="error-form" role="alert" hidden></p>
    <div class="acciones-modal"><button type="button" class="btn btn-sec" data-cerrar>${t("comun.cancelar")}</button>
      <button type="submit" class="btn ${peligro ? "btn-peligro" : "btn-pri"}">${boton}</button></div>`;

  const formulario = (h) => {
    const d = abrirModal(t(h ? "herr.editar_titulo" : "herr.nueva_titulo"), html`
      <form class="form" novalidate>
        ${!h && ctx.empresas.length > 1 ? html`<div class="campo"><label for="h-emp">${t("herr.empresa")}</label>
          <select id="h-emp" name="empresa">${ctx.empresas.map((e) => html`<option value="${e.id}" ${e.id === ctx.empresa.id ? html`selected` : ""}>${e.nombre}</option>`)}</select></div>` : ""}
        <div class="campo"><label for="h-nombre">${t("herr.nombre")}</label><input id="h-nombre" name="nombre" required maxlength="120" autocomplete="off" value="${h ? h.nombre : ""}"></div>
        <div class="dos-col">
          <div class="campo"><label for="h-codigo">${t("herr.codigo")}</label><input id="h-codigo" name="codigo" maxlength="60" autocomplete="off" value="${h?.codigo || ""}"></div>
          <div class="campo"><label for="h-valor">${t("herr.valor")}</label><input id="h-valor" name="valor" type="number" min="0" step="0.01" inputmode="decimal" value="${h && h.valor !== null ? h.valor : ""}"></div>
        </div>
        <div class="campo"><label for="h-notas">${t("herr.notas")}</label><input id="h-notas" name="notas" maxlength="500" autocomplete="off" value="${h?.notas || ""}"></div>
        ${pie(t("herr.guardar"))}
      </form>`);
    enviar(d, (v) => {
      const valor = v.valor === "" || v.valor === undefined ? null : Number(v.valor);
      const base = { p_nombre: v.nombre, p_codigo: v.codigo || null, p_valor: valor, p_notas: v.notas || null };
      return h ? api.rpc("editar_herramienta", { p_id: h.id, ...base })
        : api.rpc("crear_herramienta", { ...base, p_empresa: v.empresa || ctx.empresa.id });
    }, "herr.guardada");
  };

  const asignar = (h) => {
    const emp = efectiva(h);
    const sups = personas.filter((p) => p.empresa_id === emp && p.tipo === "supervisor");
    const proys = personas.filter((p) => p.empresa_id === emp && p.tipo === "proyecto");
    const d = abrirModal(t("herr.asignar_titulo"), html`
      <form class="form" novalidate>
        <p class="pequeno">${h.nombre} · ${nombreEmpresa(h)}</p>
        <div class="campo"><label for="a-sup">${t("herr.supervisor")}</label>
          <select id="a-sup" name="supervisor"><option value="">${t("herr.sin_sup")}</option>
            ${sups.map((p) => html`<option value="${p.id}" ${p.id === h.supervisor_id ? html`selected` : ""}>${p.nombre}</option>`)}</select></div>
        <div class="campo"><label for="a-proy">${t("herr.proyecto")}</label>
          <select id="a-proy" name="proyecto"><option value="">${t("herr.sin_proy")}</option>
            ${proys.map((p) => html`<option value="${p.id}" ${p.id === h.proyecto_id ? html`selected` : ""}>${p.nombre}</option>`)}</select></div>
        ${pie(t("herr.guardar"))}
      </form>`);
    enviar(d, (v) => api.rpc("herramienta_a_supervisor", { p_id: h.id, p_supervisor: v.supervisor || null, p_proyecto: v.proyecto || null }), "herr.asignada");
  };

  const encargar = (h) => {
    const emp = efectiva(h);
    const unicos = [...new Map(personas.filter((p) => p.empresa_id === emp && p.tipo === "trabajador").map((p) => [p.id, p])).values()]
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    const d = abrirModal(t("herr.encargar_titulo"), html`
      <form class="form" novalidate>
        <p class="pequeno">${h.nombre}${h.trabajador ? html` · ${h.trabajador}` : ""}</p>
        ${unicos.length ? html`<div class="campo"><label for="e-trab">${t("herr.trabajador")}</label>
          <select id="e-trab" name="trabajador">
            ${h.trabajador_id ? html`<option value="">${t("herr.sin_trab")}</option>` : ""}
            ${unicos.map((p) => html`<option value="${p.id}" ${p.id === h.trabajador_id ? html`selected` : ""}>${p.nombre}</option>`)}</select></div>`
          : html`<div class="vacio">${t("herr.sin_trabajadores")}</div>`}
        ${pie(t("herr.guardar"))}
      </form>`);
    enviar(d, (v) => api.rpc("herramienta_a_trabajador", { p_id: h.id, p_trabajador: v.trabajador || null }), "herr.encargada");
  };

  const estado = (h) => {
    const permitidos = ESTADOS.filter((s) => s !== h.estado && (s !== "baja" || (esAdmin && soyDuena(h))));
    const d = abrirModal(t("herr.estado_titulo"), html`
      <form class="form" novalidate>
        <p class="pequeno">${h.nombre} · ${t(`herr.est_${h.estado}`)}</p>
        <div class="campo"><label for="s-estado">${t("herr.nuevo_estado")}</label>
          <select id="s-estado" name="estado">${permitidos.map((s) => html`<option value="${s}">${t(`herr.est_${s}`)}</option>`)}</select></div>
        <div class="campo"><label for="s-nota">${t("herr.nota")}</label><input id="s-nota" name="nota" maxlength="200" autocomplete="off">
          <p class="pequeno">${t("herr.nota_ayuda")}</p></div>
        ${pie(t("herr.guardar"))}
      </form>`);
    enviar(d, (v) => api.rpc("herramienta_estado", { p_id: h.id, p_estado: v.estado, p_nota: v.nota || null }), "herr.estado_ok");
  };

  const prestar = (h) => {
    const otras = ctx.empresas.filter((e) => e.id !== h.empresa_id);
    const d = abrirModal(t("herr.compartir_titulo"), html`
      <form class="form" novalidate>
        <p class="pequeno">${h.nombre} · ${t("herr.de", { empresa: h.empresa })}</p>
        <div class="campo"><label for="p-dest">${t("herr.destino")}</label>
          <select id="p-dest" name="destino">
            ${h.empresa_uso_id ? html`<option value="">${t("herr.volver")}</option>` : ""}
            ${otras.filter((e) => e.id !== h.empresa_uso_id).map((e) => html`<option value="${e.id}">${e.nombre}</option>`)}</select></div>
        <p class="pequeno">${t("herr.compartir_nota")}</p>
        ${pie(t("herr.guardar"))}
      </form>`);
    enviar(d, (v) => api.rpc("compartir_herramienta", { p_id: h.id, p_empresa: v.destino || null }), "herr.compartida");
  };

  const historial = async (h) => {
    const d = abrirModal(t("herr.historial_titulo", { nombre: h.nombre }), html`<div class="esqueleto"><div></div><div></div></div>`, { ancho: 560 });
    try {
      const movs = await api.rpc("herramienta_movimientos", { p_id: h.id });
      d.querySelector(".modal-cuerpo").innerHTML = String(movs.length ? html`<ul class="lista-simple">
        ${movs.map((m) => html`<li><strong>${MOVS.includes(m.tipo) ? t(`herr.mov_${m.tipo}`) : m.tipo}</strong>
          ${m.tipo === "estado" && m.detalle?.despues ? html` · ${t(`herr.est_${m.detalle.despues}`)}` : ""}
          <div class="sub">${fmtFechaHora(m.creado_en)}${m.por ? ` · ${m.por}` : ""}</div>
          ${m.nota ? html`<div class="pequeno">${m.nota}</div>` : ""}</li>`)}</ul>` : html`<div class="vacio">${t("herr.sin_historial")}</div>`);
    } catch (e) { d.querySelector(".modal-cuerpo").textContent = mensajeError(e); }
  };

  await cargar();
}
