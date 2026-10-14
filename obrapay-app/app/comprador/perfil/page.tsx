'use client';

import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';

export default function PerfilCompradorPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();

  async function cerrarSesion() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-1">Perfil</h1>
      <p className="text-sm text-inkSoft mb-5">{usuario?.nombre}</p>

      <button
        onClick={cerrarSesion}
        className="w-full border border-danger text-danger rounded-sm py-3 text-sm font-bold"
      >
        Cerrar sesión
      </button>
    </>
  );
}
