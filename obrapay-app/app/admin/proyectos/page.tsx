'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { costoPorProyecto, fmtUSD } from '@/lib/admin';
import type { Proyecto } from '@/types/database';

export default function ProyectosAdminPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [proyectos, setProyectos] = useState<(Proyecto & { costo: number })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      if (!usuario?.empresa_id) return;
      const { data } = await supabase
        .from('proyectos')
        .select('*')
        .eq('empresa_id', usuario.empresa_id)
        .order('creado_en', { ascending: false });

      const ids = (data ?? []).map((p) => p.id);
      const costos = ids.length ? await costoPorProyecto(supabase, ids, usuario.empresa_id) : new Map();

      setProyectos((data ?? []).map((p) => ({ ...p, costo: costos.get(p.id) ?? 0 })));
      setLoading(false);
    }
    cargar();
  }, [supabase, usuario]);

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-5">Proyectos</h1>

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
                <span className="bg-green-50 text-success text-[11px] font-bold px-2.5 py-1 rounded-full">
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
      </div>
    </>
  );
}
