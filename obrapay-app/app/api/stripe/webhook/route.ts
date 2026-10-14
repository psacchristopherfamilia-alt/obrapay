import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase/admin';
import Stripe from 'stripe';

export async function POST(req: Request) {
  const body = await req.text();
  const firma = req.headers.get('stripe-signature')!;

  let evento: Stripe.Event;
  try {
    evento = stripe.webhooks.constructEvent(body, firma, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Firma inválida: ${err.message}` }, { status: 400 });
  }

  const admin_db = supabaseAdmin();

  // Idempotencia: si ya procesamos este evento (Stripe reintenta si no
  // recibe un 2xx a tiempo, y una entrega duplicada también puede pasar en
  // condiciones normales), no lo volvemos a aplicar. La violación de la
  // clave única de stripe_event_id es justamente cómo detectamos "ya visto".
  const { error: errorRegistro } = await admin_db
    .from('stripe_webhook_events')
    .insert({ stripe_event_id: evento.id, type: evento.type });

  if (errorRegistro) {
    if (errorRegistro.code === '23505') {
      return NextResponse.json({ received: true, duplicado: true });
    }
    // No se pudo registrar por otra razón — seguimos igual y procesamos el
    // evento: es más seguro arriesgarse a un doble-aplicado raro que perder
    // en silencio un evento de facturación legítimo.
    console.error('No se pudo registrar el evento de webhook:', errorRegistro);
  }

  switch (evento.type) {
    case 'checkout.session.completed': {
      const session = evento.data.object as Stripe.Checkout.Session;
      const empresaId = session.metadata?.empresa_id;
      const planClave = session.metadata?.plan_clave;
      if (!empresaId || !planClave) break;

      const { data: plan } = await admin_db.from('planes').select('id').eq('clave', planClave).single();
      if (!plan) break;

      await admin_db.from('suscripciones').upsert({
        empresa_id: empresaId,
        plan_id: plan.id,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
        facturacion: 'monthly',
        fecha_renovacion: new Date(Date.now() + 30 * 86400000).toISOString(),
        estado: 'active',
      });
      break;
    }

    case 'invoice.paid': {
      const invoice = evento.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        await admin_db
          .from('suscripciones')
          .update({ estado: 'active', fecha_renovacion: new Date(invoice.period_end * 1000).toISOString() })
          .eq('stripe_subscription_id', invoice.subscription as string);
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = evento.data.object as Stripe.Invoice;
      // El plan NO cambia todavía (se da margen de reintento); solo se marca
      // para que el Admin vea un aviso en /admin/plan. El correo de "avisar
      // al admin" lo dispara Stripe mismo si tienes Smart Retries activado.
      if (invoice.subscription) {
        await admin_db
          .from('suscripciones')
          .update({ estado: 'pago_fallido' })
          .eq('stripe_subscription_id', invoice.subscription as string);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = evento.data.object as Stripe.Subscription;
      const { data: planGratuito } = await admin_db.from('planes').select('id').eq('clave', 'free').single();
      await admin_db
        .from('suscripciones')
        .update({ plan_id: planGratuito?.id, estado: 'active', stripe_subscription_id: null })
        .eq('stripe_subscription_id', sub.id);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
