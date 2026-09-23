'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { obtenerProyectosDeSupervisor } from '@/lib/supervisor';
import type { Proyecto } from '@/types/database';

interface ProyectoConStats extends Proyecto {
  enTurno: number;
  horasSemana: number;
  pendientes: number;
}

export default function ProyectosSupervisorPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [proyectos, setProyectos] = useState<ProyectoConStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      if (!usuario?.empresa_id) return;

      const propios = await obtenerProyectosDeSupervisor(supabase, usuario.id);
      if (propios.length === 0) {
        setLoading(false);
        return;
      }
      const ids = propios.map((p) => p.id);

      const { data: semana } = await supabase
        .from('semanas_pago')
        .select('id')
        .eq('empresa_id', usuario.empresa_id)
        .eq('estado', 'abierta')
        .single();

      const [{ data: abiertos }, { data: horas }, { data: pendientes }] = await Promise.all([
        supabase.from('registros_horas').select('proyecto_id').in('proyecto_id', ids).is('hora_salida', null),
        semana
          ? supabase
              .from('registros_horas')
              .select('proyecto_id, horas_normales, horas_extra')
              .in('proyecto_id', ids)
              .eq('semana_id', semana.id)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from('registros_horas')
          .select('proyecto_id')
          .in('proyecto_id', ids)
          .in('estado', ['pendiente', 'cerrado_automatico']),
      ]);

      const contarPorProyecto = (rows: { proyecto_id: string }[] | null) => {
        const mapa = new Map<string, number>();
        (rows ?? []).forEach((r) => mapa.set(r.proyecto_id, (mapa.get(r.proyecto_id) ?? 0) + 1));
        return mapa;
      };

      const enTurnoPorProyecto = contarPorProyecto(abiertos);
      const pendientesPorProyecto = contarPorProyecto(pendientes);

      const horasPorProyecto = new Map<string, number>();
      (horas ?? []).forEach((h: any) => {
        const total = Number(h.horas_normales) + Number(h.horas_extra);
        horasPorProyecto.set(h.proyecto_id, (horasPorProyecto.get(h.proyecto_id) ?? 0) + total);
      });

      setProyectos(
        propios.map((p) => ({
          ...p,
          enTurno: enTurnoPorProyecto.get(p.id) ?? 0,
          horasSemana: horasPorProyecto.get(p.id) ?? 0,
          pendientes: pendientesPorProyecto.get(p.id) ?? 0,
        }))
      );
      setLoading(false);
    }
    cargar();
  }, [supabase, usuario]);

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-5">Proyectos</h1>

      <div className="space-y-3">
        {proyectos.map((p) => (
          <div key={p.id} className="bg-card border border-line rounded p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="font-bold text-sm text-ink">{p.nombre}</p>
              <span className="bg-green-50 text-success text-[11px] font-bold px-2.5 py-1 rounded-full">
                {p.estado === 'activo' ? 'Activo' : 'Cerrado'}
              </span>
            </div>
            <div className="flex gap-6 mt-3">
              <div>
                <p className="font-heading font-extrabold text-lg text-ink">{p.enTurno}</p>
                <p className="text-[11px] text-inkSoft">En turno</p>
              </div>
              <div>
                <p className="font-heading font-extrabold text-lg text-ink">
                  {p.horasSemana.toFixed(1)}h
                </p>
                <p className="text-[11px] text-inkSoft">Horas totales</p>
              </div>
              <div>
                <p className="font-heading font-extrabold text-lg text-ink">{p.pendientes}</p>
                <p className="text-[11px] text-inkSoft">Por aprobar</p>
              </div>
            </div>
          </div>
        ))}
        {proyectos.length === 0 && (
          <p className="text-sm text-inkSoft">No tienes proyectos a tu cargo.</p>
        )}
      </div>
    </>
  );
}
