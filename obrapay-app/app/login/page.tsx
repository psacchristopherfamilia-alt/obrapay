'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Ingresa tu correo y contraseña.');
      return;
    }

    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (authError) {
      setError('Correo o contraseña incorrectos.');
      return;
    }

    // El middleware decide a dónde va según el rol; aquí solo forzamos
    // una recarga para que vuelva a evaluar la sesión ya autenticada.
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Panel hero */}
      <div className="bg-charcoal text-white px-6 pt-14 pb-16 relative">
        <div className="w-15 h-15 bg-primary rounded-2xl flex items-center justify-center mb-5">
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-white">
            <rect x="4" y="13" width="4" height="7" rx="1" />
            <rect x="10" y="8" width="4" height="12" rx="1" />
            <rect x="16" y="4" width="4" height="16" rx="1" />
          </svg>
        </div>
        <p className="text-xs font-bold tracking-widest text-blue-200 uppercase mb-2">
          OBRAPAY
        </p>
        <h1 className="font-heading font-extrabold text-2xl leading-tight">
          Control de horas para tu obra, hecho para el equipo.
        </h1>
      </div>

      {/* Panel de formulario flotante */}
      <form
        onSubmit={handleLogin}
        className="bg-card mx-4 -mt-8 rounded-2xl shadow-lg p-6 relative z-10 flex-1"
      >
        <div className="mb-4">
          <label className="block text-xs font-semibold text-inkSoft mb-1">
            Correo o usuario
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="carlos.felix@obrapay.com"
            className="w-full border border-line rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-inkSoft mb-1">
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full border border-line rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && (
          <p className="text-danger text-sm mb-3" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-white font-bold py-3 rounded-sm disabled:opacity-60"
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="text-xs text-inkSoft text-center mt-4">
          ¿Olvidaste tu contraseña? Contacta al administrador.
        </p>
      </form>
    </div>
  );
}
