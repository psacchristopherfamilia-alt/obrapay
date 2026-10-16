-- Presupuesto vs real: guardar, lo real por categoría, avisos al 50/75/90/100 % y permisos.
--   Villa Grace Bay (f1): Juan 4 h × $18 = $72 de mano de obra en una semana cerrada.
begin;
create or replace function pg_temp.id(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;

update public.empresas set almuerzo_inicio = null, almuerzo_fin = null;
select public.asegurar_semana(pg_temp.id('e1'), '2027-03-04');
insert into public.turnos (empresa_id, perfil_id, proyecto_id, entrada, salida, estado)
values (pg_temp.id('e1'), pg_temp.id('c1'), pg_temp.id('f1'),
        ('2027-03-04 08:00')::timestamp at time zone 'America/Grand_Turk', ('2027-03-04 12:00')::timestamp at time zone 'America/Grand_Turk', 'aprobado');
select public._cerrar_semana((select id from public.semanas where empresa_id = pg_temp.id('e1') and inicio = '2027-03-04'));

set role authenticated;
select test.como(pg_temp.id('a1'));

select public.guardar_presupuesto(pg_temp.id('f1'), 100, 100, 50, 50, 20);
select test.igual((select count(*)::int from public.notificaciones where tipo like 'presupuesto_%'), 0, 'con 24 % usado todavía no avisa');
select test.igual((select r_mano_obra from public.presupuesto_resumen() where proyecto_id = pg_temp.id('f1')), 72.00::numeric, 'la mano de obra real sale de la nómina cerrada');
select test.igual((select p_materiales from public.presupuesto_resumen() where proyecto_id = pg_temp.id('f1')), 100.00::numeric, 'el resumen trae el presupuesto de materiales');

-- gastos por categoría
select public.registrar_gasto(pg_temp.id('f1'), 'materiales', 90, '2027-03-05');
select public.registrar_gasto(pg_temp.id('f1'), 'poliza', 10, '2027-03-05');
select public.registrar_gasto(pg_temp.id('f1'), 'otros', 5, '2027-03-05');
select public.registrar_gasto(pg_temp.id('f2'), 'materiales', 999, '2027-03-05');
select test.igual((select r_materiales from public.presupuesto_resumen() where proyecto_id = pg_temp.id('f1')), 90.00::numeric, 'materiales suma solo los de esa obra');
select test.igual((select r_subcontratos from public.presupuesto_resumen() where proyecto_id = pg_temp.id('f1')), 15.00::numeric, 'póliza y otros van a subcontratos y otros');
select public.registrar_gasto(pg_temp.id('f1'), 'herramientas', 20, '2027-03-05') as g_herr \gset
select public.anular_gasto(:'g_herr', 'duplicado');
select test.igual((select r_herramientas from public.presupuesto_resumen() where proyecto_id = pg_temp.id('f1')), 0::numeric, 'un gasto anulado no cuenta');

-- avisos: 72 + 90 + 15 = 177 de 300 = 59 %
reset role;
select test.igual((select public.avisar_presupuestos()), 1, 'revisa la obra con presupuesto');
select test.igual((select count(*)::int from public.notificaciones where tipo = 'presupuesto_umbral'), 1, 'al cruzar el 50 % avisa una vez');
select test.igual((select (datos ->> 'nivel')::int from public.notificaciones where tipo = 'presupuesto_umbral'), 50, 'el aviso es del nivel 50');
select public.avisar_presupuestos();
select test.igual((select count(*)::int from public.notificaciones where tipo = 'presupuesto_umbral'), 1, 'al día siguiente no repite el mismo nivel');

-- materiales +100 → 190 > 100 (se pasó); total 277 = 92 % → niveles 75 y 90, avisa solo el 90
set role authenticated;
select test.como(pg_temp.id('a1'));
select public.registrar_gasto(pg_temp.id('f1'), 'materiales', 100, '2027-03-06');
reset role;
select public.avisar_presupuestos();
select test.igual((select count(*)::int from public.notificaciones where tipo = 'presupuesto_umbral'), 2, 'cruzar 75 y 90 a la vez da un solo aviso nuevo');
select test.igual((select max((datos ->> 'nivel')::int) from public.notificaciones where tipo = 'presupuesto_umbral'), 90, 'avisa el nivel más alto');
select test.igual((select count(*)::int from public.notificaciones where tipo = 'presupuesto_categoria'), 1, 'materiales se pasó: un aviso de categoría');
select test.igual((select (datos ->> 'exceso')::int from public.notificaciones where tipo = 'presupuesto_categoria'), 90, 'el aviso trae cuánto se pasó');
select test.igual((select datos ->> 'categoria' from public.notificaciones where tipo = 'presupuesto_categoria'), 'materiales', 'la categoría es materiales');
select public.avisar_presupuestos();
select test.igual((select count(*)::int from public.notificaciones where tipo = 'presupuesto_categoria'), 1, 'la categoría no repite');

-- pasar el 100 %
set role authenticated;
select test.como(pg_temp.id('a1'));
select public.registrar_gasto(pg_temp.id('f1'), 'subcontrato', 40, '2027-03-07');
reset role;
select public.avisar_presupuestos();
select test.igual((select max((datos ->> 'nivel')::int) from public.notificaciones where tipo = 'presupuesto_umbral'), 100, 'al pasar el presupuesto avisa el nivel 100');
select test.igual((select count(*)::int from public.notificaciones where tipo = 'presupuesto_umbral'), 3, 'tres avisos de nivel en total');

-- subir el presupuesto limpia las marcas y deja volver a avisar
set role authenticated;
select test.como(pg_temp.id('a1'));
select public.guardar_presupuesto(pg_temp.id('f1'), 1000, 1000, 1000, 1000, 30);
reset role;
select test.igual((select count(*)::int from public.presupuesto_avisos), 0, 'al subir el presupuesto se reinician las marcas');
select test.igual((select avance from public.presupuestos where proyecto_id = pg_temp.id('f1')), 30, 'guarda el avance');

-- permisos
set role authenticated;
select test.como(pg_temp.id('b1'));
select test.falla(format($$select public.guardar_presupuesto(%L, 1, 1, 1, 1, 0)$$, pg_temp.id('f1')), 'permiso', 'el supervisor no guarda presupuestos');
select test.falla($$select * from public.presupuesto_resumen()$$, 'permiso', 'el supervisor no ve el resumen');
select test.igual((select count(*)::int from public.presupuestos), 0, 'el supervisor no lee la tabla');
select test.como(pg_temp.id('c1'));
select test.igual((select count(*)::int from public.presupuestos), 0, 'el trabajador no lee la tabla');
select test.como(pg_temp.id('d1'));
select test.igual((select count(*)::int from public.presupuestos), 1, 'el dueño lee los presupuestos');
select test.igual((select count(*)::int from public.presupuesto_resumen()), 3, 'el dueño ve las tres obras en el resumen');
select test.igual((select count(*)::int from public.presupuesto_resumen() where tiene), 1, 'solo una tiene presupuesto');
select test.falla(format($$select public.guardar_presupuesto(%L, 1, 1, 1, 1, 0)$$, pg_temp.id('f1')), 'permiso', 'el dueño no guarda presupuestos');

-- validaciones y borrar
select test.como(pg_temp.id('a1'));
select test.falla(format($$select public.guardar_presupuesto(%L, -5, 1, 1, 1, 0)$$, pg_temp.id('f1')), 'negativos', 'no acepta montos negativos');
select test.falla(format($$select public.guardar_presupuesto(%L, 1, 1, 1, 1, 150)$$, pg_temp.id('f1')), 'avance', 'el avance no pasa de 100');
select test.falla(format($$select public.guardar_presupuesto(%L, 1, 1, 1, 1, 0)$$, pg_temp.id('e1')), 'Proyecto', 'el proyecto debe existir en la compañía');
select public.guardar_presupuesto(pg_temp.id('f1'), 0, 0, 0, 0, 0);
select test.igual((select count(*)::int from public.presupuestos), 0, 'todo en cero quita el presupuesto');

rollback;
