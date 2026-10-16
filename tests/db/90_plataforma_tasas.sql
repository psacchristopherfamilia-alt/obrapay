-- Fase B (3): el dueño de la plataforma edita NIB y NHIP de una compañía.
begin;
create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;
create or replace function pg_temp.hacer_plataforma(p_perfil uuid) returns void language sql security definer as $f$
  insert into public.plataforma_duenos (perfil_id) values (p_perfil) $f$;
create or replace function pg_temp.cierra(p_semana uuid) returns void language sql security definer as $f$
  select public._cerrar_semana(p_semana) $f$;
create or replace function pg_temp.eventos(p_empresa uuid, p_tipo text) returns int language sql security definer as $f$
  select count(*)::int from public.eventos_admin where empresa_id = p_empresa and tipo = p_tipo $f$;
grant execute on all functions in schema pg_temp to public;
select pg_temp.hacer_plataforma(pg_temp.yo('c3'));
select public.asegurar_semana('00000000-0000-0000-0000-0000000000e1', '2026-10-08');

set role authenticated;
select test.como(pg_temp.yo('a1'));
select test.falla($$select * from public.plataforma_tasas('00000000-0000-0000-0000-0000000000e1')$$, 'permiso', 'el admin no ve las tasas desde la plataforma');
select test.falla($$select public.plataforma_cambiar_tasa('00000000-0000-0000-0000-0000000000e1', 'NIB', '2027-01-01', 6, 7, 6000, 15)$$, 'permiso', 'el admin no las cambia desde la plataforma');

select test.como(pg_temp.yo('c3'));
select test.igual((select count(*)::int from public.plataforma_tasas('00000000-0000-0000-0000-0000000000e1')), 2, 'lista NIB y NHIP');
select test.falla($$select public.plataforma_cambiar_tasa('00000000-0000-0000-0000-0000000000e1', 'XYZ', '2027-01-01', 6, 7, 6000, 15)$$, 'Agencia', 'agencia inválida');
select test.falla($$select public.plataforma_cambiar_tasa('00000000-0000-0000-0000-0000000000e1', 'NIB', '2027-01-01', 101, 7, 6000, 15)$$, 'tasas', 'tasa fuera de rango');
select test.falla($$select public.plataforma_cambiar_tasa('00000000-0000-0000-0000-0000000000e1', 'NIB', '2027-01-01', 6, 7, 0, 15)$$, 'tope', 'tope inválido');
select test.falla($$select public.plataforma_cambiar_tasa('00000000-0000-0000-0000-0000000000e1', 'NIB', '2027-01-01', 6, 7, 6000, 40)$$, 'vencimiento', 'día de vencimiento inválido');
select public.plataforma_cambiar_tasa('00000000-0000-0000-0000-0000000000e1', 'NIB', '2027-01-01', 6, 7, 6500, 16);
select test.igual((select tasa_empleado from public.plataforma_tasas('00000000-0000-0000-0000-0000000000e1') where agencia = 'NIB' and vigente_desde = '2027-01-01'), 6::numeric, 'la nueva tasa queda con su fecha de vigencia');
select test.igual((select count(*)::int from public.plataforma_tasas('00000000-0000-0000-0000-0000000000e1') where agencia = 'NIB'), 2, 'la anterior se conserva (historial)');
select test.igual(pg_temp.eventos('00000000-0000-0000-0000-0000000000e1', 'cambio_tasa_estatutaria'), 1, 'queda registrado');

-- con una semana cerrada, no se puede poner una fecha que la alcance
reset role;
select pg_temp.cierra(test.semana('2026-10-08'));
set role authenticated;
select test.como(pg_temp.yo('c3'));
select test.falla($$select public.plataforma_cambiar_tasa('00000000-0000-0000-0000-0000000000e1', 'NHIP', '2026-10-01', 4, 4, 7800, 14)$$, 'cerradas', 'no toca semanas cerradas');
rollback;
