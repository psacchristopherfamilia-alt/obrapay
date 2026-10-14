import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST() {
  const sesion = supabaseServer();
  const { data: { user } } = await sesion.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: usuarioDb } = await sesion.from('usuarios').select('empresa_id, rol').eq('id', user.id).single();
  if (!usuarioDb || usuarioDb.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo el Admin puede cerrar la semana' }, { status: 403 });
  }

  const admin_db = supabaseAdmin();
  const { error } = await admin_db.rpc('cerrar_semana_actual', { p_empresa_id: usuarioDb.empresa_id });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
