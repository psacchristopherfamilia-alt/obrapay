'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function NuevaClavePage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const [listo, setListo] = useState(false);
  const [invalido, setInvalido] = useState(false);
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // El enlace del correo trae ?code=... (flujo PKCE) o #access_token (enlace de invitación).
  useEffect(() => {
    async function validar() {
      const code = new URLSearchParams(window.location.search).get('code');
      if (code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(code);
        if (err) { setInvalido(true); return; }
        setListo(true);
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setListo(true);
      else setInvalido(true);
    }
    validar();
  }, [supabase]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (clave.length < 8) { setError('Usa al menos 8 caracteres.'); return; }
    if (clave !== clave2) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password: clave });
    setLoading(false);
    if (err) { setError('No se pudo guardar: ' + err.message); return; }
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="bg-card rounded-2xl shadow-lg p-6 w-full max-w-sm">
        <h1 className="font-heading font-extrabold text-xl text-ink mb-3">Nueva contraseña</h1>
        {invalido ? (
          <p className="text-sm text-danger">Este enlace venció o ya se usó. Pide uno nuevo desde "¿Olvidaste tu contraseña?".</p>
        ) : !listo ? (
          <p className="text-sm text-inkSoft">Verificando enlace…</p>
        ) : (
          <form onSubmit={guardar}>
            <input type="password" value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Nueva contraseña"
              className="w-full border border-line rounded-sm px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary" />
            <input type="password" value={clave2} onChange={(e) => setClave2(e.target.value)} placeholder="Repite la contraseña"
              className="w-full border border-line rounded-sm px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary" />
            {error && <p className="text-danger text-sm mb-3" role="alert">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-primary text-white font-bold py-3 rounded-sm disabled:opacity-60">
              {loading ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
