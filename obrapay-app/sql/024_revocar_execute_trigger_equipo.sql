-- ============================================================================
-- 024 — Cerrar el RPC de la función trigger de equipos
-- avisar_equipo_danado_perdido() solo debe dispararse como trigger, nunca
-- llamarse directo. El validador de seguridad de Supabase la encontró
-- expuesta como /rest/v1/rpc/avisar_equipo_danado_perdido, llamable tanto
-- por "anon" como por "authenticated" — revocarle EXECUTE a los tres no
-- rompe el trigger: Postgres invoca triggers con los privilegios del
-- dueño de la función, sin importar los GRANT a otros roles.
-- ============================================================================

revoke execute on function avisar_equipo_danado_perdido() from public, anon, authenticated;
