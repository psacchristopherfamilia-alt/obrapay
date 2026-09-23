'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { obtenerProyectosDeSupervisor } from '@/lib/supervisor';

interface FilaHistorial {
  id: string;
  hora_entrada: string;
  estado: string;
  usuarios: { nombre: string } | null;
  proyectos: { nombre: string } | null;
  aprobado_por_usuario?: { nombre: string } | null;
}

function formatoFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
}

const ETIQUETA_ESTADO: Record<string, { texto: string; clase: string }> = {
  aprobado_supervisor: { texto: 'Aprobado', clase: 'bg-green-50 text-success' },
  aprobado_admin_tarde: { texto: 'Aprobado (admin, tarde)', clase: 'bg-orange-50 text-warning' },
  rechazado: { texto: 'Rechazado', clase: 'bg-red-50 text-danger' },
};

export default function HistorialPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [filas, setFilas] = useState<FilaHistorial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      if (!usuario) return;

      const propios = await obtenerProyectosDeSupervisor(supabase, usuario.id);
      if (propios.length === 0) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('registros_horas')
        .select(
          'id, hora_entrada, estado, usuarios(nombre), proyectos(nombre), aprobado_por_usuario:usuarios!registros_horas_aprobado_por_fkey(nombre)'
        )
        .in('proyecto_id', propios.map((p) => p.id))
        .in('estado', ['aprobado_supervisor', 'aprobado_admin_tarde', 'rechazado'])
        .order('fecha_aprobacion', { ascending: false })
        .limit(50);

      setFilas((data as any) ?? []);
      setLoading(false);
    }
    cargar();
  }, [supabase, usuario]);

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-5">Historial</h1>

      {filas.length === 0 && (
        <p className="text-sm text-inkSoft">Sin registros aún</p>
      )}

      <div className="space-y-3">
        {filas.map((f) => {
          const etiqueta = ETIQUETA_ESTADO[f.estado];
          return (
            <div key={f.id} className="bg-card border border-line rounded p-3">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <p className="font-bold text-sm text-ink">{f.usuarios?.nombre}</p>
                  <p className="text-xs text-inkSoft">
                    {f.proyectos?.nombre} · {formatoFecha(f.hora_entrada)}
                  </p>
                </div>
                {etiqueta && (
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${etiqueta.clase}`}>
                    {etiqueta.texto}
                  </span>
                )}
              </div>
              <p className="text-xs text-inkSoft">
                Aprobado por: {f.aprobado_por_usuario?.nombre ?? '—'}
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}
