import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { obtenerTotalHistorico } from '@/lib/nomina';
import { generarConstanciaPDF } from '@/lib/pdf-constancia';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  // No hace falta comprobar a mano si quien pide esto es el propio
  // trabajador o su Admin — la RLS de `usuarios` y `pagos_semanales` ya
  // solo deja pasar a esos dos. Si esta consulta no encuentra la fila,
  // es porque no tiene permiso.
  const { data: trabajador } = await supabase
    .from('usuarios')
    .select('nombre, empresa_id, perfil_nomina(oficio, tarifa_hora)')
    .eq('id', params.id)
    .single();

  if (!trabajador) {
    return NextResponse.json({ error: 'Trabajador no encontrado o sin permiso' }, { status: 404 });
  }

  const { data: empresa } = await supabase.from('empresas').select('nombre').eq('id', trabajador.empresa_id).single();
  const totales = await obtenerTotalHistorico(supabase, params.id);
  const perfil = (trabajador as any).perfil_nomina;

  const pdf = await generarConstanciaPDF({
    empresaNombre: empresa?.nombre ?? 'OBRAPAY',
    trabajadorNombre: trabajador.nombre,
    oficio: perfil?.oficio ?? '—',
    tarifaHora: Number(perfil?.tarifa_hora ?? 0),
    totales,
  });

  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="constancia-${trabajador.nombre.replace(/\s+/g, '-').toLowerCase()}.pdf"`,
    },
  });
}
