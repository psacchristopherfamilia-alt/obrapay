import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { obtenerReporteFinanciero, generarCSV } from '@/lib/reporte-financiero';
import { generarReporteFinancieroPDF } from '@/lib/pdf-reporte-financiero';
import { generarXLSX } from '@/lib/xlsx-reporte';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mes = searchParams.get('mes'); // 'YYYY-MM'
  const f = searchParams.get('formato');
  const formato = f === 'csv' ? 'csv' : f === 'xlsx' ? 'xlsx' : 'pdf';

  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ error: 'Falta el mes (formato YYYY-MM)' }, { status: 400 });
  }

  const supabase = supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: usuarioDb } = await supabase.from('usuarios').select('empresa_id, rol').eq('id', user.id).single();
  if (!usuarioDb || usuarioDb.rol !== 'admin' || !usuarioDb.empresa_id) {
    return NextResponse.json({ error: 'Solo el Admin puede ver este reporte' }, { status: 403 });
  }

  const { data: empresa } = await supabase.from('empresas').select('nombre').eq('id', usuarioDb.empresa_id).single();
  const reporte = await obtenerReporteFinanciero(supabase, usuarioDb.empresa_id, mes);

  if (formato === 'xlsx') {
    const xlsx = await generarXLSX(reporte, empresa?.nombre ?? 'OBRAPAY');
    return new NextResponse(xlsx, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="reporte-financiero-${mes}.xlsx"`,
      },
    });
  }

  if (formato === 'csv') {
    const csv = generarCSV(reporte, empresa?.nombre ?? 'OBRAPAY');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="reporte-financiero-${mes}.csv"`,
      },
    });
  }

  const pdf = await generarReporteFinancieroPDF(reporte, empresa?.nombre ?? 'OBRAPAY');
  return new NextResponse(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="reporte-financiero-${mes}.pdf"`,
    },
  });
}
