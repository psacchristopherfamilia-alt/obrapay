import Stripe from 'stripe';

// Igual que con Twilio en notificaciones/enviar: Next.js ejecuta el
// código de nivel superior de cada route handler durante `next build`,
// no solo cuando alguien la llama. Si STRIPE_SECRET_KEY tiene un valor de
// relleno, más vale que el problema aparezca cuando de verdad se use
// Stripe, no que tumbe el build entero. El Proxy deja que los 4 archivos
// que ya escriben `stripe.algo(...)` sigan funcionando sin cambiarlos —
// el cliente real solo se crea la primera vez que se toca una propiedad.
let _stripe: Stripe | null = null;
function obtenerStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-06-20' });
  }
  return _stripe;
}

export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (obtenerStripe() as any)[prop];
  },
});

// Crea estos Price en el Dashboard de Stripe (Product: cada plan) y pega
// los IDs aquí vía variables de entorno.
export const PRICE_ID_POR_PLAN: Record<'basic' | 'pro' | 'enterprise', string> = {
  basic: process.env.STRIPE_PRICE_BASIC!,
  pro: process.env.STRIPE_PRICE_PRO!,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE!,
};

// Igual, pero para los servicios extra (add-ons) — cada uno es un Price
// separado que se agrega como línea extra a la suscripción existente.
export const PRICE_ID_POR_ADDON: Record<'whatsapp' | 'storage', string> = {
  whatsapp: process.env.STRIPE_PRICE_ADDON_WHATSAPP!,
  storage: process.env.STRIPE_PRICE_ADDON_STORAGE!,
};
