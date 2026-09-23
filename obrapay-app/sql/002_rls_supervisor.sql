-- ============================================================================
-- 002 — Refinamiento RLS: registros_horas por rol real
-- La política original (empresa completa) era un aislamiento por EMPRESA,
-- correcto contra otras empresas, pero no distinguía roles dentro de la
-- misma empresa. Un supervisor no debe poder aprobar horas de un proyecto
-- que no es suyo, ni un trabajador ver las horas de un compañero.
-- ============================================================================

drop policy if exists registros_horas_acceso on registros_horas;

-- Helper: ids de proyectos a cargo del usuario autenticado (principal o extra)
create or replace function proyectos_a_cargo()
returns setof uuid
language sql stable
as $$
  select id from proyectos where supervisor_principal_id = auth.uid()
  union
  select proyecto_id from proyecto_supervisores where usuario_id = auth.uid()
$$;

create or replace function es_admin()
returns boolean
language sql stable
as $$
  select exists (
    select 1 from usuarios
    where id = auth.uid() and rol = 'admin' and empresa_id = empresa_actual()
  )
$$;

-- LECTURA: el propio trabajador, el supervisor de ese proyecto, el admin de
-- la empresa, o el Creador SaaS.
create policy registros_horas_select on registros_horas
  for select using (
    es_owner()
    or usuario_id = auth.uid()
    or proyecto_id in (select proyectos_a_cargo())
    or es_admin()
  );

-- ESCRITURA (marcar entrada/salida): solo el propio trabajador, sobre su
-- propio registro.
create policy registros_horas_insert on registros_horas
  for insert with check (usuario_id = auth.uid());

create policy registros_horas_update_propio on registros_horas
  for update using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

-- APROBACIÓN: solo el supervisor a cargo del proyecto, o el admin (para las
-- horas que quedaron pendientes después del cierre del miércoles).
create policy registros_horas_aprobar on registros_horas
  for update using (
    proyecto_id in (select proyectos_a_cargo())
    or es_admin()
  );
