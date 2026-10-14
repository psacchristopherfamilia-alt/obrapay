-- NIB y NHIP: topes mensuales, acumulado entre semanas, cambio de tasa, cambio de mes, remesas,
-- permisos de trabajo sin registro NHIP, salario mínimo y permisos.
-- Jean (c4) cobra $1,000/h desde 2027-01-01 para tocar los topes con pocas horas (6 h = $6,000 por semana).
begin;

create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;

update public.empresas set almuerzo_inicio = null, almuerzo_fin = null;
insert into public.tarifas (empresa_id, perfil_id, monto_hora, vigente_desde)
values ('00000000-0000-0000-0000-0000000000e1', pg_temp.yo('c4'), 1000.00, '2027-01-01');

-- Semanas (jueves a miércoles): A 7–13 ene, B 14–20, C 21–27 (pago en enero) y D 28 ene–3 feb (pago el 5 feb).
select public.asegurar_semana('00000000-0000-0000-0000-0000000000e1', d::date)
from generate_series('2027-01-07'::date, '2027-01-28'::date, interval '7 days') d;

-- Tasas sembradas por defecto
select test.igual((select count(*)::int from public.tasas_estatutarias where empresa_id = '00000000-0000-0000-0000-0000000000e1'), 2, 'la empresa nace con tasa NIB y NHIP');
select test.igual((select tasa_empleado from public.tasa_vigente('00000000-0000-0000-0000-0000000000e1', 'NIB', '2027-01-15')), 5.5::numeric, 'NIB empleado 5.5%');
select test.igual((select tope_mensual from public.tasa_vigente('00000000-0000-0000-0000-0000000000e1', 'NHIP', '2027-01-15')), 7800.00::numeric, 'tope NHIP $7,800');
select test.igual((select dia_vencimiento from public.tasa_vigente('00000000-0000-0000-0000-0000000000e1', 'NIB', '2027-01-15')), 15, 'NIB vence el 15');
select test.igual((select dia_vencimiento from public.tasa_vigente('00000000-0000-0000-0000-0000000000e1', 'NHIP', '2027-01-15')), 14, 'NHIP vence el 14');

-- Semana A: $6,000 = justo el tope NIB
select test.turno('c4', 'f3', '2027-01-07', '07:00', '13:00');
create temp table a as select * from public._calcular_semana(test.semana('2027-01-07')) where perfil_id = pg_temp.yo('c4');
select test.igual((select bruto from a), 6000.00, 'semana A: bruto $6,000');
select test.igual((select base_nib from a), 6000.00, 'semana A: base NIB = tope $6,000');
select test.igual((select nib_empleado from a), 330.00, 'semana A: NIB empleado $330');
select test.igual((select nib_empleador from a), 390.00, 'semana A: NIB empleador $390');
select test.igual((select nhip_empleado from a), 180.00, 'semana A: NHIP empleado $180');
select test.igual((select seguro from a), 510.00, 'semana A: descuento al trabajador = NIB + NHIP empleado');
select test.igual((select neto from a), 5490.00, 'semana A: neto $5,490');

-- Cierres en orden: lo cerrado de la semana A cuenta para el tope del mes
reset role;
select public._cerrar_semana(test.semana('2027-01-07'));
select test.turno('c4', 'f3', '2027-01-14', '07:00', '13:00');
create temp table b as select * from public._calcular_semana(test.semana('2027-01-14')) where perfil_id = pg_temp.yo('c4');
select test.igual((select base_nib from b), 0.00, 'semana B: NIB ya llegó al tope del mes');
select test.igual((select base_nhip from b), 1800.00, 'semana B: NHIP solo cubre hasta $7,800 (quedan $1,800)');
select test.igual((select nhip_empleado from b), 54.00, 'semana B: NHIP empleado $54');
select test.igual((select seguro from b), 54.00, 'semana B: descuento solo NHIP');

select public._cerrar_semana(test.semana('2027-01-14'));
select test.turno('c4', 'f3', '2027-01-21', '07:00', '13:00');
select test.igual((select seguro from public._calcular_semana(test.semana('2027-01-21')) where perfil_id = pg_temp.yo('c4')), 0.00, 'semana C: ambos topes cubiertos, sin descuento');
select test.igual((select neto from public._calcular_semana(test.semana('2027-01-21')) where perfil_id = pg_temp.yo('c4')), 6000.00, 'semana C: neto = bruto');
select public._cerrar_semana(test.semana('2027-01-21'));

-- Lo cerrado guarda su desglose
select test.igual((select nib_empleado from public.nomina_semanal where semana_id = test.semana('2027-01-07') and perfil_id = pg_temp.yo('c4')), 330.00, 'lo cerrado guarda el NIB');

-- Semana D (paga el 5 feb): cambia el mes, vuelven los topes; la tasa nueva aplica por fecha de pago
set role authenticated;
select test.como(pg_temp.yo('a1'));
select public.cambiar_tasa_estatutaria('NIB', '2027-02-01', 6.0, 7.0, 6000, 15);
reset role;
select test.turno('c4', 'f3', '2027-01-28', '07:00', '13:00');
create temp table d as select * from public._calcular_semana(test.semana('2027-01-28')) where perfil_id = pg_temp.yo('c4');
select test.igual((select base_nib from d), 6000.00, 'semana D (febrero): los topes empiezan de cero');
select test.igual((select nib_empleado from d), 360.00, 'semana D: NIB con la tasa nueva 6.0%');
select test.igual((select nib_empleador from d), 420.00, 'semana D: NIB empleador 7.0%');
select test.igual((select nhip_empleado from d), 180.00, 'semana D: NHIP sin cambio');
select test.igual((select nib_empleado from public.nomina_semanal where semana_id = test.semana('2027-01-07') and perfil_id = pg_temp.yo('c4')), 330.00, 'cambiar la tasa no altera lo ya cerrado');
select public._cerrar_semana(test.semana('2027-01-28'));

-- Reporte de remesa
set role authenticated;
select test.como(pg_temp.yo('d1'));
create temp table rem as select * from public.reporte_remesa(2027, 1);
select test.igual((select count(*)::int from rem), 1, 'remesa de enero: un trabajador');
select test.igual((select base_nib from rem), 6000.00, 'remesa enero: base NIB');
select test.igual((select nib_total from rem), 720.00, 'remesa enero: NIB empleado + empleador');
select test.igual((select base_nhip from rem), 7800.00, 'remesa enero: base NHIP topada');
select test.igual((select nhip_total from rem), 468.00, 'remesa enero: NHIP empleado + empleador');
select test.igual((select vence_nib from rem), date '2027-02-15', 'NIB de enero vence el 15 de febrero');
select test.igual((select vence_nhip from rem), date '2027-02-14', 'NHIP de enero vence el 14 de febrero');
select test.igual((select nib_total from public.reporte_remesa(2027, 2)), 780.00, 'remesa febrero con la tasa nueva');
select test.igual((select count(*)::int from public.reporte_remesa(2027, 3)), 0, 'marzo sin nómina cerrada: vacío');

-- Desglose de una semana
select test.igual((select nib_empleado from public.nomina_semana_estatutario(test.semana('2027-01-07')) where perfil_id = pg_temp.yo('c4')), 330.00, 'nomina_semana_estatutario de una semana cerrada');

-- Permiso de trabajo sin número NHIP
select test.como(pg_temp.yo('a1'));
select public.actualizar_datos_estatutarios(pg_temp.yo('c4'), '123456', null, '2027-01-10');
select test.igual((select numero_nib from public.perfiles where id = pg_temp.yo('c4')), '123456', 'se guarda el número NIB');
create temp table pend as select * from public.pendientes_registro_nhip();
select test.igual((select count(*)::int from pend), 1, 'Jean aparece sin registro NHIP');
select test.igual((select semanas from pend), 4, 'cuenta las semanas cuyo fin es desde el permiso (A a D)');
select test.igual((select nhip_acumulado from pend), 828.00, 'NHIP acumulado sin registrar: 360 + 108 + 0 + 360');
select public.actualizar_datos_estatutarios(pg_temp.yo('c4'), '123456', '987654', '2027-01-10');
select test.igual((select count(*)::int from public.pendientes_registro_nhip()), 0, 'con número NHIP ya no está pendiente');

-- Salario mínimo y validaciones
select test.falla($$select public.cambiar_tarifa(pg_temp.yo('c4'), 8.50, '2027-02-01')$$, 'salario mínimo', 'no se permite una tarifa bajo el mínimo');
select public.cambiar_tarifa(pg_temp.yo('c4'), 9.00, '2027-03-01');
select test.igual((select monto_hora from public.tarifas where perfil_id = pg_temp.yo('c4') and vigente_desde = '2027-03-01'), 9.00::numeric, 'tarifa igual al mínimo sí se acepta');
select test.falla($$select public.cambiar_tasa_estatutaria('XYZ', '2027-02-01', 1, 1, 100, 10)$$, 'Agencia inválida', 'agencia desconocida');
select test.falla($$select public.cambiar_tasa_estatutaria('NIB', '2027-02-01', 101, 1, 100, 10)$$, 'entre 0 y 100', 'tasa fuera de rango');
select test.falla($$select public.cambiar_tasa_estatutaria('NIB', '2027-02-01', 1, 1, 0, 10)$$, 'tope mensual', 'tope debe ser positivo');
select test.falla($$select public.cambiar_tasa_estatutaria('NIB', '2027-02-01', 1, 1, 100, 31)$$, 'día de vencimiento', 'día de vencimiento 1 a 28');

-- Permisos
select test.como(pg_temp.yo('d1'));
select test.falla($$select public.cambiar_tasa_estatutaria('NIB', '2027-03-01', 1, 1, 100, 10)$$, 'No tienes permiso', 'el dueño no cambia tasas');
select test.falla($$select public.actualizar_datos_estatutarios(pg_temp.yo('c4'), 'x', 'y', null)$$, 'No tienes permiso', 'el dueño no edita datos estatutarios');
select test.como(pg_temp.yo('c1'));
select test.falla($$select * from public.reporte_remesa(2027, 1)$$, 'No tienes permiso', 'un trabajador no ve la remesa');
select test.falla($$select * from public.pendientes_registro_nhip()$$, 'No tienes permiso', 'un trabajador no ve los pendientes');
select test.igual((select count(*)::int from public.nomina_semana_estatutario(test.semana('2027-01-07'))), 0, 'un trabajador sin pago esa semana no ve nada');
select test.como(pg_temp.yo('a1'));
select test.falla($$insert into public.tasas_estatutarias (empresa_id, agencia, vigente_desde, tasa_empleado, tasa_empleador, tope_mensual, dia_vencimiento) values ('00000000-0000-0000-0000-0000000000e1', 'NIB', '2027-06-01', 1, 1, 1, 1)$$, 'permission denied', 'las tasas solo se cambian con la función');

-- Aislamiento entre empresas
reset role;
insert into public.empresas (id, nombre) values ('00000000-0000-0000-0000-0000000000e2', 'Otra empresa');
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a2');
insert into public.perfiles (id, empresa_id, usuario, nombre, roles) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000e2', 'admin', 'Admin 2', array['admin']);
select test.igual((select count(*)::int from public.tasas_estatutarias where empresa_id = '00000000-0000-0000-0000-0000000000e2'), 2, 'una empresa nueva recibe sus propias tasas');
set role authenticated;
select test.como(pg_temp.yo('a2'));
select test.igual((select count(*)::int from public.tasas_estatutarias where empresa_id <> '00000000-0000-0000-0000-0000000000e2'), 0, 'otra empresa no ve nuestras tasas');
select test.igual((select count(*)::int from public.reporte_remesa(2027, 1)), 0, 'otra empresa no ve nuestra remesa');

-- Aviso de vencimiento: 3 días antes del 15 (12 de febrero 2027, 9:00 a.m. hora de Grand Turk) para NIB, y del 14 (11 feb) para NHIP
reset role;
select test.igual(public.avisar_remesas('2027-02-11 09:00-05'), 2, 'el 11 de febrero avisa del NHIP (una por empresa)');
select test.igual(public.avisar_remesas('2027-02-12 09:00-05'), 2, 'el 12 de febrero avisa del NIB (una por empresa)');
select test.igual(public.avisar_remesas('2027-02-13 09:00-05'), 0, 'otros días no avisa');
select test.ok(exists (select 1 from public.notificaciones where tipo = 'remesa_por_vencer' and perfil_id = pg_temp.yo('a1')), 'el admin recibe el aviso');

rollback;
