-- Varias compañías: una persona en las dos, horas y pagos separados, permisos entre compañías,
-- turnos que no se solapan, gastos y el resumen de solo lectura.
--   e1 = compañía de prueba · e2 = segunda compañía · a3 = admin solo de e1 · f4 = proyecto de e2
--   Juan (c1) trabaja en las dos; Pedro (c5) también; Marie (c2) solo en e1.
begin;

create or replace function pg_temp.id(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;
-- Compañía activa de la petición (lo que la app manda en el encabezado x-empresa-id). null = sin encabezado.
create or replace function pg_temp.en(p text) returns void language sql as $$
  select set_config('request.headers',
    case when p is null then '' else json_build_object('x-empresa-id', pg_temp.id(p))::text end, false) $$;
create or replace function pg_temp.sem(p_emp text, p_fecha date) returns uuid language sql as $$
  select id from public.semanas where empresa_id = pg_temp.id(p_emp) and inicio = public.semana_inicio_de(p_fecha) $$;
-- Turno en la compañía indicada, con horas locales de Grand Turk.
create or replace function pg_temp.turno(p_emp text, p_perfil text, p_proyecto text, p_fecha date, p_ini time, p_fin time, p_estado text default 'aprobado')
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.turnos (empresa_id, perfil_id, proyecto_id, entrada, salida, estado)
  values (pg_temp.id(p_emp), pg_temp.id(p_perfil), pg_temp.id(p_proyecto),
          (p_fecha + p_ini) at time zone 'America/Grand_Turk', (p_fecha + p_fin) at time zone 'America/Grand_Turk', p_estado)
  returning id into v;
  return v;
end $$;

update public.empresas set almuerzo_inicio = null, almuerzo_fin = null;

-- ---------------------------------------------------------------------------
-- Preparación: segunda compañía, un admin que solo conoce la primera
-- ---------------------------------------------------------------------------
insert into public.empresas (id, nombre) values (pg_temp.id('e2'), 'Compañía dos');
select test.igual((select count(*)::int from public.tasas_estatutarias where empresa_id = pg_temp.id('e2')), 2, 'la compañía nueva nace con NIB y NHIP');
select test.igual((select count(*)::int from public.perfil_empresas where empresa_id = pg_temp.id('e1')), 9, 'las personas que ya existían quedan en su compañía');

insert into auth.users (id, email) values (pg_temp.id('a3'), 'admin3@obrapay.local');
insert into public.perfiles (id, empresa_id, usuario, nombre, roles)
values (pg_temp.id('a3'), pg_temp.id('e1'), 'admin3', 'Admin solo e1', array['admin']);
select test.ok(public.es_miembro(pg_temp.id('a3'), pg_temp.id('e1')), 'una persona nueva queda en su compañía automáticamente');

-- Admin y dueño pertenecen a las dos
insert into public.perfil_empresas (perfil_id, empresa_id) values (pg_temp.id('a1'), pg_temp.id('e2')), (pg_temp.id('d1'), pg_temp.id('e2'));

-- ---------------------------------------------------------------------------
-- Compañía activa
-- ---------------------------------------------------------------------------
select pg_temp.en(null);
select test.como(pg_temp.id('a1'));
select test.igual(public.mi_empresa(), pg_temp.id('e1'), 'sin encabezado: la compañía de inicio');
select pg_temp.en('e2');
select test.igual(public.mi_empresa(), pg_temp.id('e2'), 'con encabezado: la compañía elegida');
select test.como(pg_temp.id('b1'));
select test.igual(public.mi_empresa(), pg_temp.id('e1'), 'encabezado de una compañía ajena: se ignora');
select set_config('request.headers', '{"x-empresa-id":"no-es-un-uuid"}', false);
select test.igual(public.mi_empresa(), pg_temp.id('e1'), 'encabezado mal formado: se ignora');
select pg_temp.en(null);
select test.como(pg_temp.id('d1'));

-- ---------------------------------------------------------------------------
-- Compartir trabajadores
-- ---------------------------------------------------------------------------
set role authenticated;
select test.como(pg_temp.id('a1'));
select pg_temp.en('e1');
select public.compartir_trabajador(pg_temp.id('c1'), pg_temp.id('e2'), 20);
select public.compartir_trabajador(pg_temp.id('c5'), pg_temp.id('e2'));
select test.ok(public.es_miembro(pg_temp.id('c1'), pg_temp.id('e2')), 'Juan ya trabaja en las dos compañías');
select test.falla(format($q$select public.compartir_trabajador(%L, %L)$q$, pg_temp.id('c1'), pg_temp.id('e2')), 'Ya trabaja', 'no se comparte dos veces');
select test.falla(format($q$select public.compartir_trabajador(%L, %L, 5)$q$, pg_temp.id('c3'), pg_temp.id('e2')), 'salario mínimo', 'la tarifa en la otra compañía respeta el salario mínimo');
select test.falla(format($q$select public.compartir_trabajador(%L, %L)$q$, pg_temp.id('c3'), pg_temp.id('e1')), 'otra compañía', 'hay que elegir la otra compañía');
select test.como(pg_temp.id('a3'));
select test.falla(format($q$select public.compartir_trabajador(%L, %L, 15)$q$, pg_temp.id('c3'), pg_temp.id('e2')), 'No tienes acceso', 'un admin no comparte hacia una compañía que no es suya');
select test.como(pg_temp.id('c1'));
select test.falla(format($q$select public.compartir_trabajador(%L, %L, 15)$q$, pg_temp.id('c3'), pg_temp.id('e2')), 'No tienes permiso', 'un trabajador no comparte trabajadores');
reset role;
select test.igual((select monto_hora from public.tarifas where perfil_id = pg_temp.id('c1') and empresa_id = pg_temp.id('e2')), 20.00, 'Juan: tarifa propia en la compañía dos');
select test.igual((select monto_hora from public.tarifas where perfil_id = pg_temp.id('c5') and empresa_id = pg_temp.id('e2')),
                  (select monto_hora from public.tarifas where perfil_id = pg_temp.id('c5') and empresa_id = pg_temp.id('e1')),
                  'Pedro: sin tarifa indicada, se copia la de la primera compañía');

-- Proyecto de la compañía dos
set role authenticated;
select test.como(pg_temp.id('a1'));
select pg_temp.en('e2');
insert into public.proyectos (id, empresa_id, nombre) values (pg_temp.id('f4'), pg_temp.id('e2'), 'Obra compañía dos');
insert into public.proyecto_trabajadores (empresa_id, proyecto_id, perfil_id)
values (pg_temp.id('e2'), pg_temp.id('f4'), pg_temp.id('c1')), (pg_temp.id('e2'), pg_temp.id('f4'), pg_temp.id('c5'));
select test.falla(format($q$insert into public.proyecto_trabajadores (empresa_id, proyecto_id, perfil_id) values (%L, %L, %L)$q$,
                         pg_temp.id('e2'), pg_temp.id('f4'), pg_temp.id('c2')),
                  'no pertenece a la compañía', 'no se asigna a un proyecto a quien no es de esa compañía');
select test.falla(format($q$insert into public.proyecto_trabajadores (empresa_id, proyecto_id, perfil_id) values (%L, %L, %L)$q$,
                         pg_temp.id('e2'), pg_temp.id('f1'), pg_temp.id('c1')),
                  'proyecto no pertenece', 'ni a un proyecto de otra compañía');
reset role;

-- ---------------------------------------------------------------------------
-- Aislamiento de lectura
-- ---------------------------------------------------------------------------
set role authenticated;
select test.como(pg_temp.id('a1'));
select pg_temp.en('e1');
select test.igual((select count(*)::int from public.proyectos where id = pg_temp.id('f4')), 0, 'admin en la compañía uno: no ve proyectos de la dos');
select test.igual((select count(*)::int from public.proyectos), 3, 'admin en la compañía uno: ve sus 3 proyectos');
select pg_temp.en('e2');
select test.igual((select count(*)::int from public.proyectos), 1, 'admin en la compañía dos: ve solo su proyecto');
select test.igual((select count(*)::int from public.perfiles where id <> pg_temp.id('a1')), 3, 'admin en la compañía dos: ve a Juan, Pedro y al dueño');
select test.igual((select count(*)::int from public.tasas_estatutarias), 2, 'cada compañía tiene sus propias tasas');
select test.igual((select count(*)::int from public.mis_empresas()), 2, 'mis_empresas: el admin ve sus dos compañías');
select test.igual((select count(*)::int from public.mis_empresas() where activa), 1, 'mis_empresas: una sola activa');
select test.igual((select id from public.mis_empresas() where activa), pg_temp.id('e2'), 'mis_empresas: la activa es la del encabezado');
select test.como(pg_temp.id('c1'));
select pg_temp.en(null);
select test.igual((select count(*)::int from public.proyecto_trabajadores where perfil_id = pg_temp.id('c1')), 3, 'Juan ve sus asignaciones de las dos compañías (f1, f2 y f4)');
select test.igual((select count(*)::int from public.proyecto_trabajadores where empresa_id = pg_temp.id('e2') and perfil_id <> pg_temp.id('c1')), 0, 'y no las de otras personas de la compañía dos');
select test.igual((select count(*)::int from public.proyectos where id = pg_temp.id('f4')), 1, 'Juan ve el proyecto de la compañía dos donde está asignado');
select test.igual((select count(*)::int from public.mis_empresas()), 2, 'Juan ve sus dos compañías');
select test.como(pg_temp.id('c2'));
select test.igual((select count(*)::int from public.proyectos where id = pg_temp.id('f4')), 0, 'Marie (solo compañía uno) no ve el proyecto de la dos');
select test.igual((select count(*)::int from public.mis_empresas()), 1, 'Marie ve una sola compañía');
reset role;

-- ---------------------------------------------------------------------------
-- Reloj: la compañía del turno es la de su proyecto
-- ---------------------------------------------------------------------------
set role authenticated;
select test.como(pg_temp.id('c1'));
select pg_temp.en(null);
select test.falla(format($q$select public.marcar_entrada(%L)$q$, pg_temp.id('f3')), 'No estás asignado', 'no marca en un proyecto sin asignación');
select public.marcar_entrada(pg_temp.id('f4'));
select test.igual((select empresa_id from public.turnos where perfil_id = pg_temp.id('c1') and salida is null), pg_temp.id('e2'), 'marcar en el proyecto de la compañía dos crea el turno en la dos');
select test.falla(format($q$select public.marcar_entrada(%L)$q$, pg_temp.id('f1')), 'turno abierto', 'no se abre un segundo turno en la otra compañía');
select public.marcar_salida();
reset role;
update public.turnos set entrada = entrada - interval '2 hours', salida = salida - interval '2 hours' where perfil_id = pg_temp.id('c1');
set role authenticated;
select test.como(pg_temp.id('c1'));
select public.marcar_entrada(pg_temp.id('f1'));
select test.igual((select empresa_id from public.turnos where perfil_id = pg_temp.id('c1') and salida is null), pg_temp.id('e1'), 'marcar en el proyecto de la compañía uno crea el turno en la uno');
select public.marcar_salida();
select test.como(pg_temp.id('c2'));
select test.falla(format($q$select public.marcar_entrada(%L)$q$, pg_temp.id('f4')), 'No estás asignado', 'quien no es de la compañía dos no marca en su proyecto');
reset role;
delete from public.turnos where perfil_id = pg_temp.id('c1');

-- ---------------------------------------------------------------------------
-- Nómina separada: Juan trabaja el mismo día en las dos compañías, a horas distintas
-- ---------------------------------------------------------------------------
select pg_temp.en(null);
select public.asegurar_semana(pg_temp.id('e1'), '2027-03-04');
select public.asegurar_semana(pg_temp.id('e2'), '2027-03-04');
select pg_temp.turno('e1', 'c1', 'f1', '2027-03-04', '08:00', '12:00');   -- 4 h × $18 = $72
select pg_temp.turno('e2', 'c1', 'f4', '2027-03-04', '13:00', '15:00');   -- 2 h × $20 = $40

-- Un préstamo en la compañía uno no toca la dos
set role authenticated;
select test.como(pg_temp.id('a1'));
select pg_temp.en('e1');
select public.crear_prestamo(pg_temp.id('c1'), 30) as pid \gset
select public.fijar_descuento_prestamo(:'pid'::uuid, pg_temp.sem('e1', '2027-03-04'), 10);
select pg_temp.en('e2');
select test.igual((select count(*)::int from public.prestamos), 0, 'el préstamo de la compañía uno no se ve desde la dos');
select test.falla(format($q$select public.crear_prestamo(%L, 5)$q$, pg_temp.id('c2')), 'Trabajador no encontrado', 'no se presta a alguien que no es de esa compañía');
reset role;

create temp table c_e1 as select * from public._calcular_semana(pg_temp.sem('e1', '2027-03-04')) where perfil_id = pg_temp.id('c1');
create temp table c_e2 as select * from public._calcular_semana(pg_temp.sem('e2', '2027-03-04')) where perfil_id = pg_temp.id('c1');
select test.igual((select bruto from c_e1), 72.00, 'compañía uno: bruto $72 (solo sus horas)');
select test.igual((select minutos_reg + minutos_extra from c_e1), 240, 'compañía uno: 240 minutos');
select test.igual((select bruto from c_e2), 40.00, 'compañía dos: bruto $40 (solo sus horas)');
select test.igual((select minutos_reg + minutos_extra from c_e2), 120, 'compañía dos: 120 minutos');
select test.igual((select seguro from c_e1), 6.12, 'compañía uno: NIB 3.96 + NHIP 2.16');
select test.igual((select seguro from c_e2), 3.40, 'compañía dos: NIB 2.20 + NHIP 1.20');
select test.igual((select neto from c_e1), 55.88, 'compañía uno: neto con el préstamo descontado');
select test.igual((select neto from c_e2), 36.60, 'compañía dos: neto sin préstamo');

select public._cerrar_semana(pg_temp.sem('e1', '2027-03-04'));
select public._cerrar_semana(pg_temp.sem('e2', '2027-03-04'));
select test.igual((select bruto from public.nomina_semanal where semana_id = pg_temp.sem('e1', '2027-03-04') and perfil_id = pg_temp.id('c1')), 72.00, 'cerrada la uno: guarda $72');
select test.igual((select bruto from public.nomina_semanal where semana_id = pg_temp.sem('e2', '2027-03-04') and perfil_id = pg_temp.id('c1')), 40.00, 'cerrada la dos: guarda $40');
select test.igual((select count(*)::int from public.nomina_proyecto where semana_id = pg_temp.sem('e1', '2027-03-04')), 1, 'la uno solo tiene su proyecto');
select test.igual((select proyecto_id from public.nomina_proyecto where semana_id = pg_temp.sem('e2', '2027-03-04')), pg_temp.id('f4'), 'la dos solo tiene el proyecto de la dos');
select test.igual((select semana_id from public.turnos where proyecto_id = pg_temp.id('f1') and perfil_id = pg_temp.id('c1')), pg_temp.sem('e1', '2027-03-04'), 'el turno de la uno quedó en la semana de la uno');
select test.igual((select semana_id from public.turnos where proyecto_id = pg_temp.id('f4') and perfil_id = pg_temp.id('c1')), pg_temp.sem('e2', '2027-03-04'), 'el turno de la dos quedó en la semana de la dos');
select test.igual((select saldo from (select public.prestamo_saldo(:'pid'::uuid) as saldo) x), 20.00, 'el saldo del préstamo solo bajó por la compañía uno');

-- Lecturas según la compañía activa
set role authenticated;
select test.como(pg_temp.id('a1'));
select pg_temp.en('e1');
select test.falla(format($q$select * from public.nomina_semana(%L)$q$, pg_temp.sem('e2', '2027-03-04')), 'Semana no encontrada', 'la nómina de la dos no se lee desde la uno');
select test.igual((select count(*)::int from public.turnos where empresa_id = pg_temp.id('e2')), 0, 'los turnos de la dos no se ven desde la uno');
select test.igual((select bruto from public.reporte_mensual(2027, 3) where perfil_id = pg_temp.id('c1')), 72.00, 'reporte mensual de la uno: $72');
select pg_temp.en('e2');
select test.igual((select bruto from public.reporte_mensual(2027, 3) where perfil_id = pg_temp.id('c1')), 40.00, 'reporte mensual de la dos: $40');
select test.igual((select tarifa from public.nomina_semana(pg_temp.sem('e2', '2027-03-04')) where perfil_id = pg_temp.id('c1')), 20.00, 'la nómina de la dos usa la tarifa de la dos');
select pg_temp.en('e1');
select test.igual((select tarifa from public.nomina_semana(pg_temp.sem('e1', '2027-03-04')) where perfil_id = pg_temp.id('c1')), 18.00, 'la nómina de la uno usa la tarifa de la uno');
select test.como(pg_temp.id('c1'));
select pg_temp.en('e2');
select test.igual((select count(*)::int from public.nomina_semana(pg_temp.sem('e2', '2027-03-04'))), 1, 'Juan ve su pago de la dos (solo el suyo)');
select pg_temp.en('e1');
select test.igual((select count(*)::int from public.mi_pago(public.semana_inicio_de('2027-03-04'))), 2, 'mi_pago: Juan ve una fila por compañía sin cambiar de activa');
select test.igual((select neto from public.mi_pago(public.semana_inicio_de('2027-03-04')) where empresa_id = pg_temp.id('e1')), 55.88, 'mi_pago: neto de la uno');
select test.igual((select neto from public.mi_pago(public.semana_inicio_de('2027-03-04')) where empresa_id = pg_temp.id('e2')), 36.60, 'mi_pago: neto de la dos');
select test.igual((select tarifa from public.mi_pago(public.semana_inicio_de('2027-03-04')) where empresa_id = pg_temp.id('e2')), 20.00, 'mi_pago: tarifa de la dos');
select test.igual((select jsonb_array_length(proyectos) from public.mi_pago(public.semana_inicio_de('2027-03-04')) where empresa_id = pg_temp.id('e1')), 1, 'mi_pago: un proyecto en la uno');
select test.igual((select count(*)::int from public.mi_pago(public.semana_inicio_de('2027-03-04')) where empresa_id = pg_temp.id('e1') and neto <> 55.88), 0, 'mi_pago: solo muestra lo suyo');
select test.igual((select count(*)::int from public.semanas where id = pg_temp.sem('e1', '2027-03-04')), 1, 'Juan ve la semana de la uno aunque tenga la dos activa');
reset role;

-- ---------------------------------------------------------------------------
-- Turnos que no se solapan
-- ---------------------------------------------------------------------------
select test.falla($q$select pg_temp.turno('e2', 'c1', 'f4', '2027-03-04', '11:00', '12:30')$q$, 'turnos_sin_solape', 'no se solapa con un turno de la otra compañía');
select test.falla($q$select pg_temp.turno('e1', 'c1', 'f2', '2027-03-04', '07:00', '08:30')$q$, 'turnos_sin_solape', 'ni dentro de la misma compañía');
select pg_temp.turno('e1', 'c1', 'f1', '2027-03-11', '08:00', '12:00');
select pg_temp.turno('e2', 'c1', 'f4', '2027-03-11', '12:00', '13:00', 'por_aprobar');
select test.ok(true, 'salir a las 12:00 y entrar a las 12:00 en la otra compañía sí se permite');
set role authenticated;
select test.como(pg_temp.id('a1'));
select pg_temp.en('e2');
select test.falla(format($q$select public.corregir_turno(%L, %L, %L, 'prueba')$q$,
                         (select id from public.turnos where proyecto_id = pg_temp.id('f4') and estado = 'por_aprobar'),
                         ('2027-03-11 11:00' )::timestamp at time zone 'America/Grand_Turk',
                         ('2027-03-11 13:00' )::timestamp at time zone 'America/Grand_Turk'),
                  'se cruza con otro turno', 'corregir un turno tampoco lo solapa con la otra compañía');
reset role;

-- Un supervisor aprueba los turnos de sus proyectos en cualquier compañía, sin cambiar de compañía activa
insert into public.perfil_empresas (perfil_id, empresa_id) values (pg_temp.id('b2'), pg_temp.id('e2'));
insert into public.proyecto_supervisores (empresa_id, proyecto_id, perfil_id) values (pg_temp.id('e2'), pg_temp.id('f4'), pg_temp.id('b2'));
set role authenticated;
select test.como(pg_temp.id('b2'));
select pg_temp.en(null);
select test.igual((select count(*)::int from public.turnos where proyecto_id = pg_temp.id('f4') and estado = 'por_aprobar'), 1, 'el supervisor ve el turno por aprobar del proyecto de la dos');
select test.igual(public.aprobar_turnos(array(select id from public.turnos where proyecto_id = pg_temp.id('f4') and estado = 'por_aprobar')), 1, 'el supervisor lo aprueba');
reset role;
select test.igual((select estado from public.turnos where proyecto_id = pg_temp.id('f4') and entrada >= '2027-03-11'::date::timestamptz), 'aprobado', 'quedó aprobado');

-- ---------------------------------------------------------------------------
-- Roles: quien administra una compañía no toca a personas que también son de otra
-- ---------------------------------------------------------------------------
set role authenticated;
select test.como(pg_temp.id('a3'));
select pg_temp.en(null);
update public.perfiles set roles = array['admin'] where id = pg_temp.id('c1');
select test.igual((select roles from public.perfiles where id = pg_temp.id('c1')), array['trabajador'], 'admin solo de la uno: no cambia los roles de Juan (también de la dos)');
update public.perfiles set oficio = 'Jefe de cuadrilla' where id = pg_temp.id('c2');
select test.igual((select oficio from public.perfiles where id = pg_temp.id('c2')), 'Jefe de cuadrilla', 'sí edita a quien es solo de su compañía');
select test.igual((select count(*)::int from public.perfiles where id = pg_temp.id('d1')), 1, 've al dueño (de la uno)');
reset role;

-- ---------------------------------------------------------------------------
-- Tarifa independiente por compañía
-- ---------------------------------------------------------------------------
set role authenticated;
select test.como(pg_temp.id('a1'));
select pg_temp.en('e2');
select public.cambiar_tarifa(pg_temp.id('c1'), 22, '2027-03-01');
select pg_temp.en('e1');
select public.cambiar_tarifa(pg_temp.id('c1'), 19, '2027-03-01');
reset role;
select test.igual((select count(*)::int from public.tarifas where perfil_id = pg_temp.id('c1') and vigente_desde = '2027-03-01'), 2, 'la misma fecha tiene una tarifa por compañía');
select test.igual(public.tarifa_vigente(pg_temp.id('c1'), '2027-03-05', pg_temp.id('e1')), 19.00, 'tarifa de la uno');
select test.igual(public.tarifa_vigente(pg_temp.id('c1'), '2027-03-05', pg_temp.id('e2')), 22.00, 'tarifa de la dos');
set role authenticated;
select test.como(pg_temp.id('a1'));
select pg_temp.en('e2');
select test.falla(format($q$select public.cambiar_tarifa(%L, 5, '2027-03-02')$q$, pg_temp.id('c1')), 'salario mínimo', 'el mínimo se revisa con el de la compañía activa');
select test.falla(format($q$select public.cambiar_tarifa(%L, 15, '2027-03-02')$q$, pg_temp.id('c2')), 'Trabajador no encontrado', 'no se cambia la tarifa de alguien que no es de la compañía activa');
reset role;

-- ---------------------------------------------------------------------------
-- Gastos y resumen de las dos compañías (solo lectura)
-- ---------------------------------------------------------------------------
set role authenticated;
select test.como(pg_temp.id('a1'));
select pg_temp.en('e2');
select public.registrar_gasto(pg_temp.id('f4'), 'materiales', 100, '2027-03-10', 'Tubería', 'Ferretería') as g_mat \gset
select public.registrar_gasto(null, 'herramientas', 50, '2027-03-09') as g_her \gset
select test.falla(format($q$select public.registrar_gasto(%L, 'materiales', 10, '2027-03-10')$q$, pg_temp.id('f1')), 'Proyecto no encontrado', 'no se carga un gasto a un proyecto de otra compañía');
select test.falla($q$select public.registrar_gasto(null, 'cafe', 10, '2027-03-10')$q$, 'Categoría', 'categoría inválida');
select test.falla($q$select public.registrar_gasto(null, 'otros', 0, '2027-03-10')$q$, 'mayor que cero', 'monto en cero');
select pg_temp.en('e1');
select public.registrar_gasto(pg_temp.id('f1'), 'materiales', 30, '2027-03-08');
select test.igual((select count(*)::int from public.gastos), 1, 'desde la uno solo se ve su gasto');
select test.como(pg_temp.id('c1'));
select test.igual((select count(*)::int from public.gastos), 0, 'un trabajador no ve gastos');
select test.falla($q$select public.registrar_gasto(null, 'otros', 5, '2027-03-10')$q$, 'No tienes permiso', 'un trabajador no registra gastos');

-- El dueño (en las dos) ve el resumen sin mezclar
select test.como(pg_temp.id('d1'));
select pg_temp.en('e1');
select test.igual((select count(distinct empresa_id)::int from public.resumen_empresas('2027-03-01', '2027-03-31')), 2, 'el dueño ve las dos compañías aunque tenga una activa');
select test.igual((select monto from public.resumen_empresas('2027-03-01', '2027-03-31') where empresa_id = pg_temp.id('e1') and concepto = 'mano_obra'), 72.00, 'compañía uno: mano de obra $72');
select test.igual((select monto from public.resumen_empresas('2027-03-01', '2027-03-31') where empresa_id = pg_temp.id('e2') and concepto = 'mano_obra'), 40.00, 'compañía dos: mano de obra $40');
select test.igual((select monto from public.resumen_empresas('2027-03-01', '2027-03-31') where empresa_id = pg_temp.id('e1') and concepto = 'nib_empleador'), 4.68, 'compañía uno: aporte NIB del empleador');
select test.igual((select monto from public.resumen_empresas('2027-03-01', '2027-03-31') where empresa_id = pg_temp.id('e2') and concepto = 'nhip_empleador'), 1.20, 'compañía dos: aporte NHIP del empleador');
select test.igual((select monto from public.resumen_empresas('2027-03-01', '2027-03-31') where empresa_id = pg_temp.id('e2') and concepto = 'materiales' and proyecto_id = pg_temp.id('f4')), 100.00, 'compañía dos: materiales del proyecto');
select test.igual((select monto from public.resumen_empresas('2027-03-01', '2027-03-31') where empresa_id = pg_temp.id('e2') and concepto = 'herramientas' and proyecto_id is null), 50.00, 'compañía dos: herramientas sin proyecto');
select test.igual((select monto from public.resumen_empresas('2027-03-01', '2027-03-31') where empresa_id = pg_temp.id('e1') and concepto = 'materiales'), 30.00, 'compañía uno: sus materiales no se mezclan con los de la dos');
select test.igual((select count(*)::int from public.resumen_empresas('2027-04-01', '2027-04-30')), 0, 'otro mes: sin movimientos');
select test.falla($q$select * from public.resumen_empresas('2027-03-31', '2027-03-01')$q$, 'Rango', 'rango invertido');

-- Un supervisor también registra gastos, pero solo de los proyectos que supervisa, y solo ve los suyos
select test.como(pg_temp.id('b2'));
select pg_temp.en('e2');
select public.registrar_gasto(pg_temp.id('f4'), 'materiales', 20, '2027-03-11', 'Clavos');
select test.igual((select count(*)::int from public.gastos), 1, 'el supervisor ve solo el gasto que él registró');
select test.falla($q$select public.registrar_gasto(null, 'otros', 5, '2027-03-11')$q$, 'supervisas', 'el supervisor no registra gastos sin proyecto');
select test.falla(format($q$select public.registrar_gasto(%L, 'otros', 5, '2027-03-11')$q$, pg_temp.id('f1')), 'supervisas', 'ni de proyectos que no supervisa');
select test.falla($q$select public.anular_gasto(gen_random_uuid(), 'x')$q$, 'No tienes permiso', 'el supervisor no anula gastos');
select test.como(pg_temp.id('d1'));
select pg_temp.en('e1');
select test.igual((select monto from public.resumen_empresas('2027-03-01', '2027-03-31') where empresa_id = pg_temp.id('e2') and concepto = 'materiales' and proyecto_id = pg_temp.id('f4')), 120.00, 'el resumen suma el gasto del supervisor');
select test.como(pg_temp.id('a3'));
select test.igual((select count(distinct empresa_id)::int from public.resumen_empresas('2027-03-01', '2027-03-31')), 1, 'un admin solo ve las compañías a las que pertenece');
select test.como(pg_temp.id('b1'));
select test.falla($q$select * from public.resumen_empresas('2027-03-01', '2027-03-31')$q$, 'No tienes permiso', 'un supervisor no ve el resumen');

-- Anular un gasto lo saca del resumen
select test.como(pg_temp.id('a1'));
select pg_temp.en('e2');
select test.falla(format($q$select public.anular_gasto(%L, '')$q$, :'g_her'::uuid), 'motivo', 'anular pide motivo');
select public.anular_gasto(:'g_her'::uuid, 'Se registró dos veces');
select test.falla(format($q$select public.anular_gasto(%L, 'otra vez')$q$, :'g_her'::uuid), 'Gasto no encontrado', 'un gasto ya anulado no se anula de nuevo');
select test.como(pg_temp.id('d1'));
select test.igual((select count(*)::int from public.resumen_empresas('2027-03-01', '2027-03-31') where concepto = 'herramientas'), 0, 'el gasto anulado sale del resumen');
reset role;

-- ---------------------------------------------------------------------------
-- Respaldo sin encabezado: elegir_empresa
-- ---------------------------------------------------------------------------
set role authenticated;
select test.como(pg_temp.id('d1'));
select pg_temp.en(null);
select test.igual(public.mi_empresa(), pg_temp.id('e1'), 'dueño sin elección: compañía de inicio');
select public.elegir_empresa(pg_temp.id('e2'));
select test.igual(public.mi_empresa(), pg_temp.id('e2'), 'dueño que eligió la dos');
select pg_temp.en('e1');
select test.igual(public.mi_empresa(), pg_temp.id('e1'), 'el encabezado manda sobre lo elegido');
select test.como(pg_temp.id('b1'));
select test.falla(format($q$select public.elegir_empresa(%L)$q$, pg_temp.id('e2')), 'No perteneces', 'no se elige una compañía ajena');
reset role;

-- ---------------------------------------------------------------------------
-- Quitar de una compañía
-- ---------------------------------------------------------------------------
set role authenticated;
select test.como(pg_temp.id('a1'));
select pg_temp.en('e1');
select test.falla(format($q$select public.quitar_de_empresa(%L)$q$, pg_temp.id('c2')), 'única compañía', 'quien solo tiene una compañía no se quita, se desactiva');
select pg_temp.en('e2');
select public.quitar_de_empresa(pg_temp.id('c5'));
reset role;
select test.ok(not public.es_miembro(pg_temp.id('c5'), pg_temp.id('e2')), 'Pedro ya no es de la compañía dos');
select test.ok(public.es_miembro(pg_temp.id('c5'), pg_temp.id('e1')), 'Pedro sigue en la uno');
select test.ok(exists (select 1 from public.perfil_empresas where perfil_id = pg_temp.id('c5') and empresa_id = pg_temp.id('e2') and baja_en is not null), 'la baja queda marcada, la fila se conserva');
set role authenticated;
select test.como(pg_temp.id('c5'));
select test.igual((select count(*)::int from public.proyecto_trabajadores where perfil_id = pg_temp.id('c5') and empresa_id = pg_temp.id('e2')), 0, 'sus asignaciones de la dos ya no se ven');
select test.igual((select count(*)::int from public.mis_empresas()), 1, 'ya solo ve la compañía uno');
select test.como(pg_temp.id('a1'));
select pg_temp.en('e1');
select public.compartir_trabajador(pg_temp.id('c5'), pg_temp.id('e2'), 20);
reset role;
select test.ok(public.es_miembro(pg_temp.id('c5'), pg_temp.id('e2')), 'al compartirlo de nuevo se reactiva');
set role authenticated;
select test.como(pg_temp.id('a1'));
select pg_temp.en('e2');
select public.quitar_de_empresa(pg_temp.id('c5'));
reset role;
select test.igual((select empresa_id from public.perfiles where id = pg_temp.id('c5')), pg_temp.id('e1'), 'su compañía de inicio sigue siendo la uno');

-- ---------------------------------------------------------------------------
-- Avisos a los admin de cada compañía
-- ---------------------------------------------------------------------------
select pg_temp.en(null);
select public.avisar_pendientes('2027-03-17 12:00:00-04');
select test.igual((select count(*)::int from public.notificaciones where perfil_id = pg_temp.id('a3') and tipo = 'semana_por_cerrar'), 1, 'admin solo de la uno: 1 aviso de cierre');
select test.igual((select count(*)::int from public.notificaciones where perfil_id = pg_temp.id('a1') and tipo = 'semana_por_cerrar'), 2, 'admin de las dos: 1 aviso por compañía');
select test.igual((select count(*)::int from public.notificaciones where perfil_id = pg_temp.id('d1') and tipo = 'semana_por_cerrar'), 0, 'el dueño no recibe avisos de admin');

rollback;
