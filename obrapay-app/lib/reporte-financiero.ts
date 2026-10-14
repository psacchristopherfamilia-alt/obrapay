import type { SupabaseClient } from '@supabase/supabase-js';

export interface FilaNominaTrabajador {
  nombre: string;
  bruto: number;
  descuento_nib: number;
  descuento_nhip: number;
  aporte_patronal_nib: number;
  aporte_patronal_nhip: number;
  descuento_prestamo: number;
  neto: number;
}

export interface ReporteFinanciero {
  mes: string; // 'YYYY-MM'
  nomina: {
    filas: FilaNominaTrabajador[];
    totalBruto: number;
    totalDescuentoNib: number;
    totalDescuentoNhip: number;
    totalAportePatronalNib: number;
    totalAportePatronalNhip: number;
    totalDescuentoPrestamo: number;
    totalNeto: number;
  };
  totalMateriales: number;
  totalVehiculos: number;
  facturacion: { totalFacturado: number; totalCobrado: number };
}

export async function obtenerReporteFinanciero(
  supabase: SupabaseClient,
  empresaId: string,
  mes: string // 'YYYY-MM'
): Promise<ReporteFinanciero> {
  const inicioMes = `${mes}-01`;
  const [anio, mesNum] = mes.split('-').map(Number);
  const finMes = new Date(anio, mesNum, 0).toISOString().slice(0, 10); // último día del mes

  const { data: pagos } = await supabase
    .from('pagos_semanales')
    .select(
      'bruto, descuento_nib, descuento_nhip, aporte_patronal_nib, aporte_patronal_nhip, descuento_prestamo, neto, usuarios(nombre), semanas_pago!inner(fecha_inicio, empresa_id)'
    )
    .eq('semanas_pago.empresa_id', empresaId)
    .gte('semanas_pago.fecha_inicio', inicioMes)
    .lte('semanas_pago.fecha_inicio', finMes);

  const filas: FilaNominaTrabajador[] = (pagos ?? []).map((p: any) => ({
    nombre: p.usuarios?.nombre ?? '—',
    bruto: Number(p.bruto),
    descuento_nib: Number(p.descuento_nib),
    descuento_nhip: Number(p.descuento_nhip),
    aporte_patronal_nib: Number(p.aporte_patronal_nib),
    aporte_patronal_nhip: Number(p.aporte_patronal_nhip),
    descuento_prestamo: Number(p.descuento_prestamo),
    neto: Number(p.neto),
  }));

  const sumar = (campo: keyof FilaNominaTrabajador) => filas.reduce((s, f) => s + (f[campo] as number), 0);

  const { data: entregas } = await supabase
    .from('entregas_materiales')
    .select('costo_asignado, entregado_en, compras_materiales!inner(empresa_id)')
    .eq('compras_materiales.empresa_id', empresaId)
    .gte('entregado_en', inicioMes)
    .lte('entregado_en', finMes + 'T23:59:59');
  const totalMateriales = (entregas ?? []).reduce((s, e: any) => s + Number(e.costo_asignado), 0);

  const { data: gastosVehiculo } = await supabase
    .from('vehiculo_gastos')
    .select('monto, reportado_en, vehiculos_catalogo!inner(empresa_id)')
    .eq('vehiculos_catalogo.empresa_id', empresaId)
    .gte('reportado_en', inicioMes)
    .lte('reportado_en', finMes + 'T23:59:59');
  const totalVehiculos = (gastosVehiculo ?? []).reduce((s, g: any) => s + Number(g.monto), 0);

  const { data: facturasEmitidas } = await supabase
    .from('facturas')
    .select('total')
    .eq('empresa_id', empresaId)
    .gte('fecha_emision', inicioMes)
    .lte('fecha_emision', finMes);
  const totalFacturado = (facturasEmitidas ?? []).reduce((s, f) => s + Number(f.total), 0);

  const { data: facturasPagadas } = await supabase
    .from('facturas')
    .select('total')
    .eq('empresa_id', empresaId)
    .eq('estado', 'pagada')
    .gte('fecha_pago', inicioMes)
    .lte('fecha_pago', finMes);
  const totalCobrado = (facturasPagadas ?? []).reduce((s, f) => s + Number(f.total), 0);

  return {
    mes,
    nomina: {
      filas,
      totalBruto: sumar('bruto'),
      totalDescuentoNib: sumar('descuento_nib'),
      totalDescuentoNhip: sumar('descuento_nhip'),
      totalAportePatronalNib: sumar('aporte_patronal_nib'),
      totalAportePatronalNhip: sumar('aporte_patronal_nhip'),
      totalDescuentoPrestamo: sumar('descuento_prestamo'),
      totalNeto: sumar('neto'),
    },
    totalMateriales,
    totalVehiculos,
    facturacion: { totalFacturado, totalCobrado },
  };
}

export function generarCSV(reporte: ReporteFinanciero, empresaNombre: string): string {
  const filas: string[] = [];
  filas.push(`Reporte financiero,${empresaNombre},${reporte.mes}`);
  filas.push('');
  filas.push('RESUMEN');
  filas.push(`Total nómina bruta,${reporte.nomina.totalBruto.toFixed(2)}`);
  filas.push(`Total NIB retenido (empleado),${reporte.nomina.totalDescuentoNib.toFixed(2)}`);
  filas.push(`Total NIB aporte patronal,${reporte.nomina.totalAportePatronalNib.toFixed(2)}`);
  filas.push(`Total NIB a remitir (empleado + patrono),${(reporte.nomina.totalDescuentoNib + reporte.nomina.totalAportePatronalNib).toFixed(2)}`);
  filas.push(`Total NHIP retenido (empleado),${reporte.nomina.totalDescuentoNhip.toFixed(2)}`);
  filas.push(`Total NHIP aporte patronal,${reporte.nomina.totalAportePatronalNhip.toFixed(2)}`);
  filas.push(`Total NHIP a remitir (empleado + patrono),${(reporte.nomina.totalDescuentoNhip + reporte.nomina.totalAportePatronalNhip).toFixed(2)}`);
  filas.push(`Total descuentos de préstamo,${reporte.nomina.totalDescuentoPrestamo.toFixed(2)}`);
  filas.push(`Total nómina neta pagada,${reporte.nomina.totalNeto.toFixed(2)}`);
  filas.push(`Total gastado en materiales,${reporte.totalMateriales.toFixed(2)}`);
  filas.push(`Total gastado en vehículos,${reporte.totalVehiculos.toFixed(2)}`);
  filas.push(`Total facturado a clientes,${reporte.facturacion.totalFacturado.toFixed(2)}`);
  filas.push(`Total cobrado de clientes,${reporte.facturacion.totalCobrado.toFixed(2)}`);
  filas.push('');
  filas.push('DETALLE DE NÓMINA POR TRABAJADOR (para NIB/NHIP)');
  filas.push('Trabajador,Bruto,NIB empleado,NIB patrono,NHIP empleado,NHIP patrono,Préstamo,Neto');
  reporte.nomina.filas.forEach((f) => {
    filas.push(
      [f.nombre, f.bruto, f.descuento_nib, f.aporte_patronal_nib, f.descuento_nhip, f.aporte_patronal_nhip, f.descuento_prestamo, f.neto]
        .map((v) => (typeof v === 'number' ? v.toFixed(2) : `"${v}"`))
        .join(',')
    );
  });
  return filas.join('\n');
}
