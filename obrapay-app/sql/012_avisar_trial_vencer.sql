-- ============================================================================
-- 012 — Aviso de prueba por vencer (3 días antes)
-- ============================================================================

alter table empresas add column if not exists aviso_trial_enviado boolean not null default false;

create or replace function avisar_trials_por_vencer()
returns void
language plpgsql
security definer
as $$
declare
  e record;
  admin_row record;
  v_mensaje text;
begin
  for e in
    select id, nombre, trial_termina_en
    from empresas
    where estado = 'trial'
      and aviso_trial_enviado = false
      and trial_termina_en > now()
      and trial_termina_en <= now() + interval '3 days'
  loop
    v_mensaje := 'Tu prueba de OBRAPAY vence el ' || to_char(e.trial_termina_en, 'DD/MM/YYYY') ||
                 '. Elige un plan para no perder geo-cerca, alertas de sobrepresupuesto y firma digital.';

    for admin_row in
      select u.id, coalesce(ce.canal_whatsapp, true) as canal_whatsapp,
             coalesce(ce.canal_email, true) as canal_email,
             coalesce(ce.canal_push, true) as canal_push
      from usuarios u
      left join configuracion_empresa ce on ce.empresa_id = u.empresa_id
      where u.empresa_id = e.id and u.rol = 'admin'
    loop
      if admin_row.canal_whatsapp then
        insert into notificaciones (usuario_id, tipo, canal, mensaje)
          values (admin_row.id, 'prueba_por_vencer', 'whatsapp', v_mensaje);
      end if;
      if admin_row.canal_email then
        insert into notificaciones (usuario_id, tipo, canal, mensaje)
          values (admin_row.id, 'prueba_por_vencer', 'email', v_mensaje);
      end if;
      if admin_row.canal_push then
        insert into notificaciones (usuario_id, tipo, canal, mensaje)
          values (admin_row.id, 'prueba_por_vencer', 'push', v_mensaje);
      end if;
    end loop;

    -- Una sola vez por prueba — no se manda todos los días durante la
    -- ventana de 3 días.
    update empresas set aviso_trial_enviado = true where id = e.id;
  end loop;
end;
$$;

-- Una vez al día basta; no es una operación urgente como el cierre de
-- semana. Ajusta la hora (UTC) según cuándo prefieras que salgan los avisos.
select cron.schedule('avisar-trial-vencer-obrapay', '0 13 * * *', $$select avisar_trials_por_vencer();$$);

revoke execute on function avisar_trials_por_vencer() from public, authenticated, anon;
