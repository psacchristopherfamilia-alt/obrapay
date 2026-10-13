import type { SupabaseClient } from '@supabase/supabase-js';

export interface TotalHistorico {
  semanasPagadas: number;
  horasTotales: number;
  brutoTotal: number;
  descuentoSeguroTotal: number;
  descuentoPrestamoTotal: number;
  netoTotal: number;
}

/**
 * Suma TODOS los pagos ya confirmados (`estado = 'pagado'`) de un
 * trabajador — es el mismo número visto desde dos lados: lo que el Admin
 * le ha pagado en total es exactamente lo que el trabajador ha ganado en
 * neto en total. No son dos cálculos distintos, es el mismo dato mostrado
 * en el contexto de cada quien.
 */
export async function obtenerTotalHistorico(supabase: SupabaseClient, usuarioId: string): Promise<TotalHistorico> {
  const { data } = await supabase
    .from('pagos_semanales')
    .select('horas_normales, horas_extra, bruto, descuento_seguro, descuento_prestamo, neto')
    .eq('usuario_id', usuarioId)
    .eq('estado', 'pagado');

  const filas = data ?? [];

  return {
    semanasPagadas: filas.length,
    horasTotales: filas.reduce((s, p) => s + Number(p.horas_normales) + Number(p.horas_extra), 0),
    brutoTotal: filas.reduce((s, p) => s + Number(p.bruto), 0),
    descuentoSeguroTotal: filas.reduce((s, p) => s + Number(p.descuento_seguro), 0),
    descuentoPrestamoTotal: filas.reduce((s, p) => s + Number(p.descuento_prestamo), 0),
    netoTotal: filas.reduce((s, p) => s + Number(p.neto), 0),
  };
}
