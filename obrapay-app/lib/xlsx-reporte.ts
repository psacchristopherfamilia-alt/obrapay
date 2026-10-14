import ExcelJS from 'exceljs';
import type { ReporteFinanciero } from './reporte-financiero';

export async function generarXLSX(reporte: ReporteFinanciero, empresaNombre: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OBRAPAY';
  const dinero = '"$"#,##0.00';
  const n = reporte.nomina;

  const resumen = wb.addWorksheet('Resumen');
  resumen.columns = [{ width: 46 }, { width: 18 }];
  resumen.addRow([`Reporte financiero — ${empresaNombre}`]).font = { bold: true, size: 14 };
  resumen.addRow([`Mes: ${reporte.mes}`]);
  resumen.addRow([]);
  const filas: Array<[string, number]> = [
    ['Nómina bruta', n.totalBruto],
    ['NIB retenido (empleado)', n.totalDescuentoNib],
    ['NIB aporte patronal', n.totalAportePatronalNib],
    ['NIB a remitir (empleado + patrono)', n.totalDescuentoNib + n.totalAportePatronalNib],
    ['NHIP retenido (empleado)', n.totalDescuentoNhip],
    ['NHIP aporte patronal', n.totalAportePatronalNhip],
    ['NHIP a remitir (empleado + patrono)', n.totalDescuentoNhip + n.totalAportePatronalNhip],
    ['Descuentos de préstamo', n.totalDescuentoPrestamo],
    ['Nómina neta pagada', n.totalNeto],
    ['Gastado en materiales', reporte.totalMateriales],
    ['Gastado en vehículos', reporte.totalVehiculos],
    ['Facturado a clientes', reporte.facturacion.totalFacturado],
    ['Cobrado de clientes', reporte.facturacion.totalCobrado],
  ];
  filas.forEach(([k, v]) => {
    const r = resumen.addRow([k, v]);
    r.getCell(2).numFmt = dinero;
  });

  const det = wb.addWorksheet('Nómina por trabajador');
  det.columns = [
    { header: 'Trabajador', width: 28 },
    { header: 'Bruto', width: 14 },
    { header: 'NIB empleado', width: 14 },
    { header: 'NIB patrono', width: 14 },
    { header: 'NHIP empleado', width: 14 },
    { header: 'NHIP patrono', width: 14 },
    { header: 'Préstamo', width: 12 },
    { header: 'Neto', width: 14 },
  ];
  det.getRow(1).font = { bold: true };
  n.filas.forEach((f) => {
    det.addRow([f.nombre, f.bruto, f.descuento_nib, f.aporte_patronal_nib, f.descuento_nhip, f.aporte_patronal_nhip, f.descuento_prestamo, f.neto]);
  });
  const total = det.addRow(['TOTAL', n.totalBruto, n.totalDescuentoNib, n.totalAportePatronalNib, n.totalDescuentoNhip, n.totalAportePatronalNhip, n.totalDescuentoPrestamo, n.totalNeto]);
  total.font = { bold: true };
  det.eachRow((row, i) => { if (i > 1) for (let c = 2; c <= 8; c++) row.getCell(c).numFmt = dinero; });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
