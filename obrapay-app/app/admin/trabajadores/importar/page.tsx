'use client';

import { useState } from 'react';
import Link from 'next/link';
import { importarTrabajadores, type FilaImportacion } from '../actions';

const EJEMPLO = 'nombre,email,telefono,oficio,tarifa_hora,idioma\nCarlos Féliz,carlos@correo.com,6495551234,Plomero,12.50,es';

// Lector CSV mínimo: soporta comillas y comas dentro de comillas.
function leerCSV(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [], campo = '', enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') enComillas = false;
      else campo += c;
    } else if (c === '"') enComillas = true;
    else if (c === ',' || c === ';') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((x) => x.trim() !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some((x) => x.trim() !== '')) filas.push(fila);
  return filas;
}

export default function ImportarTrabajadoresPage() {
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Array<{ email: string; ok: boolean; error?: string }>>([]);

  async function cargarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setTexto(await f.text());
  }

  async function importar() {
    setAviso(null);
    setResultados([]);
    const filas = leerCSV(texto);
    if (filas.length < 2) { setAviso('Pega o sube un CSV con encabezados y al menos una fila.'); return; }
    const enc = filas[0].map((h) => h.trim().toLowerCase());
    const col = (n: string) => enc.indexOf(n);
    if (col('nombre') < 0 || col('email') < 0 || col('tarifa_hora') < 0) {
      setAviso('Faltan columnas obligatorias: nombre, email y tarifa_hora.');
      return;
    }
    const datos: FilaImportacion[] = filas.slice(1).map((r) => ({
      nombre: r[col('nombre')] ?? '',
      email: r[col('email')] ?? '',
      telefono: col('telefono') >= 0 ? r[col('telefono')] : undefined,
      oficio: col('oficio') >= 0 ? r[col('oficio')] : 'Obrero',
      tarifaHora: Number((r[col('tarifa_hora')] ?? '').replace(',', '.')),
      idioma: col('idioma') >= 0 ? r[col('idioma')]?.trim().toLowerCase() : 'es',
    }));
    setBusy(true);
    const r: any = await importarTrabajadores(datos);
    setBusy(false);
    if (r?.error) { setAviso(r.error); return; }
    setResultados(r.resultados);
  }

  const ok = resultados.filter((x) => x.ok).length;

  return (
    <>
      <Link href="/admin/trabajadores" className="text-xs text-inkSoft">← Trabajadores</Link>
      <h1 className="font-heading font-extrabold text-2xl text-ink mt-1 mb-2">Importar trabajadores</h1>
      <p className="text-sm text-inkSoft mb-3">
        Sube un CSV (en Excel: Guardar como → CSV) con las columnas <b>nombre, email, telefono, oficio, tarifa_hora, idioma</b>.
        Cada persona recibe un correo para crear su contraseña.
      </p>
      <pre className="bg-card border border-line rounded p-3 text-[11px] overflow-x-auto mb-3">{EJEMPLO}</pre>
      <input type="file" accept=".csv,text/csv" onChange={cargarArchivo} className="text-sm mb-3 block" />
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={8}
        placeholder="…o pega aquí el contenido del CSV"
        className="w-full border border-line rounded-sm px-3 py-2 text-xs font-mono mb-3"
      />
      {aviso && <p className="text-danger text-sm mb-3" role="alert">{aviso}</p>}
      <button onClick={importar} disabled={busy || !texto.trim()} className="bg-primary text-white font-bold text-sm px-5 py-3 rounded-sm disabled:opacity-60">
        {busy ? 'Importando…' : 'Importar'}
      </button>

      {resultados.length > 0 && (
        <div className="mt-5">
          <p className="font-bold text-sm text-ink mb-2">{ok} de {resultados.length} importados</p>
          <ul className="text-xs space-y-1">
            {resultados.map((r, i) => (
              <li key={i} className={r.ok ? 'text-ink' : 'text-danger'}>
                {r.ok ? '✓' : '✗'} {r.email}{r.error ? ` — ${r.error}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
