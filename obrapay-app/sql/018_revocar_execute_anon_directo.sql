-- ============================================================================
-- 018 — Revocar EXECUTE de "anon" directamente (el paso que sí funcionó)
-- El intento anterior (017, revoke ... from public) no alcanzó porque
-- Supabase le da EXECUTE a "anon" de forma explícita en cada función nueva
-- del esquema public por defecto, aparte de PUBLIC — revocarlo de PUBLIC
-- no quita un grant que "anon" ya tiene por su cuenta. Confirmado
-- consultando information_schema.routine_privileges antes y después.
-- ============================================================================

revoke execute on function empresa_actual() from anon;
revoke execute on function es_owner() from anon;
revoke execute on function es_admin() from anon;
revoke execute on function proyectos_a_cargo() from anon;
revoke execute on function confirmar_pago_semanal(uuid, numeric) from anon;
