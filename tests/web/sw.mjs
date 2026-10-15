// Revisa que la app abra sin señal: el service worker guarda todos los archivos y la app carga con la red cortada.
// Uso: node tests/web/sw.mjs
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";

const require = createRequire("/home/claude/.npm-global/lib/node_modules/@playwright/mcp/");
const { chromium } = require("playwright");
const WEB = new URL("../../web/", import.meta.url).pathname;
const TIPOS = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const fallas = [];

// 1. Todos los archivos de la app están en la lista del service worker.
const sw = await readFile(join(WEB, "sw.js"), "utf8");
async function archivos(dir) {
  const salida = [];
  for (const e of await readdir(join(WEB, dir), { withFileTypes: true })) {
    if (e.isDirectory()) salida.push(...(await archivos(join(dir, e.name))));
    else salida.push(join(dir, e.name));
  }
  return salida;
}
for (const f of [...(await archivos("js")), ...(await archivos("css")), "index.html", "config.js", "manifest.webmanifest"]) {
  if (!sw.includes(`"${f}"`)) fallas.push(`sw.js no guarda ${f}`);
}

// 2. Con la red cortada, la app abre desde el teléfono.
const servidor = createServer(async (req, res) => {
  const ruta = normalize(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  try {
    const cuerpo = await readFile(join(WEB, ruta));
    res.writeHead(200, { "content-type": TIPOS[extname(ruta)] || "application/octet-stream" });
    res.end(cuerpo);
  } catch { res.writeHead(404); res.end(); }
}).listen(0);
const BASE = `http://localhost:${servidor.address().port}/`;
const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const ctx = await navegador.newContext();
await ctx.route(/fonts\.(googleapis|gstatic)\.com|supabase/, (r) => r.abort());
const pg = await ctx.newPage();
const errores = [];
pg.on("pageerror", (e) => errores.push(String(e)));
await pg.goto(BASE);
await pg.waitForSelector("#app *");
await pg.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === "activated", null, { timeout: 8000 }).catch(() => fallas.push("el service worker no se activó"));
await pg.waitForTimeout(500);
const guardados = await pg.evaluate(async () => (await (await caches.open("obrapay-v1")).keys()).length);
if (guardados < 20) fallas.push(`el service worker guardó solo ${guardados} archivos`);
await ctx.setOffline(true);
await pg.reload();
await pg.waitForSelector("#app *", { timeout: 8000 });
const texto = await pg.evaluate(() => document.body.innerText);
if (!/ObraPay|Entrar|Usuario/i.test(texto)) fallas.push(`sin red la app no abrió: "${texto.slice(0, 80)}"`);
if (errores.length) fallas.push(`errores JS: ${errores.join(" | ")}`);
await navegador.close();
servidor.close();

if (fallas.length) { console.log("FALLAS:\n- " + fallas.join("\n- ")); process.exit(1); }
console.log("RESULTADO: todo bien (la app abre sin señal)");
