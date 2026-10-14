'use client';

import { useState } from 'react';
import Link from 'next/link';
import { registrarEmpresaPublica } from './actions';

export default function RegistroPage() {
  const [f, setF] = useState({ nombreEmpresa: '', nombreAdmin: '', emailAdmin: '', telefonoAdmin: '', idioma: 'es' as 'es' | 'en' | 'ht' });
  const [web, setWeb] = useState(''); // trampa anti-bots: las personas no la ven
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (web) { setOk(true); return; } // un bot llenó el campo oculto: fingimos éxito sin hacer nada
    setLoading(true);
    const r: any = await registrarEmpresaPublica(f);
    setLoading(false);
    if (r?.error) { setError(r.error); return; }
    setOk(true);
  }

  const input = 'w-full border border-line rounded-sm px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4 py-8">
      <div className="bg-card rounded-2xl shadow-lg p-6 w-full max-w-sm">
        <h1 className="font-heading font-extrabold text-xl text-ink mb-1">Registrar mi empresa</h1>
        <p className="text-sm text-inkSoft mb-4">1 mes de prueba, sin tarjeta.</p>
        {ok ? (
          <>
            <p className="text-sm text-ink">¡Listo! Te enviamos un correo para crear tu contraseña y entrar como administrador.</p>
            <Link href="/login" className="block text-center text-primary font-semibold text-sm mt-5">Ir a entrar</Link>
          </>
        ) : (
          <form onSubmit={enviar}>
            <input className={input} placeholder="Nombre de la empresa" value={f.nombreEmpresa} onChange={(e) => setF({ ...f, nombreEmpresa: e.target.value })} />
            <input className={input} placeholder="Tu nombre" value={f.nombreAdmin} onChange={(e) => setF({ ...f, nombreAdmin: e.target.value })} />
            <input className={input} type="email" placeholder="Tu correo" value={f.emailAdmin} onChange={(e) => setF({ ...f, emailAdmin: e.target.value })} />
            <input className={input} placeholder="Teléfono (opcional)" value={f.telefonoAdmin} onChange={(e) => setF({ ...f, telefonoAdmin: e.target.value })} />
            <select className={input} value={f.idioma} onChange={(e) => setF({ ...f, idioma: e.target.value as 'es' | 'en' | 'ht' })}>
              <option value="es">Español</option>
              <option value="en">English</option>
              <option value="ht">Kreyòl ayisyen</option>
            </select>
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={web} onChange={(e) => setWeb(e.target.value)}
              style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }} name="sitio_web" />
            {error && <p className="text-danger text-sm mb-3" role="alert">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-primary text-white font-bold py-3 rounded-sm disabled:opacity-60">
              {loading ? 'Creando…' : 'Crear mi cuenta'}
            </button>
            <Link href="/login" className="block text-center text-inkSoft text-xs mt-4">Ya tengo cuenta</Link>
          </form>
        )}
      </div>
    </div>
  );
}
