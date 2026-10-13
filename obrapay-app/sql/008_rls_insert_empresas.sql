-- ============================================================================
-- 008 — Permiso de INSERT en empresas para el Creador SaaS
-- Todas las escrituras de "Nueva empresa" corren con el service role desde
-- el Server Action (bypassa RLS de todos modos), pero se agrega la política
-- por consistencia con el resto del esquema y por si algún día se necesita
-- desde un cliente autenticado directamente.
-- ============================================================================

create policy empresas_insert on empresas
  for insert with check (es_owner());
