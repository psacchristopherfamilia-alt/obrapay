import type { SupabaseClient } from '@supabase/supabase-js';

export interface TotalHistorico {
  semanasPagadas: number;
  horasTotales: number;
  brutoTotal: number;
  descuentoNibTotal: number;
  descuentoNhipTotal: number;
  descuentoSeguroTotal: number; // = descuentoNibTotal + descuentoNhipTotal, se mantiene por compatibilidad
  descuentoPrestamoTotal: number;
  netoTotal: number;
  trabajandoDesde: string | null; // fecha_inicio de la semana de su primer pago
}

/**
 * Suma TODOS los pagos ya confirmados (`estado = 'pagado'`) de un
 * trabajador — es el mismo número visto desde dos lados: lo que el Admin
 * le ha pagado en total es exactamente lo que el trabajador ha ganado en
 * neto en total. No son dos cálculos distintos, es el mismo dato mostrado
 * en el contexto de cada quien. Es la base tanto del panel en pantalla
 * como de la constancia en PDF — un solo cálculo, dos presentaciones.
 */
export async function obtenerTotalHistorico(supabase: SupabaseClient, usuarioId: string): Promise<TotalHistorico> {
  const { data } = await supabase
    .from('pagos_semanales')
    .select('horas_normales, horas_extra, bruto, descuento_nib, descuento_nhip, descuento_seguro, descuento_prestamo, neto, semanas_pago(fecha_inicio)')
    .eq('usuario_id', usuarioId)
    .eq('estado', 'pagado')
    .order('fecha_inicio', { foreignTable: 'semanas_pago', ascending: true });

  const filas = (data as any[]) ?? [];

  return {
    semanasPagadas: filas.length,
    horasTotales: filas.reduce((s, p) => s + Number(p.horas_normales) + Number(p.horas_extra), 0),
    brutoTotal: filas.reduce((s, p) => s + Number(p.bruto), 0),
    descuentoNibTotal: filas.reduce((s, p) => s + Number(p.descuento_nib), 0),
    descuentoNhipTotal: filas.reduce((s, p) => s + Number(p.descuento_nhip), 0),
    descuentoSeguroTotal: filas.reduce((s, p) => s + Number(p.descuento_seguro), 0),
    descuentoPrestamoTotal: filas.reduce((s, p) => s + Number(p.descuento_prestamo), 0),
    netoTotal: filas.reduce((s, p) => s + Number(p.neto), 0),
    trabajandoDesde: filas[0]?.semanas_pago?.fecha_inicio ?? null,
  };
}
