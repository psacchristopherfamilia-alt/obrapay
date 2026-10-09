-- Pruebas del cálculo de nómina (reglas 1 a 6 del plan).

-- ---------------------------------------------------------------------------
-- Regla 1: regular antes de 5 p.m., extra después
-- ---------------------------------------------------------------------------
select test.igual((select min_reg from public.minutos_turno('2026-10-01 07:00-04', '2026-10-01 15:00-04', 'America/Grand_Turk', '17:00')), 480, '7:00–3:00 p.m. = 8 h regulares');
select test.igual((select min_extra from public.minutos_turno('2026-10-01 07:00-04', '2026-10-01 15:00-04', 'America/Grand_Turk', '17:00')), 0, '7:00–3:00 p.m. = 0 h extra');
select test.igual((select min_reg from public.minutos_turno('2026-10-01 15:00-04', '2026-10-01 19:00-04', 'America/Grand_Turk', '17:00')), 120, '3–7 p.m. = 2 h regulares');
select test.igual((select min_extra from public.minutos_turno('2026-10-01 15:00-04', '2026-10-01 19:00-04', 'America/Grand_Turk', '17:00')), 120, '3–7 p.m. = 2 h extra');
select test.igual((select min_reg from public.minutos_turno('2026-10-01 18:00-04', '2026-10-01 21:00-04', 'America/Grand_Turk', '17:00')), 0, '6–9 p.m. = 0 h regulares');
select test.igual((select min_extra from public.minutos_turno('2026-10-01 18:00-04', '2026-10-01 21:00-04', 'America/Grand_Turk', '17:00')), 180, '6–9 p.m. = 3 h extra');
select test.igual((select min_reg + min_extra from public.minutos_turno('2026-10-01 07:00:40-04', '2026-10-01 07:30:10-04', 'America/Grand_Turk', '17:00')), 30, 'se cuentan minutos completos');

-- ---------------------------------------------------------------------------
-- Caso base del prototipo (sin almuerzo): Juan, 46 h × $18 − 3% − $50 = $753.16
-- ---------------------------------------------------------------------------
update public.empresas set almuerzo_min = 0;

select test.turno('c1', 'f1', '2026-10-01', '09:00', '19:00');  -- jue: 8 + 2 extra
select test.turno('c1', 'f1', '2026-10-02', '07:00', '11:00');  -- vie: 4
select test.turno('c1', 'f2', '2026-10-02', '13:00', '18:00');  --      4 + 1 extra
select test.turno('c1', 'f1', '2026-10-03', '07:00', '13:00');  -- sáb: 6
select test.turno('c1', 'f2', '2026-10-05', '09:00', '19:00');  -- lun: 8 + 2 extra
select test.turno('c1', 'f1', '2026-10-06', '07:00', '13:00');  -- mar: 6
select test.turno('c1', 'f2', '2026-10-06', '13:00', '15:00');  --      2
select test.turno('c1', 'f1', '2026-10-07', '07:00', '09:00');  -- mié: 2
select test.turno('c1', 'f2', '2026-10-07', '17:00', '18:00');  --      1 extra

insert into public.prestamos (id, empresa_id, perfil_id, monto_total, fecha)
values ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 600.00, '2026-09-03');
insert into public.descuentos_prestamo (empresa_id, prestamo_id, semana_id, monto)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a9', test.semana('2026-10-01'), 50.00);

create temp table r as
  select * from public._calcular_semana(test.semana('2026-10-01'))
  where perfil_id = '00000000-0000-0000-0000-0000000000c1';

select test.igual((select minutos_reg from r), 2400, 'Juan: 40 h regulares');
select test.igual((select minutos_extra from r), 360, 'Juan: 6 h extra');
select test.igual((select bruto from r), 828.00, 'Juan: bruto $828.00');
select test.igual((select seguro from r), 24.84, 'Juan: seguro 3% = $24.84');
select test.igual((select prestamo from r), 50.00, 'Juan: préstamo $50.00');
select test.igual((select neto from r), 753.16, 'Juan: neto $753.16');
select test.igual((select con_aprobacion_admin from r), false, 'Juan: sin aprobaciones del admin');

select test.igual((select round(bruto_exacto, 2) from public._detalle_semana(test.semana('2026-10-01'))
                   where perfil_id = '00000000-0000-0000-0000-0000000000c1' and proyecto_id = '00000000-0000-0000-0000-0000000000f1'), 504.00, 'Juan en Villa Grace Bay: 28 h = $504.00');
select test.igual((select round(bruto_exacto, 2) from public._detalle_semana(test.semana('2026-10-01'))
                   where perfil_id = '00000000-0000-0000-0000-0000000000c1' and proyecto_id = '00000000-0000-0000-0000-0000000000f2'), 324.00, 'Juan en Leeward Plaza: 18 h = $324.00');
select test.igual(public.prestamo_saldo('00000000-0000-0000-0000-0000000000a9'), 550.00, 'saldo del préstamo baja a $550.00');

-- ---------------------------------------------------------------------------
-- Regla 3: aumento a mitad de semana se aplica desde ese día
-- ---------------------------------------------------------------------------
insert into public.tarifas (empresa_id, perfil_id, monto_hora, vigente_desde)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c2', 22.00, '2026-10-05');
select test.turno('c2', 'f2', '2026-10-01', '08:00', '16:00');   -- jueves a $20
select test.turno('c2', 'f2', '2026-10-05', '08:00', '16:00');   -- lunes  a $22
select test.igual((select bruto from public._calcular_semana(test.semana('2026-10-01'))
                   where perfil_id = '00000000-0000-0000-0000-0000000000c2'), 336.00, 'Marie: 8 h × $20 + 8 h × $22 = $336.00');

-- ---------------------------------------------------------------------------
-- Regla 6: solo cuenta lo aprobado; lo del admin sale marcado
-- ---------------------------------------------------------------------------
select test.turno('c4', 'f3', '2026-10-01', '07:00', '15:00', 'por_aprobar');
select test.ok(not exists (select 1 from public._calcular_semana(test.semana('2026-10-01'))
                           where perfil_id = '00000000-0000-0000-0000-0000000000c4'), 'Jean: turno por aprobar no entra al pago');
select test.turno('c4', 'f3', '2026-10-02', '07:00', '15:00', 'aprobado_admin');
select test.igual((select con_aprobacion_admin from public._calcular_semana(test.semana('2026-10-01'))
                   where perfil_id = '00000000-0000-0000-0000-0000000000c4'), true, 'Jean: aprobado por admin sale marcado');
select test.igual((select bruto from public._calcular_semana(test.semana('2026-10-01'))
                   where perfil_id = '00000000-0000-0000-0000-0000000000c4'), 128.00, 'Jean: solo cuenta el turno aprobado (8 h × $16)');

-- ---------------------------------------------------------------------------
-- Regla 2: almuerzo fijo (30 min si el día suma 6 h o más)
-- ---------------------------------------------------------------------------
update public.empresas set almuerzo_min = 30, almuerzo_desde_min = 360;

select test.turno('c3', 'f1', '2026-10-01', '07:00', '15:30');  -- 8.5 h → 8 h
select test.turno('c3', 'f1', '2026-10-02', '07:00', '12:00');  -- 5 h, no llega a 6 → sin almuerzo
select test.turno('c3', 'f1', '2026-10-03', '07:00', '07:20');  -- dos turnos el mismo día (6 h 50 m):
select test.turno('c3', 'f1', '2026-10-03', '07:30', '14:00');  -- el almuerzo sale 20 min del 1º y 10 del 2º

create temp table rc as
  select * from public._calcular_semana(test.semana('2026-10-01'))
  where perfil_id = '00000000-0000-0000-0000-0000000000c3';
select test.igual((select minutos_reg from rc), 1160, 'Carlos: 480 + 300 + 380 min tras almuerzo');
select test.igual((select bruto from rc), 251.33, 'Carlos: 19 h 20 m × $13 = $251.33');
select test.igual((select seguro from rc), 7.54, 'Carlos: seguro redondeado a $7.54');
select test.igual((select neto from rc), 243.79, 'Carlos: neto $243.79');
select test.ok((select min(min_reg) from public._turnos_semana(test.semana('2026-10-01'))
                where perfil_id = '00000000-0000-0000-0000-0000000000c3' and fecha = '2026-10-03') = 0,
               'Carlos: el primer turno corto absorbe sus 20 min de almuerzo');

select test.turno('c5', 'f1', '2026-10-01', '17:00', '23:00');   -- todo extra: el almuerzo sale del extra
select test.igual((select minutos_extra from public._calcular_semana(test.semana('2026-10-01'))
                   where perfil_id = '00000000-0000-0000-0000-0000000000c5'), 330, 'Pedro: 6 h extra − 30 min almuerzo');

drop table r;
drop table rc;
