import type { SupabaseClient } from '@supabase/supabase-js';

export type EstadoVehiculo = 'activo' | 'en_reparacion' | 'de_baja';
export type TipoGastoVehiculo = 'gasolina' | 'mantenimiento' | 'reparacion' | 'otro';

export interface VehiculoCatalogo {
  id: string;
  nombre: string;
  placa: string | null;
  tipo: string | null;
  estado: EstadoVehiculo;
  proximo_mantenimiento: string | null;
}

export interface AsignacionVehiculo {
  id: string;
  vehiculo_id: string;
  vehiculo_nombre: string;
  entregado_en: string;
}

export interface GastoVehiculo {
  id: string;
  tipo: TipoGastoVehiculo;
  monto: number;
  nota: string | null;
  reportado_en: string;
}

export async function obtenerCatalogoVehiculos(supabase: SupabaseClient, empresaId: string): Promise<VehiculoCatalogo[]> {
  const { data } = await supabase
    .from('vehiculos_catalogo')
    .select('id, nombre, placa, tipo, estado, proximo_mantenimiento')
    .eq('empresa_id', empresaId)
    .order('nombre');
  return data ?? [];
}

export async function obtenerVehiculosActivos(supabase: SupabaseClient, empresaId: string): Promise<VehiculoCatalogo[]> {
  const { data } = await supabase
    .from('vehiculos_catalogo')
    .select('id, nombre, placa, tipo, estado, proximo_mantenimiento')
    .eq('empresa_id', empresaId)
    .eq('estado', 'activo')
    .order('nombre');
  return data ?? [];
}

/** Vehículos disponibles = activos y sin ninguna asignación abierta (sin devolver). */
export async function obtenerVehiculosDisponibles(supabase: SupabaseClient, empresaId: string): Promise<VehiculoCatalogo[]> {
  const [{ data: activos }, { data: enUso }] = await Promise.all([
    supabase.from('vehiculos_catalogo').select('id, nombre, placa, tipo, estado, proximo_mantenimiento')
      .eq('empresa_id', empresaId).eq('estado', 'activo'),
    supabase.from('vehiculo_asignaciones').select('vehiculo_id').is('devuelto_en', null),
  ]);
  const idsEnUso = new Set((enUso ?? []).map((a) => a.vehiculo_id));
  return (activos ?? []).filter((v) => !idsEnUso.has(v.id));
}

export async function obtenerAsignacionesAbiertas(supabase: SupabaseClient, proyectoId: string): Promise<AsignacionVehiculo[]> {
  const { data } = await supabase
    .from('vehiculo_asignaciones')
    .select('id, vehiculo_id, entregado_en, vehiculos_catalogo(nombre)')
    .eq('proyecto_id', proyectoId)
    .is('devuelto_en', null)
    .order('entregado_en', { ascending: false });

  return (data ?? []).map((a: any) => ({
    id: a.id,
    vehiculo_id: a.vehiculo_id,
    vehiculo_nombre: a.vehiculos_catalogo?.nombre ?? '—',
    entregado_en: a.entregado_en,
  }));
}

export async function asignarVehiculo(
  supabase: SupabaseClient,
  datos: { vehiculoId: string; proyectoId: string; conductorId?: string; entregadoPor: string }
) {
  const { error } = await supabase.from('vehiculo_asignaciones').insert({
    vehiculo_id: datos.vehiculoId,
    proyecto_id: datos.proyectoId,
    conductor_id: datos.conductorId || null,
    entregado_por: datos.entregadoPor,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function devolverVehiculo(supabase: SupabaseClient, asignacionId: string, recibidoPor: string) {
  const { error } = await supabase
    .from('vehiculo_asignaciones')
    .update({ recibido_por: recibidoPor, devuelto_en: new Date().toISOString() })
    .eq('id', asignacionId);
  if (error) return { error: error.message };
  return { ok: true };
}

/** Cualquier usuario autenticado de la empresa puede reportar un gasto — así funciona hoy en la compañía real. */
export async function reportarGastoVehiculo(
  supabase: SupabaseClient,
  datos: { vehiculoId: string; tipo: TipoGastoVehiculo; monto: number; nota?: string; reportadoPor: string }
) {
  const { error } = await supabase.from('vehiculo_gastos').insert({
    vehiculo_id: datos.vehiculoId,
    tipo: datos.tipo,
    monto: datos.monto,
    nota: datos.nota || null,
    reportado_por: datos.reportadoPor,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function obtenerGastosPorVehiculo(supabase: SupabaseClient, vehiculoId: string): Promise<GastoVehiculo[]> {
  const { data } = await supabase
    .from('vehiculo_gastos')
    .select('id, tipo, monto, nota, reportado_en')
    .eq('vehiculo_id', vehiculoId)
    .order('reportado_en', { ascending: false });
  return data ?? [];
}

/** Total gastado por vehículo — para mostrar en el catálogo. */
export async function totalGastosPorVehiculo(supabase: SupabaseClient, vehiculoIds: string[]): Promise<Map<string, number>> {
  const totales = new Map<string, number>();
  if (vehiculoIds.length === 0) return totales;
  const { data } = await supabase.from('vehiculo_gastos').select('vehiculo_id, monto').in('vehiculo_id', vehiculoIds);
  (data ?? []).forEach((g) => totales.set(g.vehiculo_id, (totales.get(g.vehiculo_id) ?? 0) + Number(g.monto)));
  return totales;
}

/**
 * Actualiza la fecha de próximo mantenimiento y resetea el aviso — para
 * que el cron vuelva a avisar 3 días antes de la fecha nueva, en vez de
 * quedarse callado para siempre porque ya avisó una vez con la fecha vieja.
 */
export async function actualizarMantenimiento(supabase: SupabaseClient, vehiculoId: string, fecha: string | null) {
  const { error } = await supabase
    .from('vehiculos_catalogo')
    .update({ proximo_mantenimiento: fecha, aviso_mantenimiento_enviado: false })
    .eq('id', vehiculoId);
  if (error) return { error: error.message };
  return { ok: true };
}

/** Vehículos activos con mantenimiento vencido o a 3 días o menos — para la alerta del Panel. */
export async function obtenerVehiculosMantenimientoProximo(supabase: SupabaseClient, empresaId: string): Promise<VehiculoCatalogo[]> {
  const limite = new Date();
  limite.setDate(limite.getDate() + 3);
  const { data } = await supabase
    .from('vehiculos_catalogo')
    .select('id, nombre, placa, tipo, estado, proximo_mantenimiento')
    .eq('empresa_id', empresaId)
    .eq('estado', 'activo')
    .not('proximo_mantenimiento', 'is', null)
    .lte('proximo_mantenimiento', limite.toISOString().slice(0, 10));
  return data ?? [];
}

export async function cambiarEstadoVehiculo(supabase: SupabaseClient, vehiculoId: string, estado: EstadoVehiculo) {
  const { error } = await supabase.from('vehiculos_catalogo').update({ estado }).eq('id', vehiculoId);
  if (error) return { error: error.message };
  return { ok: true };
}
