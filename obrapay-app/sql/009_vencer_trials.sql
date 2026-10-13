-- ============================================================================
-- 009 — Vencimiento de prueba: cae a Gratuito si no se convirtió
-- ============================================================================

alter table empresas add column if not exists trial_termina_en timestamptz;

-- ----------------------------------------------------------------------------
-- Revisa las empresas en prueba vencida. Si nunca completaron un Stripe
-- Checkout de verdad (stripe_subscription_id sigue null), se bajan a
-- Gratuito. Si sí pagaron durante la prueba, el webhook de Stripe ya les
-- dejó el plan correcto — aquí solo se les quita la etiqueta de "trial".
-- ----------------------------------------------------------------------------
create or replace function vencer_trials()
returns void
language plpgsql
security definer
as $$
declare
  e record;
  v_plan_gratuito uuid;
begin
  select id into v_plan_gratuito from planes where clave = 'free';

  for e in
    select em.id, s.stripe_subscription_id
    from empresas em
    join suscripciones s on s.empresa_id = em.id
    where em.estado = 'trial' and em.trial_termina_en <= now()
  loop
    if e.stripe_subscription_id is null then
      update suscripciones
        set plan_id = v_plan_gratuito,
            fecha_renovacion = now() + interval '30 days'
        where empresa_id = e.id;
    end if;

    update empresas set estado = 'active' where id = e.id;
  end loop;
end;
$$;

select cron.schedule('vencer-trials-obrapay', '0 * * * *', $$select vencer_trials();$$);

revoke execute on function vencer_trials() from public, authenticated, anon;
