-- Plataforma: panel del dueño, pagos, suspensión que bloquea el acceso y entrada como asistente.
begin;
create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;
create or replace function pg_temp.hacer_plataforma(p_perfil uuid) returns void language sql security definer as $f$
  insert into public.plataforma_duenos (perfil_id) values (p_perfil) $f$;
create or replace function pg_temp.tasas(p_empresa uuid) returns int language sql security definer as $f$
  select count(*)::int from public.tasas_estatutarias where empresa_id = p_empresa $f$;
create or replace function pg_temp.eventos(p_empresa uuid, p_tipo text) returns int language sql security definer as $f$
  select count(*)::int from public.eventos_admin where empresa_id = p_empresa and tipo = p_tipo $f$;
create or replace function pg_temp.pagos(p_empresa uuid) returns int language sql security definer as $f$
  select count(*)::int from public.pagos_plataforma where empresa_id = p_empresa $f$;
create or replace function pg_temp.vence_ayer(p_empresa uuid) returns void language sql security definer as $f$
  update public.empresas set vence = current_date - 3 where id = p_empresa $f$;
create or replace function pg_temp.vence(p_empresa uuid) returns date language sql security definer as $f$
  select vence from public.empresas where id = p_empresa $f$;
create or replace function pg_temp.pres(p_empresa uuid) returns int language sql security definer as $f$
  select count(*)::int from public.presupuestos where empresa_id = p_empresa $f$;
create or replace function pg_temp.veh_con_conductor(p_empresa uuid) returns int language sql security definer as $f$
  select count(*)::int from public.vehiculos where empresa_id = p_empresa and conductor_id is not null $f$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.hacer_plataforma(pg_temp.yo('c3'));  -- Carlos es dueño de la plataforma (aunque su rol sea trabajador)

set role authenticated;
-- quien no es dueño de la plataforma no entra
select test.como(pg_temp.yo('a1'));
select test.igual(public.es_plataforma(), false, 'un admin de compañía no es dueño de la plataforma');
select test.falla($$select * from public.plataforma_panel()$$, 'permiso', 'el admin no ve el panel');
select test.falla($$select public.plataforma_suspender('00000000-0000-0000-0000-0000000000e1', true)$$, 'permiso', 'el admin no suspende');
select test.falla($$select public.plataforma_pago('00000000-0000-0000-0000-0000000000e1')$$, 'permiso', 'el admin no registra pagos');

-- el dueño de la plataforma
select test.como(pg_temp.yo('c3'));
select test.igual(public.es_plataforma(), true, 'Carlos es dueño de la plataforma');
select public.plataforma_guardar_cliente(null, 'Don Eugenio Pérez', '6491112222', 'eugenio@correo.com', 'Providenciales', 'cliente de prueba') as cli \gset
select public.plataforma_guardar_empresa(null, :'cli', 'Constructora Isla Ltd', 'LIC-123', 'Leeward', 500, null, null) as emp \gset
select test.igual((select count(*)::int from public.plataforma_panel() where nombre = 'Constructora Isla Ltd'), 1, 'la compañía nueva sale en el panel');
select test.igual((select precio from public.plataforma_panel() where empresa_id = :'emp'), 500::numeric, 'cobra 500 por compañía');
select test.igual((select vence > current_date from public.plataforma_panel() where empresa_id = :'emp'), true, 'arranca con un vencimiento a futuro');
select test.igual(pg_temp.tasas(:'emp'), 2, 'se siembran las tasas de NIB y NHIP');
select test.igual((select cliente from public.plataforma_panel() where empresa_id = :'emp'), 'Don Eugenio Pérez', 'muestra al dueño');
select test.falla($$select public.plataforma_guardar_empresa(null, null, '  ', null, null, 500, null, null)$$, 'nombre', 'pide el nombre de la compañía');
select test.falla($$select public.plataforma_guardar_empresa(null, null, 'X', null, null, -5, null, null)$$, 'precio', 'el precio no puede ser negativo');
select test.falla($$select public.plataforma_guardar_cliente(null, '', null, null, null, null)$$, 'nombre', 'pide el nombre del dueño');
select public.plataforma_guardar_empresa(:'emp', :'cli', 'Constructora Isla Ltd', 'LIC-123', 'Leeward', 450, null, null);
select test.igual((select precio from public.plataforma_panel() where empresa_id = :'emp'), 450::numeric, 'edita el precio de una compañía');

-- las compañías que ya existían no se pierden y se pueden editar sus datos
select test.igual((select count(*)::int from public.plataforma_panel()), 2, 'el panel lista las dos compañías');
select public.plataforma_guardar_cliente((select cliente_id from public.plataforma_panel() where nombre = 'Empresa de prueba'), 'Dueño ya registrado', null, null, null, null);

select test.igual((select count(*)::int from public.plataforma_admins()), 1, 'lista los administradores existentes');

-- alta de obras y vehículos
select (public.plataforma_alta_datos(:'emp',
  '[{"nombre":"Villa Azul","direccion":"Grace Bay","presupuesto":"10000"},{"nombre":"Torre Dos"},{"nombre":"  "}]'::jsonb,
  '[{"nombre":"Hilux 01","placa":"TCI 100","tipo":"camioneta"},{"nombre":"Van 02","tipo":"inventado"}]'::jsonb) ->> 'obras')::int as n_obras \gset
select test.igual(:n_obras, 2, 'crea las obras con nombre y salta la vacía');
select test.igual(pg_temp.pres(:'emp'), 1, 'guarda el presupuesto de la obra que lo trae');
select test.igual((select count(*)::int from public.plataforma_panel() where empresa_id = :'emp' and obras = 2 and vehiculos = 2), 1, 'el panel cuenta obras y vehículos');
select test.igual(pg_temp.veh_con_conductor(:'emp'), 0, 'sin conductor si no se pide');

-- pagos y suspensión
select public.plataforma_suspender(:'emp', true);
select test.igual((select suspendida from public.plataforma_panel() where empresa_id = :'emp'), true, 'la suspende');
select pg_temp.vence_ayer(:'emp');
select public.plataforma_pago(:'emp') as nuevo \gset
select test.igual(:'nuevo'::date, (current_date + interval '1 month')::date, 'si estaba vencida, el nuevo vencimiento cuenta desde hoy');
select test.igual((select suspendida from public.plataforma_panel() where empresa_id = :'emp'), false, 'el pago reactiva la compañía');
select test.igual(pg_temp.pagos(:'emp'), 1, 'queda registrado el pago');
select public.plataforma_pago(:'emp', 200);
select test.igual(pg_temp.vence(:'emp'), (current_date + interval '2 months')::date, 'si paga antes de vencer, se suma un mes al vencimiento');
select test.igual((select count(*)::int from public.plataforma_pagos(:'emp')), 2, 'el historial de pagos tiene los dos');
select test.falla($$select public.plataforma_pago('00000000-0000-0000-0000-0000000000e1', -1)$$, 'monto', 'no acepta monto negativo');

-- la suspensión bloquea el acceso de la compañía
select public.plataforma_suspender('00000000-0000-0000-0000-0000000000e1', true);
select test.como(pg_temp.yo('a1'));
select test.igual(public.mi_empresa(), null, 'el admin de una compañía suspendida no tiene compañía activa');
select test.igual((select count(*)::int from public.proyectos), 0, 'no ve las obras');
select test.igual((select count(*)::int from public.mis_empresas()), 0, 'no la ve en su selector');
select test.igual((select suspendida from public.mi_cuenta() limit 1), true, 'la pantalla de suspendido puede saberlo');
select test.como(pg_temp.yo('c1'));
select test.igual(public.mi_empresa(), null, 'un trabajador tampoco entra');
select test.igual((select count(*)::int from public.turnos), 0, 'no ve turnos');
select test.falla($$select public.marcar_entrada('00000000-0000-0000-0000-0000000000f1', null, null, null)$$, '', 'no puede marcar entrada');

-- entrar como asistente
select test.como(pg_temp.yo('c3'));
select test.igual(public.tengo_rol('admin'), false, 'fuera de una compañía no actúa como admin');
select public.plataforma_entrar('00000000-0000-0000-0000-0000000000e1');
select test.igual(public.mi_empresa(), '00000000-0000-0000-0000-0000000000e1'::uuid, 'entra a la compañía suspendida');
select test.igual(public.tengo_rol('admin'), true, 'como asistente actúa como administrador');
select test.igual((select count(*)::int from public.proyectos) > 0, true, 've sus obras');
select test.igual((select asistiendo from public.plataforma_yo()), true, 'sabe que está asistiendo');
select test.igual(pg_temp.eventos('00000000-0000-0000-0000-0000000000e1', 'asistente_entro'), 1, 'queda en su historial que entró');
select public.plataforma_salir();
select test.igual(public.tengo_rol('admin'), false, 'al salir deja de ser administrador');
select test.igual(pg_temp.eventos('00000000-0000-0000-0000-0000000000e1', 'asistente_salio'), 1, 'queda en su historial que salió');

-- activar de nuevo
select public.plataforma_suspender('00000000-0000-0000-0000-0000000000e1', false);
select test.como(pg_temp.yo('a1'));
select test.igual(public.mi_empresa(), '00000000-0000-0000-0000-0000000000e1'::uuid, 'al activarla, el admin vuelve a entrar');
select test.igual((select count(*)::int from public.proyectos) > 0, true, 'y vuelve a ver sus obras');

-- un admin no se hace asistente de otra compañía
select test.falla($$select public.plataforma_entrar('00000000-0000-0000-0000-0000000000e1')$$, 'permiso', 'un admin no entra como asistente');
rollback;
