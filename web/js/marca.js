// Marca de cada compañía: nombre, color y logo (o iniciales). Se aplica con variables CSS y se guarda una copia
// para que la pantalla de entrada ya salga con la marca de la última compañía usada en este aparato.
const LLAVE = "obrapay.marca";
const VARS = ["--acento", "--acento-osc", "--acento-suave", "--sobre-acento"];

const hex = (c) => /^#[0-9a-f]{6}$/i.test(c || "");
const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const aHex = (v) => `#${v.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("")}`;
const lum = (c) => { const [r, g, b] = rgb(c).map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const mezcla = (c, con, p) => aHex(rgb(c).map((x, i) => x + (rgb(con)[i] - x) * p));
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const oscuro = () => { try { return matchMedia("(prefers-color-scheme: dark)").matches && document.documentElement.dataset.theme !== "light" || document.documentElement.dataset.theme === "dark"; } catch { return false; } };

// Devuelve las variables que corresponden a un color de marca (con contraste legible en claro y en oscuro).
export function variablesDeMarca(color, esOscuro = oscuro()) {
  if (!hex(color)) return null;
  let a = color.toLowerCase();
  const fondo = esOscuro ? "#14181a" : "#ffffff";
  // Texto y enlaces usan el acento sobre el fondo: si no se lee, se acerca al blanco (oscuro) o al negro (claro).
  for (let i = 0; i < 12 && contraste(a, fondo) < 4.5; i += 1) a = mezcla(a, esOscuro ? "#ffffff" : "#000000", 0.12);
  const sobre = contraste(a, "#ffffff") >= contraste(a, "#111111") ? "#ffffff" : "#111111";
  const osc = esOscuro ? mezcla(a, "#ffffff", 0.25) : mezcla(a, "#000000", 0.25);
  const [r, g, b] = rgb(a);
  const suave = esOscuro ? `rgba(${r}, ${g}, ${b}, .2)` : `rgba(${r}, ${g}, ${b}, .12)`;
  return { "--acento": a, "--acento-osc": osc, "--acento-suave": suave, "--sobre-acento": sobre };
}

let ultima = null;
export function aplicarMarca(marca) {
  ultima = marca || null;
  const raiz = document.documentElement;
  VARS.forEach((v) => raiz.style.removeProperty(v));
  const v = variablesDeMarca(marca?.marca_color ?? marca?.color);
  if (v) Object.entries(v).forEach(([k, val]) => raiz.style.setProperty(k, val));
}
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => ultima && aplicarMarca(ultima)); } catch { /* nada */ }

export function guardarMarca(empresa) {
  try {
    const m = { nombre: empresa?.marca_nombre || null, color: empresa?.marca_color || null, logo: empresa?.marca_logo || null, empresa: empresa?.nombre || null };
    if (m.nombre || m.color || m.logo) localStorage.setItem(LLAVE, JSON.stringify(m)); else localStorage.removeItem(LLAVE);
  } catch { /* nada */ }
}
export function marcaGuardada() {
  try { const m = JSON.parse(localStorage.getItem(LLAVE)); return m && typeof m === "object" ? { marca_nombre: m.nombre, marca_color: m.color, marca_logo: m.logo, nombre: m.empresa } : null; } catch { return null; }
}
export function aplicarYGuardar(empresa) { aplicarMarca(empresa); guardarMarca(empresa); }
export function aplicarMarcaGuardada() { const m = marcaGuardada(); if (m) aplicarMarca(m); }

export const tieneMarca = (e) => !!(e?.marca_nombre || e?.marca_color || e?.marca_logo);
export const nombreMarca = (e) => (e?.marca_nombre || e?.nombre || "").trim();
export function iniciales(nombre) {
  const p = (nombre || "").trim().split(/\s+/).filter((x) => x.length > 1 || /\p{L}/u.test(x));
  const l = p.filter((x) => !/^(de|del|la|las|los|y|and|the|ltd|inc|co)\.?$/i.test(x));
  const base = l.length ? l : p;
  return ((base[0]?.[0] || "") + (base[1]?.[0] || "")).toUpperCase() || "OP";
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// HTML (texto) del logo: imagen si hay, si no un cuadro con las iniciales.
export function logoHtml(e, clase = "logo-marca") {
  if (!tieneMarca(e)) return "";
  const logo = e?.marca_logo;
  if (logo && /^data:image\/(png|jpeg|webp);base64,/.test(logo)) return `<img class="${clase}" src="${esc(logo)}" alt="">`;
  return `<div class="${clase} logo-ini" aria-hidden="true">${esc(iniciales(nombreMarca(e)))}</div>`;
}

// Reduce una imagen a un logo pequeño (máx. 160 px) en PNG/WebP para guardarlo en la base de datos.
export function reducirLogo(archivo, max = 160) {
  return new Promise((ok, mal) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(archivo.type)) { mal(new Error("tipo")); return; }
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/png");
      out.length > 140000 ? mal(new Error("grande")) : ok(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error("imagen")); };
    img.src = url;
  });
}

// Marca para el encabezado de los Excel (logo + nombre). Sin logo sale solo el nombre.
export const marcaDe = (e, linea = "") => ({ nombre: nombreMarca(e), logo: e?.marca_logo || null, linea });
