// "Exportar todo": arma un Excel con una hoja por tema a partir del volcado que entrega la base (exportar_todo).
// Funciones puras: reciben el volcado y devuelven las hojas para crearXlsx. Los id se cambian por nombres.
import { aLocal } from "./ui.js";

// tabla → nombre de la hoja (el orden es el orden del archivo). Lo que no está aquí es de uso interno y no se exporta.
const HOJAS = [
  ["perfiles", "Trabajadores"], ["tarifas", "Tarifas"], ["turnos", "Horas"], ["semanas", "Semanas"],
  ["nomina_semanal", "Nómina"], ["nomina_proyecto", "Nómina por obra"], ["tasas_estatutarias", "Tasas NIB-NHIP"],
  ["prestamos", "Préstamos"], ["descuentos_prestamo", "Descuentos de préstamo"], ["proyectos", "Obras"],
  ["presupuestos", "Presupuestos"], ["gastos", "Gastos"], ["vehiculos", "Vehículos"], ["vehiculo_gasolina", "Gasolina"],
  ["vehiculo_seguro_costo", "Seguro de vehículos"], ["herramientas", "Herramientas"], ["documentos", "Documentos"],
  ["eventos_admin", "Historial"],
];
const OCULTAS = new Set(["id", "empresa_id", "foto_path", "foto_nombre", "recibo_path", "anulada"]);
const PERSONAS = new Set(["perfil_id", "creado_por", "aprobado_por", "conductor_id", "marcado_por", "por", "actualizado_por", "registrado_por", "encargado_id"]);
const DINERO = /(^|_)(bruto|neto|monto|total|seguro|prestamo|mano_obra|materiales|herramientas|subcontratos|tope_mensual|monto_hora)($|_)|^(nib|nhip|base)_/;

const titulo = (k) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const esMomento = (k, v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && (/_en$|^entrada$|^salida$/.test(k));

export function hojasExportacion(v) {
  const nombres = {
    perfil: new Map((v.perfiles || []).map((p) => [p.id, p.nombre])),
    proyecto: new Map((v.proyectos || []).map((p) => [p.id, p.nombre])),
    vehiculo: new Map((v.vehiculos || []).map((p) => [p.id, p.nombre])),
    semana: new Map((v.semanas || []).map((s) => [s.id, `${s.inicio} → ${s.fin}`])),
    prestamo: new Map((v.prestamos || []).map((p) => [p.id, `${nombres_perfil(v, p.perfil_id)} · ${p.fecha}`])),
  };
  const valor = (k, x) => {
    if (x === null || x === undefined) return "";
    if (PERSONAS.has(k)) return nombres.perfil.get(x) || x;
    if (k === "proyecto_id") return nombres.proyecto.get(x) || x;
    if (k === "vehiculo_id") return nombres.vehiculo.get(x) || x;
    if (k === "semana_id") return nombres.semana.get(x) || x;
    if (k === "prestamo_id") return nombres.prestamo.get(x) || x;
    if (esMomento(k, x)) return aLocal(x).replace("T", " ");
    if (Array.isArray(x)) return x.join(", ");
    if (typeof x === "object") return JSON.stringify(x);
    if (typeof x === "boolean") return x ? "Sí" : "No";
    return x;
  };
  const hojas = [];
  for (const [tabla, nombre] of HOJAS) {
    const filas = v[tabla];
    if (!Array.isArray(filas) || !filas.length) continue;
    const claves = Object.keys(filas[0]).filter((k) => !OCULTAS.has(k));
    // Si hay un id que se puede traducir a nombre (perfil_id, proyecto_id…), la columna sale con el nombre.
    const columnas = claves.map((k) => {
      const muestra = filas.find((f) => typeof f[k] === "number");
      const tipo = muestra ? (DINERO.test(k) ? "dinero" : filas.every((f) => typeof f[k] !== "number" || Number.isInteger(f[k])) ? "entero" : "numero") : "texto";
      return { titulo: titulo(k.replace(/_id$/, "")), tipo, ancho: /nombre|descripcion|detalle/.test(k) ? 28 : /_en$|entrada|salida/.test(k) ? 18 : undefined };
    });
    hojas.push({ nombre, columnas, filas: filas.map((f) => claves.map((k) => valor(k, f[k]))) });
  }
  return hojas;
}

function nombres_perfil(v, id) { return (v.perfiles || []).find((p) => p.id === id)?.nombre || ""; }

export const nombreExport = (empresa, hoy) =>
  `obrapay-datos_${String(empresa || "").normalize("NFD").replace(/[^\w ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase()}_${hoy}.xlsx`;
