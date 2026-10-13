'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { obtenerProyectosDeSupervisor } from '@/lib/supervisor';
import { calcularHoras, obtenerHoraInicioExtra } from '@/lib/horas';
import type { Proyecto } from '@/types/database';

interface FilaAprobacion {
  id: string;
  hora_entrada: string;
  hora_salida: string | null;
  estado: string;
  usuarios: { nombre: string } | null;
  proyectos: { nombre: string } | null;
}

function formatoHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
}

/** Combina la fecha del registro con una hora "HH:MM" escrita a mano */
function combinarFechaHora(fechaBase: string, horaHHMM: string): Date {
  const [h, m] = horaHHMM.split(':').map(Number);
  const d = new Date(fechaBase);
  d.setHours(h, m, 0, 0);
  return d;
}

export default function AprobacionesPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [filas, setFilas] = useState<FilaAprobacion[]>([]);
  const [horaInicioExtra, setHoraInicioExtra] = useState('17:00');
  const [salidasManuales, setSalidasManuales] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!usuario) return;
    setLoading(true);

    const propios = await obtenerProyectosDeSupervisor(supabase, usuario.id);
    setProyectos(propios);

    if (usuario.empresa_id) {
      setHoraInicioExtra(await obtenerHoraInicioExtra(supabase, usuario.empresa_id));
    }

    if (propios.length === 0) {
      setFilas([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('registros_horas')
      .select('id, hora_entrada, hora_salida, estado, usuarios(nombre), proyectos(nombre)')
      .in('proyecto_id', propios.map((p) => p.id))
      .in('estado', ['pendiente', 'cerrado_automatico'])
      .order('hora_entrada', { ascending: true });

    setFilas((data as any) ?? []);
    setLoading(false);
  }, [supabase, usuario]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function resolver(fila: FilaAprobacion, nuevoEstado: 'aprobado_supervisor' | 'rechazado') {
    setBusyId(fila.id);

    // Un registro cerrado_automatico nunca tiene hora_salida — hay que
    // ponérsela antes de poder calcular horas y aprobar. Si el supervisor
    // rechaza, no hace falta (el registro no vuelve a contar para nómina).
    const necesitaSalida = fila.estado === 'cerrado_automatico' && nuevoEstado === 'aprobado_supervisor';
    const horaManual = salidasManuales[fila.id];

    if (necesitaSalida && !horaManual) {
      alert('Ingresa la hora de salida real antes de aprobar.');
      setBusyId(null);
      return;
    }

    const cambios: Record<string, any> = {
      estado: nuevoEstado,
      aprobado_por: usuario?.id,
      fecha_aprobacion: new Date().toISOString(),
    };

    if (necesitaSalida) {
      const entrada = new Date(fila.hora_entrada);
      const salida = combinarFechaHora(fila.hora_entrada, horaManual);

      if (salida <= entrada) {
        alert('La hora de salida debe ser después de la entrada (' + formatoHora(fila.hora_entrada) + ').');
        setBusyId(null);
        return;
      }

      const { horasNormales, horasExtra } = calcularHoras(entrada, salida, horaInicioExtra);
      cambios.hora_salida = salida.toISOString();
      cambios.horas_normales = Number(horasNormales.toFixed(2));
      cambios.horas_extra = Number(horasExtra.toFixed(2));
    }

    const { error } = await supabase.from('registros_horas').update(cambios).eq('id', fila.id);

    if (error) alert('No se pudo actualizar: ' + error.message);
    await cargar();
    setBusyId(null);
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink">Aprobaciones</h1>
      <p className="text-sm text-inkSoft mb-5">
        {proyectos.length} proyecto{proyectos.length !== 1 ? 's' : ''} a tu cargo
      </p>

      {filas.length === 0 && (
        <div className="bg-card border border-line rounded p-4 text-center text-2xl">✓</div>
      )}

      <div className="space-y-3">
        {filas.map((f) => {
          const esAutoCerrado = f.estado === 'cerrado_automatico';
          return (
            <div key={f.id} className="bg-card border border-line rounded p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-sm text-ink">{f.usuarios?.nombre}</p>
                  <p className="text-xs text-inkSoft">
                    {f.proyectos?.nombre} · Entró {formatoHora(f.hora_entrada)}
                  </p>
                </div>
                {esAutoCerrado && (
                  <span className="bg-orange-50 text-warning text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap">
                    Cierre automático {horaInicioExtra}
                  </span>
                )}
              </div>

              {esAutoCerrado && (
                <div className="mb-3">
                  <label className="block text-xs font-semibold text-inkSoft mb-1">
                    ¿A qué hora salió realmente?
                  </label>
                  <input
                    type="time"
                    value={salidasManuales[f.id] ?? ''}
                    onChange={(e) => setSalidasManuales({ ...salidasManuales, [f.id]: e.target.value })}
                    className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                  />
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => resolver(f, 'aprobado_supervisor')}
                  disabled={busyId === f.id}
                  className="flex-1 bg-primary text-white text-xs font-bold py-2 rounded-sm disabled:opacity-60"
                >
                  Aprobar
                </button>
                <button
                  onClick={() => resolver(f, 'rechazado')}
                  disabled={busyId === f.id}
                  className="flex-1 border border-danger text-danger text-xs font-bold py-2 rounded-sm disabled:opacity-60"
                >
                  Rechazar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
