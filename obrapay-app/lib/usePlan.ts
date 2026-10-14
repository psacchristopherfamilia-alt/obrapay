'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';

export type ClavePlan = 'free' | 'basic' | 'pro' | 'enterprise';

const ORDEN_PLANES: ClavePlan[] = ['free', 'basic', 'pro', 'enterprise'];

/** true si `plan` es igual o superior a `minimo` en la escalera de planes */
export function planIncluye(plan: ClavePlan | null, minimo: ClavePlan): boolean {
  if (!plan) return false;
  return ORDEN_PLANES.indexOf(plan) >= ORDEN_PLANES.indexOf(minimo);
}

export function usePlanEmpresa() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [plan, setPlan] = useState<ClavePlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      if (!usuario?.empresa_id) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('suscripciones')
        .select('planes(clave)')
        .eq('empresa_id', usuario.empresa_id)
        .single();

      setPlan((data?.planes as any)?.clave ?? 'free');
      setLoading(false);
    }
    cargar();
  }, [supabase, usuario]);

  return {
    plan,
    loading,
    tieneGeofence: planIncluye(plan, 'pro'),
    tieneFirmaDigital: planIncluye(plan, 'pro'),
    tieneMultiSupervisor: planIncluye(plan, 'pro'),
    tieneExportAutomatica: planIncluye(plan, 'pro'),
    tieneAlertasPresupuesto: planIncluye(plan, 'pro'),
    tieneHistorialCompleto: planIncluye(plan, 'basic'),
  };
}
