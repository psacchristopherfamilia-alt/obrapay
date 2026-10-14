'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface FilaEmpresa {
  id: string;
  nombre: string;
  estado: 'active' | 'trial' | 'suspended';
  creado_en: string;
  trial_termina_en: string | null;
  plan_clave: string;
  cantidad_trabajadores: number;
}

const ETIQUETA_ESTADO: Record<string, { texto: string; clase: string }> = {
  active: { texto: 'Activa', clase: 'bg-green-50 text-success' },
  trial: { texto: 'Prueba', clase: 'bg-steel-soft text-steel' },
  suspended: { texto: 'Suspendida', clase: 'bg-orange-50 text-warning' },
};

const NOMBRE_PLAN: Record<string, string> = {
  free: 'Gratuito',
  basic: 'Básico',
  pro: 'Profesional',
  enterprise: 'Empresarial',
};

export default function EmpresasPage() {
  const supabase = supabaseBrowser();
  const [empresas, setEmpresas] = useState<FilaEmpresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase
      .from('empresas')
      .select('id, nombre, estado, creado_en, trial_termina_en, suscripciones(planes(clave))')
      .order('creado_en', { ascending: false });

    const conteos = await Promise.all(
      (data ?? []).map((e) =>
        supabase.from('usuarios').select('id', { count: 'exact', head: true }).eq('empresa_id', e.id)
      )
    );

    setEmpresas(
      (data ?? []).map((e: any, i) => ({
        id: e.id,
        nombre: e.nombre,
        estado: e.estado,
        creado_en: e.creado_en,
        trial_termina_en: e.trial_termina_en,
        plan_clave: e.suscripciones?.planes?.clave ?? 'free',
        cantidad_trabajadores: conteos[i].count ?? 0,
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function toggleEstado(empresa: FilaEmpresa) {
    setBusyId(empresa.id);
    const nuevoEstado = empresa.estado === 'suspended' ? 'active' : 'suspended';
    const { error } = await supabase.from('empresas').update({ estado: nuevoEstado }).eq('id', empresa.id);
    if (error) alert('No se pudo actualizar: ' + error.message);
    await cargar();
    setBusyId(null);
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  const totalTrabajadores = empresas.reduce((s, e) => s + e.cantidad_trabajadores, 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-card border border-line rounded p-3">
          <p className="font-heading font-extrabold text-2xl text-ink">{empresas.length}</p>
          <p className="text-[11px] text-inkSoft">Empresas totales</p>
        </div>
        <div className="bg-card border border-line rounded p-3">
          <p className="font-heading font-extrabold text-2xl text-ink">{totalTrabajadores}</p>
          <p className="text-[11px] text-inkSoft">Trabajadores en la plataforma</p>
        </div>
      </div>

      <div className="flex justify-end mb-3">
        <a href="/owner/nueva-empresa" className="bg-primary text-white text-xs font-bold px-3 py-2 rounded-sm">
          + Nueva empresa
        </a>
      </div>

      <div className="bg-card border border-line rounded divide-y divide-line">
        {empresas.map((e) => {
          const etiqueta = ETIQUETA_ESTADO[e.estado];
          return (
            <div key={e.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-50 text-primary flex items-center justify-center text-xs font-bold">
                  {e.nombre.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                </div>
                <div>
                  <p className="font-semibold text-sm text-ink">{e.nombre}</p>
                  <p className="text-xs text-inkSoft">
                    {NOMBRE_PLAN[e.plan_clave]} · {e.cantidad_trabajadores} trabajadores · Desde{' '}
                    {new Date(e.creado_en).toLocaleDateString('es-DO', { month: 'short', year: 'numeric' })}
                    {e.estado === 'trial' && e.trial_termina_en && (
                      <> · Prueba vence en {Math.max(0, Math.ceil((new Date(e.trial_termina_en).getTime() - Date.now()) / 86400000))} días</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${etiqueta.clase}`}>
                  {etiqueta.texto}
                </span>
                <button
                  onClick={() => toggleEstado(e)}
                  disabled={busyId === e.id}
                  className="text-xs font-bold text-ink border border-line px-2.5 py-1.5 rounded-sm disabled:opacity-60"
                >
                  {e.estado === 'suspended' ? 'Activar' : 'Suspender'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
