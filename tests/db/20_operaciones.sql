-- Pruebas de las operaciones: reloj, GPS, aprobación, corrección, tarifas, préstamos y cierres.
-- Todo corre dentro de una transacción que se deshace al final.
begin;

do $$ begin perform public.asegurar_semana('00000000-0000-0000-0000-0000000000e1', '2026-10-08'); end $$;

-- Ayudas para actuar como cada persona con el rol de base de datos de la app
create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;

-- ===========================================================================
-- A. Reloj
-- ===========================================================================
set role authenticated;

select test.como(pg_temp.yo('c1'));
select test.ok(public.marcar_entrada(pg_temp.yo('f1')) is not null, 'Juan marca entrada en Villa Grace Bay');
select test.falla($$select public.marcar_entrada('00000000-0000-0000-0000-0000000000f2')$$, 'Ya tienes un turno abierto', 'no permite dos turnos abiertos');
select test.ok(public.marcar_salida() is not null, 'Juan marca salida');
select test.igual((select estado from public.turnos where perfil_id = pg_temp.yo('c1') order by creado_en desc limit 1), 'por_aprobar', 'al salir, el turno queda por aprobar');
select test.falla($$select public.marcar_salida()$$, 'No tienes un turno abierto', 'no permite salida sin entrada');

select test.como(pg_temp.yo('c3'));
select test.falla($$select public.marcar_entrada('00000000-0000-0000-0000-0000000000f3')$$, 'No estás asignado', 'Carlos no puede marcar en un proyecto ajeno');

select test.como(pg_temp.yo('a1'));
select test.falla($$select public.marcar_entrada('00000000-0000-0000-0000-0000000000f1')$$, 'no marca horas', 'el admin no marca horas');

select test.falla($$insert into public.turnos (empresa_id, perfil_id, proyecto_id, entrada) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1', now())$$,
                  'permission denied', 'nadie escribe turnos directo en la tabla');

-- GPS
reset role;
update public.empresas set gps_activo = true, gps_modo = 'bloquear';
set role authenticated;

select test.como(pg_temp.yo('c2'));
select test.falla($$select public.marcar_entrada('00000000-0000-0000-0000-0000000000f2')$$, 'Activa la ubicación', 'GPS activo: exige ubicación');
select test.falla($$select public.marcar_entrada('00000000-0000-0000-0000-0000000000f2', 21.7000, -72.3000)$$, 'fuera del área', 'modo bloquear: fuera del radio no deja marcar');
select test.ok(public.marcar_entrada(pg_temp.yo('f2'), 21.8005, -72.1502) is not null, 'dentro del radio (~60 m) sí deja marcar');
select public.marcar_salida(21.8005, -72.1502);

reset role;
update public.empresas set gps_modo = 'marcar';
set role authenticated;
select test.como(pg_temp.yo('c3'));
select public.marcar_entrada(pg_temp.yo('f1'), 21.7000, -72.3000);
select test.igual((select fuera_de_area from public.turnos where perfil_id = pg_temp.yo('c3') and salida is null), true, 'modo marcar: deja marcar pero lo señala');
select public.marcar_salida(21.7000, -72.3000);

reset role;
update public.empresas set gps_activo = false;

-- ===========================================================================
-- B. Aprobación
-- ===========================================================================
create temp table ids (nombre text primary key, id uuid);
grant select, insert on ids to authenticated;
insert into ids values
  ('juan_jue8',  test.turno('c1', 'f1', '2026-10-08', '07:00', '15:00', 'por_aprobar')),
  ('jean_jue8',  test.turno('c4', 'f3', '2026-10-08', '07:00', '15:00', 'por_aprobar')),
  ('louis_jue8', test.turno('b2', 'f2', '2026-10-08', '07:00', '15:00', 'por_aprobar'));

set role authenticated;
select test.como(pg_temp.yo('b2'));
select test.falla($$select public.aprobar_turnos(array[(select id from ids where nombre = 'juan_jue8')])$$, 'No puedes aprobar turnos de este proyecto', 'A. Louis no aprueba en Villa Grace Bay');
select test.falla($$select public.aprobar_turnos(array[(select id from ids where nombre = 'louis_jue8')])$$, 'propio turno', 'nadie aprueba su propio turno');

select test.como(pg_temp.yo('b1'));
select test.igual(public.aprobar_turnos(array[(select id from ids where nombre = 'juan_jue8')]), 1, 'Ramón aprueba el turno de Juan');
select test.igual((select estado from public.turnos where id = (select id from ids where nombre = 'juan_jue8')), 'aprobado', 'queda aprobado por supervisor');

select test.como(pg_temp.yo('a1'));
select test.igual(public.aprobar_turnos(array[(select id from ids where nombre = 'jean_jue8')]), 1, 'el admin aprueba el turno de Jean');
select test.igual((select estado from public.turnos where id = (select id from ids where nombre = 'jean_jue8')), 'aprobado_admin', 'queda marcado como aprobado por admin');
select test.como(pg_temp.yo('b1'));
select public.aprobar_turnos(array[(select id from ids where nombre = 'jean_jue8')]);
select test.igual((select estado from public.turnos where id = (select id from ids where nombre = 'jean_jue8')), 'aprobado', 'el supervisor puede confirmar después');

select test.como(pg_temp.yo('c1'));
select test.falla($$select public.aprobar_turnos(array[(select id from ids where nombre = 'jean_jue8')])$$, 'No puedes aprobar', 'un trabajador no aprueba');

-- ===========================================================================
-- C. Turno olvidado y corrección
-- ===========================================================================
reset role;
insert into ids values ('pedro_olvido', test.turno('c5', 'f1', '2026-10-08', '07:00', null, 'abierto'));
select test.igual(public.cerrar_turnos_olvidados('2026-10-08 22:30-04'), 0, 'a las 10:30 p.m. todavía no lo cierra');
select test.igual(public.cerrar_turnos_olvidados('2026-10-08 23:05-04'), 1, 'después de las 11:00 p.m. lo cierra');
select test.igual((select salida from public.turnos where id = (select id from ids where nombre = 'pedro_olvido')), '2026-10-08 23:00-04'::timestamptz, 'salida puesta a las 11:00 p.m.');
select test.igual((select cierre_automatico from public.turnos where id = (select id from ids where nombre = 'pedro_olvido')), true, 'queda marcado como cierre automático');

set role authenticated;
select test.como(pg_temp.yo('b1'));
select test.falla($$select public.corregir_turno((select id from ids where nombre = 'pedro_olvido'), '2026-10-08 07:00-04', '2026-10-08 16:00-04', '  ')$$, 'motivo', 'corregir exige motivo');
select public.corregir_turno((select id from ids where nombre = 'pedro_olvido'), '2026-10-08 07:00-04', '2026-10-08 16:00-04', 'Olvidó marcar; salió a las 4');
select test.igual((select estado from public.turnos where id = (select id from ids where nombre = 'pedro_olvido')), 'aprobado', 'corrección del supervisor deja el turno aprobado');
select test.igual((select count(*)::int from public.turno_cambios where turno_id = (select id from ids where nombre = 'pedro_olvido')), 1, 'la corrección queda en la auditoría');

-- ===========================================================================
-- D. Cambio de tarifa con aviso
-- ===========================================================================
select test.como(pg_temp.yo('c1'));
select test.falla($$select public.cambiar_tarifa('00000000-0000-0000-0000-0000000000c1', 99, '2026-10-12')$$, 'No tienes permiso', 'un trabajador no cambia tarifas');
select test.como(pg_temp.yo('a1'));
select public.cambiar_tarifa(pg_temp.yo('c1'), 19.00, '2026-10-12');
select test.como(pg_temp.yo('c1'));
select test.igual((select (datos ->> 'despues')::numeric from public.notificaciones where perfil_id = pg_temp.yo('c1') and tipo = 'cambio_tarifa'), 19.00, 'Juan recibe el aviso del aumento a $19.00');
select test.igual((select (datos ->> 'antes')::numeric from public.notificaciones where perfil_id = pg_temp.yo('c1') and tipo = 'cambio_tarifa'), 18.00, 'el aviso dice la tarifa anterior');
update public.notificaciones set leida = true where perfil_id = pg_temp.yo('c1');
select test.igual((select bool_and(leida) from public.notificaciones where perfil_id = pg_temp.yo('c1')), true, 'Juan marca su aviso como leído');

-- ===========================================================================
-- E. Préstamos y topes
-- ===========================================================================
select test.como(pg_temp.yo('a1'));
insert into ids values ('prest_carlos', public.crear_prestamo(pg_temp.yo('c3'), 300.00, '2026-09-24'));
select test.falla($$select public.fijar_descuento_prestamo((select id from ids where nombre = 'prest_carlos'), test.semana('2026-10-08'), 40)$$, 'máximo $0.00', 'sin horas aprobadas no se puede descontar');

reset role;
select test.turno('c3', 'f1', '2026-10-08', '07:00', '15:30');   -- 7.5 h tras almuerzo × $13 = $97.50; NIB+NHIP $8.29
set role authenticated;
select test.como(pg_temp.yo('a1'));
select test.falla($$select public.fijar_descuento_prestamo((select id from ids where nombre = 'prest_carlos'), test.semana('2026-10-08'), 350)$$, 'supera el saldo del préstamo ($300.00)', 'no descuenta más que el saldo');
select test.falla($$select public.fijar_descuento_prestamo((select id from ids where nombre = 'prest_carlos'), test.semana('2026-10-08'), 101)$$, 'máximo $89.21', 'no deja el pago en negativo');
select public.fijar_descuento_prestamo((select id from ids where nombre = 'prest_carlos'), test.semana('2026-10-08'), 40);
select test.igual((select neto from public.nomina_semana(test.semana('2026-10-08')) where perfil_id = pg_temp.yo('c3')), 49.21, 'Carlos: $97.50 − $8.29 − $40.00 = $49.21');

-- ===========================================================================
-- F. Cierre semanal, arrastre de lo aprobado tarde, reabrir y pagar
-- ===========================================================================
reset role;
insert into ids values
  ('juan_mie7',  test.turno('c1', 'f1', '2026-10-07', '07:00', '15:00')),                 -- 7 h × $18 = $126.00
  ('marie_mie7', test.turno('c2', 'f2', '2026-10-07', '08:00', '16:00', 'por_aprobar'));  -- sin aprobar al cierre

select test.igual(public.cerrar_semanas_vencidas('2026-10-07 23:58-04'), 0, 'miércoles 11:58 p.m.: todavía no cierra');
select test.igual(public.cerrar_semanas_vencidas('2026-10-08 00:01-04'), 1, 'pasado el miércoles 11:59 p.m. cierra la semana');
select test.igual((select estado from public.semanas where id = test.semana('2026-10-01')), 'cerrada', 'semana del 1 oct cerrada');
select test.igual((select bruto from public.nomina_semanal where semana_id = test.semana('2026-10-01') and perfil_id = pg_temp.yo('c1')), 126.00, 'nómina congelada de Juan: $126.00 (7 h, sin la hora de almuerzo)');
select test.igual((select semana_id from public.turnos where id = (select id from ids where nombre = 'juan_mie7')), test.semana('2026-10-01'), 'el turno queda ligado a la semana cerrada');
select test.ok((select semana_id is null from public.turnos where id = (select id from ids where nombre = 'marie_mie7')), 'lo no aprobado queda fuera');
select test.igual((select estado from public.semanas where inicio = '2026-10-08'), 'abierta', 'la semana siguiente queda abierta');

update public.tarifas set monto_hora = 50 where perfil_id = pg_temp.yo('c1') and vigente_desde = '2026-10-01';
select test.igual((select bruto from public.nomina_semanal where semana_id = test.semana('2026-10-01') and perfil_id = pg_temp.yo('c1')), 126.00, 'cambiar una tarifa después no altera lo cerrado');
update public.tarifas set monto_hora = 18 where perfil_id = pg_temp.yo('c1') and vigente_desde = '2026-10-01';

set role authenticated;
select test.como(pg_temp.yo('b2'));
select public.aprobar_turnos(array[(select id from ids where nombre = 'marie_mie7')]);
reset role;
select test.igual((select min_reg from public._turnos_semana(test.semana('2026-10-08')) where turno_id = (select id from ids where nombre = 'marie_mie7')), 420, 'aprobado tarde: pasa a la semana siguiente (7 h)');
set role authenticated;
select test.como(pg_temp.yo('b1'));
select test.falla($$select public.corregir_turno((select id from ids where nombre = 'juan_mie7'), '2026-10-07 07:00-04', '2026-10-07 16:00-04', 'x')$$, 'semana ya está cerrada', 'no se corrige un turno de una semana cerrada');

-- Lecturas por rol de la semana cerrada
select test.como(pg_temp.yo('c1'));
select test.igual((select count(*)::int from public.nomina_semana(test.semana('2026-10-01'))), 1, 'Juan solo ve su propia línea de nómina');
select test.como(pg_temp.yo('d1'));
select test.ok((select count(*) from public.nomina_semana(test.semana('2026-10-01'))) >= 1 and
               (select count(*) from public.nomina_semana(test.semana('2026-10-01'))) = (select count(*) from public.nomina_semanal where semana_id = test.semana('2026-10-01')),
               'el dueño ve a todos');
select test.ok((select count(*) from public.reporte_mensual(2026, 10)) >= 1, 'reporte mensual de octubre (pago viernes 9 oct)');
select test.falla($$select public.reabrir_semana(test.semana('2026-10-01'), 'x')$$, 'No tienes permiso', 'el dueño no reabre semanas');
select test.como(pg_temp.yo('c1'));
select test.falla($$select * from public.reporte_mensual(2026, 10)$$, 'No tienes permiso', 'un trabajador no ve el reporte mensual');

-- Reabrir: el cierre automático la respeta y nada se cuenta dos veces
select test.como(pg_temp.yo('a1'));
select public.reabrir_semana(test.semana('2026-10-01'), 'Revisar horas de Juan');
select test.ok((select bool_and(anulada) from public.nomina_semanal where semana_id = test.semana('2026-10-01')), 'al reabrir, la nómina congelada queda anulada (no se borra)');
reset role;
select test.igual(public.cerrar_semanas_vencidas('2026-10-08 00:10-04'), 0, 'semana reabierta: el cierre automático no la vuelve a cerrar');
select test.igual((select count(*)::int from public._turnos_semana(test.semana('2026-10-08')) where fecha < '2026-10-08'), 0, 'con dos semanas abiertas, lo del 7 oct va solo a la del 1 oct');
set role authenticated;
select test.como(pg_temp.yo('a1'));
select public.cerrar_semana(test.semana('2026-10-01'));
select test.igual((select bruto from public.nomina_semanal where semana_id = test.semana('2026-10-01') and perfil_id = pg_temp.yo('c2')), 140.00, 'al volver a cerrar entra lo de Marie (7 h × $20)');
select test.ok((select not bool_or(anulada) from public.nomina_semanal where semana_id = test.semana('2026-10-01')), 'al volver a cerrar, la nómina vuelve a estar vigente');
select public.marcar_semana_pagada(test.semana('2026-10-01'));
select test.falla($$select public.reabrir_semana(test.semana('2026-10-01'), 'x')$$, 'pagada no se puede reabrir', 'una semana pagada no se reabre');

-- Funciones del sistema fuera del alcance de la app
select test.falla($$select public.cerrar_semanas_vencidas()$$, 'permission denied', 'la app no puede disparar cierres automáticos');
select test.falla($$select * from public._calcular_semana(test.semana('2026-10-08'))$$, 'permission denied', 'la app no llama al cálculo interno');
select test.falla($$select public.tarifa_vigente('00000000-0000-0000-0000-0000000000c2', '2026-10-08')$$, 'permission denied', 'nadie consulta la tarifa de otro por la puerta de atrás');

reset role;
rollback;
