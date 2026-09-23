import { NextResponse } from 'next/server';
import { stripe, PRICE_ID_POR_PLAN } from '@/lib/stripe';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const { planClave } = (await req.json()) as { planClave: 'free' | 'basic' | 'pro' | 'enterprise' };

  const sesion = supabaseServer();
  const { data: { user } } = await sesion.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: usuarioDb } = await sesion.from('usuarios').select('empresa_id, rol, email').eq('id', user.id).single();
  if (!usuarioDb || usuarioDb.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo el Admin puede cambiar el plan' }, { status: 403 });
  }

  const admin_db = supabaseAdmin();
  const { data: empresa } = await admin_db.from('empresas').select('*').eq('id', usuarioDb.empresa_id).single();
  const { data: planDb } = await admin_db.from('planes').select('id').eq('clave', planClave).single();
  if (!empresa || !planDb) return NextResponse.json({ error: 'Plan no encontrado' }, { status: 404 });

  const { data: suscripcionActual } = await admin_db
    .from('suscripciones')
    .select('stripe_customer_id, stripe_subscription_id')
    .eq('empresa_id', empresa.id)
    .maybeSingle();

  const subscriptionIdActual = suscripcionActual?.stripe_subscription_id as string | undefined;

  // Bajar a Gratuito: si tenía una suscripción pagando en Stripe, hay que
  // cancelarla — si no, Stripe le sigue cobrando aunque la app ya le haya
  // quitado las funciones del plan pago.
  if (planClave === 'free') {
    if (subscriptionIdActual) {
      await stripe.subscriptions.cancel(subscriptionIdActual);
    }
    await admin_db.from('suscripciones').upsert({
      empresa_id: empresa.id,
      plan_id: planDb.id,
      stripe_subscription_id: null,
      facturacion: 'monthly',
      fecha_renovacion: new Date(Date.now() + 30 * 86400000).toISOString(),
      estado: 'active',
    });
    return NextResponse.json({ redirigirA: '/admin/plan?actualizado=1' });
  }

  // Ya tiene una suscripción pagando en Stripe: se actualiza ESA MISMA
  // suscripción (con prorrateo automático), nunca se crea una segunda.
  if (subscriptionIdActual) {
    const suscripcionStripe = await stripe.subscriptions.retrieve(subscriptionIdActual);
    await stripe.subscriptions.update(subscriptionIdActual, {
      items: [{ id: suscripcionStripe.items.data[0].id, price: PRICE_ID_POR_PLAN[planClave] }],
      proration_behavior: 'create_prorations',
    });
    await admin_db.from('suscripciones').update({ plan_id: planDb.id }).eq('empresa_id', empresa.id);
    return NextResponse.json({ redirigirA: '/admin/plan?actualizado=1' });
  }

  // Primera vez que paga de verdad: sí hace falta Checkout.
  let customerId = suscripcionActual?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: empresa.nombre,
      email: usuarioDb.email,
      metadata: { empresa_id: empresa.id },
    });
    customerId = customer.id;
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: PRICE_ID_POR_PLAN[planClave], quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/plan?actualizado=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/plan`,
    metadata: { empresa_id: empresa.id, plan_clave: planClave },
  });

  return NextResponse.json({ redirigirA: session.url });
}
