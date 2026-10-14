'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { obtenerProyectosDeSupervisor } from '@/lib/supervisor';
import {
  obtenerCatalogoMateriales, obtenerEntregasPorProyecto, registrarCompra,
  type MaterialCatalogo, type EntregaProyecto,
} from '@/lib/materiales';
import {
  obtenerEquiposDisponibles, obtenerAsignacionesAbiertas, entregarEquipo, devolverEquipo,
  type EquipoCatalogo, type AsignacionEquipo, type CondicionEquipo,
} from '@/lib/equipos';
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
  const [catalogo, setCatalogo] = useState<MaterialCatalogo[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [entregas, setEntregas] = useState<EntregaProyecto[]>([]);
  const [form, setForm] = useState({ materialId: '', cantidad: '', costo: '', proveedor: '' });
  const [guardando, setGuardando] = useState(false);
  const [equipoDisponible, setEquipoDisponible] = useState<EquipoCatalogo[]>([]);
  const [equipoAsignado, setEquipoAsignado] = useState<AsignacionEquipo[]>([]);
  const [equipoSeleccionado, setEquipoSeleccionado] = useState('');
  const [devolviendo, setDevolviendo] = useState<string | null>(null);
  const [condicionDevolucion, setCondicionDevolucion] = useState<CondicionEquipo>('buena');

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
      setCatalogo(await obtenerCatalogoMateriales(supabase, usuario.empresa_id));
      setLoading(false);
    }
    cargar();
  }, [supabase, usuario]);

  async function toggleExpandir(proyectoId: string) {
    if (expandido === proyectoId) {
      setExpandido(null);
      return;
    }
    setExpandido(proyectoId);
    setForm({ materialId: '', cantidad: '', costo: '', proveedor: '' });
    setEntregas(await obtenerEntregasPorProyecto(supabase, proyectoId));
    if (usuario?.empresa_id) setEquipoDisponible(await obtenerEquiposDisponibles(supabase, usuario.empresa_id));
    setEquipoAsignado(await obtenerAsignacionesAbiertas(supabase, proyectoId));
  }

  async function manejarAsignarEquipo(proyectoId: string) {
    if (!equipoSeleccionado || !usuario) return;
    const resultado = await entregarEquipo(supabase, {
      equipoId: equipoSeleccionado,
      proyectoId,
      condicion: 'buena',
      entregadoPor: usuario.id,
    });
    if (resultado.error) {
      alert('No se pudo asignar: ' + resultado.error);
      return;
    }
    setEquipoSeleccionado('');
    setEquipoAsignado(await obtenerAsignacionesAbiertas(supabase, proyectoId));
  }

  async function manejarDevolverEquipo(proyectoId: string, a: AsignacionEquipo) {
    if (!usuario) return;
    const resultado = await devolverEquipo(supabase, {
      asignacionId: a.id,
      equipoId: a.equipo_id,
      condicion: condicionDevolucion,
      recibidoPor: usuario.id,
    });
    if (resultado.error) {
      alert('No se pudo registrar la devolución: ' + resultado.error);
      return;
    }
    setDevolviendo(null);
    setCondicionDevolucion('buena');
    setEquipoAsignado(await obtenerAsignacionesAbiertas(supabase, proyectoId));
  }

  async function manejarRegistrarCompra(proyectoId: string) {
    if (!form.materialId || !form.cantidad || !form.costo || !usuario) return;
    setGuardando(true);
    const resultado = await registrarCompra(supabase, {
      empresaId: usuario.empresa_id!,
      materialId: form.materialId,
      cantidad: parseFloat(form.cantidad),
      costoTotal: parseFloat(form.costo),
      proveedor: form.proveedor || undefined,
      compradoPor: usuario.id,
      proyectoId,
    });
    setGuardando(false);
    if (resultado.error) {
      alert('No se pudo registrar: ' + resultado.error);
      return;
    }
    setForm({ materialId: '', cantidad: '', costo: '', proveedor: '' });
    setEntregas(await obtenerEntregasPorProyecto(supabase, proyectoId));
  }

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

            <button
              onClick={() => toggleExpandir(p.id)}
              className="text-[11px] font-bold text-primary mt-3"
            >
              {expandido === p.id ? 'Cerrar' : '+ Registrar compra de material'}
            </button>

            {expandido === p.id && (
              <div className="mt-3 pt-3 border-t border-line space-y-2">
                <select
                  value={form.materialId}
                  onChange={(e) => setForm({ ...form, materialId: e.target.value })}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white"
                >
                  <option value="">Selecciona un material…</option>
                  {catalogo.filter((m) => m.activo).map((m) => (
                    <option key={m.id} value={m.id}>{m.nombre} (por {m.unidad})</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={form.cantidad}
                    onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
                    placeholder="Cantidad"
                    className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    value={form.costo}
                    onChange={(e) => setForm({ ...form, costo: e.target.value })}
                    placeholder="Costo total $"
                    className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
                  />
                </div>
                <input
                  value={form.proveedor}
                  onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                  placeholder="Proveedor (opcional)"
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                />
                {catalogo.length === 0 && (
                  <p className="text-[11px] text-inkSoft">
                    Tu empresa todavía no tiene materiales en el catálogo — pídele al Admin que agregue alguno.
                  </p>
                )}
                <button
                  onClick={() => manejarRegistrarCompra(p.id)}
                  disabled={guardando}
                  className="w-full bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60"
                >
                  {guardando ? 'Registrando…' : 'Registrar compra'}
                </button>

                {entregas.length > 0 && (
                  <div className="pt-2 space-y-1.5">
                    {entregas.map((e) => (
                      <div key={e.id} className="flex justify-between text-xs">
                        <span className="text-ink">{e.material_nombre} — {e.cantidad} {e.unidad}</span>
                        <span className="text-inkSoft">${e.costo_asignado.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[11px] font-bold uppercase text-inkSoft pt-3 border-t border-line mt-2">
                  Equipo
                </p>
                <select
                  value={equipoSeleccionado}
                  onChange={(e) => setEquipoSeleccionado(e.target.value)}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white"
                >
                  <option value="">Selecciona un equipo disponible…</option>
                  {equipoDisponible.map((eq) => (
                    <option key={eq.id} value={eq.id}>{eq.nombre}</option>
                  ))}
                </select>
                <button
                  onClick={() => manejarAsignarEquipo(p.id)}
                  disabled={!equipoSeleccionado}
                  className="w-full bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60"
                >
                  + Asignar a este proyecto
                </button>

                {equipoAsignado.map((a) => (
                  <div key={a.id} className="pt-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-ink font-semibold">{a.equipo_nombre}</span>
                      {devolviendo !== a.id && (
                        <button onClick={() => setDevolviendo(a.id)} className="font-bold text-primary">
                          Devolver
                        </button>
                      )}
                    </div>
                    {devolviendo === a.id && (
                      <div className="mt-1.5 space-y-1.5">
                        <select
                          value={condicionDevolucion}
                          onChange={(e) => setCondicionDevolucion(e.target.value as CondicionEquipo)}
                          className="w-full border border-line rounded-sm px-2 py-1.5 text-xs bg-white"
                        >
                          <option value="buena">Buena condición</option>
                          <option value="regular">Condición regular</option>
                          <option value="dañada">Dañada</option>
                        </select>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setDevolviendo(null)}
                            className="flex-1 border border-line rounded-sm py-1.5 text-[11px] font-bold text-ink"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => manejarDevolverEquipo(p.id, a)}
                            className="flex-1 bg-primary text-white rounded-sm py-1.5 text-[11px] font-bold"
                          >
                            Confirmar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {proyectos.length === 0 && (
          <p className="text-sm text-inkSoft">No tienes proyectos a tu cargo.</p>
        )}
      </div>
    </>
  );
}
