import PDFDocument from 'pdfkit';

interface ItemPDF {
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

interface DatosDocumentoPDF {
  tipo: 'Cotización' | 'Factura';
  numero: number;
  fecha: string;
  fechaSecundaria?: { etiqueta: string; valor: string }; // "Válida hasta" o "Vencimiento"
  empresaNombre: string;
  clienteNombre: string;
  clienteContacto?: string | null;
  clienteTelefono?: string | null;
  clienteEmail?: string | null;
  clienteDireccion?: string | null;
  items: ItemPDF[];
  total: number;
  notas?: string | null;
  estado: string;
}

/** Genera el PDF en memoria y devuelve el Buffer completo — pensado para
 * un route handler que lo sirva directo, no para guardarlo en disco. */
export function generarDocumentoPDF(datos: DatosDocumentoPDF): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'letter', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Encabezado
    doc.fontSize(20).font('Helvetica-Bold').text(datos.empresaNombre);
    doc.fontSize(14).font('Helvetica').fillColor('#555').text(datos.tipo.toUpperCase());
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#000')
      .text(`N.º ${String(datos.numero).padStart(4, '0')}`)
      .text(`Fecha: ${new Date(datos.fecha).toLocaleDateString('es-DO')}`);
    if (datos.fechaSecundaria) {
      doc.text(`${datos.fechaSecundaria.etiqueta}: ${new Date(datos.fechaSecundaria.valor).toLocaleDateString('es-DO')}`);
    }
    doc.text(`Estado: ${datos.estado}`);
    doc.moveDown();

    // Cliente
    doc.font('Helvetica-Bold').text('Cliente');
    doc.font('Helvetica').text(datos.clienteNombre);
    if (datos.clienteContacto) doc.text(datos.clienteContacto);
    if (datos.clienteTelefono) doc.text(datos.clienteTelefono);
    if (datos.clienteEmail) doc.text(datos.clienteEmail);
    if (datos.clienteDireccion) doc.text(datos.clienteDireccion);
    doc.moveDown();

    // Tabla de líneas
    const colDescX = 50, colCantX = 320, colPrecioX = 390, colTotalX = 470;
    doc.font('Helvetica-Bold');
    doc.text('Descripción', colDescX, doc.y, { width: 260 });
    doc.text('Cant.', colCantX, doc.y - doc.currentLineHeight(), { width: 60, align: 'right' });
    doc.text('Precio', colPrecioX, doc.y - doc.currentLineHeight(), { width: 70, align: 'right' });
    doc.text('Total', colTotalX, doc.y - doc.currentLineHeight(), { width: 80, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica');
    datos.items.forEach((item) => {
      const totalLinea = item.cantidad * item.precio_unitario;
      const yInicio = doc.y;
      doc.text(item.descripcion, colDescX, yInicio, { width: 260 });
      doc.text(item.cantidad.toString(), colCantX, yInicio, { width: 60, align: 'right' });
      doc.text(`$${item.precio_unitario.toFixed(2)}`, colPrecioX, yInicio, { width: 70, align: 'right' });
      doc.text(`$${totalLinea.toFixed(2)}`, colTotalX, yInicio, { width: 80, align: 'right' });
      doc.moveDown(0.5);
    });

    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(13);
    doc.text(`Total: $${datos.total.toFixed(2)}`, colDescX, doc.y, { width: 500, align: 'right' });

    if (datos.notas) {
      doc.moveDown();
      doc.font('Helvetica').fontSize(10).fillColor('#555').text('Notas', 50);
      doc.text(datos.notas, 50, doc.y, { width: 500 });
    }

    doc.end();
  });
}
