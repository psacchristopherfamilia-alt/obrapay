-- ============================================================================
-- 006 — Privacidad de pagos_semanales + RLS faltante en pago_proyecto_detalle
-- La política original dejaba ver el pago de CUALQUIER trabajador a
-- CUALQUIER persona de la misma empresa (un compañero podía ver el sueldo
-- de otro). La reemplazo por: el propio trabajador, el admin de su empresa,
-- o el owner.
-- ============================================================================

drop policy if exists pagos_acceso on pagos_semanales;

create policy pagos_semanales_select on pagos_semanales
  for select using (
    es_owner()
    or usuario_id = auth.uid()
    or (es_admin() and usuario_id in (select id from usuarios where empresa_id = empresa_actual()))
  );

-- Nadie escribe esta tabla directo desde el cliente — todo pasa por las
-- funciones cerrar_semana_actual() y confirmar_pago_semanal() (security
-- definer), así que no hace falta política de INSERT/UPDATE aquí.

alter table pago_proyecto_detalle enable row level security;

create policy pago_proyecto_detalle_select on pago_proyecto_detalle
  for select using (
    es_owner()
    or exists (
      select 1 from pagos_semanales p
      where p.id = pago_proyecto_detalle.pago_id
        and (p.usuario_id = auth.uid() or (es_admin() and p.usuario_id in (
          select id from usuarios where empresa_id = empresa_actual()
        )))
    )
  );
