'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { supabaseServer } from '@/lib/supabase/server';

export async function cambiarTarifa(usuarioId: string, tarifaNueva: number, motivo?: string) {
  const sesion = supabaseServer();
  const { data: { user } } = await sesion.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  const { data: admin } = await sesion.from('usuarios').select('empresa_id, rol').eq('id', user.id).single();
  if (!admin || admin.rol !== 'admin') return { error: 'Solo el Admin puede cambiar tarifas' };

  const admin_db = supabaseAdmin();

  // Verifica que el trabajador sea de la misma empresa del Admin que llama
  const { data: trabajador } = await admin_db
    .from('usuarios')
    .select('empresa_id')
    .eq('id', usuarioId)
    .single();
  if (!trabajador || trabajador.empresa_id !== admin.empresa_id) {
    return { error: 'No autorizado' };
  }

  const { data: perfil } = await admin_db
    .from('perfil_nomina')
    .select('tarifa_hora')
    .eq('usuario_id', usuarioId)
    .single();
  if (!perfil) return { error: 'Este usuario no tiene perfil de nómina' };

  const tarifaAnterior = Number(perfil.tarifa_hora);
  if (tarifaAnterior === tarifaNueva) return { error: 'La nueva tarifa es igual a la actual' };

  const { error: errorUpdate } = await admin_db
    .from('perfil_nomina')
    .update({ tarifa_hora: tarifaNueva })
    .eq('usuario_id', usuarioId);
  if (errorUpdate) return { error: errorUpdate.message };

  await admin_db.from('historial_tarifas').insert({
    usuario_id: usuarioId,
    tarifa_anterior: tarifaAnterior,
    tarifa_nueva: tarifaNueva,
    motivo: motivo || null,
  });

  // Notificar por cada canal que la empresa tenga activado — mismo patrón
  // que avisar_trials_por_vencer() en SQL, aquí en TS porque esta acción
  // ya corre del lado del servidor con el service role.
  const { data: config } = await admin_db
    .from('configuracion_empresa')
    .select('canal_whatsapp, canal_email, canal_push')
    .eq('empresa_id', admin.empresa_id)
    .maybeSingle();

  const mensaje = `Tu tarifa cambió de $${tarifaAnterior.toFixed(2)} a $${tarifaNueva.toFixed(2)} por hora.`;
  const canales: Array<'whatsapp' | 'email' | 'push'> = [];
  if (config?.canal_whatsapp ?? true) canales.push('whatsapp');
  if (config?.canal_email ?? true) canales.push('email');
  if (config?.canal_push ?? true) canales.push('push');

  if (canales.length > 0) {
    await admin_db.from('notificaciones').insert(
      canales.map((canal) => ({ usuario_id: usuarioId, tipo: 'cambio_tarifa', canal, mensaje }))
    );
  }

  return { ok: true };
}

interface DatosPago {
  porcentajeSeguro: number;
  metodoPago: 'transfer' | 'cash' | 'check' | 'wallet';
  cuentaBancaria?: string;
}

export async function actualizarDatosPago(usuarioId: string, datos: DatosPago) {
  const sesion = supabaseServer();
  const { data: { user } } = await sesion.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  const { data: admin } = await sesion.from('usuarios').select('empresa_id, rol').eq('id', user.id).single();
  if (!admin || admin.rol !== 'admin') return { error: 'Solo el Admin puede editar estos datos' };

  const admin_db = supabaseAdmin();

  const { data: trabajador } = await admin_db
    .from('usuarios')
    .select('empresa_id')
    .eq('id', usuarioId)
    .single();
  if (!trabajador || trabajador.empresa_id !== admin.empresa_id) {
    return { error: 'No autorizado' };
  }

  // Sin historial ni notificación a propósito: a diferencia de la tarifa,
  // el % de seguro y el método de pago no tienen tabla de auditoría en el
  // esquema — si más adelante hace falta, es la misma idea que
  // cambiarTarifa() de arriba.
  const { error } = await admin_db
    .from('perfil_nomina')
    .update({
      porcentaje_seguro: datos.porcentajeSeguro,
      metodo_pago: datos.metodoPago,
      cuenta_bancaria: datos.metodoPago === 'transfer' ? datos.cuentaBancaria ?? null : null,
    })
    .eq('usuario_id', usuarioId);

  if (error) return { error: error.message };
  return { ok: true };
}
