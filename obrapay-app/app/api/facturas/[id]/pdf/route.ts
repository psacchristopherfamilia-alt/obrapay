import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { obtenerFacturaCompleta } from '@/lib/facturacion';
import { generarDocumentoPDF } from '@/lib/pdf-documento';

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  pagada: 'Pagada',
  vencida: 'Vencida',
  anulada: 'Anulada',
};

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { factura, items } = await obtenerFacturaCompleta(supabase, params.id);
  if (!factura) {
    return NextResponse.json({ error: 'Factura no encontrada o sin permiso' }, { status: 404 });
  }

  const { data: empresa } = await supabase.from('empresas').select('nombre').eq('id', factura.empresa_id).single();
  const cliente = factura.clientes;

  const pdf = await generarDocumentoPDF({
    tipo: 'Factura',
    numero: factura.numero,
    fecha: factura.fecha_emision,
    fechaSecundaria: factura.fecha_vencimiento ? { etiqueta: 'Vencimiento', valor: factura.fecha_vencimiento } : undefined,
    empresaNombre: empresa?.nombre ?? 'OBRAPAY',
    clienteNombre: cliente?.nombre ?? '—',
    clienteContacto: cliente?.contacto,
    clienteTelefono: cliente?.telefono,
    clienteEmail: cliente?.email,
    clienteDireccion: cliente?.direccion,
    items,
    total: Number(factura.total),
    notas: factura.notas,
    estado: ETIQUETA_ESTADO[factura.estado] ?? factura.estado,
  });

  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="factura-${factura.numero}.pdf"`,
    },
  });
}
