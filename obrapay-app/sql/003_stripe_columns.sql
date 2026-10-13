alter table suscripciones
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create unique index if not exists idx_suscripciones_stripe_sub
  on suscripciones (stripe_subscription_id);
