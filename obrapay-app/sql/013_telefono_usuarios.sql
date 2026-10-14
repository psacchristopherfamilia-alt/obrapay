-- ============================================================================
-- 013 — Teléfono del usuario (necesario para entregar avisos por WhatsApp)
-- ============================================================================

alter table usuarios add column if not exists telefono text;
