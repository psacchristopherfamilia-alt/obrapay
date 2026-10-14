'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import type { Proyecto, RegistroHoras } from '@/types/database';

/**
 * Idéntica en espíritu a app/trabajador/page.tsx — el Comprador también es
 * un empleado pagado por hora que marca entrada/salida como cualquier
 * trabajador, además de comprar. Se duplica en vez de compartir un
 * componente porque el resto de las pantallas de cada rol en este
 * proyecto ya siguen ese mismo patrón (cada rol es autocontenido); el
 * costo es mantenimiento doble si algún día cambia la lógica de marcaje —
 * ver el README para esta decisión documentada.
 */
export default function CompradorMarcarPage() {
  const supabase = supabaseBrowser();
  const { usuario, perfil, loading: loadingUsuario } = useUsuarioActual();

  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [entradaAbierta, setEntradaAbierta] = useState<RegistroHoras | null>(null);
  const [elapsed, setElapsed] = useState('00:00:00');
  const [busy, setBusy] = useState(false);

  const cargarDatos = useCallback(async () => {
    if (!usuario) return;

    const { data: asignados } = await supabase
      .from('proyecto_trabajadores')
      .select('proyectos(*)')
      .eq('usuario_id', usuario.id);

    setProyectos((asignados ?? []).map((a: any) => a.proyectos));

    const { data: abierta } = await supabase
      .from('registros_horas')
      .select('*')
      .eq('usuario_id', usuario.id)
      .is('hora_salida', null)
      .maybeSingle();

    setEntradaAbierta(abierta ?? null);
  }, [supabase, usuario]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    if (!entradaAbierta) return;
    const inicio = new Date(entradaAbierta.hora_entrada).getTime();

    const tick = () => {
      const diff = Math.floor((Date.now() - inicio) / 1000);
      const h = String(Math.floor(diff / 3600)).padStart(2, '0');
      const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
      const s = String(diff % 60).padStart(2, '0');
      setElapsed(`${h}:${m}:${s}`);
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [entradaAbierta]);

  async function obtenerUbicacion(): Promise<string | null> {
    if (!navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(`(${pos.coords.longitude},${pos.coords.latitude})`),
        () => resolve(null),
        { timeout: 5000 }
      );
    });
  }

  async function obtenerSemanaAbierta(empresaId: string) {
    const { data } = await supabase
      .from('semanas_pago')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('estado', 'abierta')
      .single();
    return data?.id as string | undefined;
  }

  async function marcarEntrada(proyecto: Proyecto) {
    if (!usuario || busy) return;
    setBusy(true);

    const semanaId = await obtenerSemanaAbierta(proyecto.empresa_id);
    if (!semanaId) {
      alert('No hay una semana de pago abierta. Contacta a tu administrador.');
      setBusy(false);
      return;
    }

    const ubicacion = proyecto.geo_cerca_activa ? await obtenerUbicacion() : null;

    const { error } = await supabase.from('registros_horas').insert({
      usuario_id: usuario.id,
      proyecto_id: proyecto.id,
      semana_id: semanaId,
      hora_entrada: new Date().toISOString(),
      ubicacion_entrada: ubicacion,
      estado: 'pendiente',
    });

    if (error) alert('No se pudo marcar entrada: ' + error.message);
    await cargarDatos();
    setBusy(false);
  }

  async function marcarSalida() {
    if (!entradaAbierta || !usuario?.empresa_id || busy) return;
    setBusy(true);

    // El servidor fija la salida y calcula las horas (trigger).
    const { error } = await supabase
      .from('registros_horas')
      .update({ ubicacion_salida: null })
      .eq('id', entradaAbierta.id);

    if (error) alert('No se pudo marcar salida: ' + error.message);
    await cargarDatos();
    setBusy(false);
  }

  if (loadingUsuario) {
    return <p className="text-sm text-inkSoft">Cargando…</p>;
  }

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink">
        Hola, {usuario?.nombre?.split(' ')[0]}
      </h1>
      <p className="text-sm text-inkSoft mb-5">{perfil?.oficio ?? 'Comprador'}</p>

      {entradaAbierta ? (
        <div className="bg-card border-2 border-primary rounded p-4 mb-4">
          <span className="inline-block bg-primary text-white text-xs font-bold px-2.5 py-1 rounded-full mb-3">
            En curso
          </span>
          <p className="font-heading font-extrabold text-4xl text-ink">{elapsed}</p>
          <button
            onClick={marcarSalida}
            disabled={busy}
            className="w-full mt-4 bg-primary text-white font-bold py-3 rounded-sm disabled:opacity-60"
          >
            Marcar salida
          </button>
        </div>
      ) : (
        <div className="bg-card border border-line rounded p-4 mb-4">
          <p className="font-semibold text-ink">Sin turno activo</p>
          <p className="text-sm text-inkSoft">Toca un proyecto para marcar entrada</p>
        </div>
      )}

      <div className="bg-card border border-line rounded divide-y divide-line">
        {proyectos.map((p) => {
          const disabled = !!entradaAbierta && entradaAbierta.proyecto_id !== p.id;
          return (
            <div key={p.id} className="flex items-center justify-between px-4 py-3">
              <div className={disabled ? 'opacity-40' : ''}>
                <p className="font-semibold text-sm text-ink">{p.nombre}</p>
                <p className="text-xs text-inkSoft">
                  {disabled ? 'Cierra tu turno actual para cambiar de proyecto' : 'Toca para marcar entrada'}
                </p>
              </div>
              {!entradaAbierta && (
                <button
                  onClick={() => marcarEntrada(p)}
                  disabled={busy}
                  className="bg-steel text-white text-xs font-bold px-3 py-2 rounded-sm disabled:opacity-60"
                >
                  Marcar entrada
                </button>
              )}
            </div>
          );
        })}
        {proyectos.length === 0 && (
          <p className="px-4 py-4 text-sm text-inkSoft">
            No tienes proyectos asignados todavía.
          </p>
        )}
      </div>
    </>
  );
}
