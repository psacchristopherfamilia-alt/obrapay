// Genera un archivo .xlsx real (Office Open XML) sin librerías: XML + ZIP sin compresión.
// hojas: [{ nombre, columnas: [{ titulo, tipo: "texto"|"numero"|"dinero"|"horas", ancho }], filas: [[...]] }]

const xmlEsc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
  // caracteres de control no válidos en XML
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function letraCol(n) {
  let s = "";
  n += 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}


// ---------- encabezado con la marca de la compañía (logo + nombre) ----------
// marca: { nombre, logo (data URL png/jpeg, opcional), linea (texto opcional) }. Ocupa las filas 1-3 y deja la 4 en blanco.
const FILAS_MARCA = 4;
const LOGO_MAX_ANCHO = 80; const LOGO_MAX_ALTO = 64; const EMU = 9525;

export function leerLogo(dataUrl) {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) return null;
  let bin;
  try { bin = atob(m[2]); } catch { return null; }
  const b = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  let w = 0; let h = 0;
  if (m[1] === "png") {
    if (b.length < 24) return null;
    const dv = new DataView(b.buffer); w = dv.getUint32(16); h = dv.getUint32(20);
  } else {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) { i += 1; continue; }
      const mk = b[i + 1];
      if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) { h = (b[i + 5] << 8) | b[i + 6]; w = (b[i + 7] << 8) | b[i + 8]; break; }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
  }
  if (!w || !h) return null;
  const k = Math.min(LOGO_MAX_ANCHO / w, LOGO_MAX_ALTO / h);
  return { ext: m[1], bytes: b, cx: Math.round(w * k * EMU), cy: Math.round(h * k * EMU), px: Math.round(w * k) };
}

// Columna donde empieza el texto: justo después del logo (según el ancho de las columnas).
function colTexto(anchos, px) {
  if (!px) return 0;
  const necesarios = Math.ceil(px / 7) + 1;
  let acum = 0;
  for (let i = 0; i < anchos.length; i += 1) { if (acum >= necesarios) return i; acum += anchos[i]; }
  return Math.max(1, anchos.length);
}

function encabezadoMarca(hoja, marca, logo, anchos) {
  const k = colTexto(anchos, logo?.px);
  const fila = (n, ht, txt, estilo) => (txt ? `<row r="${n}" ht="${ht}" customHeight="1"><c r="${letraCol(k)}${n}" t="inlineStr"${estilo ? ` s="${estilo}"` : ""}><is><t xml:space="preserve">${xmlEsc(txt)}</t></is></c></row>` : `<row r="${n}" ht="${ht}" customHeight="1"/>`);
  return fila(1, 24, marca.nombre, 6) + fila(2, 22, hoja.titulo || hoja.nombre, 1) + fila(3, 22, marca.linea, 0);
}

function dibujoXml(logo) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>38100</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from><xdr:ext cx="${logo.cx}" cy="${logo.cy}"/>
<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${logo.cx}" cy="${logo.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;
}

// estilos: 0 normal, 1 encabezado en negrita, 2 dinero, 3 número con 2 decimales, 4 total en negrita dinero
const ESTILO = { texto: 0, numero: 3, dinero: 2, horas: 3, entero: 5 };

// Hoja libre (para reproducir formularios): hoja.libre = filas; cada celda es un valor o { v, e } con e = "neg" (negrita),
// "din" (dinero), "dinneg" (dinero en negrita), "num" (2 decimales). hoja.anchos = anchos de columna. Sin fila de encabezado fija.
const ESTILO_LIBRE = { neg: 1, din: 2, num: 3, dinneg: 4 };
function hojaLibreXml(hoja, marca, logo) {
  const off = marca ? FILAS_MARCA : 0;
  const ncol = Math.max(1, ...hoja.libre.map((f) => f.length));
  const anchos = Array.from({ length: ncol }, (_, i) => (hoja.anchos || [])[i] || 14);
  const cols = anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join("");
  const filas = hoja.libre.map((fila, fi) => {
    const celdas = fila.map((c, ci) => {
      const obj = c !== null && typeof c === "object";
      const v = obj ? c.v : c;
      const e = obj ? c.e : undefined;
      if (v === null || v === undefined || v === "") return "";
      const ref = `${letraCol(ci)}${fi + 1 + off}`;
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}" s="${ESTILO_LIBRE[e] ?? 0}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${e === "neg" || e === "dinneg" ? ' s="1"' : ""}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join("");
    return `<row r="${fi + 1 + off}">${celdas}</row>`;
  });
  const cab = marca ? encabezadoMarca(hoja, marca, logo, anchos) : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"/></sheetViews>
<cols>${cols}</cols><sheetData>${cab}${filas.join("")}</sheetData>${logo ? '<drawing r:id="rId1"/>' : ""}</worksheet>`;
}

function hojaXml(hoja, marca = null, logo = null) {
  if (hoja.libre) return hojaLibreXml(hoja, marca, logo);
  const off = marca ? FILAS_MARCA : 0;
  const anchos = hoja.columnas.map((c) => c.ancho || Math.max(12, String(c.titulo).length + 4));
  const cols = anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join("");
  const filas = [];
  const enc = hoja.columnas.map((c, i) =>
    `<c r="${letraCol(i)}${1 + off}" t="inlineStr" s="1"><is><t>${xmlEsc(c.titulo)}</t></is></c>`).join("");
  filas.push(`<row r="${1 + off}">${enc}</row>`);
  hoja.filas.forEach((fila, fi) => {
    const r = fi + 2 + off;
    const negrita = fila.__total;
    const celdas = hoja.columnas.map((c, ci) => {
      const v = fila[ci];
      const ref = `${letraCol(ci)}${r}`;
      if (v === null || v === undefined || v === "") return "";
      if (c.tipo && c.tipo !== "texto" && typeof v === "number" && Number.isFinite(v)) {
        const s = negrita ? 4 : ESTILO[c.tipo];
        return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"${negrita ? ' s="1"' : ""}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join("");
    filas.push(`<row r="${r}">${celdas}</row>`);
  });
  const cab = marca ? encabezadoMarca(hoja, marca, logo, anchos) : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${1 + off}" topLeftCell="A${2 + off}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols><sheetData>${cab}${filas.join("")}</sheetData>${logo ? '<drawing r:id="rId1"/>' : ""}</worksheet>`;
}

const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs></styleSheet>`;

// --- ZIP sin compresión ---
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function zip(archivos) {
  const te = new TextEncoder();
  const partes = [];
  const central = [];
  let offset = 0;
  for (const a of archivos) {
    const nombre = te.encode(a.nombre);
    const datos = typeof a.contenido === "string" ? te.encode(a.contenido) : a.contenido;
    const crc = crc32(datos);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true);
    loc.setUint16(8, 0, true); loc.setUint16(10, 0, true); loc.setUint16(12, 0x21, true);
    loc.setUint32(14, crc, true); loc.setUint32(18, datos.length, true); loc.setUint32(22, datos.length, true);
    loc.setUint16(26, nombre.length, true); loc.setUint16(28, 0, true);
    partes.push(new Uint8Array(loc.buffer), nombre, datos);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true); cen.setUint16(12, 0, true); cen.setUint16(14, 0x21, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, datos.length, true); cen.setUint32(24, datos.length, true);
    cen.setUint16(28, nombre.length, true); cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nombre);
    offset += 30 + nombre.length + datos.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
  return new Blob([...partes, ...central, new Uint8Array(fin.buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function crearXlsx(hojas, marca = null) {
  if (marca && !marca.nombre && !marca.logo) marca = null;
  const logo = marca ? leerLogo(marca.logo) : null;
  const nombres = hojas.map((h, i) => xmlEsc(String(h.nombre || `Hoja${i + 1}`).replace(/[\\/?*[\]:]/g, " ").slice(0, 31)));
  const archivos = [
    { nombre: "[Content_Types].xml", contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${logo ? `<Default Extension="${logo.ext}" ContentType="image/${logo.ext}"/>` : ""}
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
${logo ? hojas.map((_, i) => `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join("") : ""}
</Types>` },
    { nombre: "_rels/.rels", contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },
    { nombre: "xl/workbook.xml", contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${nombres.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { nombre: "xl/_rels/workbook.xml.rels", contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}
<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },
    { nombre: "xl/styles.xml", contenido: ESTILOS_XML },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: hojaXml(h, marca, logo) })),
  ];
  if (logo) {
    archivos.push({ nombre: `xl/media/logo.${logo.ext}`, contenido: logo.bytes });
    hojas.forEach((_, i) => {
      archivos.push(
        { nombre: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`, contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${i + 1}.xml"/></Relationships>` },
        { nombre: `xl/drawings/drawing${i + 1}.xml`, contenido: dibujoXml(logo) },
        { nombre: `xl/drawings/_rels/drawing${i + 1}.xml.rels`, contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.${logo.ext}"/></Relationships>` },
      );
    });
  }
  return zip(archivos);
}

export function descargar(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
