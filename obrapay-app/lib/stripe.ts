import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
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
