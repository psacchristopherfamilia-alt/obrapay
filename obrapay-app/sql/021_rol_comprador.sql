-- ============================================================================
-- 021 — Nuevo rol: comprador
-- Separado en su propia migración porque Postgres no permite usar un valor
-- de enum recién agregado en la misma transacción en la que se agrega —
-- por eso va sola, antes de 022 (que sí lo usa en políticas de RLS).
-- ============================================================================

alter type rol_usuario add value 'comprador';
