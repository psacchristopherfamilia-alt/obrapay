-- Avisos para el admin dentro de la app (sin WhatsApp ni correo todavía):
--   · remesa NIB/NHIP: 3 días antes y el mismo día del vencimiento (reemplaza avisar_remesas)
--   · semana por cerrar: el miércoles, último día de la semana
--   · turnos sin aprobar con más de un día
--   · trabajador que llegó al tope mensual de NIB o NHIP al cerrar una semana
-- Todo se guarda en `notificaciones`, que el admin lee y marca como leída.

create or replace function public.avisar_remesas(p_ahora timestamptz default now())
returns integer language plpgsql security definer set search_path to 'public' as $$
declare e record; a text; t tasas_estatutarias; v_hoy date; v_vence date; v_mes date; v_total numeric; v_dias integer; n integer := 0;
begin
  for e in select id, zona_horaria from empresas loop
    v_hoy := (p_ahora at time zone e.zona_horaria)::date;
    foreach a in array array['NIB', 'NHIP'] loop
      t := public.tasa_vigente(e.id, a, v_hoy);
      continue when t.id is null;
      v_vence := make_date(extract(year from v_hoy)::int, extract(month from v_hoy)::int, t.dia_vencimiento);
      v_dias := v_vence - v_hoy;
      continue when v_dias not in (3, 0);
      v_mes := (date_trunc('month', v_hoy) - interval '1 month')::date;
      select coalesce(sum(case when a = 'NIB' then x.nib_empleado + x.nib_empleador else x.nhip_empleado + x.nhip_empleador end), 0) into v_total
        from nomina_semanal x join semanas s on s.id = x.semana_id
       where s.empresa_id = e.id and s.estado in ('cerrada', 'pagada') and not x.anulada and date_trunc('month', s.fin + 2) = v_mes;
      insert into notificaciones (empresa_id, perfil_id, tipo, datos)
      select e.id, p.id, 'remesa_por_vencer', jsonb_build_object('agencia', a, 'vence', v_vence, 'mes', to_char(v_mes, 'YYYY-MM'), 'total', v_total, 'dias', v_dias)
      from perfiles p where p.empresa_id = e.id and p.activo and 'admin' = any (p.roles);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.avisar_remesas(timestamptz) from public, anon, authenticated;

create or replace function public.avisar_pendientes(p_ahora timestamptz default now())
returns integer language plpgsql security definer set search_path to 'public' as $$
declare e record; s record; r record; v_hoy date; v_n integer; v_f integer; n integer := 0;
begin
  for e in select id, zona_horaria from empresas loop
    v_hoy := (p_ahora at time zone e.zona_horaria)::date;

    -- Semana por cerrar: hoy es el último día (miércoles) de la semana abierta.
    for s in select id, inicio, fin from semanas where empresa_id = e.id and estado = 'abierta' and fin = v_hoy loop
      insert into notificaciones (empresa_id, perfil_id, tipo, datos)
      select e.id, p.id, 'semana_por_cerrar', jsonb_build_object('semana', s.id, 'inicio', s.inicio, 'fin', s.fin)
      from perfiles p
      where p.empresa_id = e.id and p.activo and 'admin' = any (p.roles)
        and not exists (select 1 from notificaciones x where x.perfil_id = p.id and x.tipo = 'semana_por_cerrar' and x.datos ->> 'semana' = s.id::text);
      get diagnostics v_f = row_count; n := n + v_f;
    end loop;

    -- Turnos por aprobar con más de un día.
    select count(*) into v_n from turnos
      where empresa_id = e.id and estado = 'por_aprobar' and salida is not null and entrada < p_ahora - interval '1 day';
    if v_n > 0 then
      insert into notificaciones (empresa_id, perfil_id, tipo, datos)
      select e.id, p.id, 'turnos_sin_aprobar', jsonb_build_object('n', v_n)
      from perfiles p
      where p.empresa_id = e.id and p.activo and 'admin' = any (p.roles)
        and not exists (select 1 from notificaciones x where x.perfil_id = p.id and x.tipo = 'turnos_sin_aprobar' and not x.leida);
      get diagnostics v_f = row_count; n := n + v_f;
    end if;

    -- Trabajador que cruzó el tope mensual de NIB o NHIP al cerrar una semana (cerrada en las últimas 24 h).
    for r in
      select ns.perfil_id, ns.semana_id, pf.nombre,
             case when ns.base_nib > 0 and ns.base_nib < ns.bruto then true else false end as tope_nib,
             case when ns.base_nhip > 0 and ns.base_nhip < ns.bruto then true else false end as tope_nhip
      from nomina_semanal ns join semanas se on se.id = ns.semana_id join perfiles pf on pf.id = ns.perfil_id
      where se.empresa_id = e.id and not ns.anulada and se.estado in ('cerrada', 'pagada') and se.cerrada_en > p_ahora - interval '1 day'
    loop
      for s in select a as agencia from unnest(array[case when r.tope_nib then 'NIB' end, case when r.tope_nhip then 'NHIP' end]) a where a is not null loop
        insert into notificaciones (empresa_id, perfil_id, tipo, datos)
        select e.id, p.id, 'tope_seguro', jsonb_build_object('agencia', s.agencia, 'perfil', r.perfil_id, 'nombre', r.nombre, 'semana', r.semana_id)
        from perfiles p
        where p.empresa_id = e.id and p.activo and 'admin' = any (p.roles)
          and not exists (select 1 from notificaciones x where x.perfil_id = p.id and x.tipo = 'tope_seguro'
                          and x.datos ->> 'perfil' = r.perfil_id::text and x.datos ->> 'semana' = r.semana_id::text and x.datos ->> 'agencia' = s.agencia);
        get diagnostics v_f = row_count; n := n + v_f;
      end loop;
    end loop;
  end loop;
  return n;
end $$;
revoke all on function public.avisar_pendientes(timestamptz) from public, anon, authenticated;
