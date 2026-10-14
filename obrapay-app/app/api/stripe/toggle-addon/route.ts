import { NextResponse } from 'next/server';
import { stripe, PRICE_ID_POR_ADDON } from '@/lib/stripe';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabase/admin';

type ClaveAddon = 'whatsapp' | 'storage';

export async function POST(req: Request) {
  const { addonClave, activar } = (await req.json()) as { addonClave: ClaveAddon; activar: boolean };

  const sesion = supabaseServer();
  const { data: { user } } = await sesion.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { data: usuarioDb } = await sesion.from('usuarios').select('empresa_id, rol').eq('id', user.id).single();
  if (!usuarioDb || usuarioDb.rol !== 'admin') {
    return NextResponse.json({ error: 'Solo el Admin puede cambiar los servicios extra' }, { status: 403 });
  }

  const admin_db = supabaseAdmin();

  const { data: suscripcion } = await admin_db
    .from('suscripciones')
    .select('stripe_subscription_id')
    .eq('empresa_id', usuarioDb.empresa_id)
    .maybeSingle();

  const subscriptionId = suscripcion?.stripe_subscription_id as string | undefined;
  if (!subscriptionId) {
    return NextResponse.json(
      { error: 'Necesitas un plan pago activo para agregar servicios extra.' },
      { status: 400 }
    );
  }

  const { data: addon } = await admin_db.from('addons_catalogo').select('id').eq('clave', addonClave).single();
  if (!addon) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 });

  if (activar) {
    const item = await stripe.subscriptionItems.create({
      subscription: subscriptionId,
      price: PRICE_ID_POR_ADDON[addonClave],
    });

    await admin_db.from('empresa_addons').upsert(
      {
        empresa_id: usuarioDb.empresa_id,
        addon_id: addon.id,
        activo: true,
        stripe_subscription_item_id: item.id,
        activado_en: new Date().toISOString(),
      },
      { onConflict: 'empresa_id,addon_id' }
    );
  } else {
    const { data: empresaAddon } = await admin_db
      .from('empresa_addons')
      .select('stripe_subscription_item_id')
      .eq('empresa_id', usuarioDb.empresa_id)
      .eq('addon_id', addon.id)
      .maybeSingle();

    if (empresaAddon?.stripe_subscription_item_id) {
      await stripe.subscriptionItems.del(empresaAddon.stripe_subscription_item_id);
    }

    await admin_db
      .from('empresa_addons')
      .update({ activo: false, stripe_subscription_item_id: null })
      .eq('empresa_id', usuarioDb.empresa_id)
      .eq('addon_id', addon.id);
  }

  return NextResponse.json({ ok: true });
}
