-- ============================================================================
-- 007 — Cierre automático diario a las 5:00pm
-- Regla de negocio: si un trabajador no marca salida y llega la hora de
-- inicio de horas extra (configuracion_empresa.hora_inicio_extra, 5:00pm
-- por defecto), el turno se cierra solo ESE MISMO DÍA — no hay que esperar
-- al cierre semanal del miércoles para que el supervisor lo vea y lo revise.
-- ============================================================================

create or replace function cerrar_turnos_del_dia()
returns void
language plpgsql
security definer
as $$
declare
  r record;
begin
  -- Un turno "vencido" es uno sin hora_salida cuya hora de inicio de extras
  -- (de SU empresa, por si cada una configuró un horario distinto) ya pasó
  -- hoy. Se usa la zona horaria de la empresa si la tuviera; por ahora,
  -- America/Grand_Turk para todas (Turks and Caicos).
  for r in
    select rh.id, rh.hora_entrada, rh.usuario_id, ce.hora_inicio_extra
    from registros_horas rh
    join usuarios u on u.id = rh.usuario_id
    join configuracion_empresa ce on ce.empresa_id = u.empresa_id
    where rh.hora_salida is null
      and rh.estado = 'pendiente'
      and (now() at time zone 'America/Grand_Turk')::time >= ce.hora_inicio_extra
      and (rh.hora_entrada at time zone 'America/Grand_Turk')::date
        = (now() at time zone 'America/Grand_Turk')::date
  loop
    -- La salida se registra a la hora exacta del corte (5:00pm), no a
    -- "ahora" — así las horas extra reales se calculan cuando alguien le
    -- ponga la hora de salida verdadera al revisar el caso.
    update registros_horas
      set estado = 'cerrado_automatico'
      where id = r.id;
  end loop;
end;
$$;

select cron.schedule('cierre-diario-turnos-obrapay', '*/10 * * * *', $$select cerrar_turnos_del_dia();$$);

revoke execute on function cerrar_turnos_del_dia() from public, authenticated, anon;
