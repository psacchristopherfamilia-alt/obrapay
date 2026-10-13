import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import twilio from 'twilio';
import { supabaseAdmin } from '@/lib/supabase/admin';

const resend = new Resend(process.env.RESEND_API_KEY);
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const TITULO_POR_TIPO: Record<string, string> = {
  cambio_tarifa: 'Tu tarifa cambió',
  prestamo: 'Descuento de préstamo aplicado',
  prueba_por_vencer: 'Tu prueba de OBRAPAY está por vencer',
  cierre_semana: 'Se cerró tu semana de trabajo',
  horas_pendientes: 'Tienes horas pendientes de aprobar',
};

/**
 * Supabase Database Webhook llama aquí cada vez que se inserta una fila en
 * `notificaciones` (configurado en el Dashboard, ver README). El payload
 * trae la forma { type: 'INSERT', table: 'notificaciones', record: {...} }.
 */
export async function POST(req: Request) {
  const secreto = req.headers.get('x-notif-secret');
  if (!secreto || secreto !== process.env.NOTIF_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const payload = await req.json();
  const notif = payload.record;
  if (!notif?.usuario_id || !notif?.canal || !notif?.mensaje) {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 });
  }

  // canal === 'push' no se entrega desde aquí — ver nota en el README
  // sobre por qué (requiere infraestructura de Web Push aparte).
  if (notif.canal !== 'email' && notif.canal !== 'whatsapp') {
    return NextResponse.json({ ok: true, omitido: notif.canal });
  }

  const admin_db = supabaseAdmin();
  const { data: usuario } = await admin_db
    .from('usuarios')
    .select('nombre, email, telefono')
    .eq('id', notif.usuario_id)
    .single();

  if (!usuario) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  try {
    if (notif.canal === 'email') {
      await resend.emails.send({
        from: 'OBRAPAY <notificaciones@obrapay.app>',
        to: usuario.email,
        subject: TITULO_POR_TIPO[notif.tipo] ?? 'Nuevo aviso de OBRAPAY',
        text: notif.mensaje,
      });
    }

    if (notif.canal === 'whatsapp') {
      if (!usuario.telefono) {
        // No es un error del sistema — simplemente esta persona no tiene
        // teléfono registrado. Queda igual visible en "Avisos" dentro de
        // la app.
        return NextResponse.json({ ok: true, omitido: 'sin_telefono' });
      }
      await twilioClient.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${usuario.telefono}`,
        body: notif.mensaje,
      });
    }
  } catch (err) {
    // No relanzamos el error: la notificación ya quedó guardada y visible
    // en "Avisos" dentro de la app aunque el envío externo falle. Solo se
    // pierde el WhatsApp/correo, no el aviso en sí.
    console.error(`No se pudo entregar la notificación ${notif.id} por ${notif.canal}:`, err);
    return NextResponse.json({ ok: false, error: 'Fallo en la entrega, aviso guardado igual' }, { status: 200 });
  }

  return NextResponse.json({ ok: true });
}
