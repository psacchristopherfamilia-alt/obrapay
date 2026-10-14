import { fechaCorta } from './fechas';
import PDFDocument from 'pdfkit';
import type { TotalHistorico } from './nomina';

interface DatosConstancia {
  empresaNombre: string;
  trabajadorNombre: string;
  oficio: string;
  tarifaHora: number;
  totales: TotalHistorico;
}

export function generarConstanciaPDF(datos: DatosConstancia): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'letter', margin: 55 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const fmt = (n: number) => `$${n.toFixed(2)}`;
    const t = datos.totales;
    const hoy = new Date().toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
    const desde = t.trabajandoDesde
      ? fechaCorta(t.trabajandoDesde, { day: 'numeric', month: 'long', year: 'numeric' })
      : 'la fecha de su ingreso';

    doc.fontSize(18).font('Helvetica-Bold').text(datos.empresaNombre);
    doc.fontSize(13).font('Helvetica').fillColor('#555').text('CONSTANCIA DE TRABAJO E INGRESOS');
    doc.moveDown();

    doc.fontSize(11).fillColor('#000').font('Helvetica');
    doc.text(
      `Por medio de la presente se hace constar que ${datos.trabajadorNombre}, quien se desempeña como ` +
      `${datos.oficio} con una tarifa de ${fmt(datos.tarifaHora)} por hora, ha trabajado en ${datos.empresaNombre} ` +
      `desde el ${desde} hasta la fecha de este documento (${hoy}), habiendo completado ${t.semanasPagadas} ` +
      `${t.semanasPagadas === 1 ? 'semana de pago' : 'semanas de pago'} y un total de ${t.horasTotales.toFixed(1)} horas trabajadas.`,
      { align: 'justify' }
    );
    doc.moveDown();

    doc.font('Helvetica-Bold').text('Resumen de ingresos y descuentos, acumulado desde su ingreso');
    doc.moveDown(0.3);
    doc.font('Helvetica');

    const fila = (etiqueta: string, valor: string, negrita = false) => {
      const y = doc.y;
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').text(etiqueta, 55, y, { width: 320 });
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').text(valor, 375, y, { width: 180, align: 'right' });
      doc.moveDown(0.5);
    };

    fila('Total devengado (bruto)', fmt(t.brutoTotal), true);
    fila('  Descuento de NIB (retiro/pensión)', '−' + fmt(t.descuentoNibTotal));
    fila('  Descuento de NHIP (seguro de salud)', '−' + fmt(t.descuentoNhipTotal));
    fila('  Descuento por préstamos internos', '−' + fmt(t.descuentoPrestamoTotal));
    doc.moveTo(55, doc.y).lineTo(555, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.4);
    fila('Total neto recibido', fmt(t.netoTotal), true);

    doc.moveDown();
    doc.fontSize(9).fillColor('#888').font('Helvetica').text(
      'Este documento refleja únicamente los pagos ya confirmados en el sistema de nómina de la compañía. ' +
      'Generado automáticamente el ' + hoy + '.',
      { align: 'left' }
    );

    doc.moveDown(2);
    doc.fontSize(11).fillColor('#000');
    doc.text('_________________________________');
    doc.text('Firma autorizada, ' + datos.empresaNombre);

    doc.end();
  });
}
