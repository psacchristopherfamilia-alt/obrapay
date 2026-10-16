-- ObraPay · Fase B (3): el dueño de la plataforma edita NIB y NHIP de cualquier compañía desde "Configurar".
-- Misma regla que el administrador de la compañía (tasa por fecha de vigencia), pero sin entrar como asistente,
-- y sin tocar semanas ya cerradas o pagadas.

create or replace function public.plataforma_tasas(p_empresa uuid)
returns table (agencia text, vigente_desde date, tasa_empleado numeric, tasa_empleador numeric, tope_mensual numeric, dia_vencimiento integer)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._exigir_plataforma();
  if not exists (select 1 from empresas where id = p_empresa and not interna) then raise exception 'Compañía no encontrada'; end if;
  return query
  select t.agencia, t.vigente_desde, t.tasa_empleado, t.tasa_empleador, t.tope_mensual, t.dia_vencimiento
  from tasas_estatutarias t where t.empresa_id = p_empresa order by t.agencia, t.vigente_desde;
end $$;

create or replace function public.plataforma_cambiar_tasa(
  p_empresa uuid, p_agencia text, p_desde date, p_tasa_empleado numeric, p_tasa_empleador numeric, p_tope_mensual numeric, p_dia_vencimiento integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._exigir_plataforma();
  if not exists (select 1 from empresas where id = p_empresa and not interna) then raise exception 'Compañía no encontrada'; end if;
  if p_agencia not in ('NIB', 'NHIP') then raise exception 'Agencia inválida (NIB o NHIP)'; end if;
  if p_desde is null then raise exception 'Falta la fecha de vigencia'; end if;
  if p_tasa_empleado is null or p_tasa_empleado < 0 or p_tasa_empleado > 100 or p_tasa_empleador is null or p_tasa_empleador < 0 or p_tasa_empleador > 100 then
    raise exception 'Las tasas deben estar entre 0 y 100';
  end if;
  if p_tope_mensual is null or p_tope_mensual <= 0 then raise exception 'El tope mensual debe ser mayor que cero'; end if;
  if p_dia_vencimiento is null or p_dia_vencimiento not between 1 and 28 then raise exception 'El día de vencimiento debe estar entre 1 y 28'; end if;
  if exists (select 1 from semanas where empresa_id = p_empresa and estado in ('cerrada', 'pagada') and pago >= p_desde) then
    raise exception 'La fecha no puede tocar semanas ya cerradas o pagadas';
  end if;
  insert into tasas_estatutarias (empresa_id, agencia, vigente_desde, tasa_empleado, tasa_empleador, tope_mensual, dia_vencimiento, creado_por)
  values (p_empresa, p_agencia, p_desde, p_tasa_empleado, p_tasa_empleador, round(p_tope_mensual, 2), p_dia_vencimiento, auth.uid())
  on conflict (empresa_id, agencia, vigente_desde) do update
    set tasa_empleado = excluded.tasa_empleado, tasa_empleador = excluded.tasa_empleador, tope_mensual = excluded.tope_mensual,
        dia_vencimiento = excluded.dia_vencimiento, creado_por = excluded.creado_por;
  perform public._evento(p_empresa, 'cambio_tasa_estatutaria', jsonb_build_object('agencia', p_agencia, 'desde', p_desde,
    'tasa_empleado', p_tasa_empleado, 'tasa_empleador', p_tasa_empleador, 'tope_mensual', p_tope_mensual, 'dia_vencimiento', p_dia_vencimiento, 'por_plataforma', true));
end $$;

revoke all on function public.plataforma_tasas(uuid), public.plataforma_cambiar_tasa(uuid, text, date, numeric, numeric, numeric, integer) from public, anon;
grant execute on function public.plataforma_tasas(uuid), public.plataforma_cambiar_tasa(uuid, text, date, numeric, numeric, numeric, integer) to authenticated;
