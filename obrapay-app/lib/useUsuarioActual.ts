'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { Usuario, PerfilNomina } from '@/types/database';

export function useUsuarioActual() {
  const supabase = supabaseBrowser();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [perfil, setPerfil] = useState<PerfilNomina | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const [{ data: u }, { data: p }] = await Promise.all([
        supabase.from('usuarios').select('*').eq('id', user.id).single(),
        supabase.from('perfil_nomina').select('*').eq('usuario_id', user.id).single(),
      ]);

      setUsuario(u ?? null);
      setPerfil(p ?? null);
      setLoading(false);
    }

    cargar();
  }, [supabase]);

  return { usuario, perfil, loading };
}
