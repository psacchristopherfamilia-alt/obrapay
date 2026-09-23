import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function POST() {
  const sesion = supabaseServer();
  const { data: { user } } = await sesion.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: usuarioDb } = await sesion.from('usuarios').select('empresa_id, rol').eq('id', user.id).single();
  if (!usuarioDb || usuarioDb.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo el Admin puede administrar la facturación' }, { status: 403 });
  }

  const admin_db = supabaseAdmin();
  const { data: suscripcion } = await admin_db
    .from('suscripciones')
    .select('stripe_customer_id')
    .eq('empresa_id', usuarioDb.empresa_id)
    .maybeSingle();

  if (!suscripcion?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'Todavía no tienes facturación con Stripe — elige un plan pago primero.' },
      { status: 404 }
    );
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: suscripcion.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/admin/plan`,
  });

  return NextResponse.json({ redirigirA: portal.url });
}
