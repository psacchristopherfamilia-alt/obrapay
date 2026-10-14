-- El admin puede cambiar el salario mínimo por hora de la empresa (antes solo se leía).
create or replace function public.cambiar_salario_minimo(p_monto numeric)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_emp uuid := public.mi_empresa(); v_antes numeric;
begin
  perform public._exigir_rol('admin');
  if p_monto is null or p_monto <= 0 or p_monto > 1000 then raise exception 'El salario mínimo debe ser mayor que cero'; end if;
  select salario_minimo_hora into v_antes from empresas where id = v_emp;
  update empresas set salario_minimo_hora = round(p_monto, 2) where id = v_emp;
  perform public._evento(v_emp, 'cambio_salario_minimo', jsonb_build_object('antes', v_antes, 'despues', round(p_monto, 2)));
end $$;
revoke all on function public.cambiar_salario_minimo(numeric) from public, anon;
grant execute on function public.cambiar_salario_minimo(numeric) to authenticated;
