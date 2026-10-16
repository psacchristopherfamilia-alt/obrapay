// Recorre la app en Chromium con un Supabase simulado: cada rol, cada pantalla, móvil y escritorio.
// Falla si hay errores de JavaScript, textos sin traducir o llamadas inesperadas. Guarda capturas.
// Uso: node tests/web/simulado.mjs [carpeta-capturas]
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";

const require = createRequire("/home/claude/.npm-global/lib/node_modules/@playwright/mcp/");
const { chromium } = require("playwright");

const WEB = new URL("../../web/", import.meta.url).pathname;
const CAPTURAS = process.argv[2] || new URL("./capturas/", import.meta.url).pathname;
const SUPA = "https://pxsutkiiwqjevgfvvewb.supabase.co";

// ---------------------------------------------------------------------------
// Servidor estático
// ---------------------------------------------------------------------------
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const servidor = createServer(async (req, res) => {
  const ruta = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^\/+/, "") || "index.html";
  try {
    const datos = await readFile(join(WEB, ruta));
    res.writeHead(200, { "Content-Type": TIPOS[extname(ruta)] || "application/octet-stream" });
    res.end(datos);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((ok) => servidor.listen(0, ok));
const BASE = `http://localhost:${servidor.address().port}/`;

// ---------------------------------------------------------------------------
// Datos del escenario (los del prototipo)
// ---------------------------------------------------------------------------
const id = (s) => `00000000-0000-0000-0000-0000000000${s}`;
const EMP = { id: id("e1"), nombre: "Mi empresa", zona_horaria: "America/Grand_Turk", gps_activo: false, gps_modo: "marcar",
  hora_extra_desde: "17:00:00", hora_cierre_turno: "23:00:00", almuerzo_inicio: "12:00:00", almuerzo_fin: "13:00:00" };
const EMP2 = { id: id("e2"), nombre: "Current Ltd" };
const MIS_EMPRESAS = [{ id: EMP2.id, nombre: EMP2.nombre, zona_horaria: EMP.zona_horaria, activa: false }, { id: EMP.id, nombre: EMP.nombre, zona_horaria: EMP.zona_horaria, activa: true }];
const P = {
  admin: { id: id("a1"), usuario: "admin", nombre: "Administración", oficio: null, roles: ["admin"] },
  dueno: { id: id("d1"), usuario: "dueno", nombre: "Dueño", oficio: null, roles: ["dueno"] },
  ramon: { id: id("b1"), usuario: "ramon.gomez", nombre: "Ramón Gómez", oficio: "Supervisor", roles: ["supervisor"] },
  juan: { id: id("c1"), usuario: "juan.perez", nombre: "Juan Pérez", oficio: "Plomero", roles: ["trabajador"] },
  marie: { id: id("c2"), usuario: "marie.joseph", nombre: "Marie Joseph", oficio: "Electricista", roles: ["trabajador"] },
  pedro: { id: id("c5"), usuario: "pedro.santos", nombre: "Pedro Santos", oficio: "Carpintero", roles: ["trabajador"] },
  nuevo: { id: id("c9"), usuario: "nuevo.uno", nombre: "Nuevo Uno", oficio: "Ayudante", roles: ["trabajador"] },
};
Object.values(P).forEach((p) => Object.assign(p, { empresa_id: EMP.id, idioma: "es", activo: true, debe_cambiar_clave: false }));
P.nuevo.debe_cambiar_clave = true;
const PROY = [
  { id: id("f1"), empresa_id: EMP.id, nombre: "Villa Grace Bay", direccion: "Grace Bay", lat: 21.796, lng: -72.17, radio_m: 150, activo: true },
  { id: id("f2"), empresa_id: EMP.id, nombre: "Leeward Plaza", direccion: null, lat: null, lng: null, radio_m: 150, activo: true },
];
const SEM = [
  { id: id("s2"), empresa_id: EMP.id, inicio: "2026-10-08", fin: "2026-10-14", estado: "abierta", reabierta: false },
  { id: id("s1"), empresa_id: EMP.id, inicio: "2026-10-01", fin: "2026-10-07", estado: "cerrada", reabierta: false },
  { id: id("s0"), empresa_id: EMP.id, inicio: "2026-09-24", fin: "2026-09-30", estado: "pagada", reabierta: false },
];
const nombreProy = (pid) => { const p = PROY.find((x) => x.id === pid); return { nombre: p.nombre, empresa_id: p.empresa_id }; };
const turno = (tid, perfil, proy, entrada, salida, estado, extra = {}) => ({
  id: id(tid), empresa_id: EMP.id, perfil_id: perfil.id, proyecto_id: proy, entrada, salida, estado,
  fuera_de_area: false, cierre_automatico: false, corregido: false, semana_id: null,
  perfiles: { nombre: perfil.nombre, usuario: perfil.usuario }, proyectos: nombreProy(proy), ...extra,
});
const TURNOS = [
  turno("t1", P.juan, id("f1"), "2026-10-08T11:00:00Z", "2026-10-08T22:10:00Z", "por_aprobar", { marca_diferida: true }),
  turno("t2", P.marie, id("f2"), "2026-10-08T11:15:00Z", "2026-10-08T19:30:00Z", "por_aprobar"),
  turno("t3", P.pedro, id("f1"), "2026-10-08T10:58:00Z", "2026-10-09T03:00:00Z", "por_aprobar", { cierre_automatico: true }),
  turno("t4", P.juan, id("f1"), "2026-10-09T11:00:00Z", "2026-10-09T19:00:00Z", "aprobado"),
  turno("t5", P.marie, id("f2"), "2026-10-10T11:00:00Z", null, "abierto"),
];
const TARIFAS = [
  { perfil_id: P.juan.id, monto_hora: 17, vigente_desde: "2026-09-01" }, { perfil_id: P.juan.id, monto_hora: 18, vigente_desde: "2026-10-01" },
  { perfil_id: P.marie.id, monto_hora: 20, vigente_desde: "2026-09-01" }, { perfil_id: P.pedro.id, monto_hora: 17, vigente_desde: "2026-09-01" },
];
const SEGUROS = [P.juan, P.marie, P.pedro].map((p) => ({ perfil_id: p.id, porcentaje: 3, vigente_desde: "2026-09-01" }));
const NOMINA = {
  [id("s1")]: [
    { perfil_id: P.juan.id, nombre: "Juan Pérez", oficio: "Plomero", minutos_reg: 2400, minutos_extra: 360, tarifa: 18, bruto: 828, seguro_pct: 0, seguro: 70.38, prestamo: 50, neto: 707.62, con_aprobacion_admin: false, estado_semana: "cerrada" },
    { perfil_id: P.marie.id, nombre: "Marie Joseph", oficio: "Electricista", minutos_reg: 2400, minutos_extra: 120, tarifa: 20, bruto: 840, seguro_pct: 0, seguro: 71.4, prestamo: 0, neto: 768.6, con_aprobacion_admin: true, estado_semana: "cerrada" },
  ],
  [id("s2")]: [
    { perfil_id: P.juan.id, nombre: "Juan Pérez", oficio: "Plomero", minutos_reg: 420, minutos_extra: 0, tarifa: 18, bruto: 126, seguro_pct: 0, seguro: 10.71, prestamo: 0, neto: 115.29, con_aprobacion_admin: false, estado_semana: "abierta" },
  ],
  [id("s0")]: [],
};
const NOMINA_PROY = {
  [id("s1")]: [
    { perfil_id: P.juan.id, proyecto_id: id("f1"), proyecto: "Villa Grace Bay", minutos_reg: 1500, minutos_extra: 180, bruto: 504 },
    { perfil_id: P.juan.id, proyecto_id: id("f2"), proyecto: "Leeward Plaza", minutos_reg: 900, minutos_extra: 180, bruto: 324 },
    { perfil_id: P.marie.id, proyecto_id: id("f2"), proyecto: "Leeward Plaza", minutos_reg: 2400, minutos_extra: 120, bruto: 840 },
  ],
  [id("s2")]: [{ perfil_id: P.juan.id, proyecto_id: id("f1"), proyecto: "Villa Grace Bay", minutos_reg: 420, minutos_extra: 0, bruto: 126 }],
  [id("s0")]: [],
};
const PRESTAMOS = [{ id: id("l1"), empresa_id: EMP.id, perfil_id: P.juan.id, monto_total: 600, fecha: "2026-09-03", nota: null, activo: true, perfiles: { nombre: "Juan Pérez" } }];
const DESCUENTOS = [{ prestamo_id: id("l1"), semana_id: id("s1"), monto: 50 }, { prestamo_id: id("l1"), semana_id: id("s0"), monto: 200 }];
const AVISOS_ADMIN = [
  { id: id("na1"), perfil_id: P.admin.id, tipo: "remesa_por_vencer", datos: { agencia: "NHIP", vence: "2026-11-14", mes: "2026-10", total: 1006, dias: 3 }, leida: false, creado_en: "2026-11-11T13:00:00Z" },
  { id: id("na2"), perfil_id: P.admin.id, tipo: "semana_por_cerrar", datos: { inicio: "2026-10-08", fin: "2026-10-14" }, leida: false, creado_en: "2026-10-14T13:00:00Z" },
  { id: id("na3"), perfil_id: P.admin.id, tipo: "turnos_sin_aprobar", datos: { n: 3 }, leida: false, creado_en: "2026-10-14T13:00:00Z" },
  { id: id("na4"), perfil_id: P.admin.id, tipo: "tope_seguro", datos: { agencia: "NIB", nombre: "Juan <b>Pérez</b>" }, leida: false, creado_en: "2026-10-14T13:00:00Z" },
  { id: id("na5"), perfil_id: P.admin.id, tipo: "documento_por_vencer", datos: { documento: "d1", doc_tipo: "permiso_trabajo", quien: "Marie <i>Joseph</i>", vence: "2026-11-05", dias: 20 }, leida: false, creado_en: "2026-10-15T13:00:00Z" },
  { id: id("na6"), perfil_id: P.admin.id, tipo: "mantenimiento_vehiculo", datos: { plan: "p1", servicio: "Cambio de <u>aceite</u>", quien: "Toyota Hilux 01 · TCI 4821", por: "fecha", dias: 10 }, leida: false, creado_en: "2026-10-15T13:10:00Z" },
];
const sumar = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const DOCUMENTOS = [
  { id: id("d1"), empresa_id: EMP.id, tipo: "permiso_trabajo", perfil_id: P.juan.id, titulo: null, numero: "WP-2024-01877", vence: sumar(20), archivo_path: `${EMP.id}/a.pdf`, archivo_nombre: "permiso_juan.pdf", activo: true },
  { id: id("d2"), empresa_id: EMP.id, tipo: "licencia_construccion", perfil_id: null, titulo: "Licencia Grace Bay", numero: "BL-77120", vence: sumar(-4), archivo_path: null, archivo_nombre: null, activo: true },
  { id: id("d3"), empresa_id: EMP.id, tipo: "licencia_conducir", perfil_id: P.marie.id, titulo: null, numero: "DL-1", vence: sumar(200), archivo_path: null, archivo_nombre: null, activo: true },
  { id: id("d4"), empresa_id: EMP.id, tipo: "seguro_vehiculo", perfil_id: null, vehiculo_id: id("v1"), titulo: null, numero: "POL-77120", vence: sumar(-4), archivo_path: null, archivo_nombre: null, activo: true },
  { id: id("d5"), empresa_id: EMP.id, tipo: "inspeccion_vehiculo", perfil_id: null, vehiculo_id: id("v1"), titulo: null, numero: "INS-9", vence: sumar(200), archivo_path: null, archivo_nombre: null, activo: true },
  { id: id("d6"), empresa_id: EMP.id, tipo: "registro_vehiculo", perfil_id: null, vehiculo_id: id("v2"), titulo: null, numero: "REG-4", vence: sumar(100), archivo_path: null, archivo_nombre: null, activo: true },
];
const VEHICULOS = [
  { id: id("v1"), empresa_id: EMP.id, nombre: "Toyota Hilux 01", placa: "TCI 4821", tipo: "camioneta", marca: "Toyota", modelo: "Hilux", anio: 2021, vin: "MR0FB8CD600123456", foto_path: null, foto_nombre: null, conductor_id: P.juan.id, millas: 48600, millas_en: "2026-10-14T12:00:00Z", activo: true },
  { id: id("v2"), empresa_id: EMP.id, nombre: "Ford Transit", placa: "TCI 3310", tipo: "van", marca: "Ford", modelo: "Transit", anio: 2019, vin: null, foto_path: null, foto_nombre: null, conductor_id: null, millas: 1200, millas_en: "2026-10-01T12:00:00Z", activo: true },
];
const PLANES = [
  { id: id("p1"), empresa_id: EMP.id, vehiculo_id: id("v1"), nombre: "Cambio de aceite", cada_millas: 5000, cada_dias: 90, ultimo_fecha: sumar(-80), ultimo_millas: 45900, activo: true },
  { id: id("p2"), empresa_id: EMP.id, vehiculo_id: id("v1"), nombre: "Rotación de llantas", cada_millas: 5000, cada_dias: null, ultimo_fecha: sumar(-30), ultimo_millas: 44000, activo: true },
  { id: id("p3"), empresa_id: EMP.id, vehiculo_id: id("v2"), nombre: "Frenos", cada_millas: 20000, cada_dias: null, ultimo_fecha: sumar(-30), ultimo_millas: 0, activo: true },
];
const SERVICIOS = [{ id: id("sv1"), vehiculo_id: id("v1"), plan_id: id("p1"), nombre: "Cambio de aceite", fecha: sumar(-80), millas: 45900, costo: 92.5, notas: "Aceite 5W-30" }];
const AVISOS = [{ id: id("n1"), perfil_id: P.juan.id, tipo: "cambio_tarifa", datos: { antes: 17, despues: 18, desde: "2026-10-01" }, leida: false, creado_en: "2026-10-01T12:00:00Z" }];

// ---------------------------------------------------------------------------
// Supabase simulado
// ---------------------------------------------------------------------------
const RED = { caido: false }; // true = sin señal: todas las llamadas a Supabase fallan
function simulador(quien, llamadas) {
  const filtrar = (filas, qs) => {
    const p = new URLSearchParams(qs);
    let r = filas;
    for (const [k, v] of p.entries()) {
      if (["select", "order", "limit"].includes(k)) continue;
      if (v.startsWith("eq.")) r = r.filter((x) => String(x[k]) === v.slice(3));
      else if (v.startsWith("neq.")) r = r.filter((x) => String(x[k]) !== v.slice(4));
      else if (v === "is.null") r = r.filter((x) => x[k] === null || x[k] === undefined);
      else if (v.startsWith("in.(")) { const set = v.slice(4, -1).split(","); r = r.filter((x) => set.includes(String(x[k]))); }
    }
    return r;
  };
  const RPC = {
    semana_actual: () => id("s2"),
    mis_empresas: () => MIS_EMPRESAS,
    mis_ajustes_empresas: () => MIS_EMPRESAS.map((e) => ({ empresa_id: e.id, zona_horaria: EMP.zona_horaria, hora_extra_desde: "17:00", almuerzo_inicio: "12:00", almuerzo_fin: "13:00", gps_activo: false, gps_modo: "marcar" })),
    elegir_empresa: () => null,
    mi_pago: () => [
      { empresa_id: EMP2.id, empresa: EMP2.nombre, semana_id: id("t1"), estado_semana: "cerrada", minutos_reg: 240, minutos_extra: 0, tarifa: 18, bruto: 72, seguro: 6.12, prestamo: 10, neto: 55.88, proyectos: [{ proyecto: "Torre Sur", minutos: 240, bruto: 72 }], nib_empleado: 3.96, nhip_empleado: 2.16, nib_empleador: 4.68, nhip_empleador: 2.16 },
      { empresa_id: EMP.id, empresa: EMP.nombre, semana_id: id("s1"), estado_semana: "cerrada", minutos_reg: 120, minutos_extra: 0, tarifa: 20, bruto: 40, seguro: 3.4, prestamo: 0, neto: 36.6, proyectos: [{ proyecto: "Villa Grace Bay", minutos: 120, bruto: 40 }], nib_empleado: 2.2, nhip_empleado: 1.2, nib_empleador: 2.6, nhip_empleador: 1.2 }],
    resumen_empresas: () => [
      { empresa_id: EMP2.id, empresa: EMP2.nombre, proyecto_id: id("g1"), proyecto: "Torre Sur", concepto: "mano_obra", monto: 4100 },
      { empresa_id: EMP2.id, empresa: EMP2.nombre, proyecto_id: null, proyecto: null, concepto: "nib_empleador", monto: 420 },
      { empresa_id: EMP2.id, empresa: EMP2.nombre, proyecto_id: id("g1"), proyecto: "Torre Sur", concepto: "materiales", monto: 1250 },
      { empresa_id: EMP.id, empresa: EMP.nombre, proyecto_id: id("f1"), proyecto: "Villa Grace Bay", concepto: "mano_obra", monto: 6300 },
      { empresa_id: EMP.id, empresa: EMP.nombre, proyecto_id: null, proyecto: null, concepto: "poliza", monto: 900 }],
    equipo_empresas: () => [
      { empresa_id: EMP2.id, tipo: "total", proyecto_id: null, perfil_id: null, nombre: null, trabajadores: 3, supervisores: 1, proyectos: 1 },
      { empresa_id: EMP2.id, tipo: "sin_asignar", proyecto_id: null, perfil_id: null, nombre: null, trabajadores: 2, supervisores: null, proyectos: null },
      { empresa_id: EMP2.id, tipo: "proyecto", proyecto_id: id("g1"), perfil_id: null, nombre: "Torre Sur", trabajadores: 3, supervisores: 1, proyectos: null },
      { empresa_id: EMP2.id, tipo: "supervisor", proyecto_id: null, perfil_id: id("b1"), nombre: "Ramón Gómez", trabajadores: 3, supervisores: null, proyectos: 1 },
      { empresa_id: EMP.id, tipo: "total", proyecto_id: null, perfil_id: null, nombre: null, trabajadores: 1, supervisores: 0, proyectos: 1 },
      { empresa_id: EMP.id, tipo: "sin_asignar", proyecto_id: null, perfil_id: null, nombre: null, trabajadores: 0, supervisores: null, proyectos: null },
      { empresa_id: EMP.id, tipo: "proyecto", proyecto_id: id("f1"), perfil_id: null, nombre: "Villa Grace Bay", trabajadores: 1, supervisores: 0, proyectos: null }],
    herramientas_inventario: () => {
      const todas = [
        { id: id("h1"), empresa_id: EMP.id, empresa: EMP.nombre, nombre: "Taladro percutor", codigo: "TAL-01", valor: 120, notas: null, estado: "bueno", empresa_uso_id: null, empresa_uso: null, supervisor_id: P.ramon.id, supervisor: "Ramón Gómez", trabajador_id: P.juan.id, trabajador: "Juan Pérez", proyecto_id: id("f1"), proyecto: "Villa Grace Bay", creado_en: "2026-10-01T12:00:00Z" },
        { id: id("h2"), empresa_id: EMP.id, empresa: EMP.nombre, nombre: "Escalera de 12 pies", codigo: null, valor: 85, notas: null, estado: "danado", empresa_uso_id: null, empresa_uso: null, supervisor_id: P.ramon.id, supervisor: "Ramón Gómez", trabajador_id: null, trabajador: null, proyecto_id: id("f1"), proyecto: "Villa Grace Bay", creado_en: "2026-10-01T12:00:00Z" },
        { id: id("h3"), empresa_id: EMP.id, empresa: EMP.nombre, nombre: "Amoladora", codigo: "AMO-02", valor: 60, notas: null, estado: "perdido", empresa_uso_id: null, empresa_uso: null, supervisor_id: P.ramon.id, supervisor: "Ramón Gómez", trabajador_id: null, trabajador: null, proyecto_id: null, proyecto: null, creado_en: "2026-10-01T12:00:00Z" },
        { id: id("h4"), empresa_id: EMP2.id, empresa: EMP2.nombre, nombre: "Compresor de aire", codigo: "COM-07", valor: 340, notas: null, estado: "bueno", empresa_uso_id: EMP.id, empresa_uso: EMP.nombre, supervisor_id: null, supervisor: null, trabajador_id: null, trabajador: null, proyecto_id: null, proyecto: null, creado_en: "2026-10-02T12:00:00Z" },
        { id: id("h5"), empresa_id: EMP2.id, empresa: EMP2.nombre, nombre: "Nivel láser", codigo: null, valor: 150, notas: null, estado: "bueno", empresa_uso_id: null, empresa_uso: null, supervisor_id: null, supervisor: null, trabajador_id: null, trabajador: null, proyecto_id: null, proyecto: null, creado_en: "2026-10-03T12:00:00Z" }];
      return quien.roles.includes("supervisor") && !quien.roles.includes("admin") ? todas.slice(0, 3) : todas;
    },
    herramientas_personas: () => (quien.roles.includes("admin") ? [
      { empresa_id: EMP.id, tipo: "supervisor", id: P.ramon.id, nombre: "Ramón Gómez", proyecto_id: null },
      { empresa_id: EMP.id, tipo: "proyecto", id: id("f1"), nombre: "Villa Grace Bay", proyecto_id: null },
      { empresa_id: EMP.id, tipo: "trabajador", id: P.juan.id, nombre: "Juan Pérez", proyecto_id: null },
      { empresa_id: EMP2.id, tipo: "supervisor", id: id("b3"), nombre: "Supervisor dos", proyecto_id: null }]
      : [{ empresa_id: EMP.id, tipo: "trabajador", id: P.juan.id, nombre: "Juan Pérez", proyecto_id: id("f1") },
         { empresa_id: EMP.id, tipo: "trabajador", id: P.pedro.id, nombre: "Pedro Santos", proyecto_id: id("f1") }]),
    herramienta_movimientos: () => [
      { creado_en: "2026-10-03T15:00:00Z", tipo: "estado", nota: "Se cayó del andamio", por: "Ramón Gómez", detalle: { antes: "bueno", despues: "danado" } },
      { creado_en: "2026-10-01T12:00:00Z", tipo: "creada", nota: null, por: "Administración", detalle: {} }],
    nomina_semana: (a) => (quien.roles.some((r) => ["admin", "dueno"].includes(r)) ? NOMINA[a.p_semana] : NOMINA[a.p_semana].filter((n) => n.perfil_id === quien.id)),
    nomina_semana_proyectos: (a) => (quien.roles.some((r) => ["admin", "dueno"].includes(r)) ? NOMINA_PROY[a.p_semana] : NOMINA_PROY[a.p_semana].filter((n) => n.perfil_id === quien.id)),
    nomina_semana_estatutario: (a) => NOMINA[a.p_semana].map((n) => ({ perfil_id: n.perfil_id, nombre: n.nombre, bruto: n.bruto, nib_empleado: 10.11, nhip_empleado: 5.55, nib_empleador: 12.34, nhip_empleador: 5.55, estado_semana: n.estado_semana })),
    reporte_mensual: () => [{ perfil_id: P.juan.id, nombre: "Juan Pérez", semanas: 2, minutos_reg: 4800, minutos_extra: 400, bruto: 1600, seguro: 48, prestamo: 250, neto: 1302 }],
    reporte_remesa: () => [
      { perfil_id: P.juan.id, nombre: "Juan Pérez", numero_nib: "NIB-1", numero_nhip: null, base_nib: 1656, nib_empleado: 91.08, nib_empleador: 107.64, nib_total: 198.72,
        base_nhip: 1656, nhip_empleado: 49.68, nhip_empleador: 49.68, nhip_total: 99.36, vence_nib: "2026-11-15", vence_nhip: "2026-11-14" },
      { perfil_id: P.marie.id, nombre: "Marie Joseph", numero_nib: null, numero_nhip: null, base_nib: 1680, nib_empleado: 92.4, nib_empleador: 109.2, nib_total: 201.6,
        base_nhip: 1680, nhip_empleado: 50.4, nhip_empleador: 50.4, nhip_total: 100.8, vence_nib: "2026-11-15", vence_nhip: "2026-11-14" }],
    pendientes_registro_nhip: () => [{ perfil_id: P.pedro.id, nombre: "Pedro Santos", permiso_trabajo_aprobado: "2026-10-01", semanas: 2, nhip_acumulado: 468 }],
    reporte_semanas: () => [
      { semana_id: id("s2"), inicio: "2026-10-08", fin: "2026-10-14", estado: "abierta", pago: "2026-10-16", anio: 2026, mes: 10, nro: 3 },
      { semana_id: id("s1"), inicio: "2026-10-01", fin: "2026-10-07", estado: "cerrada", pago: "2026-10-09", anio: 2026, mes: 10, nro: 2 }],
    datos_empleador: (a) => [{ empresa_id: a.p_empresa, nombre: a.p_empresa === EMP2.id ? EMP2.nombre : EMP.nombre, nib_registro: "REG-123", nib_seguro: null, direccion: null, apartado: null, telefono: null }],
    guardar_datos_empleador: () => null,
    guardar_vehiculo: (a) => a.p_id || id("v3"),
    actualizar_nombre_legal: () => null,
    reporte_seguros: () => [
      { semana_id: id("s1"), inicio: "2026-10-01", fin: "2026-10-07", pago: "2026-10-09", nro: 2, perfil_id: P.juan.id, apellido: "Pérez", nombre: "Juan", inicial: null, nombre_completo: "Juan Pérez",
        numero_nib: "NIB-1", numero_nhip: null, bruto: 72, base_nib: 72, nib_empleado: 3.96, nib_empleador: 4.68, base_nhip: 72, nhip_empleado: 2.16, nhip_empleador: 2.16 },
      { semana_id: id("s1"), inicio: "2026-10-01", fin: "2026-10-07", pago: "2026-10-09", nro: 2, perfil_id: P.marie.id, apellido: "Joseph", nombre: "Marie", inicial: null, nombre_completo: "Marie Joseph",
        numero_nib: null, numero_nhip: null, bruto: 80, base_nib: 80, nib_empleado: 4.4, nib_empleador: 5.2, base_nhip: 80, nhip_empleado: 2.4, nhip_empleador: 2.4 }],
    reporte_proyectos_pagados: () => [
      { semana_id: id("s1"), inicio: "2026-10-01", fin: "2026-10-07", pago: "2026-10-09", nro: 2, proyecto_id: id("f1"), proyecto: "Villa Grace Bay", perfil_id: P.juan.id, trabajador: "Juan Pérez", minutos_reg: 240, minutos_extra: 0, bruto: 72 }],
    reporte_altas_bajas: () => [
      { tipo: "alta", perfil_id: P.juan.id, apellido: "Pérez", nombre: "Juan", inicial: null, nombre_completo: "Juan Pérez", numero_nib: "NIB-1", fecha: "2026-10-01" }],
    reporte_mensual_proyectos: () => [{ proyecto_id: id("f1"), proyecto: "Villa Grace Bay", minutos_reg: 3000, minutos_extra: 300, bruto: 990 }],
  };
  const TABLAS = {
    perfiles: () => (quien.roles.includes("admin") || quien.roles.includes("dueno") ? Object.values(P) : [quien, ...(quien.roles.includes("supervisor") ? [P.juan, P.pedro] : [])]),
    empresas: () => [EMP], proyectos: () => PROY, semanas: () => SEM,
    turnos: () => TURNOS.filter((x) => quien.roles.some((r) => ["admin", "dueno"].includes(r)) || x.perfil_id === quien.id || (quien.roles.includes("supervisor") && x.proyecto_id === id("f1"))),
    tarifas: () => TARIFAS, seguros: () => SEGUROS, notificaciones: () => (quien.roles.includes("admin") ? AVISOS_ADMIN : AVISOS),
    prestamos: () => PRESTAMOS, descuentos_prestamo: () => DESCUENTOS,
    proyecto_trabajadores: () => [{ proyecto_id: id("f1"), perfil_id: P.juan.id, proyectos: PROY[0] }, { proyecto_id: id("f2"), perfil_id: P.juan.id, proyectos: PROY[1] }, { proyecto_id: id("f9"), perfil_id: P.juan.id, proyectos: { id: id("f9"), empresa_id: EMP2.id, nombre: "Torre Sur", activo: true } }, { proyecto_id: id("f2"), perfil_id: P.marie.id, proyectos: PROY[1] }, { proyecto_id: id("f1"), perfil_id: P.pedro.id, proyectos: PROY[0] }],
    tasas_estatutarias: () => [
      { agencia: "NIB", tasa_empleado: 5.5, tasa_empleador: 6.5, tope_mensual: 6000, dia_vencimiento: 15, vigente_desde: "2026-01-01" },
      { agencia: "NHIP", tasa_empleado: 3, tasa_empleador: 3, tope_mensual: 7800, dia_vencimiento: 14, vigente_desde: "2026-01-01" }],
    gastos: () => [
      { id: id("x1"), proyecto_id: id("f1"), categoria: "materiales", monto: 120, fecha: "2026-10-14", descripcion: "Tubería PVC", proveedor: "Ferretería Island", anulado: false, anulado_motivo: null, proyectos: { nombre: "Villa Grace Bay" } },
      { id: id("x2"), proyecto_id: null, categoria: "poliza", monto: 900, fecha: "2026-10-01", descripcion: null, proveedor: "Aseguradora", anulado: true, anulado_motivo: "duplicado", proyectos: null }],
    documentos: () => DOCUMENTOS,
    vehiculos: () => (quien.roles.some((r) => ["admin", "dueno"].includes(r)) ? VEHICULOS : VEHICULOS.filter((x) => x.conductor_id === quien.id)),
    vehiculo_planes: () => (quien.roles.some((r) => ["admin", "dueno"].includes(r)) ? PLANES : PLANES.filter((x) => VEHICULOS.find((v) => v.id === x.vehiculo_id)?.conductor_id === quien.id)),
    vehiculo_servicios: () => (quien.roles.some((r) => ["admin", "dueno"].includes(r)) ? SERVICIOS : []),
    proyecto_supervisores: () => [{ empresa_id: EMP.id, proyecto_id: id("f1"), perfil_id: P.ramon.id, proyectos: PROY[0] }],
  };
  return async (route) => {
    if (RED.caido) return route.abort("internetdisconnected");
    const req = route.request();
    const url = new URL(req.url());
    const ruta = url.pathname;
    const cuerpo = req.postData() ? JSON.parse(req.postData()) : null;
    const json = (status, datos) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(datos), headers: { "access-control-allow-origin": "*" } });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    llamadas.push({ metodo: req.method(), ruta, qs: url.search, cuerpo });
    if (ruta === "/auth/v1/token") {
      if (cuerpo.password === "mala") return json(400, { error: "invalid_grant", error_description: "Invalid login credentials" });
      return json(200, { access_token: "tok", refresh_token: "ref", expires_in: 3600, user: { id: quien.id } });
    }
    if (ruta === "/auth/v1/user" || ruta === "/auth/v1/logout") return json(200, {});
    if (ruta.startsWith("/rest/v1/rpc/")) {
      const fn = ruta.split("/").pop();
      if (RPC[fn]) return json(200, RPC[fn](cuerpo || {}));
      if (fn === "aprobar_turnos") return json(200, cuerpo.p_ids.length);
      return json(200, null);
    }
    if (ruta.startsWith("/functions/v1/crear-trabajador")) return json(201, { perfil_id: id("c9"), usuario: cuerpo.usuario || "x", clave_temporal: "sol-mar-isla-42" });
    if (ruta.startsWith("/rest/v1/")) {
      const tabla = ruta.split("/").pop();
      if (req.method() === "GET") return json(200, filtrar((TABLAS[tabla] || (() => []))(), url.search.slice(1)));
      return json(200, Array.isArray(cuerpo) ? cuerpo : [cuerpo || {}]);
    }
    return json(404, { message: "no simulado" });
  };
}

// ---------------------------------------------------------------------------
// Recorrido
// ---------------------------------------------------------------------------
await mkdir(CAPTURAS, { recursive: true });
const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const fallas = [];
const RECORRIDOS = [
  { quien: P.juan, ancho: 390, alto: 844, rutas: ["reloj", "horas", "pago"], idiomas: ["es", "en", "ht"] },
  { quien: P.ramon, ancho: 390, alto: 844, rutas: ["aprobar", "gastos", "herramientas"], idiomas: ["es", "en", "ht"] },
  { quien: P.admin, ancho: 1360, alto: 900, rutas: ["nomina", "turnos", "trabajadores", "proyectos", "prestamos", "gastos", "herramientas", "companias", "reportes", "seguros", "vehiculos", "vencimientos", "contador", "ajustes"], idiomas: ["es", "en"] },
  { quien: P.admin, ancho: 390, alto: 844, rutas: ["nomina", "trabajadores", "herramientas", "vehiculos", "vencimientos"], idiomas: ["es"], sufijo: "-movil" },
  { quien: P.dueno, ancho: 1360, alto: 900, rutas: ["resumen", "companias", "herramientas", "reportes", "seguros", "vehiculos", "vencimientos", "contador"], idiomas: ["es", "en", "ht"] },
];

async function nuevaPagina(quien, ancho, alto, lang, llamadas) {
  const ctx = await navegador.newContext({ viewport: { width: ancho, height: alto }, timezoneId: "Asia/Tokyo", locale: "es-US", serviceWorkers: "block" });
  await ctx.addInitScript(([l, uid]) => {
    if (sessionStorage.getItem("prueba.iniciada")) return;
    sessionStorage.setItem("prueba.iniciada", "1");
    localStorage.setItem("obrapay.idioma", l);
    localStorage.setItem("obrapay.sesion", JSON.stringify({ access_token: "tok", refresh_token: "ref", expires_at: Math.floor(Date.now() / 1000) + 3600, user_id: uid }));
  }, [lang, quien.id]);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.route(`${SUPA}/**`, simulador({ ...quien, idioma: lang }, llamadas));
  const pagina = await ctx.newPage();
  const errores = [];
  pagina.on("pageerror", (e) => errores.push(String(e)));
  pagina.on("console", (m) => { if (m.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) errores.push(m.text()); });
  return { ctx, pagina, errores };
}

async function revisarPantalla(pagina, nombre, errores) {
  await pagina.waitForSelector(".esqueleto", { state: "detached", timeout: 8000 }).catch(() => {});
  await pagina.waitForTimeout(250);
  const texto = await pagina.evaluate(() => document.body.innerText);
  const sinTraducir = texto.match(/\b(?:[a-z]+)\.(?:[a-z_]+)\b/g)?.filter((x) => /^(nav|comun|err|acceso|clave|reloj|horas|pago|turno|turnos|aprobar|nomina|ciclo|col|excel|trab|proy|prest|rep|aj|dueno|estado|semana|rol|aviso|gastos|comp|emp|herr|cont|seg|veh|venc)\./.test(x)) || [];
  const llaves = texto.match(/\{[a-z_]+\}/g) || [];
  const errorVista = await pagina.$(".error-vista");
  if (!(await pagina.$("#vista"))) fallas.push(`${nombre}: no cargó la vista (¿pantalla de entrar?)`);
  const desborde = await pagina.evaluate(() => {
    if (document.documentElement.scrollWidth <= window.innerWidth + 1) return false;
    const culpables = [...document.querySelectorAll("body *")].filter((e) => {
      const r = e.getBoundingClientRect();
      return r.right > window.innerWidth + 1 && !(e.parentElement && e.parentElement.closest(".tabla-caja, .nav-lista"));
    }).slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")} (${Math.round(e.getBoundingClientRect().right)}px)`);
    return culpables.join(", ") || "sin culpable visible";
  });
  if (sinTraducir.length) fallas.push(`${nombre}: texto sin traducir ${[...new Set(sinTraducir)].join(", ")}`);
  if (llaves.length) fallas.push(`${nombre}: variable sin reemplazar ${llaves.join(", ")}`);
  if (errorVista) fallas.push(`${nombre}: la vista mostró error: ${await errorVista.innerText()}`);
  if (desborde) fallas.push(`${nombre}: la página se desborda a lo ancho → ${desborde}`);
  if (errores.length) fallas.push(`${nombre}: errores JS ${errores.join(" | ")}`);
  errores.length = 0;
  await pagina.screenshot({ path: join(CAPTURAS, `${nombre}.png`), fullPage: true });
}

for (const r of RECORRIDOS) {
  for (const lang of r.idiomas) {
    const llamadas = [];
    const { ctx, pagina, errores } = await nuevaPagina(r.quien, r.ancho, r.alto, lang, llamadas);
    for (const ruta of r.rutas) {
      await pagina.goto(`${BASE}#/${ruta}`);
      await revisarPantalla(pagina, `${r.quien.usuario}-${ruta}-${lang}${r.sufijo || ""}`, errores);
    }
    await ctx.close();
  }
}

// ---------------------------------------------------------------------------
// Flujos
// ---------------------------------------------------------------------------
async function flujo(nombre, quien, ancho, pasos) {
  const llamadas = [];
  const { ctx, pagina, errores } = await nuevaPagina(quien, ancho, 844, "es", llamadas);
  try {
    await pasos(pagina, llamadas);
    if (errores.length) fallas.push(`flujo ${nombre}: errores JS ${errores.join(" | ")}`);
    console.log(`ok - flujo ${nombre}`);
  } catch (e) {
    fallas.push(`flujo ${nombre}: ${e.message.split("\n")[0]}`);
    await pagina.screenshot({ path: join(CAPTURAS, `FALLA-${nombre}.png`), fullPage: true });
  }
  await ctx.close();
}
const esperar = (cond, msg) => { if (!cond) throw new Error(msg); };

await flujo("entrar y marcar entrada", P.juan, 390, async (pg, ll) => {
  await pg.goto(BASE);
  await pg.evaluate(() => localStorage.removeItem("obrapay.sesion"));
  await pg.goto(BASE + "?entrar");
  await pg.fill("#usuario", "juan.perez");
  await pg.fill("#clave", "mala");
  await pg.click("button[type=submit]");
  await pg.waitForSelector(".error-form");
  esperar((await pg.innerText(".error-form")).includes("incorrectos"), "no mostró error de credenciales");
  await pg.fill("#clave", "buena-clave");
  await pg.click("button[type=submit]");
  await pg.waitForSelector("#marcar");
  const tok = ll.find((x) => x.ruta === "/auth/v1/token" && x.cuerpo.password === "buena-clave");
  esperar(tok && tok.cuerpo.email === "juan.perez@obrapay.local", "no armó el correo interno");
  await pg.click("text=Villa Grace Bay");
  await pg.click("#marcar");
  await pg.waitForTimeout(400);
  const rpc = ll.find((x) => x.ruta.endsWith("/marcar_entrada"));
  esperar(rpc && rpc.cuerpo.p_proyecto === id("f1"), "marcar_entrada no recibió el proyecto");
  await pg.click("[data-leido]");
  await pg.waitForTimeout(200);
  esperar(ll.some((x) => x.metodo === "PATCH" && x.ruta.endsWith("/notificaciones")), "no marcó el aviso como leído");
});

await flujo("marcar sin señal guarda la marca y la envía al volver la conexión", P.juan, 390, async (pg, ll) => {
  await pg.goto(`${BASE}#/reloj`);
  await pg.waitForSelector("#marcar");
  await pg.click("text=Villa Grace Bay");
  RED.caido = true;
  await pg.click("#marcar");
  await pg.waitForSelector(".marca-cola");
  const cola = await pg.evaluate((uid) => JSON.parse(localStorage.getItem(`obrapay.cola.${uid}`)), P.juan.id);
  esperar(cola.length === 1 && cola[0].tipo === "entrada" && cola[0].estado === "pendiente" && cola[0].clave && cola[0].hora, "la marca no quedó guardada en el teléfono");
  esperar((await pg.innerText(".reloj-tarjeta")).toLowerCase().includes("trabajando ahora"), "no muestra el turno abierto con la marca guardada");
  esperar((await pg.innerText("#vista")).includes("por enviar"), "no muestra la marca como por enviar");
  // Recargar la app sin señal: abre con los datos guardados, no cierra la sesión.
  await pg.reload();
  await pg.waitForSelector(".reloj-tarjeta", { timeout: 8000 });
  esperar((await pg.innerText("#vista")).includes("Sin señal"), "sin señal no avisa que muestra datos guardados");
  esperar((await pg.innerText(".reloj-tarjeta")).toLowerCase().includes("trabajando ahora"), "al recargar sin señal se perdió la marca guardada");
  esperar(await pg.evaluate(() => !!localStorage.getItem("obrapay.sesion")), "se cerró la sesión por falta de señal");
  // Vuelve la señal: se envía con su hora y su clave.
  RED.caido = false;
  await pg.evaluate(() => window.dispatchEvent(new Event("online")));
  await pg.waitForFunction(() => document.body.innerText.includes("enviada") || !document.querySelector(".marca-cola"), null, { timeout: 8000 });
  await pg.waitForTimeout(300);
  const env = ll.filter((x) => x.ruta.endsWith("/marcar_entrada")).pop();
  esperar(env && env.cuerpo.p_clave === cola[0].clave && env.cuerpo.p_hora === cola[0].hora && env.cuerpo.p_proyecto === id("f1"), "no envió la marca con su clave y su hora real");
  const despues = await pg.evaluate((uid) => JSON.parse(localStorage.getItem(`obrapay.cola.${uid}`)), P.juan.id);
  esperar(despues.every((x) => x.estado === "enviada"), "la marca no quedó como enviada");
});
RED.caido = false;

await flujo("cambio de contraseña obligatorio", P.nuevo, 390, async (pg, ll) => {
  await pg.goto(BASE);
  await pg.waitForSelector("#nueva");
  await pg.fill("#nueva", "corta");
  await pg.fill("#repetir", "corta");
  await pg.click("button[type=submit]");
  esperar((await pg.innerText(".error-form")).includes("8"), "no exigió 8 caracteres");
  await pg.fill("#nueva", "MiClave-2026");
  await pg.fill("#repetir", "MiClave-2026");
  await pg.click("button[type=submit]");
  await pg.waitForTimeout(500);
  esperar(ll.some((x) => x.metodo === "PUT" && x.ruta === "/auth/v1/user" && x.cuerpo.password === "MiClave-2026"), "no cambió la contraseña");
  esperar(ll.some((x) => x.ruta.endsWith("/confirmar_clave_cambiada")), "no confirmó el cambio");
});

await flujo("supervisor corrige turno olvidado", P.ramon, 390, async (pg, ll) => {
  await pg.goto(`${BASE}#/aprobar`);
  await pg.waitForSelector(`[data-corregir="${id("t3")}"]`);
  esperar((await pg.innerText(`[data-turno="${id("t1")}"]`)).includes("envió tarde") || (await pg.innerText(`[data-turno="${id("t1")}"]`)).includes("se envió tarde"), "no marca el turno enviado tarde");
  esperar(!(await pg.$(`[data-aprobar-todo]`)) || !(await pg.getAttribute("[data-aprobar-todo]", "data-aprobar-todo")).includes(id("t3")), "incluyó el turno con alerta en aprobar todo");
  await pg.click(`[data-corregir="${id("t3")}"]`);
  await pg.fill("#c-salida", "2026-10-08T16:00");
  await pg.fill("#c-motivo", "Olvidó marcar; salió a las 4");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(400);
  const c = ll.find((x) => x.ruta.endsWith("/corregir_turno"));
  esperar(c, "no llamó a corregir_turno");
  esperar(c.cuerpo.p_salida === "2026-10-08T20:00:00.000Z", `salida mal convertida a UTC: ${c.cuerpo.p_salida}`);
  esperar(c.cuerpo.p_entrada === "2026-10-08T10:58:00.000Z", `entrada mal convertida: ${c.cuerpo.p_entrada}`);
});

await flujo("admin descarga recibos de todos o de un trabajador", P.admin, 1360, async (pg) => {
  await pg.goto(`${BASE}#/nomina`);
  await pg.waitForSelector("#recibos-todos:not([disabled])");
  await pg.click("#recibos-todos");
  await pg.waitForSelector("#recibo-imp .recibo-hoja", { state: "attached" });
  esperar((await pg.locator("#recibo-imp .recibo-hoja").count()) === 2, "debe haber un recibo por trabajador");
  const todos = await pg.locator("#recibo-imp").evaluate((n) => n.textContent);
  esperar(todos.includes("Juan Pérez") && todos.includes("Marie Joseph") && todos.includes("Detalle por día y lugar") && todos.includes("−$10.11") && todos.includes("−$5.55"), "faltan datos en los recibos del admin");
  await pg.click(`[data-recibo="${P.marie.id}"]`);
  await pg.waitForTimeout(300);
  esperar((await pg.locator("#recibo-imp .recibo-hoja").count()) === 1, "el recibo individual debe ser uno solo");
  esperar((await pg.locator("#recibo-imp").evaluate((n) => n.textContent)).includes("Marie Joseph"), "no es el recibo de Marie");
});

await flujo("admin agrega, renueva y quita documentos", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/vencimientos`);
  await pg.waitForSelector(`[data-doc="${id("d1")}"]`);
  const lista = await pg.innerText("#vista");
  esperar(lista.includes("Juan Pérez") && lista.includes("Licencia Grace Bay") && /hace [34] d/.test(lista), "no lista los documentos con sus días");
  esperar(!lista.includes("POL-77120") && !lista.includes("REG-4") && !lista.includes("INS-9"), "Vencimientos lista documentos de vehículos");
  esperar((await pg.innerText(`[data-doc="${id("d2")}"]`)).toLowerCase().includes("vencido"), "la licencia vencida no se marca como vencida");
  esperar((await pg.innerText(`[data-doc="${id("d1")}"]`)).toLowerCase().includes("renovar"), "el permiso a 20 días debe estar por renovar");
  esperar((await pg.innerText(`[data-doc="${id("d3")}"]`)).toLowerCase().includes("vigente"), "la licencia a 200 días debe estar vigente");
  await pg.click(`[data-doc="${id("d1")}"]`);
  await pg.waitForSelector("#doc-detalle");
  esperar((await pg.innerText("#doc-detalle")).includes("permiso_juan.pdf"), "el detalle no muestra el archivo");
  // agregar
  await pg.click("#agregar");
  esperar((await pg.locator('#dc-tipo option[value="seguro_vehiculo"]').count()) === 0, "Vencimientos todavía ofrece el seguro de vehículo");
  await pg.selectOption("#dc-tipo", "licencia_construccion");
  await pg.fill("#dc-titulo", "Licencia Leeward");
  await pg.fill("#dc-vence", "2027-03-01");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  const g = ll.find((x) => x.ruta.endsWith("/guardar_documento"));
  esperar(g && g.cuerpo.p_tipo === "licencia_construccion" && g.cuerpo.p_titulo === "Licencia Leeward" && g.cuerpo.p_vence === "2027-03-01" && g.cuerpo.p_perfil === null, "datos mal enviados a guardar_documento");
  // validar
  await pg.click("#agregar");
  await pg.selectOption("#dc-tipo", "permiso_trabajo");
  await pg.fill("#dc-vence", "2027-03-01");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(200);
  esperar((await pg.locator("dialog .error-form").innerText()).length > 0, "no pidió el trabajador del permiso");
  esperar(ll.filter((x) => x.ruta.endsWith("/guardar_documento")).length === 1, "envió un permiso sin trabajador");
  await pg.click("dialog [data-cerrar]");
  // renovar
  await pg.click(`[data-doc="${id("d1")}"]`);
  await pg.click('[data-accion="renovar"]');
  await pg.fill("#rn-vence", sumar(400));
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  const r = ll.find((x) => x.ruta.endsWith("/renovar_documento"));
  esperar(r && r.cuerpo.p_id === id("d1") && r.cuerpo.p_vence === sumar(400), "no llamó a renovar_documento");
});

await flujo("dueño ve los vencimientos sin poder editarlos", P.dueno, 1360, async (pg) => {
  await pg.goto(`${BASE}#/vencimientos`);
  await pg.waitForSelector(`[data-doc="${id("d1")}"]`);
  esperar((await pg.locator("#agregar").count()) === 0, "el dueño ve el botón de agregar");
  await pg.click(`[data-doc="${id("d1")}"]`);
  esperar((await pg.locator('[data-accion="renovar"], [data-accion="quitar"]').count()) === 0, "el dueño ve botones de edición");
});

await flujo("admin controla la flota de vehículos", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/vehiculos`);
  await pg.waitForSelector(`[data-veh="${id("v1")}"]`);
  const lista = await pg.innerText("#vista");
  esperar(lista.includes("Toyota Hilux 01") && lista.includes("TCI 4821") && lista.includes("Ford Transit"), "no lista los vehículos");
  esperar((await pg.getAttribute(`[data-veh="${id("v1")}"]`, "class")).includes("veh-error"), "el seguro vencido no deja la tarjeta en rojo");
  esperar((await pg.getAttribute(`[data-veh="${id("v2")}"]`, "class")).includes("veh-ok"), "el vehículo al día no está en verde");
  await pg.click('[data-filtro="alertas"]');
  esperar((await pg.locator("[data-veh]").count()) === 1, "el filtro de alertas debe dejar un vehículo");
  await pg.click('[data-filtro="todos"]');
  await pg.click(`[data-veh="${id("v1")}"]`);
  await pg.waitForSelector("#veh-detalle");
  const det = await pg.innerText("#veh-detalle");
  esperar(det.includes("Juan Pérez") && det.includes("48,600") && det.includes("POL-77120"), "el detalle no muestra conductor, millas y seguro");
  // millas
  await pg.click('[data-accion="millas"]');
  await pg.fill("#mi-millas", "48700");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  const m = ll.find((x) => x.ruta.endsWith("/actualizar_millas"));
  esperar(m && m.cuerpo.p_vehiculo === id("v1") && m.cuerpo.p_millas === 48700, "no llamó a actualizar_millas");
  // mantenimiento
  await pg.click('[data-sub="mant"]');
  const mant = await pg.innerText("#veh-detalle");
  esperar(mant.includes("Cambio de aceite") && mant.includes("Rotación de llantas") && !mant.includes("Frenos"), "los planes del vehículo no son los correctos");
  await pg.click(`[data-plan-servicio="${id("p1")}"]`);
  await pg.fill("#sv-costo", "95.5");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  const sv = ll.find((x) => x.ruta.endsWith("/registrar_servicio"));
  esperar(sv && sv.cuerpo.p_plan === id("p1") && sv.cuerpo.p_costo === 95.5, "no llamó a registrar_servicio");
  await pg.click("[data-plan-nuevo]");
  await pg.fill("#pl-nombre", "Frenos delanteros");
  await pg.fill("#pl-millas", "20000");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  const pl = ll.find((x) => x.ruta.endsWith("/guardar_plan"));
  esperar(pl && pl.cuerpo.p_vehiculo === id("v1") && pl.cuerpo.p_nombre === "Frenos delanteros" && pl.cuerpo.p_cada_millas === 20000 && pl.cuerpo.p_cada_dias === null, "datos mal enviados a guardar_plan");
  // plan sin intervalo
  await pg.click("[data-plan-nuevo]");
  await pg.fill("#pl-nombre", "Sin intervalo");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(200);
  esperar((await pg.locator("dialog .error-form").innerText()).length > 0, "no pidió millas o días");
  esperar(ll.filter((x) => x.ruta.endsWith("/guardar_plan")).length === 1, "envió un plan sin intervalo");
  await pg.click("dialog [data-cerrar]");
  // historial
  await pg.click('[data-sub="hist"]');
  await pg.waitForSelector("#veh-detalle table, #veh-detalle .tabla");
  esperar((await pg.innerText("#veh-detalle")).includes("Aceite 5W-30"), "el historial no muestra el servicio");
  // documento del vehículo
  await pg.click('[data-sub="docs"]');
  await pg.click("[data-doc-nuevo]");
  await pg.fill("#vd-vence", "2027-05-01");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  const gd = ll.find((x) => x.ruta.endsWith("/guardar_documento"));
  esperar(gd && gd.cuerpo.p_vehiculo === id("v1") && gd.cuerpo.p_vence === "2027-05-01" && gd.cuerpo.p_perfil === null, "datos mal enviados a guardar_documento del vehículo");
  // agregar vehículo
  await pg.click("#agregar");
  await pg.fill("#vh-nombre", "Nissan Frontier");
  await pg.fill("#vh-placa", "TCI 9000");
  await pg.fill("#vh-millas", "15000");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  const gv = ll.find((x) => x.ruta.endsWith("/guardar_vehiculo"));
  esperar(gv && gv.cuerpo.p_nombre === "Nissan Frontier" && gv.cuerpo.p_placa === "TCI 9000" && gv.cuerpo.p_millas === 15000 && gv.cuerpo.p_id === null, "datos mal enviados a guardar_vehiculo");
  // el admin no tiene la pestaña "Mi vehículo"
  esperar((await pg.locator('a[href="#/mivehiculo"]').count()) === 0, "el admin ve Mi vehículo");
});

await flujo("dueño ve los vehículos sin poder editarlos", P.dueno, 1360, async (pg) => {
  await pg.goto(`${BASE}#/vehiculos`);
  await pg.waitForSelector(`[data-veh="${id("v1")}"]`);
  esperar((await pg.locator("#agregar").count()) === 0, "el dueño ve el botón de agregar vehículo");
  await pg.click(`[data-veh="${id("v1")}"]`);
  await pg.waitForSelector("#veh-detalle");
  esperar((await pg.locator('[data-accion="millas"], [data-accion="editar"], [data-accion="quitar"], [data-doc-nuevo], [data-doc-renovar], [data-plan-nuevo], [data-plan-servicio]').count()) === 0, "el dueño ve botones de edición");
});

await flujo("el conductor actualiza las millas de su vehículo", P.juan, 390, async (pg, ll) => {
  await pg.goto(`${BASE}#/`);
  await pg.waitForSelector('a[href="#/mivehiculo"]');
  await pg.goto(`${BASE}#/mivehiculo`);
  await pg.waitForSelector("[data-millas]");
  const txt = await pg.innerText("#vista");
  esperar(txt.includes("Toyota Hilux 01") && txt.includes("Cambio de aceite") && !txt.includes("Ford Transit") && !txt.includes("POL-77120"), "Mi vehículo muestra datos que no le tocan");
  await pg.click("[data-millas]");
  await pg.fill("#mi-millas", "48000");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(200);
  esperar((await pg.locator("dialog .error-form").innerText()).length > 0 && !ll.some((x) => x.ruta.endsWith("/actualizar_millas")), "dejó bajar las millas");
  await pg.fill("#mi-millas", "48750");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  const m = ll.find((x) => x.ruta.endsWith("/actualizar_millas"));
  esperar(m && m.cuerpo.p_vehiculo === id("v1") && m.cuerpo.p_millas === 48750, "no llamó a actualizar_millas");
});

await flujo("un trabajador sin vehículo no ve Mi vehículo", P.marie, 390, async (pg) => {
  await pg.goto(`${BASE}#/`);
  await pg.waitForTimeout(800);
  esperar((await pg.locator('a[href="#/mivehiculo"]').count()) === 0, "Marie ve una pestaña de vehículo sin tener uno");
});

await flujo("admin crea trabajador", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/trabajadores`);
  await pg.click("#nuevo");
  await pg.fill("#n-nombre", "José Ángel Núñez");
  esperar((await pg.inputValue("#n-usuario")) === "jose.nunez", "no sugirió el usuario");
  await pg.fill("#n-tarifa", "16.50");
  await pg.click("dialog button[type=submit]");
  await pg.waitForSelector(".credenciales");
  esperar((await pg.innerText(".credenciales")).includes("sol-mar-isla-42"), "no mostró la contraseña temporal");
  const f = ll.find((x) => x.ruta.includes("crear-trabajador"));
  esperar(f.cuerpo.tarifa === 16.5 && f.cuerpo.roles[0] === "trabajador" && f.cuerpo.usuario === "jose.nunez", "datos mal enviados a crear-trabajador");
});

await flujo("admin cambia tarifa y exporta Excel", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/trabajadores`);
  await pg.click(`[data-tarifa="${P.juan.id}"]`);
  await pg.fill("#m-valor", "19");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.ruta.endsWith("/cambiar_tarifa") && x.cuerpo.p_monto === 19), "no cambió la tarifa");
  await pg.goto(`${BASE}#/nomina`);
  await pg.waitForSelector("#excel:not([disabled])");
  const [descarga] = await Promise.all([pg.waitForEvent("download"), pg.click("#excel")]);
  const archivo = join(CAPTURAS, descarga.suggestedFilename());
  await descarga.saveAs(archivo);
  const bytes = await readFile(archivo);
  esperar(bytes.slice(0, 2).toString() === "PK", "el Excel no es un ZIP");
  esperar(descarga.suggestedFilename() === "nomina_2026-10-01_2026-10-07.xlsx", `nombre inesperado ${descarga.suggestedFilename()}`);
});

await flujo("admin restablece contraseña", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/trabajadores`);
  await pg.click(`[data-editar="${P.juan.id}"]`);
  await pg.click("[data-ir-clave]");
  await pg.click("dialog [data-si]");
  await pg.waitForSelector(".credenciales");
  esperar(ll.some((x) => x.ruta.includes("crear-trabajador") && x.cuerpo.accion === "restablecer" && x.cuerpo.perfil_id === P.juan.id), "no restableció");
  await pg.click("dialog [data-cerrar]");
  esperar(!(await pg.content()).includes("data-ir-seguro"), "quedó el botón del seguro %");
});

await flujo("admin fija descuento de préstamo", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/prestamos`);
  await pg.fill(`#d-${id("l1")}`, "60");
  await pg.click(`[data-prestamo="${id("l1")}"] button[type=submit]`);
  await pg.waitForTimeout(300);
  const d = ll.find((x) => x.ruta.endsWith("/fijar_descuento_prestamo"));
  esperar(d && d.cuerpo.p_monto === 60 && d.cuerpo.p_semana === id("s2"), "descuento mal enviado");
});

await flujo("admin asigna equipo a proyecto", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/proyectos`);
  await pg.click(`[data-equipo="${id("f2")}"]`);
  await pg.check(`dialog input[name=sup][value="${P.ramon.id}"]`);
  await pg.uncheck(`dialog input[name=tra][value="${P.marie.id}"]`);
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.metodo === "POST" && x.ruta.endsWith("/proyecto_supervisores") && x.cuerpo[0].perfil_id === P.ramon.id), "no asignó supervisor");
  esperar(ll.some((x) => x.metodo === "DELETE" && x.ruta.endsWith("/proyecto_trabajadores") && x.qs.includes(P.marie.id)), "no quitó a la trabajadora");
});

await flujo("admin cierra y reabre semana", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/nomina`);
  await pg.waitForSelector("#reabrir");
  await pg.click("#reabrir");
  await pg.fill("#motivo", "Revisar horas de Juan");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.ruta.endsWith("/reabrir_semana") && x.cuerpo.p_motivo === "Revisar horas de Juan"), "no reabrió");
});

await flujo("admin cambia tasa NHIP, guarda datos de seguro y exporta la remesa", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/seguros`);
  await pg.waitForSelector("[data-tasa=NHIP]");
  const texto = await pg.textContent("body");
  esperar(texto.includes("$400.32") || texto.includes("$300.00") || texto.includes("$198.72"), "no muestra la remesa por trabajador");
  esperar(texto.includes("Pedro Santos") && texto.includes("$468.00"), "no muestra el permiso sin número NHIP");
  await pg.click("[data-tasa=NHIP]");
  await pg.fill("#s-emp", "4");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.ruta.endsWith("/cambiar_tasa_estatutaria") && x.cuerpo.p_agencia === "NHIP" && x.cuerpo.p_tasa_empleado === 4 && x.cuerpo.p_tope_mensual === 7800), "no cambió la tasa");
  await pg.click(`[data-datos="${P.juan.id}"]`);
  await pg.fill("#d-nhip", "NHIP-1");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.ruta.endsWith("/actualizar_datos_estatutarios") && x.cuerpo.p_numero_nhip === "NHIP-1" && x.cuerpo.p_perfil === P.juan.id), "no guardó los datos de seguro");
  const [descarga] = await Promise.all([pg.waitForEvent("download"), pg.click("#excel")]);
  esperar(/^remesa_\d{4}-\d{2}\.xlsx$/.test(descarga.suggestedFilename()), `nombre inesperado ${descarga.suggestedFilename()}`);
});

await flujo("admin cambia el salario mínimo", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/seguros`);
  await pg.click("#editar-minimo");
  await pg.fill("#m-min", "9.50");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.ruta.endsWith("/cambiar_salario_minimo") && x.cuerpo.p_monto === 9.5), "no cambió el mínimo");
});

await flujo("admin ve y descarta sus avisos", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/nomina`);
  await pg.waitForSelector(".avisos-admin");
  const txt = await pg.innerText(".avisos-admin");
  esperar(txt.includes("NHIP vence el") && txt.includes("La semana cierra hoy") && txt.includes("3 turnos sin aprobar") && txt.includes("llegó al tope mensual de NIB") && txt.includes("Permiso de trabajo · Marie") && txt.includes("vence en 20 días") && txt.includes("Cambio de <u>aceite</u> · Toyota Hilux 01") && txt.includes("toca en 10 días"), "faltan avisos del admin");
  esperar(!(await pg.innerHTML(".avisos-admin")).includes("<u>"), "el servicio del aviso no se escapó");
  esperar(!(await pg.innerHTML(".avisos-admin")).includes("<b>"), "el nombre del aviso no se escapó");
  await pg.click(`[data-leido="${id("na3")}"]`);
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.metodo === "PATCH" && x.ruta.endsWith("/notificaciones")), "no marcó el aviso como leído");
  esperar((await pg.locator("[data-aviso]").count()) === 5, "no quitó el aviso descartado");
});

await flujo("admin valida la tasa antes de guardar", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/seguros`);
  await pg.waitForSelector("[data-tasa=NIB]");
  await pg.click("[data-tasa=NIB]");
  await pg.fill("#s-dia", "30");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(200);
  esperar(!ll.some((x) => x.ruta.endsWith("/cambiar_tasa_estatutaria")), "envió una tasa inválida");
});

await flujo("dueño ve los seguros sin poder editar", P.dueno, 1360, async (pg) => {
  await pg.goto(`${BASE}#/seguros`);
  await pg.waitForSelector("table");
  esperar((await pg.locator("[data-tasa], [data-datos]").count()) === 0, "el dueño ve botones de edición");
});


await flujo("trabajador en dos compañías ve un pago por compañía", P.juan, 390, async (pg) => {
  await pg.goto(`${BASE}#/pago`);
  await pg.waitForSelector(".monto-grande");
  const txt = await pg.innerText("#vista");
  esperar(txt.includes("$92.48"), "no suma el neto de las dos compañías");
  esperar(txt.includes("Current Ltd") && txt.includes("$55.88") && txt.includes("$36.60"), "falta el bloque de cada compañía");
  esperar((await pg.locator("#recibo-pdf").count()) === 1, "falta el botón del recibo");
  const rec2 = await pg.locator("#recibo-imp").evaluate((n) => n.textContent);
  esperar(rec2.includes("Detalle por día y lugar") && rec2.includes("Horas por lugar") && rec2.includes("Villa Grace Bay"), "el recibo no trae el detalle por día y lugar");
  esperar((await pg.locator("#recibo-imp .recibo-hoja").count()) === 1, "debe haber un solo recibo con las dos compañías");
  esperar(rec2.includes(EMP.nombre) && rec2.includes(EMP2.nombre) && rec2.includes("−$3.96") && rec2.includes("−$2.16") && rec2.includes("$55.88"), "el recibo no trae NIB, NHIP y neto por separado");
  esperar(rec2.includes("$7.28") && rec2.includes("$3.36"), "el recibo no muestra el aporte del patrón");
  await pg.evaluate(() => document.body.classList.add("imp-recibo"));
  await pg.pdf({ path: join(CAPTURAS, "recibo-pago.pdf"), format: "Letter" });
  await pg.evaluate(() => document.body.classList.remove("imp-recibo"));
});

await flujo("trabajador con dos compañías marca en cualquiera sin cambiar de compañía", P.juan, 390, async (pg, ll) => {
  await pg.goto(`${BASE}#/reloj`);
  await pg.waitForSelector(".lista-proyectos");
  esperar((await pg.locator("#empresa-app").count()) === 0, "el trabajador ve el selector de compañía");
  const txt = await pg.innerText("#vista");
  esperar(txt.includes("Torre Sur") && txt.includes("Current Ltd") && txt.includes("Villa Grace Bay"), "el Reloj no muestra los proyectos de las dos compañías");
  await pg.click(`input[name=proyecto][value="${id("f9")}"]`, { force: true });
  await pg.click("#marcar");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.ruta.endsWith("/marcar_entrada") && x.cuerpo.p_proyecto === id("f9")), "no marcó entrada en el proyecto de la otra compañía");
});

await flujo("elegir compañía activa", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/nomina`);
  await pg.waitForSelector("#empresa-app");
  await pg.selectOption("#empresa-app", EMP2.id);
  await pg.waitForTimeout(400);
  esperar(ll.some((x) => x.ruta.endsWith("/elegir_empresa") && x.cuerpo.p_empresa === EMP2.id), "no eligió la compañía");
});

await flujo("supervisor registra un gasto", P.ramon, 390, async (pg, ll) => {
  await pg.goto(`${BASE}#/gastos`);
  await pg.waitForSelector("#form-gasto");
  await pg.selectOption("#g-categoria", "materiales");
  await pg.fill("#g-monto", "0");
  await pg.click("#form-gasto [type=submit]");
  esperar(!ll.some((x) => x.ruta.endsWith("/registrar_gasto")), "envió un gasto en cero");
  await pg.fill("#g-monto", "45.5");
  await pg.click("#form-gasto [type=submit]");
  await pg.waitForTimeout(300);
  const g = ll.find((x) => x.ruta.endsWith("/registrar_gasto"));
  esperar(g && g.cuerpo.p_monto === 45.5 && g.cuerpo.p_proyecto === id("f1") && g.cuerpo.p_categoria === "materiales", "gasto mal enviado");
  esperar((await pg.locator("[data-anular]").count()) === 0, "el supervisor ve el botón de anular");
});

await flujo("admin comparte un trabajador y anula un gasto", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/trabajadores`);
  await pg.click(`[data-compartir="${P.juan.id}"]`);
  await pg.fill("#c-tarifa", "20");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.ruta.endsWith("/compartir_trabajador") && x.cuerpo.p_perfil === P.juan.id && x.cuerpo.p_empresa === EMP2.id && x.cuerpo.p_tarifa === 20), "no compartió");
  await pg.goto(`${BASE}#/gastos`);
  await pg.click(`[data-anular="${id("x1")}"]`);
  await pg.fill("#a-motivo", "Error de monto");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.ruta.endsWith("/anular_gasto") && x.cuerpo.p_motivo === "Error de monto"), "no anuló el gasto");
});

await flujo("dueño ve el resumen separado por compañía", P.dueno, 1360, async (pg) => {
  await pg.goto(`${BASE}#/companias`);
  await pg.waitForSelector(".kpis");
  const txt = await pg.innerText("#vista");
  esperar(/current ltd/i.test(txt) && /mi empresa/i.test(txt), "no muestra las dos compañías");
  esperar(txt.includes("$5,770.00") && txt.includes("$7,200.00") && txt.includes("$12,970.00"), "totales por compañía incorrectos");
  esperar(/equipo · current ltd/i.test(txt) && /ramón gómez/i.test(txt) && /trabajadores a cargo/i.test(txt), "no muestra el equipo por compañía");
});

await flujo("supervisor encarga una herramienta a un trabajador", P.ramon, 390, async (pg, ll) => {
  await pg.goto(`${BASE}#/herramientas`);
  await pg.waitForSelector("table");
  esperar((await pg.locator("[data-asignar]").count()) === 0, "el supervisor ve el botón de asignar");
  esperar((await pg.locator("[data-editar]").count()) === 0, "el supervisor ve el botón de editar");
  esperar((await pg.locator("#nueva").count()) === 0, "el supervisor ve nueva herramienta");
  await pg.click(`[data-encargar="${id("h2")}"]`);
  await pg.selectOption("#e-trab", P.pedro.id);
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.ruta.endsWith("/herramienta_a_trabajador") && x.cuerpo.p_id === id("h2") && x.cuerpo.p_trabajador === P.pedro.id), "no encargó la herramienta");
  await pg.click(`[data-estado="${id("h2")}"]`);
  await pg.selectOption("#s-estado", "perdido");
  await pg.fill("#s-nota", "Se perdió en la obra");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.ruta.endsWith("/herramienta_estado") && x.cuerpo.p_estado === "perdido" && x.cuerpo.p_nota === "Se perdió en la obra"), "no marcó la herramienta como perdida");
  await pg.click(`[data-historial="${id("h1")}"]`);
  await pg.waitForSelector("dialog .lista-simple");
});

await flujo("admin crea, asigna y presta una herramienta", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/herramientas`);
  await pg.waitForSelector("#nueva");
  const txt = await pg.innerText("#vista");
  esperar(/herramientas · current ltd/i.test(txt) && /dueña: current ltd/i.test(txt), "no muestra las compañías ni la dueña de la prestada");
  await pg.click("#nueva");
  await pg.fill("#h-nombre", "Sierra circular");
  await pg.fill("#h-valor", "95.50");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.ruta.endsWith("/crear_herramienta") && x.cuerpo.p_nombre === "Sierra circular" && x.cuerpo.p_valor === 95.5), "no creó la herramienta");
  await pg.click(`[data-asignar="${id("h5")}"]`);
  await pg.selectOption("#a-sup", id("b3"));
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.ruta.endsWith("/herramienta_a_supervisor") && x.cuerpo.p_id === id("h5")), "no asignó al supervisor");
  await pg.click(`[data-prestar="${id("h1")}"]`);
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.ruta.endsWith("/compartir_herramienta") && x.cuerpo.p_id === id("h1") && x.cuerpo.p_empresa === EMP2.id), "no prestó la herramienta");
});

await flujo("dueño ve herramientas sin poder cambiarlas", P.dueno, 1360, async (pg) => {
  await pg.goto(`${BASE}#/herramientas`);
  await pg.waitForSelector("table");
  esperar((await pg.locator("#nueva, [data-asignar], [data-encargar], [data-estado], [data-editar], [data-prestar]").count()) === 0, "el dueño ve botones de cambio");
  esperar((await pg.locator("[data-historial]").count()) > 0, "el dueño no ve el historial");
});

await flujo("admin descarga los archivos del contador y edita los datos del empleador", P.admin, 1360, async (pg, ll) => {
  await pg.goto(`${BASE}#/contador`);
  await pg.waitForSelector("[data-bajar=nib]");
  esperar(await pg.locator("#c-sem option").count() === 1, "la lista de semanas debe tener solo la semana cerrada");
  let [d] = await Promise.all([pg.waitForEvent("download"), pg.click("[data-bajar=nib]")]);
  esperar(/^nib_mi-empresa_2026-10-01\.xlsx$/.test(d.suggestedFilename()), `nombre semanal inesperado ${d.suggestedFilename()}`);
  await pg.selectOption("#c-modo", "mes");
  await pg.selectOption("#c-mes", "10");
  await pg.selectOption("#c-anio", "2026");
  [d] = await Promise.all([pg.waitForEvent("download"), pg.click("[data-bajar=nib]")]);
  esperar(/^nib-ins007_mi-empresa_2026-10\.xlsx$/.test(d.suggestedFilename()), `nombre mensual inesperado ${d.suggestedFilename()}`);
  const archivo = join(CAPTURAS, d.suggestedFilename());
  await d.saveAs(archivo);
  const xml = (await readFile(archivo)).toString("latin1");  // el ZIP va sin comprimir
  esperar(xml.includes("PART A") && xml.includes("PART B") && xml.includes("PART C") && xml.includes("Week 5") && xml.includes(">N<"), "el Excel mensual no sigue el formulario INS.007");
  esperar(ll.some((x) => x.ruta.endsWith("/reporte_seguros") && x.cuerpo.p_desde === "2026-10-01" && x.cuerpo.p_hasta === "2026-10-31"), "no pidió el mes completo");
  esperar(ll.some((x) => x.ruta.endsWith("/reporte_altas_bajas") && x.cuerpo.p_anio === 2026 && x.cuerpo.p_mes === 10), "no pidió altas y bajas");
  [d] = await Promise.all([pg.waitForEvent("download"), pg.click("[data-bajar=nhip]")]);
  esperar(/^nhip_/.test(d.suggestedFilename()), "no descargó el NHIP");
  [d] = await Promise.all([pg.waitForEvent("download"), pg.click("[data-bajar=proy]")]);
  esperar(/^pagado-por-proyecto_/.test(d.suggestedFilename()), "no descargó el pagado por proyecto");
  await pg.click("#editar-emp");
  await pg.fill("#e-dir", "Leeward Highway");
  await pg.click("dialog button[type=submit]");
  await pg.waitForTimeout(300);
  esperar(ll.some((x) => x.ruta.endsWith("/guardar_datos_empleador") && x.cuerpo.p_direccion === "Leeward Highway" && x.cuerpo.p_empresa === EMP.id), "no guardó los datos del empleador");
});

await flujo("dueño ve el reporte del contador sin editar los datos", P.dueno, 1360, async (pg) => {
  await pg.goto(`${BASE}#/contador`);
  await pg.waitForSelector("[data-bajar=nib]");
  esperar((await pg.locator("#editar-emp").count()) === 0, "el dueño ve el botón de editar datos del empleador");
});

await navegador.close();
servidor.close();
if (fallas.length) { console.log(fallas.map((f) => `FALLA: ${f}`).join("\n")); console.log(`RESULTADO: ${fallas.length} fallas`); process.exit(1); }
console.log(`RESULTADO: todo bien · capturas en ${CAPTURAS}`);
