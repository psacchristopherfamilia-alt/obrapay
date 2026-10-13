-- ============================================================================
-- 015 — Idempotencia de webhooks de Stripe
-- Stripe reintenta la entrega de un evento si no recibe una respuesta 2xx a
-- tiempo, y en circunstancias normales el mismo evento puede llegar
-- duplicado incluso sin ningún error. Sin este registro, procesar el mismo
-- evento dos veces podría, por ejemplo, aplicar un cambio de plan repetido.
-- ============================================================================

create table if not exists stripe_webhook_events (
  stripe_event_id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table stripe_webhook_events enable row level security;
-- Sin políticas, a propósito: esta tabla solo la toca el service role desde
-- dentro de app/api/stripe/webhook/route.ts. A diferencia de las 7 tablas
-- del Corte 9, esto no es un descuido — ningún usuario autenticado necesita
-- jamás leerla ni escribirla directamente.
