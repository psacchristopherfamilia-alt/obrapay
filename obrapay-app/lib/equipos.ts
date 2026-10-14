import type { SupabaseClient } from '@supabase/supabase-js';

export type EstadoEquipo = 'activo' | 'dañado' | 'perdido' | 'en_reparacion' | 'de_baja';
export type CondicionEquipo = 'buena' | 'regular' | 'dañada';

export interface EquipoCatalogo {
  id: string;
  nombre: string;
  tipo: string | null;
  numero_serie: string | null;
  estado: EstadoEquipo;
  valor_reemplazo: number | null;
}

export interface AsignacionEquipo {
  id: string;
  equipo_id: string;
  equipo_nombre: string;
  condicion_entrega: CondicionEquipo;
  entregado_en: string;
}

export async function obtenerCatalogoEquipos(supabase: SupabaseClient, empresaId: string): Promise<EquipoCatalogo[]> {
  const { data } = await supabase
    .from('equipos_catalogo')
    .select('id, nombre, tipo, numero_serie, estado, valor_reemplazo')
    .eq('empresa_id', empresaId)
    .order('nombre');
  return data ?? [];
}

/** Equipos disponibles = no tienen ninguna asignación abierta (sin devolver) en ningún proyecto. */
export async function obtenerEquiposDisponibles(supabase: SupabaseClient, empresaId: string): Promise<EquipoCatalogo[]> {
  const [{ data: todos }, { data: enUso }] = await Promise.all([
    supabase.from('equipos_catalogo').select('id, nombre, tipo, numero_serie, estado, valor_reemplazo')
      .eq('empresa_id', empresaId).eq('estado', 'activo'),
    supabase.from('equipo_asignaciones').select('equipo_id').is('devuelto_en', null),
  ]);
  const idsEnUso = new Set((enUso ?? []).map((a) => a.equipo_id));
  return (todos ?? []).filter((e) => !idsEnUso.has(e.id));
}

export async function obtenerAsignacionesAbiertas(supabase: SupabaseClient, proyectoId: string): Promise<AsignacionEquipo[]> {
  const { data } = await supabase
    .from('equipo_asignaciones')
    .select('id, equipo_id, condicion_entrega, entregado_en, equipos_catalogo(nombre)')
    .eq('proyecto_id', proyectoId)
    .is('devuelto_en', null)
    .order('entregado_en', { ascending: false });

  return (data ?? []).map((a: any) => ({
    id: a.id,
    equipo_id: a.equipo_id,
    equipo_nombre: a.equipos_catalogo?.nombre ?? '—',
    condicion_entrega: a.condicion_entrega,
    entregado_en: a.entregado_en,
  }));
}

export async function entregarEquipo(
  supabase: SupabaseClient,
  datos: { equipoId: string; proyectoId: string; condicion: CondicionEquipo; nota?: string; entregadoPor: string }
) {
  const { error } = await supabase.from('equipo_asignaciones').insert({
    equipo_id: datos.equipoId,
    proyecto_id: datos.proyectoId,
    condicion_entrega: datos.condicion,
    nota_entrega: datos.nota || null,
    entregado_por: datos.entregadoPor,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * Registra la devolución y, si la condición es "dañada", además marca el
 * equipo como dañado en el catálogo — eso es lo que dispara el aviso
 * automático al Admin (trigger avisar_equipo_danado_perdido en Postgres).
 */
export async function devolverEquipo(
  supabase: SupabaseClient,
  datos: { asignacionId: string; equipoId: string; condicion: CondicionEquipo; nota?: string; recibidoPor: string }
) {
  const { error } = await supabase
    .from('equipo_asignaciones')
    .update({
      condicion_devolucion: datos.condicion,
      nota_devolucion: datos.nota || null,
      recibido_por: datos.recibidoPor,
      devuelto_en: new Date().toISOString(),
    })
    .eq('id', datos.asignacionId);
  if (error) return { error: error.message };

  if (datos.condicion === 'dañada') {
    await supabase.from('equipos_catalogo').update({ estado: 'dañado' }).eq('id', datos.equipoId);
  }
  return { ok: true };
}

/** Cambia el estado del equipo directamente (perdido, en reparación, de baja, o vuelto a activo). */
export async function cambiarEstadoEquipo(supabase: SupabaseClient, equipoId: string, estado: EstadoEquipo) {
  const { error } = await supabase.from('equipos_catalogo').update({ estado }).eq('id', equipoId);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function obtenerEquiposDanadosOPerdidos(supabase: SupabaseClient, empresaId: string): Promise<EquipoCatalogo[]> {
  const { data } = await supabase
    .from('equipos_catalogo')
    .select('id, nombre, tipo, numero_serie, estado, valor_reemplazo')
    .eq('empresa_id', empresaId)
    .in('estado', ['dañado', 'perdido']);
  return data ?? [];
}
