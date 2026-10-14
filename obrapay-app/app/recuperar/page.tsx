'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function RecuperarPage() {
  const supabase = supabaseBrowser();
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Escribe un correo válido.');
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nueva-clave`,
    });
    setLoading(false);
    // Mensaje igual exista o no la cuenta, para no revelar qué correos están registrados.
    if (err && err.status === 429) {
      setError('Pediste demasiados correos seguidos. Espera unos minutos e inténtalo de nuevo.');
      return;
    }
    setEnviado(true);
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="bg-card rounded-2xl shadow-lg p-6 w-full max-w-sm">
        <h1 className="font-heading font-extrabold text-xl text-ink mb-1">Recuperar contraseña</h1>
        {enviado ? (
          <>
            <p className="text-sm text-inkSoft mt-3">
              Si ese correo tiene una cuenta, te enviamos un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.
            </p>
            <Link href="/login" className="block text-center text-primary font-semibold text-sm mt-5">Volver a entrar</Link>
          </>
        ) : (
          <form onSubmit={enviar}>
            <p className="text-sm text-inkSoft mb-4">Escribe tu correo y te enviamos un enlace.</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="w-full border border-line rounded-sm px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {error && <p className="text-danger text-sm mb-3" role="alert">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-primary text-white font-bold py-3 rounded-sm disabled:opacity-60">
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </button>
            <Link href="/login" className="block text-center text-inkSoft text-xs mt-4">Volver</Link>
          </form>
        )}
      </div>
    </div>
  );
}
