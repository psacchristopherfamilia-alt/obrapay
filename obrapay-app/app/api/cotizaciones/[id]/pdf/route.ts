import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { obtenerCotizacionCompleta } from '@/lib/facturacion';
import { generarDocumentoPDF } from '@/lib/pdf-documento';

const ETIQUETA_ESTADO: Record<string, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
};

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  // No hace falta chequear el rol a mano aquí — la RLS de `cotizaciones`
  // ya solo deja pasar al Admin/Owner de la propia empresa. Si esta
  // consulta no encuentra la fila, es porque no tiene permiso.
  const { cotizacion, items } = await obtenerCotizacionCompleta(supabase, params.id);
  if (!cotizacion) {
    return NextResponse.json({ error: 'Cotización no encontrada o sin permiso' }, { status: 404 });
  }

  const { data: empresa } = await supabase.from('empresas').select('nombre').eq('id', cotizacion.empresa_id).single();
  const cliente = cotizacion.clientes;

  const pdf = await generarDocumentoPDF({
    tipo: 'Cotización',
    numero: cotizacion.numero,
    fecha: cotizacion.fecha,
    fechaSecundaria: cotizacion.valida_hasta ? { etiqueta: 'Válida hasta', valor: cotizacion.valida_hasta } : undefined,
    empresaNombre: empresa?.nombre ?? 'OBRAPAY',
    clienteNombre: cliente?.nombre ?? '—',
    clienteContacto: cliente?.contacto,
    clienteTelefono: cliente?.telefono,
    clienteEmail: cliente?.email,
    clienteDireccion: cliente?.direccion,
    items,
    total: Number(cotizacion.total),
    notas: cotizacion.notas,
    estado: ETIQUETA_ESTADO[cotizacion.estado] ?? cotizacion.estado,
  });

  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="cotizacion-${cotizacion.numero}.pdf"`,
    },
  });
}
