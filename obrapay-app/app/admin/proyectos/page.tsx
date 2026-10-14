'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { costoPorProyecto, fmtUSD } from '@/lib/admin';
import { totalMaterialesPorProyecto } from '@/lib/materiales';
import type { Proyecto } from '@/types/database';

type ProyectoConCosto = Proyecto & { costo: number };

// Por defecto solo proyectos activos: los cerrados se acumulan con los
// años y casi nunca se consultan. El costo (mano de obra + materiales) es
// la parte pesada, y se calcula solo para la página visible.
const POR_PAGINA = 15;

export default function ProyectosAdminPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [proyectos, setProyectos] = useState<ProyectoConCosto[]>([]);
  const [total, setTotal] = useState(0);
  const [estado, setEstado] = useState<'activo' | 'cerrado'>('activo');
  const [loading, setLoading] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);

  const cargarPagina = useCallback(
    async (desde: number) => {
      if (!usuario?.empresa_id) return { proyectos: [] as ProyectoConCosto[], total: 0 };

      const { data, count } = await supabase
        .from('proyectos')
        .select('*', { count: 'exact' })
        .eq('empresa_id', usuario.empresa_id)
        .eq('estado', estado)
        .order('creado_en', { ascending: false })
        .range(desde, desde + POR_PAGINA - 1);

      const ids = (data ?? []).map((p) => p.id);
      const [costos, materiales] = await Promise.all([
        ids.length ? costoPorProyecto(supabase, ids, usuario.empresa_id) : new Map<string, number>(),
        totalMaterialesPorProyecto(supabase, ids),
      ]);

      return {
        total: count ?? 0,
        proyectos: (data ?? []).map((p) => ({
          ...p,
          costo: (costos.get(p.id) ?? 0) + (materiales.get(p.id) ?? 0),
        })),
      };
    },
    [supabase, usuario, estado]
  );

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    cargarPagina(0).then((r) => {
      if (cancelado) return;
      setProyectos(r.proyectos);
      setTotal(r.total);
      setLoading(false);
    });
    return () => {
      cancelado = true;
    };
  }, [cargarPagina]);

  async function cargarMas() {
    setCargandoMas(true);
    const r = await cargarPagina(proyectos.length);
    setProyectos((prev) => [...prev, ...r.proyectos]);
    setTotal(r.total);
    setCargandoMas(false);
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h1 className="font-heading font-extrabold text-2xl text-ink">Proyectos</h1>
        <Link href="/admin/proyectos/nuevo" className="bg-primary text-white text-xs font-bold px-3 py-2 rounded-sm">
          + Nuevo
        </Link>
      </div>

      <div className="flex gap-1 mb-4 bg-line rounded-sm p-1">
        {(['activo', 'cerrado'] as const).map((e) => (
          <button
            key={e}
            onClick={() => setEstado(e)}
            className={`flex-1 py-2 text-xs font-bold rounded-sm ${
              estado === e ? 'bg-white text-ink shadow-sm' : 'text-inkSoft'
            }`}
          >
            {e === 'activo' ? 'Activos' : 'Cerrados'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-inkSoft">Cargando…</p>
      ) : (
        <>
          <p className="text-[11px] text-inkSoft mb-2">
            Mostrando {proyectos.length} de {total}
          </p>
          <div className="space-y-3">
            {proyectos.map((p) => {
              const pct = p.presupuesto ? Math.min(100, (p.costo / p.presupuesto) * 100) : 0;
              return (
                <Link
                  key={p.id}
                  href={`/admin/proyectos/${p.id}`}
                  className="block bg-card border border-line rounded p-4"
                >
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-bold text-sm text-ink">{p.nombre}</p>
                    <span
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                        p.estado === 'activo' ? 'bg-green-50 text-success' : 'bg-line text-inkSoft'
                      }`}
                    >
                      {p.estado === 'activo' ? 'Activo' : 'Cerrado'}
                    </span>
                  </div>
                  <div className="bg-line h-1.5 rounded-full mb-1.5">
                    <div
                      className={`h-1.5 rounded-full ${pct >= 80 ? 'bg-danger' : 'bg-steel'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-inkSoft">
                    <span>Presupuesto usado</span>
                    <span>
                      {fmtUSD(p.costo)} / {p.presupuesto ? fmtUSD(p.presupuesto) : '—'}
                    </span>
                  </div>
                </Link>
              );
            })}
            {proyectos.length === 0 && (
              <p className="text-sm text-inkSoft">
                {estado === 'activo' ? 'No hay proyectos activos.' : 'No hay proyectos cerrados.'}
              </p>
            )}
          </div>

          {proyectos.length < total && (
            <button
              onClick={cargarMas}
              disabled={cargandoMas}
              className="w-full mt-3 border border-line rounded-sm py-2.5 text-xs font-bold text-ink disabled:opacity-60"
            >
              {cargandoMas ? 'Cargando…' : `Cargar más (${total - proyectos.length} restantes)`}
            </button>
          )}
        </>
      )}
    </>
  );
}
