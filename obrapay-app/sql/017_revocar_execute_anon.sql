-- ============================================================================
-- 017 — Revocar EXECUTE de PUBLIC en las funciones auxiliares de RLS
-- Postgres le da EXECUTE a PUBLIC automáticamente al crear una función, a
-- menos que se revoque explícito. Estas funciones son inofensivas para un
-- llamador anónimo (dependen de auth.uid(), que sería null sin sesión),
-- pero no hay razón para dejarlas expuestas a quien no inició sesión.
--
-- Nota: este paso, por sí solo, NO fue suficiente — ver 018_revocar_
-- execute_anon_directo.sql. Se deja aquí para que el historial de
-- migraciones coincida exactamente con lo que se aplicó de verdad.
-- ============================================================================

revoke execute on function empresa_actual() from public;
revoke execute on function es_owner() from public;
revoke execute on function es_admin() from public;
revoke execute on function proyectos_a_cargo() from public;
revoke execute on function confirmar_pago_semanal(uuid, numeric) from public;

grant execute on function empresa_actual() to authenticated;
grant execute on function es_owner() to authenticated;
grant execute on function es_admin() to authenticated;
grant execute on function proyectos_a_cargo() to authenticated;
grant execute on function confirmar_pago_semanal(uuid, numeric) to authenticated;
