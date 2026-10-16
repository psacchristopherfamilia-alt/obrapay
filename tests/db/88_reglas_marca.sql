-- Fase B (1): multiplicador de hora extra, marca y configuración (solo el dueño de la plataforma), con registro.
begin;
create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;
create or replace function pg_temp.hacer_plataforma(p_perfil uuid) returns void language sql security definer as $f$
  insert into public.plataforma_duenos (perfil_id) values (p_perfil) $f$;
create or replace function pg_temp.eventos(p_empresa uuid, p_tipo text) returns int language sql security definer as $f$
  select count(*)::int from public.eventos_admin where empresa_id = p_empresa and tipo = p_tipo $f$;
create or replace function pg_temp.cierra(p_semana uuid) returns void language sql security definer as $f$
  select public._cerrar_semana(p_semana) $f$;
grant execute on all functions in schema pg_temp to public;
update public.empresas set almuerzo_inicio = null, almuerzo_fin = null;
select pg_temp.hacer_plataforma(pg_temp.yo('c3'));

select public.asegurar_semana('00000000-0000-0000-0000-0000000000e1', '2026-10-08');
-- Juan (a $18/h): 8 h regulares + 2 h extra el jueves 8
select test.turno('c1', 'f1', '2026-10-08', '09:00', '19:00');
select test.igual((select bruto from public._calcular_semana(test.semana('2026-10-08')) where perfil_id = pg_temp.yo('c1')), 180.00, 'sin multiplicador la extra se paga igual (como hasta hoy)');
select test.igual(public._mult_extra(test.semana('2026-10-08')), 1::numeric, 'el multiplicador por defecto es 1');

set role authenticated;
select test.como(pg_temp.yo('a1'));
select test.falla($$select public.plataforma_config('00000000-0000-0000-0000-0000000000e1')$$, 'permiso', 'el admin no lee la configuración');
select test.falla($$select public.plataforma_guardar_config('00000000-0000-0000-0000-0000000000e1', '{"extra_multiplicador":1.5}')$$, 'permiso', 'el admin no cambia la configuración');

select test.como(pg_temp.yo('c3'));
select test.igual(public.plataforma_config('00000000-0000-0000-0000-0000000000e1') ->> 'hora_extra_desde', '17:00', 'lee la hora de extra');
select test.falla($$select public.plataforma_guardar_config('00000000-0000-0000-0000-0000000000e1', '{"extra_multiplicador":1.5}')$$, 'fecha', 'un multiplicador pide fecha de inicio');
select test.falla($$select public.plataforma_guardar_config('00000000-0000-0000-0000-0000000000e1', '{"extra_multiplicador":5,"extra_mult_desde":"2030-01-01"}')$$, 'entre 1 y 3', 'multiplicador fuera de rango');
select test.falla($$select public.plataforma_guardar_config('00000000-0000-0000-0000-0000000000e1', '{"almuerzo_inicio":"12:00","almuerzo_fin":null}')$$, 'almuerzo', 'almuerzo a medias');
select test.falla($$select public.plataforma_guardar_config('00000000-0000-0000-0000-0000000000e1', '{"zona_horaria":"Marte/Olimpo"}')$$, 'zona', 'zona inválida');
select test.falla($$select public.plataforma_guardar_config('00000000-0000-0000-0000-0000000000e1', '{"marca_color":"rojo"}')$$, 'marca_color', 'color inválido');

-- vale desde el inicio de la semana del 8 de octubre
select public.plataforma_guardar_config('00000000-0000-0000-0000-0000000000e1', '{"extra_multiplicador":1.5,"extra_mult_desde":"2026-10-08"}');
reset role;
select test.igual((select bruto from public._calcular_semana(test.semana('2026-10-08')) where perfil_id = pg_temp.yo('c1')), 198.00, 'con 1.5×: 8 h × 18 + 2 h × 27 = $198');
select test.igual((select round(sum(bruto_exacto), 2) from public._detalle_semana(test.semana('2026-10-08')) where perfil_id = pg_temp.yo('c1')), 198.00, 'el detalle por obra coincide');
select test.igual(public._mult_extra(test.semana('2026-10-01')), 1::numeric, 'las semanas anteriores a la fecha no cambian');
select test.igual(pg_temp.eventos('00000000-0000-0000-0000-0000000000e1', 'config_cambiada'), 1, 'el cambio queda registrado');

-- una semana cerrada ya no se toca: no se puede poner una fecha dentro de semanas cerradas
select pg_temp.cierra(test.semana('2026-10-08'));
set role authenticated;
select test.como(pg_temp.yo('c3'));
select test.falla($$select public.plataforma_guardar_config('00000000-0000-0000-0000-0000000000e1', '{"extra_multiplicador":2,"extra_mult_desde":"2026-10-08"}')$$, 'cerradas', 'no cambia semanas cerradas');
select public.plataforma_guardar_config('00000000-0000-0000-0000-0000000000e1', '{"hora_extra_desde":"16:00","marca_nombre":"  Constructora Prueba ","marca_color":"#1a73e8","marca_logo":"data:image/png;base64,AAA"}');
select test.igual(public.plataforma_config('00000000-0000-0000-0000-0000000000e1') ->> 'marca_nombre', 'Constructora Prueba', 'guarda el nombre de marca sin espacios sobrantes');
select test.igual(public.plataforma_config('00000000-0000-0000-0000-0000000000e1') ->> 'hora_extra_desde', '16:00', 'cambia la hora de extra');
select test.igual(public.plataforma_config('00000000-0000-0000-0000-0000000000e1') ->> 'extra_multiplicador', '1.50', 'conserva lo que no se tocó');
-- quitar la marca
select public.plataforma_guardar_config('00000000-0000-0000-0000-0000000000e1', '{"marca_logo":null,"marca_nombre":""}');
select test.igual(public.plataforma_config('00000000-0000-0000-0000-0000000000e1') -> 'marca_logo', 'null'::jsonb, 'quita el logo');
reset role;
select test.igual(pg_temp.eventos('00000000-0000-0000-0000-0000000000e1', 'config_cambiada'), 3, 'cada cambio queda con quién y qué valor había');
rollback;
