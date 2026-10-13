-- ============================================================================
-- 014 — Columna para rastrear el subscription item de Stripe de cada add-on
-- ============================================================================

alter table empresa_addons add column if not exists stripe_subscription_item_id text;
