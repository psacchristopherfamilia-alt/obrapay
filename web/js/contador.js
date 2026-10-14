// Arma los archivos Excel para el contador (NIB en el formato del formulario INS.007, NHIP y pagado por proyecto).
// Son funciones puras: reciben las filas que devuelven los reportes y devuelven las hojas para crearXlsx.
import { t } from "./i18n.js";

const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const MESES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fecha = (ymd) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : "");
const neg = (v) => ({ v, e: "neg" });
const din = (v) => ({ v: r2(v), e: "din" });
const dinneg = (v) => ({ v: r2(v), e: "dinneg" });

export const nombreArchivo = (prefijo, empresa, sufijo) =>
  `${prefijo}_${String(empresa || "").normalize("NFD").replace(/[^\w ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase()}_${sufijo}.xlsx`;

// Agrupa los renglones semanales por trabajador: una fila por persona con lo ganado en cada semana del mes (1 a 5).
export function porTrabajador(filas) {
  const m = new Map();
  for (const f of filas) {
    if (!m.has(f.perfil_id)) {
      m.set(f.perfil_id, { perfil_id: f.perfil_id, apellido: f.apellido || "", nombre: f.nombre || "", inicial: f.inicial || "",
        completo: f.nombre_completo, nib: f.numero_nib || "", nhip: f.numero_nhip || "", semanas: {}, tot: {
          bruto: 0, base_nib: 0, nib_empleado: 0, nib_empleador: 0, base_nhip: 0, nhip_empleado: 0, nhip_empleador: 0 } });
    }
    const p = m.get(f.perfil_id);
    const s = Math.min(5, Math.max(1, Number(f.nro)));
    p.semanas[s] = p.semanas[s] || { base_nib: 0, base_nhip: 0, bruto: 0, nib_empleado: 0, nib_empleador: 0, nhip_empleado: 0, nhip_empleador: 0 };
    for (const k of Object.keys(p.tot)) { p.tot[k] += Number(f[k] || 0); p.semanas[s][k] += Number(f[k] || 0); }
  }
  return [...m.values()].sort((a, b) => a.apellido.localeCompare(b.apellido) || a.nombre.localeCompare(b.nombre));
}

// Encabezado con los datos del empleador, igual en los formularios.
function bloqueEmpleador(emp, titulo, periodo) {
  return [
    [neg(titulo)],
    [],
    ["Employer / Empleador", neg(emp.nombre)],
    ["NIB registration no.", emp.nib_registro || ""],
    ["Insurance no.", emp.nib_seguro || ""],
    ["Address", emp.direccion || ""],
    ["P.O. Box", emp.apartado || ""],
    ["Telephone", emp.telefono || ""],
    ["Period", periodo],
    [],
  ];
}

// NIB mensual: Parte A (ganancias por semana), Parte B (empezaron), Parte C (dejaron), y los totales a pagar.
export function hojasNibMes(emp, anio, mes, filas, altas, bajas) {
  const gente = porTrabajador(filas);
  const libre = bloqueEmpleador(emp, "NIB — Employer's monthly contribution return (INS.007)", `${MESES_EN[mes - 1]} ${anio}`);
  libre.push([neg("PART A — Employees")]);
  libre.push(["No.", neg("NIB number"), neg("Surname"), neg("First name"), neg("Initial"),
    neg("Week 1"), neg("Week 2"), neg("Week 3"), neg("Week 4"), neg("Week 5"), neg("Total earnings")]);
  let totSemanas = [0, 0, 0, 0, 0]; let totGanado = 0; let nibEmpleado = 0; let nibEmpleador = 0;
  gente.forEach((p, i) => {
    const celdas = [1, 2, 3, 4, 5].map((n, k) => {
      const v = p.semanas[n]?.base_nib;
      if (v === undefined || !(v > 0)) return "N";
      totSemanas[k] += v;
      return din(v);
    });
    totGanado += p.tot.base_nib; nibEmpleado += p.tot.nib_empleado; nibEmpleador += p.tot.nib_empleador;
    libre.push([i + 1, p.nib, p.apellido, p.nombre, p.inicial, ...celdas, din(p.tot.base_nib)]);
  });
  libre.push(["", "", "", "", neg("Totals"), ...totSemanas.map(dinneg), dinneg(totGanado)]);
  libre.push([]);
  libre.push(["", "", "", "", "", "", "", "", neg("Total earnings"), "", dinneg(totGanado)]);
  libre.push(["", "", "", "", "", "", "", "", neg("Contributions payable (employee + employer)"), "", dinneg(nibEmpleado + nibEmpleador)]);
  libre.push(["", "", "", "", "", "", "", "", "  of which employee", "", din(nibEmpleado)]);
  libre.push(["", "", "", "", "", "", "", "", "  of which employer", "", din(nibEmpleador)]);
  libre.push(["", "", "", "", "", "", "", "", neg("Additional charge"), "", ""]);
  libre.push(["", "", "", "", "", "", "", "", neg("Total payable"), "", dinneg(nibEmpleado + nibEmpleador)]);
  libre.push([]);
  libre.push([neg("PART B — Employees who started this month")]);
  libre.push(["No.", neg("NIB number"), neg("Surname"), neg("First name"), neg("Initial"), neg("Date started")]);
  altas.forEach((a, i) => libre.push([i + 1, a.numero_nib || "", a.apellido || "", a.nombre || "", a.inicial || "", fecha(a.fecha)]));
  if (!altas.length) libre.push(["", "—"]);
  libre.push([]);
  libre.push([neg("PART C — Employees who left this month")]);
  libre.push(["No.", neg("NIB number"), neg("Surname"), neg("First name"), neg("Initial"), neg("Date left")]);
  bajas.forEach((a, i) => libre.push([i + 1, a.numero_nib || "", a.apellido || "", a.nombre || "", a.inicial || "", fecha(a.fecha)]));
  if (!bajas.length) libre.push(["", "—"]);
  return [{ nombre: "INS.007", libre, anchos: [6, 18, 20, 20, 8, 13, 13, 13, 13, 13, 16] }];
}

// NIB de una semana: lo mismo que el mes, pero con una sola semana.
export function hojasNibSemana(emp, semana, filas) {
  const libre = bloqueEmpleador(emp, "NIB — Weekly earnings and contributions",
    `${fecha(semana.inicio)} – ${fecha(semana.fin)} (pay ${fecha(semana.pago)})`);
  libre.push(["No.", neg("NIB number"), neg("Surname"), neg("First name"), neg("Initial"),
    neg("Gross pay"), neg("Insurable earnings"), neg("Employee"), neg("Employer"), neg("Total")]);
  let a = 0; let b = 0; let c = 0; let d = 0;
  filas.forEach((f, i) => {
    a += Number(f.bruto); b += Number(f.base_nib); c += Number(f.nib_empleado); d += Number(f.nib_empleador);
    libre.push([i + 1, f.numero_nib || "", f.apellido || "", f.nombre || "", f.inicial || "", din(f.bruto), din(f.base_nib),
      din(f.nib_empleado), din(f.nib_empleador), din(Number(f.nib_empleado) + Number(f.nib_empleador))]);
  });
  libre.push(["", "", "", "", neg("Totals"), dinneg(a), dinneg(b), dinneg(c), dinneg(d), dinneg(c + d)]);
  return [{ nombre: "NIB", libre, anchos: [6, 18, 20, 20, 8, 14, 18, 14, 14, 14] }];
}

const colsNhip = () => [
  { titulo: "NHIP no.", ancho: 16 }, { titulo: t("col.trabajador"), ancho: 28 },
  { titulo: t("cont.sem"), ancho: 8, tipo: "numero" }, { titulo: t("cont.pago"), ancho: 12 },
  { titulo: t("cont.bruto"), tipo: "dinero" }, { titulo: t("seg.base_nhip"), tipo: "dinero" },
  { titulo: `NHIP ${t("seg.empleado")}`, tipo: "dinero" }, { titulo: `NHIP ${t("seg.empleador")}`, tipo: "dinero" }, { titulo: t("seg.total"), tipo: "dinero" },
];
const filaNhip = (f) => [f.numero_nhip || "", f.nombre_completo, f.nro, fecha(f.pago), r2(f.bruto), r2(f.base_nhip),
  r2(f.nhip_empleado), r2(f.nhip_empleador), r2(Number(f.nhip_empleado) + Number(f.nhip_empleador))];

// NHIP: detalle semana por semana y, aparte, el resumen por trabajador.
export function hojasNhip(emp, filas) {
  const detalle = filas.map(filaNhip);
  const tot = filas.reduce((a, f) => ({ bruto: a.bruto + Number(f.bruto), base: a.base + Number(f.base_nhip),
    e: a.e + Number(f.nhip_empleado), r: a.r + Number(f.nhip_empleador) }), { bruto: 0, base: 0, e: 0, r: 0 });
  detalle.push(Object.assign(["", t("cont.total"), "", "", r2(tot.bruto), r2(tot.base), r2(tot.e), r2(tot.r), r2(tot.e + tot.r)], { __total: true }));
  const gente = porTrabajador(filas);
  const resumen = gente.map((p) => [p.nhip, p.completo, "", "", r2(p.tot.bruto), r2(p.tot.base_nhip), r2(p.tot.nhip_empleado),
    r2(p.tot.nhip_empleador), r2(p.tot.nhip_empleado + p.tot.nhip_empleador)]);
  resumen.push(Object.assign(["", t("cont.total"), "", "", r2(tot.bruto), r2(tot.base), r2(tot.e), r2(tot.r), r2(tot.e + tot.r)], { __total: true }));
  return [
    { nombre: "NHIP", columnas: colsNhip(), filas: detalle },
    { nombre: t("cont.resumen"), columnas: colsNhip(), filas: resumen },
  ];
}

// Pagado por proyecto: detalle por proyecto y trabajador, y resumen por proyecto.
export function hojasProyectos(filas) {
  const horas = (min) => r2(Number(min || 0) / 60);
  const detalle = []; const resumen = [];
  const proyectos = [...new Set(filas.map((f) => f.proyecto))];
  let gB = 0; let gR = 0; let gE = 0;
  for (const nombre of proyectos) {
    const del = filas.filter((f) => f.proyecto === nombre);
    let pB = 0; let pR = 0; let pE = 0;
    for (const f of del) {
      pB += Number(f.bruto); pR += Number(f.minutos_reg); pE += Number(f.minutos_extra);
      detalle.push([nombre, f.trabajador, f.nro, fecha(f.pago), horas(f.minutos_reg), horas(f.minutos_extra), r2(f.bruto)]);
    }
    detalle.push(Object.assign([`${nombre} — ${t("cont.total")}`, "", "", "", horas(pR), horas(pE), r2(pB)], { __total: true }));
    resumen.push([nombre, horas(pR), horas(pE), r2(pB)]);
    gB += pB; gR += pR; gE += pE;
  }
  detalle.push(Object.assign([t("cont.total"), "", "", "", horas(gR), horas(gE), r2(gB)], { __total: true }));
  resumen.push(Object.assign([t("cont.total"), horas(gR), horas(gE), r2(gB)], { __total: true }));
  return [
    { nombre: t("cont.resumen"), columnas: [{ titulo: t("col.proyecto"), ancho: 32 }, { titulo: t("col.horas_reg"), tipo: "numero" },
      { titulo: t("cont.extra"), tipo: "numero" }, { titulo: t("cont.pagado"), tipo: "dinero" }], filas: resumen },
    { nombre: t("cont.detalle"), columnas: [{ titulo: t("col.proyecto"), ancho: 32 }, { titulo: t("col.trabajador"), ancho: 28 },
      { titulo: t("cont.sem"), ancho: 8, tipo: "numero" }, { titulo: t("cont.pago"), ancho: 12 }, { titulo: t("col.horas_reg"), tipo: "numero" },
      { titulo: t("cont.extra"), tipo: "numero" }, { titulo: t("cont.pagado"), tipo: "dinero" }], filas: detalle },
  ];
}
