-- Cuadrillas: armarlas, asignarlas a una obra y marcar entrada y salida de varios a la vez.
begin;
create or replace function pg_temp.yo(p text) returns uuid language sql as $$
  select ('00000000-0000-0000-0000-0000000000' || p)::uuid $$;

create or replace function pg_temp.miembros(p_cuadrilla uuid) returns int language sql security definer as $f$
  select count(*)::int from public.cuadrilla_miembros where cuadrilla_id = p_cuadrilla $f$;
create or replace function pg_temp.en_cuadrillas(p_perfil uuid) returns int language sql security definer as $f$
  select count(*)::int from public.cuadrilla_miembros where perfil_id = p_perfil $f$;
create or replace function pg_temp.supervisor_de(p_cuadrilla uuid) returns uuid language sql security definer as $f$
  select supervisor_id from public.cuadrillas where id = p_cuadrilla $f$;
grant execute on all functions in schema pg_temp to public;

set role authenticated;
select test.como(pg_temp.yo('a1'));
select public.guardar_cuadrilla(null, 'Plomería', pg_temp.yo('b1'), array[pg_temp.yo('c1'), pg_temp.yo('c3'), pg_temp.yo('c5')]) as q1 \gset
select test.igual(pg_temp.miembros(:'q1'), 3, 'el admin arma una cuadrilla con tres trabajadores');
select test.falla($$select public.guardar_cuadrilla(null, 'plomería', null, array[]::uuid[])$$, 'ese nombre', 'no repite el nombre');
select test.falla($$select public.guardar_cuadrilla(null, 'Otra', '00000000-0000-0000-0000-0000000000c1', array[]::uuid[])$$, 'Supervisor no encontrado', 'el supervisor debe ser supervisor');
select test.falla($$select public.guardar_cuadrilla(null, '  ', null, array[]::uuid[])$$, 'nombre', 'pide el nombre');
select test.falla($$select public.guardar_cuadrilla(null, 'Con jefe', null, array['00000000-0000-0000-0000-0000000000b1']::uuid[])$$, 'Trabajador no encontrado', 'solo entran trabajadores');

-- el supervisor arma la suya
select test.como(pg_temp.yo('b1'));
select public.guardar_cuadrilla(null, 'Eléctrica', null, array[pg_temp.yo('c2')]) as q2 \gset
select test.igual(pg_temp.supervisor_de(:'q2'), pg_temp.yo('b1'), 'la cuadrilla del supervisor es suya aunque no la ponga');
select public.guardar_cuadrilla(:'q2', 'Eléctrica', null, array[pg_temp.yo('c2'), pg_temp.yo('c4')]);
select test.igual(pg_temp.miembros(:'q2'), 2, 'la edita y agrega a alguien libre');
select test.igual((select count(*)::int from public.cuadrillas_lista()), 2, 've sus dos cuadrillas');

-- otro supervisor no toca las de Ramón ni le quita gente
select test.como(pg_temp.yo('b2'));
select test.igual((select count(*)::int from public.cuadrillas_lista()), 0, 'otro supervisor no ve las cuadrillas de Ramón');
select test.falla(format($$select public.guardar_cuadrilla(%L, 'Plomería', null, array[]::uuid[])$$, :'q1'), 'permiso', 'no edita la cuadrilla de otro');
select test.falla($$select public.guardar_cuadrilla(null, 'Mía', null, array['00000000-0000-0000-0000-0000000000c1']::uuid[])$$, 'ya está en la cuadrilla', 'no le quita gente a otra cuadrilla');
select test.falla(format($$select public.quitar_cuadrilla(%L)$$, :'q1'), 'permiso', 'no quita la cuadrilla de otro');

-- el trabajador no usa nada de esto
select test.como(pg_temp.yo('c1'));
select test.falla($$select * from public.cuadrillas_lista()$$, 'permiso', 'un trabajador no ve cuadrillas');
select test.falla($$select public.marcar_entrada_por('00000000-0000-0000-0000-0000000000f1', array['00000000-0000-0000-0000-0000000000c1']::uuid[])$$, 'No supervisas', 'un trabajador no marca a otros');
select test.falla($$select * from public.trabajadores_cuadrilla()$$, 'permiso', 'un trabajador no lista trabajadores');

-- el dueño ve todas
select test.como(pg_temp.yo('d1'));
select test.igual((select count(*)::int from public.cuadrillas_lista()), 2, 'el dueño ve todas');

-- asignar a una obra
select test.como(pg_temp.yo('b1'));
select test.igual(public.asignar_cuadrilla_proyecto(:'q1', pg_temp.yo('f1')), 0, 'en Villa Grace Bay ya estaban los tres');
select test.igual(public.asignar_cuadrilla_proyecto(:'q1', pg_temp.yo('f3')), 2, 'en Taylor Bay faltaban Juan y Carlos');
select test.falla(format($$select public.asignar_cuadrilla_proyecto(%L, %L)$$, :'q1', pg_temp.yo('f2')), 'No supervisas', 'no asigna a una obra que no supervisa');

-- estado para marcar en f1
select test.igual((select count(*)::int from public.cuadrilla_estado(pg_temp.yo('f1'))), 5, 've a sus 5 de cuadrilla (Juan, Carlos, Pedro, Marie, Jean)');
select test.igual((select asignado from public.cuadrilla_estado(pg_temp.yo('f1')) where perfil_id = pg_temp.yo('c2')), false, 'Marie no está asignada a la obra');
select test.falla(format($$select * from public.cuadrilla_estado(%L)$$, pg_temp.yo('f2')), 'No supervisas', 'no ve el estado de una obra ajena');

-- entrada de varios
select public.marcar_entrada_por(pg_temp.yo('f1'), array[pg_temp.yo('c1'), pg_temp.yo('c2'), pg_temp.yo('c3')]) :: text as r1 \gset
select test.igual((:'r1'::jsonb ->> 'marcados')::int, 2, 'marca a los dos asignados');
select test.igual(jsonb_array_length(:'r1'::jsonb -> 'omitidos'), 1, 'y omite a Marie');
select test.ok((:'r1'::jsonb -> 'omitidos' -> 0 ->> 'motivo') like '%no está asignado%', 'con el motivo');
select test.igual((select count(*)::int from public.turnos where marcado_por = pg_temp.yo('b1') and salida is null), 2, 'los turnos quedan marcados por Ramón');
select test.igual((select estado from public.turnos where perfil_id = pg_temp.yo('c1') and salida is null), 'abierto', 'quedan abiertos');
select public.marcar_entrada_por(pg_temp.yo('f1'), array[pg_temp.yo('c1')]) :: text as r2 \gset
select test.ok((:'r2'::jsonb -> 'omitidos' -> 0 ->> 'motivo') like '%turno abierto%', 'no abre dos turnos');
select test.falla($$select public.marcar_entrada_por('00000000-0000-0000-0000-0000000000f1', array['00000000-0000-0000-0000-0000000000c5']::uuid[], now() + interval '30 minutes')$$, 'futuro', 'no acepta una hora del futuro');
select test.falla($$select public.marcar_entrada_por('00000000-0000-0000-0000-0000000000f1', array[]::uuid[])$$, 'al menos', 'pide a alguien');

-- hora corregida: Pedro entró hace 2 horas
select public.marcar_entrada_por(pg_temp.yo('f1'), array[pg_temp.yo('c5')], now() - interval '2 hours') :: text as r3 \gset
select test.igual((:'r3'::jsonb ->> 'marcados')::int, 1, 'marca con la hora corregida');
select test.igual((select entrada < now() - interval '119 minutes' from public.turnos where perfil_id = pg_temp.yo('c5') and salida is null), true, 'guarda la hora corregida');
select test.igual((select marca_diferida from public.turnos where perfil_id = pg_temp.yo('c5') and salida is null), true, 'una hora de hace más de 5 minutos queda como diferida');

-- otro supervisor no marca en la obra de Ramón
select test.como(pg_temp.yo('b2'));
select test.falla($$select public.marcar_entrada_por('00000000-0000-0000-0000-0000000000f1', array['00000000-0000-0000-0000-0000000000c3']::uuid[])$$, 'No supervisas', 'otro supervisor no marca en mi obra');
select public.marcar_salida_por(array[pg_temp.yo('c3')]) :: text as r4 \gset
select test.ok((:'r4'::jsonb -> 'omitidos' -> 0 ->> 'motivo') like '%no puedes marcar%', 'otro supervisor no cierra turnos ajenos');

-- salida de varios
select test.como(pg_temp.yo('b1'));
select public.marcar_salida_por(array[pg_temp.yo('c1'), pg_temp.yo('c3'), pg_temp.yo('c5'), pg_temp.yo('c4')]) :: text as r5 \gset
select test.igual((:'r5'::jsonb ->> 'marcados')::int, 3, 'cierra los tres turnos abiertos');
select test.igual(jsonb_array_length(:'r5'::jsonb -> 'omitidos'), 1, 'y omite a quien no tenía turno');
select test.igual((select count(*)::int from public.turnos where marcado_por = pg_temp.yo('b1') and salida is not null), 3, 'quedan cerrados');
select test.igual((select estado from public.turnos where perfil_id = pg_temp.yo('c5')), 'por_aprobar', 'el turno diferido espera aprobación');
select test.igual((select count(*)::int from public.turnos where marcado_por = pg_temp.yo('b1') and estado = 'abierto'), 0, 'ninguno sigue abierto');

-- el admin mueve a alguien y quita una cuadrilla
select test.como(pg_temp.yo('a1'));
select public.guardar_cuadrilla(null, 'Otra', null, array[pg_temp.yo('c1')]) as q3 \gset
select test.igual(pg_temp.miembros(:'q1'), 2, 'el admin pasa a Juan a otra cuadrilla');
select test.igual(pg_temp.en_cuadrillas(pg_temp.yo('c1')), 1, 'Juan solo está en una');
select public.quitar_cuadrilla(:'q1');
select test.igual(pg_temp.miembros(:'q1'), 0, 'quitar la cuadrilla suelta a su gente');
select test.igual((select cuadrilla_id from public.trabajadores_cuadrilla() where perfil_id = pg_temp.yo('c3')), null::uuid, 'Carlos queda sin cuadrilla');
select public.guardar_cuadrilla(null, 'Plomería', null, array[]::uuid[]);

rollback;
