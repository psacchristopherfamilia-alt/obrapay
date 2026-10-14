-- Reportes del contador: semanas, NIB/NHIP por semana, pagado por proyecto, altas y bajas, datos del empleador.
--   e1 = compañía de prueba · e2 = otra compañía con su propio admin (a9), que no debe ver nada de e1.
--   Marzo 2027: semana jue 4–mié 10 (pago vie 12 → semana 2 del mes) y semana jue 11–mié 17 (pago vie 19 → semana 3).
begin;

create or replace function pg_temp.id(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;
create or replace function pg_temp.en(p text) returns void language sql as $$
  select set_config('request.headers',
    case when p is null then '' else json_build_object('x-empresa-id', pg_temp.id(p))::text end, false) $$;
create or replace function pg_temp.turno(p_perfil text, p_proyecto text, p_fecha date, p_ini time, p_fin time)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.turnos (empresa_id, perfil_id, proyecto_id, entrada, salida, estado)
  values (pg_temp.id('e1'), pg_temp.id(p_perfil), pg_temp.id(p_proyecto),
          (p_fecha + p_ini) at time zone 'America/Grand_Turk', (p_fecha + p_fin) at time zone 'America/Grand_Turk', 'aprobado')
  returning id into v;
  return v;
end $$;

update public.empresas set almuerzo_inicio = null, almuerzo_fin = null;
insert into public.empresas (id, nombre) values (pg_temp.id('e2'), 'Compañía dos');
insert into auth.users (id, email) values (pg_temp.id('a9'), 'admin9@obrapay.local');
insert into public.perfiles (id, empresa_id, usuario, nombre, roles) values (pg_temp.id('a9'), pg_temp.id('e2'), 'admin9', 'Admin dos', array['admin']);

select public.asegurar_semana(pg_temp.id('e1'), '2027-03-04');
select public.asegurar_semana(pg_temp.id('e1'), '2027-03-11');
select pg_temp.turno('c1', 'f1', '2027-03-04', '08:00', '12:00');   -- Juan 4 h × $18 = $72
select pg_temp.turno('c2', 'f2', '2027-03-04', '08:00', '12:00');   -- Marie 4 h × $20 = $80
select pg_temp.turno('c1', 'f1', '2027-03-11', '08:00', '10:00');   -- Juan 2 h × $18 = $36
select public._cerrar_semana((select id from public.semanas where empresa_id = pg_temp.id('e1') and inicio = '2027-03-04'));
select public._cerrar_semana((select id from public.semanas where empresa_id = pg_temp.id('e1') and inicio = '2027-03-11'));

set role authenticated;
select test.como(pg_temp.id('a1'));
select pg_temp.en('e1');
select test.igual((select count(*)::int from public.reporte_semanas(pg_temp.id('e1')) where inicio in ('2027-03-04','2027-03-11')), 2, 'las dos semanas están en la lista');
select test.igual((select nro from public.reporte_semanas(pg_temp.id('e1')) where inicio = '2027-03-04'), 2, 'pago el 12: semana 2 del mes');
select test.igual((select nro from public.reporte_semanas(pg_temp.id('e1')) where inicio = '2027-03-11'), 3, 'pago el 19: semana 3 del mes');
select test.igual((select count(*)::int from public.reporte_seguros(pg_temp.id('e1'), '2027-03-01', '2027-03-31')), 3, 'tres renglones: Juan dos semanas y Marie una');
select test.igual((select base_nib from public.reporte_seguros(pg_temp.id('e1'), '2027-03-12', '2027-03-12') where perfil_id = pg_temp.id('c1')), 72.00::numeric, 'una semana: base NIB de Juan');
select test.igual((select count(*)::int from public.reporte_seguros(pg_temp.id('e1'), '2027-03-12', '2027-03-12')), 2, 'filtrar por el viernes de pago deja solo esa semana');
select test.igual((select apellido from public.reporte_seguros(pg_temp.id('e1'), '2027-03-12', '2027-03-12') where perfil_id = pg_temp.id('c1')), 'Pérez', 'sin nombre legal: apellido = última palabra');
select test.igual((select nombre from public.reporte_seguros(pg_temp.id('e1'), '2027-03-12', '2027-03-12') where perfil_id = pg_temp.id('c1')), 'Juan', 'sin nombre legal: nombre = el resto');
select public.actualizar_nombre_legal(pg_temp.id('c1'), 'Pérez Díaz', 'Juan Carlos', 'x');
select test.igual((select apellido || '|' || nombre || '|' || inicial from public.reporte_seguros(pg_temp.id('e1'), '2027-03-12', '2027-03-12') where perfil_id = pg_temp.id('c1')), 'Pérez Díaz|Juan Carlos|x', 'el nombre legal guardado manda');
select test.igual((select sum(bruto) from public.reporte_proyectos_pagados(pg_temp.id('e1'), '2027-03-01', '2027-03-31')), 188.00::numeric, 'pagado por proyecto suma $188');
select test.igual((select bruto from public.reporte_proyectos_pagados(pg_temp.id('e1'), '2027-03-12', '2027-03-12') where proyecto_id = pg_temp.id('f2')), 80.00::numeric, 'Marie en Leeward Plaza esa semana');

-- Altas y bajas
select test.igual((select count(*)::int from public.reporte_altas_bajas(pg_temp.id('e1'), 2027, 3) where tipo = 'alta'), 2, 'altas de marzo: Juan y Marie');
select test.igual((select fecha from public.reporte_altas_bajas(pg_temp.id('e1'), 2027, 3) where tipo = 'alta' and perfil_id = pg_temp.id('c1')), '2027-03-04'::date, 'fecha de inicio = primer turno');
select test.igual((select count(*)::int from public.reporte_altas_bajas(pg_temp.id('e1'), 2027, 3) where tipo = 'baja'), 0, 'sin bajas todavía');
select test.igual((select count(*)::int from public.reporte_altas_bajas(pg_temp.id('e1'), 2027, 4)), 0, 'abril no tiene altas ni bajas');
reset role;
update public.perfiles set activo = false where id = pg_temp.id('c2');
set role authenticated;
select test.como(pg_temp.id('a1'));
select test.igual((select fecha from public.reporte_altas_bajas(pg_temp.id('e1'), 2027, 3) where tipo = 'baja' and perfil_id = pg_temp.id('c2')), '2027-03-04'::date, 'baja = último turno del inactivo');

-- Datos del empleador
select public.guardar_datos_empleador(pg_temp.id('e1'), 'REG-123', 'INS-456', 'Leeward Hwy', 'PO Box 9', '649-555-0100');
select test.igual((select nib_registro || '|' || telefono from public.datos_empleador(pg_temp.id('e1'))), 'REG-123|649-555-0100', 'datos del empleador guardados');

-- Permisos
select test.como(pg_temp.id('a9'));
select test.falla(format($q$select * from public.reporte_seguros(%L, '2027-03-01', '2027-03-31')$q$, pg_temp.id('e1')), 'No tienes permiso', 'un admin de otra compañía no ve el reporte');
select test.falla(format($q$select * from public.reporte_semanas(%L)$q$, pg_temp.id('e1')), 'No tienes permiso', 'ni la lista de semanas');
select test.falla(format($q$select public.guardar_datos_empleador(%L, 'x', 'x', 'x', 'x', 'x')$q$, pg_temp.id('e1')), 'No tienes permiso', 'ni cambia sus datos');
select test.como(pg_temp.id('b1'));
select test.falla(format($q$select * from public.reporte_seguros(%L, '2027-03-01', '2027-03-31')$q$, pg_temp.id('e1')), 'No tienes permiso', 'un supervisor no ve el reporte');
select test.como(pg_temp.id('d1'));
select test.igual((select count(*)::int from public.reporte_seguros(pg_temp.id('e1'), '2027-03-01', '2027-03-31')), 3, 'el dueño sí lo ve');
select test.falla(format($q$select public.guardar_datos_empleador(%L, 'x', 'x', 'x', 'x', 'x')$q$, pg_temp.id('e1')), 'No tienes permiso', 'pero no cambia los datos');
reset role;

rollback;
