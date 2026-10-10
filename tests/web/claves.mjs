// Verifica que cada texto usado en las pantallas exista en los 3 idiomas.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
globalThis.localStorage = { getItem: () => "es", setItem() {} };
globalThis.document = { documentElement: {} };

const raiz = new URL("../../web/js/", import.meta.url).pathname;
const { TEXTOS } = await import(join(raiz, "i18n.js"));
const archivos = [];
const recorrer = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => e.isDirectory() ? recorrer(join(d, e.name)) : e.name.endsWith(".js") && archivos.push(join(d, e.name)));
recorrer(raiz);
const usadas = new Set();
for (const f of archivos) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/\bt\("([a-z_]+\.[a-z_0-9]+)"/g)) usadas.add(m[1]);
  for (const m of s.matchAll(/"((?:nav|estado|turno)\.[a-z_]+)"/g)) usadas.add(m[1]);
}
for (const r of ["trabajador", "supervisor", "admin", "dueno"]) usadas.add(`rol.${r}`);
for (const e of ["abierta", "cerrada", "pagada"]) usadas.add(`semana.${e}`);
let fallas = 0;
for (const [lang, tx] of Object.entries(TEXTOS)) {
  for (const k of usadas) if (!(k in tx)) { console.log(`falta ${lang}: ${k}`); fallas++; }
  for (const k of Object.keys(TEXTOS.es)) if (!(k in tx)) { console.log(`${lang} no tiene ${k}`); fallas++; }
  for (const [k, v] of Object.entries(tx)) {
    const a = (TEXTOS.es[k] || "").match(/\{\w+\}/g)?.sort().join() || "";
    const b = v.match(/\{\w+\}/g)?.sort().join() || "";
    if (k !== "locale" && a !== b) { console.log(`${lang} variables distintas en ${k}: ${a} vs ${b}`); fallas++; }
  }
}
const sobran = Object.keys(TEXTOS.es).filter((k) => !usadas.has(k) && k !== "locale");
console.log(`claves usadas: ${usadas.size}; sin usar: ${sobran.length}${sobran.length ? " → " + sobran.join(", ") : ""}`);
console.log(fallas ? `RESULTADO: ${fallas} fallas` : "RESULTADO: todo bien");
process.exit(fallas ? 1 : 0);
