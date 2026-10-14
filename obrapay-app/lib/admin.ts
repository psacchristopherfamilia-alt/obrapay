import type { SupabaseClient } from '@supabase/supabase-js';

export function fmtUSD(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function obtenerSemanaAbierta(supabase: SupabaseClient, empresaId: string) {
  const { data } = await supabase
    .from('semanas_pago')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('estado', 'abierta')
    .single();
  return data;
}

/**
 * Costo acumulado de uno o varios proyectos, combinando dos fuentes:
 *
 * 1. Semanas ya cerradas — se leen de `pago_proyecto_detalle`, que quedó
 *    congelado con la tarifa vigente EN ESE MOMENTO al cerrar la semana
 *    (`cerrar_semana_actual()`). Esto es intencional: si a un trabajador
 *    le suben la tarifa hoy, el costo de las semanas ya pagadas no debe
 *    cambiar retroactivamente.
 * 2. La semana actualmente abierta — todavía no tiene snapshot (se crea
 *    recién al cerrar), así que se calcula en vivo sobre `registros_horas`
 *    con la tarifa vigente. Es correcto que use la tarifa de hoy: es
 *    exactamente la que se va a usar cuando esa semana cierre.
 *
 * Antes, esta función recalculaba TODO el historial con la tarifa actual
 * cada vez — lo que hacía que el costo de semanas ya pagadas cambiara
 * solo cuando alguien recibía un aumento. Ese era el bug real detrás del
 * pendiente "el Panel debería leer pago_proyecto_detalle".
 */
export async function costoPorProyecto(
  supabase: SupabaseClient,
  proyectoIds: string[],
  empresaId: string
): Promise<Map<string, number>> {
  const costos = new Map<string, number>();
  if (proyectoIds.length === 0) return costos;

  const { data: historico } = await supabase
    .from('pago_proyecto_detalle')
    .select('proyecto_id, costo')
    .in('proyecto_id', proyectoIds);

  (historico ?? []).forEach((h) => {
    costos.set(h.proyecto_id, (costos.get(h.proyecto_id) ?? 0) + Number(h.costo));
  });

  const semanaAbierta = await obtenerSemanaAbierta(supabase, empresaId);
  if (!semanaAbierta) return costos;

  const { data: enCurso } = await supabase
    .from('registros_horas')
    .select('proyecto_id, horas_normales, horas_extra, tarifa_aplicada, usuarios(perfil_nomina(tarifa_hora))')
    .in('proyecto_id', proyectoIds)
    .eq('semana_id', semanaAbierta.id)
    .neq('estado', 'rechazado');

  (enCurso ?? []).forEach((r: any) => {
    const tarifa = r.tarifa_aplicada ?? r.usuarios?.perfil_nomina?.tarifa_hora ?? 0;
    const horas = Number(r.horas_normales) + Number(r.horas_extra);
    costos.set(r.proyecto_id, (costos.get(r.proyecto_id) ?? 0) + horas * tarifa);
  });

  return costos;
}
