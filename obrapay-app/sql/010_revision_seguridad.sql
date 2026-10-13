-- ============================================================================
-- 010 — Revisión de seguridad: RLS faltante encontrado en pasada general
--
-- Grupo A: RLS habilitado desde el esquema original pero SIN ninguna
-- política — con row level security activado y cero políticas, Postgres
-- bloquea el 100% del acceso (ni el propio dueño de la fila puede leerla).
-- Esto rompía en silencio: Ajustes, el marcaje de horas (necesita
-- configuracion_empresa y semanas_pago), Mi equipo y Trabajadores del
-- Supervisor/Admin (necesitan perfil_nomina y proyecto_trabajadores).
--
-- Grupo B: tablas que nunca tuvieron RLS activado — lo opuesto: sin
-- ninguna protección, cualquier usuario autenticado podía leerlas enteras.
-- ============================================================================

-- ---- Grupo A ----------------------------------------------------------------

create policy perfil_nomina_select on perfil_nomina
  for select using (
    es_owner()
    or usuario_id = auth.uid()
    or (es_admin() and usuario_id in (select id from usuarios where empresa_id = empresa_actual()))
    or usuario_id in (
      select ut.usuario_id from proyecto_trabajadores ut
      where ut.proyecto_id in (select proyectos_a_cargo())
    )
  );

create policy perfil_nomina_write on perfil_nomina
  for all using (es_admin() and usuario_id in (select id from usuarios where empresa_id = empresa_actual()))
  with check (es_admin() and usuario_id in (select id from usuarios where empresa_id = empresa_actual()));

create policy proyecto_trabajadores_select on proyecto_trabajadores
  for select using (
    es_owner()
    or usuario_id = auth.uid()
    or proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  );

create policy proyecto_trabajadores_write on proyecto_trabajadores
  for all using (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  with check (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()));

create policy proyecto_supervisores_select on proyecto_supervisores
  for select using (
    es_owner()
    or usuario_id = auth.uid()
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  );

-- Necesaria: app/admin/proyectos/[id]/page.tsx inserta aquí directo desde
-- el navegador con la sesión del Admin (no pasa por un Server Action).
create policy proyecto_supervisores_write on proyecto_supervisores
  for all using (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  with check (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()));

create policy prestamos_select on prestamos
  for select using (
    es_owner()
    or usuario_id = auth.uid()
    or (es_admin() and usuario_id in (select id from usuarios where empresa_id = empresa_actual()))
  );
-- Sin política de escritura: los préstamos solo se crean/actualizan desde
-- crearTrabajador() y confirmar_pago_semanal() (service role / security
-- definer), nunca directo desde el navegador.

create policy auditoria_select on auditoria
  for select using (es_owner() or (es_admin() and empresa_id = empresa_actual()));

-- configuracion_empresa: el select debe alcanzar a CUALQUIER rol de la
-- empresa (trabajador y supervisor la leen indirecto vía
-- obtenerHoraInicioExtra en lib/horas.ts), no solo al Admin.
create policy configuracion_empresa_select on configuracion_empresa
  for select using (es_owner() or empresa_id = empresa_actual());

create policy configuracion_empresa_write on configuracion_empresa
  for all using (es_admin() and empresa_id = empresa_actual())
  with check (es_admin() and empresa_id = empresa_actual());

-- semanas_pago: mismo caso — el trabajador la necesita para marcar entrada,
-- el supervisor para el resumen de horas de la semana en Proyectos.
create policy semanas_pago_select on semanas_pago
  for select using (es_owner() or empresa_id = empresa_actual());

-- ---- Grupo B ----------------------------------------------------------------

alter table historial_tarifas enable row level security;

create policy historial_tarifas_select on historial_tarifas
  for select using (
    es_owner()
    or usuario_id = auth.uid()
    or (es_admin() and usuario_id in (select id from usuarios where empresa_id = empresa_actual()))
  );

alter table prestamo_descuentos enable row level security;

create policy prestamo_descuentos_select on prestamo_descuentos
  for select using (
    es_owner()
    or exists (
      select 1 from prestamos p where p.id = prestamo_descuentos.prestamo_id and p.usuario_id = auth.uid()
    )
    or (es_admin() and exists (
      select 1 from prestamos p join usuarios u on u.id = p.usuario_id
      where p.id = prestamo_descuentos.prestamo_id and u.empresa_id = empresa_actual()
    ))
  );
