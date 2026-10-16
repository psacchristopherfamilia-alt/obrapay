// Lector mínimo de archivos Excel (.xlsx) sin librerías: un .xlsx es un zip con XML adentro.
// Solo lee la primera hoja y devuelve filas de texto. Las fechas de Excel (números) se convierten a AAAA-MM-DD.

const u16 = (d, o) => d[o] | (d[o + 1] << 8);
const u32 = (d, o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
const texto = (bytes) => new TextDecoder("utf-8").decode(bytes);

async function inflar(bytes) {
  const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

// Lee el directorio central del zip y devuelve { nombre: () => Promise<Uint8Array> }
function abrirZip(buf) {
  const d = new Uint8Array(buf);
  let fin = -1;
  for (let i = d.length - 22; i >= Math.max(0, d.length - 65558); i--) {
    if (u32(d, i) === 0x06054b50) { fin = i; break; }
  }
  if (fin < 0) throw new Error("zip");
  const n = u16(d, fin + 10);
  let o = u32(d, fin + 16);
  const archivos = {};
  for (let i = 0; i < n; i++) {
    if (u32(d, o) !== 0x02014b50) throw new Error("zip");
    const metodo = u16(d, o + 10);
    const tam = u32(d, o + 20);
    const lNombre = u16(d, o + 28), lExtra = u16(d, o + 30), lCom = u16(d, o + 32);
    const local = u32(d, o + 42);
    const nombre = texto(d.subarray(o + 46, o + 46 + lNombre));
    archivos[nombre] = async () => {
      const ln = u16(d, local + 26), le = u16(d, local + 28);
      const ini = local + 30 + ln + le;
      const datos = d.subarray(ini, ini + tam);
      if (metodo === 0) return datos;
      if (metodo === 8) return inflar(datos);
      throw new Error("zip");
    };
    o += 46 + lNombre + lExtra + lCom;
  }
  return archivos;
}

const columna = (ref) => {
  let n = 0;
  for (const c of ref.replace(/[0-9]/g, "")) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
};

const fechaSerial = (n) => {
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const f = new Date(ms);
  return Number.isNaN(f.getTime()) ? "" : f.toISOString().slice(0, 10);
};

// Devuelve las filas de la primera hoja como arreglos de texto. `fechas`: columnas (por posición) que deben leerse como fecha.
export async function leerXlsx(buf, { fechas = [] } = {}) {
  let zip;
  try { zip = abrirZip(buf); } catch { throw new Error("no_xlsx"); }
  const hojas = Object.keys(zip).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => parseInt(a.match(/(\d+)\.xml/)[1]) - parseInt(b.match(/(\d+)\.xml/)[1]));
  if (!hojas.length) throw new Error("no_xlsx");
  const xml = (s) => new DOMParser().parseFromString(s, "application/xml");
  let compartidos = [];
  if (zip["xl/sharedStrings.xml"]) {
    const doc = xml(texto(await zip["xl/sharedStrings.xml"]()));
    compartidos = [...doc.getElementsByTagName("si")].map((si) => [...si.getElementsByTagName("t")].map((t) => t.textContent).join(""));
  }
  const hoja = xml(texto(await zip[hojas[0]]()));
  const filas = [];
  for (const fila of hoja.getElementsByTagName("row")) {
    const r = [];
    for (const c of fila.getElementsByTagName("c")) {
      const i = columna(c.getAttribute("r") || "A1");
      const tipo = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      let valor = "";
      if (tipo === "s") valor = compartidos[Number(v)] ?? "";
      else if (tipo === "inlineStr") valor = [...c.getElementsByTagName("t")].map((t) => t.textContent).join("");
      else if (tipo === "str" || tipo === "b" || tipo === "e") valor = v;
      else if (v !== "" && fechas.includes(i) && Number(v) > 20000 && Number(v) < 80000) valor = fechaSerial(Number(v));
      else valor = v;
      r[i] = String(valor).trim();
    }
    for (let k = 0; k < r.length; k++) if (r[k] === undefined) r[k] = "";
    filas.push(r);
  }
  return filas;
}

const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Columnas de la plantilla de trabajadores, por nombre de título (sin importar el orden).
const CAMPOS = [
  ["nombre", ["nombre completo", "nombre"]],
  ["oficio", ["oficio"]],
  ["tarifa", ["tarifa por hora", "tarifa"]],
  ["telefono", ["telefono"]],
  ["nib", ["numero nib", "nib"]],
  ["nhip", ["numero nhip", "nhip"]],
  ["permiso_numero", ["permiso de trabajo numero"]],
  ["permiso_vence", ["permiso de trabajo vence"]],
  ["licencia_numero", ["licencia de conducir numero"]],
  ["licencia_vence", ["licencia de conducir vence"]],
];
const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;

// Convierte las filas leídas en personas con su validación. Devuelve { personas, error }.
export function trabajadoresDeFilas(filas) {
  if (!filas.length) return { personas: [], error: "vacio" };
  const titulos = filas[0].map(sinAcentos);
  const pos = {};
  for (const [campo, nombres] of CAMPOS) {
    const i = titulos.findIndex((x) => nombres.includes(x));
    if (i >= 0) pos[campo] = i;
  }
  if (pos.nombre === undefined || pos.tarifa === undefined) return { personas: [], error: "titulos" };
  const personas = [];
  for (let f = 1; f < filas.length; f++) {
    const r = filas[f];
    const get = (c) => (pos[c] === undefined ? "" : String(r[pos[c]] ?? "").trim());
    if (!r.some((x) => String(x || "").trim())) continue; // fila vacía
    const p = { fila: f + 1 };
    for (const [campo] of CAMPOS) p[campo] = get(campo);
    p.tarifa = Number(String(p.tarifa).replace(/[$,\s]/g, ""));
    const errores = [];
    if (!p.nombre) errores.push("nombre");
    if (!(p.tarifa > 0)) errores.push("tarifa");
    if (p.permiso_vence && !FECHA_OK.test(p.permiso_vence)) errores.push("permiso");
    if (p.licencia_vence && !FECHA_OK.test(p.licencia_vence)) errores.push("licencia");
    p.errores = errores;
    personas.push(p);
  }
  return { personas, error: personas.length ? null : "vacio" };
}

export { CAMPOS as CAMPOS_TRABAJADOR };
// Las columnas de fecha de la plantilla (posición 7 y 9, contando desde 0) para pasarlas a leerXlsx.
export const COLUMNAS_FECHA = [7, 9];
