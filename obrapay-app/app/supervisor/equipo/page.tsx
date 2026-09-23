'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { obtenerProyectosDeSupervisor } from '@/lib/supervisor';

interface MiembroEquipo {
  usuario_id: string;
  nombre: string;
  oficio: string;
  proyectoNombre: string;
  enTurno: boolean;
}

export default function MiEquipoPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [equipo, setEquipo] = useState<MiembroEquipo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      if (!usuario) return;

      const propios = await obtenerProyectosDeSupervisor(supabase, usuario.id);
      if (propios.length === 0) {
        setLoading(false);
        return;
      }
      const proyectoIds = propios.map((p) => p.id);
      const nombreProyecto = new Map(propios.map((p) => [p.id, p.nombre]));

      // Trabajadores asignados a esos proyectos + su perfil de nómina
      const { data: asignaciones } = await supabase
        .from('proyecto_trabajadores')
        .select('proyecto_id, usuarios(id, nombre, perfil_nomina(oficio))')
        .in('proyecto_id', proyectoIds);

      // Quiénes tienen un turno abierto ahora mismo, en cualquiera de estos
      // proyectos (para el punto verde/gris)
      const { data: abiertos } = await supabase
        .from('registros_horas')
        .select('usuario_id')
        .in('proyecto_id', proyectoIds)
        .is('hora_salida', null);

      const idsEnTurno = new Set((abiertos ?? []).map((a) => a.usuario_id));

      const filas: MiembroEquipo[] = (asignaciones ?? []).map((a: any) => ({
        usuario_id: a.usuarios.id,
        nombre: a.usuarios.nombre,
        oficio: a.usuarios.perfil_nomina?.oficio ?? '—',
        proyectoNombre: nombreProyecto.get(a.proyecto_id) ?? '',
        enTurno: idsEnTurno.has(a.usuarios.id),
      }));

      // dedupe (un trabajador puede aparecer en más de un proyecto tuyo)
      const porId = new Map(filas.map((f) => [f.usuario_id, f]));
      setEquipo(Array.from(porId.values()));
      setLoading(false);
    }
    cargar();
  }, [supabase, usuario]);

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink">Mi equipo</h1>
      <p className="text-sm text-inkSoft mb-5">
        {equipo.length} trabajador{equipo.length !== 1 ? 'es' : ''} en tus proyectos
      </p>

      <div className="bg-card border border-line rounded divide-y divide-line">
        {equipo.map((m) => (
          <div key={m.usuario_id} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 text-primary flex items-center justify-center text-xs font-bold">
                {m.nombre.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </div>
              <div>
                <p className="font-semibold text-sm text-ink">{m.nombre}</p>
                <p className="text-xs text-inkSoft flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${m.enTurno ? 'bg-success' : 'bg-gray-300'}`}
                  />
                  {m.enTurno ? `En turno · ${m.proyectoNombre}` : 'Fuera de turno'}
                </p>
              </div>
            </div>
          </div>
        ))}
        {equipo.length === 0 && (
          <p className="px-4 py-4 text-sm text-inkSoft">Aún no tienes trabajadores asignados.</p>
        )}
      </div>
    </>
  );
}
