import PDFDocument from 'pdfkit';
import type { ReporteFinanciero } from './reporte-financiero';

export function generarReporteFinancieroPDF(reporte: ReporteFinanciero, empresaNombre: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'letter', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fmt = (n: number) => `$${n.toFixed(2)}`;

    doc.fontSize(20).font('Helvetica-Bold').text(empresaNombre);
    doc.fontSize(14).font('Helvetica').fillColor('#555').text(`REPORTE FINANCIERO — ${reporte.mes}`);
    doc.moveDown();

    doc.fontSize(10).fillColor('#000');
    doc.font('Helvetica-Bold').text('Resumen del mes');
    doc.font('Helvetica');
    doc.text(`Nómina bruta: ${fmt(reporte.nomina.totalBruto)}`);
    doc.text(`NIB — retenido empleados: ${fmt(reporte.nomina.totalDescuentoNib)} · aporte patronal: ${fmt(reporte.nomina.totalAportePatronalNib)} · total a remitir: ${fmt(reporte.nomina.totalDescuentoNib + reporte.nomina.totalAportePatronalNib)}`);
    doc.text(`NHIP — retenido empleados: ${fmt(reporte.nomina.totalDescuentoNhip)} · aporte patronal: ${fmt(reporte.nomina.totalAportePatronalNhip)} · total a remitir: ${fmt(reporte.nomina.totalDescuentoNhip + reporte.nomina.totalAportePatronalNhip)}`);
    doc.text(`Descuentos de préstamo: ${fmt(reporte.nomina.totalDescuentoPrestamo)}`);
    doc.text(`Nómina neta pagada: ${fmt(reporte.nomina.totalNeto)}`);
    doc.moveDown(0.5);
    doc.text(`Materiales: ${fmt(reporte.totalMateriales)}`);
    doc.text(`Vehículos: ${fmt(reporte.totalVehiculos)}`);
    doc.text(`Facturado a clientes: ${fmt(reporte.facturacion.totalFacturado)}`);
    doc.text(`Cobrado de clientes: ${fmt(reporte.facturacion.totalCobrado)}`);
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Detalle de nómina por trabajador (NIB / NHIP)');
    doc.moveDown(0.3);

    const cols = [50, 170, 235, 300, 365, 430, 495];
    doc.fontSize(8).font('Helvetica-Bold');
    ['Trabajador', 'Bruto', 'NIB emp.', 'NIB patr.', 'NHIP emp.', 'NHIP patr.', 'Neto'].forEach((titulo, i) => {
      doc.text(titulo, cols[i], doc.y - (i > 0 ? doc.currentLineHeight() : 0), { width: 60 });
    });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(555, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica').fontSize(8);
    reporte.nomina.filas.forEach((f) => {
      const y = doc.y;
      doc.text(f.nombre, cols[0], y, { width: 115 });
      doc.text(fmt(f.bruto), cols[1], y, { width: 60 });
      doc.text(fmt(f.descuento_nib), cols[2], y, { width: 60 });
      doc.text(fmt(f.aporte_patronal_nib), cols[3], y, { width: 60 });
      doc.text(fmt(f.descuento_nhip), cols[4], y, { width: 60 });
      doc.text(fmt(f.aporte_patronal_nhip), cols[5], y, { width: 60 });
      doc.text(fmt(f.neto), cols[6], y, { width: 60 });
      doc.moveDown(0.4);
    });

    if (reporte.nomina.filas.length === 0) {
      doc.fontSize(9).fillColor('#888').text('Sin pagos registrados en este mes.');
    }

    doc.moveDown();
    doc.fontSize(8).fillColor('#888').text(
      'Las tasas y topes de NIB/NHIP usados en este cálculo están configurados en Ajustes — verifícalos con tu contador periódicamente, ya que pueden cambiar por ley.'
    );

    doc.end();
  });
}
