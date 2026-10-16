-- ObraPay · Fase C: historial de cambios, exportar todo, respaldo diario y compañía de demostración.

alter table public.empresas add column if not exists demo boolean not null default false;

-- ---------------------------------------------------------------------------
-- Historial de cambios (lee eventos_admin). Dueño/administrador: solo su compañía.
-- Dueño de la plataforma: una compañía cualquiera (p_empresa) o todas (p_todas).
-- ---------------------------------------------------------------------------
create or replace function public.historial(
  p_empresa uuid default null, p_tipos text[] default null, p_antes timestamptz default null,
  p_limite integer default 50, p_todas boolean default false)
returns table (id uuid, empresa_id uuid, empresa text, tipo text, detalle jsonb, por text, sobre text,
               sem_inicio date, sem_fin date, creado_en timestamptz)
language plpgsql stable security definer set search_path = public as $fn$
declare v_emp uuid; v_plat boolean := public.es_plataforma(); v_lim integer := least(greatest(coalesce(p_limite, 50), 1), 200);
begin
  if p_todas and not v_plat then
    raise exception 'No tienes permiso para ver el historial' using errcode = '42501';
  end if;
  if p_todas then
    v_emp := null;
  elsif p_empresa is not null and v_plat then
    v_emp := p_empresa;
  else
    v_emp := public.mi_empresa();
    if v_emp is null or (p_empresa is not null and p_empresa <> v_emp) or not public.es_gerencia() then
      raise exception 'No tienes permiso para ver el historial' using errcode = '42501';
    end if;
  end if;
  return query
  select ev.id, ev.empresa_id, e.nombre::text, ev.tipo::text, ev.detalle, pp.nombre::text,
         (select x.nombre::text from perfiles x
           where x.id = case when ev.detalle ->> 'perfil' ~ '^[0-9a-f-]{36}$' then (ev.detalle ->> 'perfil')::uuid end),
         s.inicio, s.fin, ev.creado_en
  from eventos_admin ev
  join empresas e on e.id = ev.empresa_id
  left join perfiles pp on pp.id = ev.por
  left join semanas s on s.id = case when ev.detalle ->> 'semana' ~ '^[0-9a-f-]{36}$' then (ev.detalle ->> 'semana')::uuid end
  where (case when v_emp is null then not e.interna else ev.empresa_id = v_emp end)
    and (p_tipos is null or ev.tipo = any (p_tipos))
    and (p_antes is null or ev.creado_en < p_antes)
  order by ev.creado_en desc
  limit v_lim;
end $fn$;

-- ---------------------------------------------------------------------------
-- Volcado de los datos de una compañía (todas las tablas con empresa_id) y "Exportar todo".
-- ---------------------------------------------------------------------------
create or replace function public._volcado(p_empresa uuid, p_excluir text[] default '{}', p_logo boolean default false)
returns jsonb language plpgsql stable security definer set search_path = public as $fn$
declare r record; v jsonb := '{}'::jsonb; t jsonb;
begin
  for r in
    select c.table_name::text as n
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'empresa_id' and tb.table_type = 'BASE TABLE'
      and c.table_name <> all (p_excluir) and c.table_name <> 'empresas'
    order by 1
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.empresa_id = $1', r.n) into t using p_empresa;
    v := v || jsonb_build_object(r.n, t);
  end loop;
  return v || jsonb_build_object('empresa', (select case when p_logo then to_jsonb(e) else to_jsonb(e) - 'marca_logo' end from empresas e where e.id = p_empresa));
end $fn$;

create or replace function public.exportar_todo() returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare v_emp uuid := public.mi_empresa();
begin
  if v_emp is null or not public.es_gerencia() then
    raise exception 'No tienes permiso para exportar los datos' using errcode = '42501';
  end if;
  perform public._evento(v_emp, 'exportar_todo', '{}'::jsonb);
  return public._volcado(v_emp, array['notificaciones', 'pagos_plataforma']);
end $fn$;

-- ---------------------------------------------------------------------------
-- Respaldos: una copia completa de todas las compañías (menos la demo). 14 diarios y 10 manuales.
-- ---------------------------------------------------------------------------
create table if not exists public.respaldos (
  id         uuid primary key default gen_random_uuid(),
  creado_en  timestamptz not null default now(),
  tipo       text not null check (tipo in ('auto', 'manual')),
  companias  integer not null,
  filas      integer not null,
  tamano     integer not null,
  datos      jsonb not null
);
create index if not exists respaldos_tipo_fecha on public.respaldos (tipo, creado_en desc);
alter table public.respaldos enable row level security;
revoke all on public.respaldos from anon, authenticated;

create or replace function public._hacer_respaldo(p_tipo text default 'auto') returns uuid
language plpgsql security definer set search_path = public as $fn$
declare r record; v jsonb; v_cias jsonb := '{}'::jsonb; v_datos jsonb; v_id uuid; n integer := 0; v_filas integer := 0;
begin
  for r in select e.id from empresas e where not e.demo order by e.nombre loop
    v := public._volcado(r.id, '{}', true);
    v_cias := v_cias || jsonb_build_object(r.id::text, v);
    v_filas := v_filas + coalesce((select sum(jsonb_array_length(j.value))::integer from jsonb_each(v) j where jsonb_typeof(j.value) = 'array'), 0);
    n := n + 1;
  end loop;
  v_datos := jsonb_build_object('creado_en', now(), 'companias', v_cias,
    'plataforma', jsonb_build_object('clientes', (select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) from clientes c),
                                      'duenos', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from plataforma_duenos d)));
  insert into respaldos (creado_en, tipo, companias, filas, tamano, datos)
  values (clock_timestamp(), case when p_tipo = 'manual' then 'manual' else 'auto' end, n, v_filas, octet_length(v_datos::text), v_datos)
  returning id into v_id;
  delete from respaldos where tipo = 'auto' and id not in (select x.id from respaldos x where x.tipo = 'auto' order by x.creado_en desc limit 14);
  delete from respaldos where tipo = 'manual' and id not in (select x.id from respaldos x where x.tipo = 'manual' order by x.creado_en desc limit 10);
  return v_id;
end $fn$;

create or replace function public.plataforma_respaldos()
returns table (id uuid, creado_en timestamptz, tipo text, companias integer, filas integer, tamano integer)
language plpgsql stable security definer set search_path = public as $fn$
begin
  perform public._exigir_plataforma();
  return query select r.id, r.creado_en, r.tipo::text, r.companias, r.filas, r.tamano from respaldos r order by r.creado_en desc;
end $fn$;

create or replace function public.plataforma_respaldar_ahora() returns uuid
language plpgsql security definer set search_path = public as $fn$
begin
  perform public._exigir_plataforma();
  return public._hacer_respaldo('manual');
end $fn$;

create or replace function public.plataforma_respaldo(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $fn$
declare v jsonb;
begin
  perform public._exigir_plataforma();
  select r.datos into v from respaldos r where r.id = p_id;
  if v is null then raise exception 'Respaldo no encontrado'; end if;
  return v;
end $fn$;

-- ---------------------------------------------------------------------------
-- Compañía de demostración: datos inventados, sin cobro, con botón para reiniciarla.
-- ---------------------------------------------------------------------------
create or replace function public._demo_limpiar(p_empresa uuid) returns void
language plpgsql security definer set search_path = public as $fn$
declare r record; v_ids uuid[]; v_vivos integer; v_pasada integer := 0;
begin
  if not exists (select 1 from empresas where id = p_empresa and demo) then raise exception 'No es una compañía de demostración'; end if;
  if exists (select 1 from perfiles p join plataforma_duenos d on d.perfil_id = p.id where p.empresa_id = p_empresa) then
    raise exception 'La demostración no puede contener al dueño de la plataforma';
  end if;
  select coalesce(array_agg(id), '{}') into v_ids from perfiles where empresa_id = p_empresa;
  loop
    v_pasada := v_pasada + 1; v_vivos := 0;
    for r in
      select c.table_name::text as n from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
      where c.table_schema = 'public' and c.column_name = 'empresa_id' and tb.table_type = 'BASE TABLE'
        and c.table_name not in ('empresas', 'tasas_estatutarias', 'pagos_plataforma')
    loop
      begin
        execute format('delete from public.%I where empresa_id = $1', r.n) using p_empresa;
      exception when foreign_key_violation then v_vivos := v_vivos + 1;
      end;
    end loop;
    exit when v_vivos = 0;
    if v_pasada >= 10 then raise exception 'No se pudo limpiar la demostración'; end if;
  end loop;
  delete from auth.users where id = any (v_ids);
end $fn$;

create or replace function public._demo_poblar(p_empresa uuid) returns void
language plpgsql security definer set search_path = public as $fn$
declare
  v_tz text; v_hoy date; v_ini date; w date; d date; v_ent timestamptz; v_sal timestamptz;
  nom text[] := array['Ana Rivera','Roberto Delgado','Marco Vásquez','Jean Pierre','Luis Almonte','Wilson Charles','Darnell Forbes','Yolanda Reyes','Kervens Joseph','Daniel Rosario','Samuel Ellis','Rafael Núñez'];
  ofi text[] := array['Administración','Supervisor','Plomero','Electricista','Albañil','Carpintero','Ayudante','Ayudante','Albañil','Pintor','Soldador','Ayudante'];
  tar numeric[] := array[0,0,24,26,19,22,14,14,18,17,21,13];
  nobra text[] := array['Villa Coral Bay','Plaza Sunset','Residencia Long Bay'];
  ids uuid[] := '{}'; obras uuid[] := '{}'; v_id uuid; v_sid uuid; v_pre uuid; veh uuid[] := '{}'; i integer; k integer;
begin
  select e.zona_horaria into v_tz from empresas e where e.id = p_empresa;
  v_hoy := (now() at time zone v_tz)::date;
  update empresas set marca_nombre = 'Constructora Demo', marca_color = '#1D4ED8' where id = p_empresa;
  for i in 1..12 loop
    v_id := gen_random_uuid(); ids := ids || v_id;
    insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'demo' || i || '.' || substr(p_empresa::text, 1, 8) || '@demo.invalid', now(), '{}', '{}', now(), now());
    insert into perfiles (id, empresa_id, usuario, nombre, oficio, roles, debe_cambiar_clave, numero_nib, numero_nhip)
    values (v_id, p_empresa, 'demo' || i, nom[i], ofi[i],
            case i when 1 then array['admin'] when 2 then array['supervisor'] else array['trabajador'] end, false,
            case when i > 2 then '9' || lpad(i::text, 6, '0') end, case when i > 2 then '8' || lpad(i::text, 6, '0') end);
    if i > 2 then
      insert into tarifas (empresa_id, perfil_id, monto_hora, vigente_desde) values (p_empresa, v_id, tar[i], v_hoy - 400);
    end if;
  end loop;
  for i in 1..3 loop
    insert into proyectos (empresa_id, nombre, direccion) values (p_empresa, nobra[i], 'Providenciales') returning id into v_id;
    obras := obras || v_id;
    insert into presupuestos (proyecto_id, empresa_id, mano_obra, materiales, herramientas, subcontratos, avance, actualizado_por)
    values (v_id, p_empresa, 30000 + i * 9000, 42000 + i * 11000, 3000 + i * 800, 8000 + i * 2500, 20 + i * 18, ids[1]);
    insert into proyecto_supervisores (empresa_id, proyecto_id, perfil_id) values (p_empresa, v_id, ids[2]);
  end loop;
  for i in 3..12 loop
    insert into proyecto_trabajadores (empresa_id, proyecto_id, perfil_id) values (p_empresa, obras[1 + (i % 3)], ids[i]);
  end loop;
  insert into prestamos (empresa_id, perfil_id, monto_total, fecha, nota, creado_por)
  values (p_empresa, ids[7], 400, v_hoy - 50, 'Adelanto (demostración)', ids[1]) returning id into v_pre;
  v_ini := public.semana_inicio_de(v_hoy, p_empresa);
  for k in reverse 6..0 loop
    w := v_ini - 7 * k;
    v_sid := public.asegurar_semana(p_empresa, w);
    for d in select g::date from generate_series(w, w + 6, interval '1 day') g loop
      continue when d >= v_hoy or extract(isodow from d) in (6, 7);
      for i in 3..12 loop
        continue when (i * 5 + extract(day from d)::integer) % 13 = 0;
        v_ent := (d + time '07:00') at time zone v_tz;
        v_sal := v_ent + case when (i + extract(day from d)::integer) % 5 = 0 then interval '11 hours 30 minutes' else interval '9 hours' end;
        insert into turnos (empresa_id, perfil_id, proyecto_id, entrada, salida, estado, aprobado_por, aprobado_en)
        values (p_empresa, ids[i], obras[1 + ((i + k) % 3)], v_ent, v_sal,
                case when k = 0 and d = v_hoy - 1 and i % 3 = 0 then 'por_aprobar' else 'aprobado' end,
                case when k = 0 and d = v_hoy - 1 and i % 3 = 0 then null else ids[2] end,
                case when k = 0 and d = v_hoy - 1 and i % 3 = 0 then null else v_sal end);
      end loop;
    end loop;
    if k between 1 and 6 then
      if k between 2 and 4 then
        insert into descuentos_prestamo (empresa_id, prestamo_id, semana_id, monto, creado_por) values (p_empresa, v_pre, v_sid, 50, ids[1]);
      end if;
      perform public._cerrar_semana(v_sid);
      if k >= 2 then
        update semanas set estado = 'pagada', pagada_en = (pago + time '16:00') at time zone v_tz where id = v_sid;
        perform public._evento(p_empresa, 'semana_pagada', jsonb_build_object('semana', v_sid));
      end if;
    end if;
  end loop;
  for i in 1..2 loop
    insert into vehiculos (empresa_id, nombre, placa, tipo, marca, modelo, anio, conductor_id, millas, creado_por)
    values (p_empresa, case i when 1 then 'Ford F-150 blanca' else 'Toyota Hiace' end, 'DEMO-' || i || '01',
            case i when 1 then 'camioneta' else 'van' end, case i when 1 then 'Ford' else 'Toyota' end,
            case i when 1 then 'F-150' else 'Hiace' end, case i when 1 then 2019 else 2021 end, ids[2 + i], 84210 + i * 9000, ids[1])
    returning id into v_id;
    veh := veh || v_id;
    for k in 1..6 loop
      insert into vehiculo_gasolina (empresa_id, vehiculo_id, perfil_id, fecha, total, millas, recibo_path, recibo_nombre)
      values (p_empresa, v_id, ids[2 + i], v_hoy - (7 * k - 2), round((56 + k * 3.4 + i * 4)::numeric, 2), 84210 + i * 9000 - k * 410, 'demo/recibo.png', 'recibo-demo.png');
    end loop;
  end loop;
  for i in 1..10 loop
    insert into gastos (empresa_id, proyecto_id, categoria, monto, fecha, descripcion, proveedor, creado_por)
    values (p_empresa, obras[1 + (i % 3)], (array['materiales','materiales','herramientas','transporte','subcontrato','materiales'])[1 + (i % 6)],
            round((180 + i * 215.5)::numeric, 2), v_hoy - i * 4, 'Compra de demostración ' || i,
            (array['Ferretería Isla','Cemento TCI','Eléctrica Caribe'])[1 + (i % 3)], ids[1]);
  end loop;
end $fn$;

create or replace function public.plataforma_crear_demo() returns uuid
language plpgsql security definer set search_path = public as $fn$
declare v_id uuid;
begin
  perform public._exigir_plataforma();
  select e.id into v_id from empresas e where e.demo limit 1;
  if v_id is not null then return v_id; end if;
  insert into empresas (nombre, precio_mensual, vence, demo) values ('Constructora Demo', 0, date '2099-12-31', true) returning id into v_id;
  perform public._sembrar_tasas(v_id);
  perform public._demo_poblar(v_id);
  return v_id;
end $fn$;

create or replace function public.plataforma_reiniciar_demo(p_empresa uuid) returns void
language plpgsql security definer set search_path = public as $fn$
begin
  perform public._exigir_plataforma();
  if not exists (select 1 from empresas where id = p_empresa and demo) then
    raise exception 'Solo se puede reiniciar la compañía de demostración';
  end if;
  perform public._demo_limpiar(p_empresa);
  perform public._demo_poblar(p_empresa);
end $fn$;

-- El panel ahora dice cuál es la demo.
drop function if exists public.plataforma_panel();
create or replace function public.plataforma_panel()
returns table (empresa_id uuid, nombre text, cliente_id uuid, cliente text, telefono text, email text,
               precio numeric, vence date, suspendida boolean, trabajadores int, obras int, vehiculos int,
               licencia text, creado_en timestamptz, demo boolean)
language plpgsql stable security definer set search_path = public as $fn$
begin
  perform public._exigir_plataforma();
  return query
  select e.id, e.nombre::text, e.cliente_id, c.nombre::text, c.telefono::text, c.email::text, e.precio_mensual, e.vence, e.suspendida,
         (select count(*)::int from perfil_empresas m join perfiles p on p.id = m.perfil_id
           where m.empresa_id = e.id and m.baja_en is null and p.activo and 'trabajador' = any (p.roles)),
         (select count(*)::int from proyectos x where x.empresa_id = e.id and x.activo),
         (select count(*)::int from vehiculos v where v.empresa_id = e.id and v.activo),
         e.licencia::text, e.creado_en, e.demo
  from empresas e left join clientes c on c.id = e.cliente_id
  where not e.interna
  order by e.demo, c.nombre nulls last, e.nombre;
end $fn$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on function public._volcado(uuid, text[], boolean), public._hacer_respaldo(text),
  public._demo_limpiar(uuid), public._demo_poblar(uuid) from public, anon, authenticated;
revoke all on function public.historial(uuid, text[], timestamptz, integer, boolean), public.exportar_todo(),
  public.plataforma_respaldos(), public.plataforma_respaldar_ahora(), public.plataforma_respaldo(uuid),
  public.plataforma_crear_demo(), public.plataforma_reiniciar_demo(uuid), public.plataforma_panel() from public, anon;
grant execute on function public.historial(uuid, text[], timestamptz, integer, boolean), public.exportar_todo(),
  public.plataforma_respaldos(), public.plataforma_respaldar_ahora(), public.plataforma_respaldo(uuid),
  public.plataforma_crear_demo(), public.plataforma_reiniciar_demo(uuid), public.plataforma_panel() to authenticated;
