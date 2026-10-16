-- ObraPay · Plataforma: clientes, cobro por compañía, suspensión y "entrar como asistente"
-- Quien es dueño de la plataforma (plataforma_duenos) ve un panel con todas las compañías, registra pagos,
-- suspende o activa el acceso y puede entrar a ayudar a una compañía (queda en el historial).
--   · Una compañía suspendida deja de ser accesible: mi_empresa() y es_miembro() no la reconocen para sus usuarios.
--     Nada se borra; al registrar el pago o activarla, todo vuelve al instante.
--   · Todas las tablas nuevas están cerradas: se usan solo por las funciones de abajo.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.plataforma_duenos (
  perfil_id  uuid primary key references public.perfiles (id) on delete cascade,
  creado_en  timestamptz not null default now()
);

create table public.clientes (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(trim(nombre)) > 0),
  telefono   text,
  email      text,
  direccion  text,
  notas      text,
  creado_en  timestamptz not null default now()
);

alter table public.empresas
  add column if not exists cliente_id      uuid references public.clientes (id),
  add column if not exists precio_mensual  numeric(10, 2) not null default 500 check (precio_mensual >= 0),
  add column if not exists vence           date,
  add column if not exists suspendida      boolean not null default false,
  add column if not exists suspendida_en   timestamptz,
  add column if not exists licencia        text,
  add column if not exists direccion       text,
  add column if not exists interna         boolean not null default false;
create index empresas_cliente_idx on public.empresas (cliente_id);

create table public.pagos_plataforma (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas (id),
  monto          numeric(10, 2) not null check (monto >= 0),
  vence_antes    date,
  vence_despues  date not null,
  registrado_por uuid references public.perfiles (id),
  creado_en      timestamptz not null default now()
);
create index pagos_plataforma_empresa_idx on public.pagos_plataforma (empresa_id, creado_en desc);

alter table public.perfiles add column asistiendo boolean not null default false;
alter table public.perfiles add column if not exists telefono text;

alter table public.plataforma_duenos enable row level security;
alter table public.clientes enable row level security;
alter table public.pagos_plataforma enable row level security;
revoke all on public.plataforma_duenos, public.clientes, public.pagos_plataforma from anon, authenticated;

-- Las compañías que ya existen quedan como el cliente n.º 1 (el dueño completa sus datos desde el panel).
do $fn$
declare v_cliente uuid;
begin
  if exists (select 1 from public.empresas) then
    insert into public.clientes (nombre) values ('Cliente n.º 1') returning id into v_cliente;
    update public.empresas set cliente_id = v_cliente, vence = current_date + 30;
  end if;
end $fn$;

-- ---------------------------------------------------------------------------
-- Quién es quién
-- ---------------------------------------------------------------------------
create or replace function public.es_plataforma() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from plataforma_duenos d join perfiles p on p.id = d.perfil_id
    where d.perfil_id = auth.uid() and p.activo)
$$;

create or replace function public._exigir_plataforma() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_plataforma() then
    raise exception 'No tienes permiso para esta acción' using errcode = '42501';
  end if;
end $$;

-- Dueño de la plataforma que está ayudando a una compañía: actúa como administrador de ella.
create or replace function public.tengo_rol(p_rol text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p_rol = any (roles) or (p_rol = 'admin' and asistiendo and public.es_plataforma())
                   from perfiles where id = auth.uid() and activo), false)
$$;

-- Miembro de una compañía que NO está suspendida. El dueño de la plataforma cuenta como miembro de cualquiera (solo él mismo).
create or replace function public.es_miembro(p_perfil uuid, p_empresa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (exists (select 1 from perfil_empresas where perfil_id = p_perfil and empresa_id = p_empresa and baja_en is null)
          and not coalesce((select suspendida from empresas where id = p_empresa), false))
      or (p_perfil = auth.uid() and public.es_plataforma() and exists (select 1 from empresas where id = p_empresa))
$$;

create or replace function public.mi_empresa() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_yo perfiles; v_h text; v_e uuid; v_r uuid;
begin
  select * into v_yo from perfiles where id = auth.uid() and activo;
  if not found then return null; end if;
  begin
    v_h := nullif(current_setting('request.headers', true)::json ->> 'x-empresa-id', '');
  exception when others then v_h := null;
  end;
  if v_h is not null then
    begin v_e := v_h::uuid; exception when others then v_e := null; end;
    if v_e is not null and public.es_miembro(v_yo.id, v_e) then v_r := v_e; end if;
  end if;
  if v_r is null and v_yo.empresa_activa_id is not null and public.es_miembro(v_yo.id, v_yo.empresa_activa_id) then
    v_r := v_yo.empresa_activa_id;
  end if;
  if v_r is null then v_r := v_yo.empresa_id; end if;
  -- Compañía suspendida: se pasa a otra activa de la persona; si no hay, no hay compañía.
  if exists (select 1 from empresas where id = v_r and suspendida) and not public.es_plataforma() then
    select m.empresa_id into v_r from perfil_empresas m join empresas e on e.id = m.empresa_id
    where m.perfil_id = v_yo.id and m.baja_en is null and not e.suspendida
    order by m.creado_en limit 1;
  end if;
  return v_r;
end $$;

create or replace function public.mis_empresas()
returns table (id uuid, nombre text, zona_horaria text, activa boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.nombre, e.zona_horaria, e.id = public.mi_empresa()
  from empresas e
  join perfil_empresas m on m.empresa_id = e.id and m.perfil_id = auth.uid() and m.baja_en is null
  where exists (select 1 from perfiles where id = auth.uid() and activo) and not e.suspendida
  order by e.nombre
$$;

-- Para la pantalla de "acceso suspendido": las compañías de quien llama, aunque estén suspendidas.
create or replace function public.mi_cuenta()
returns table (empresa_id uuid, nombre text, suspendida boolean, vence date)
language sql stable security definer set search_path = public as $$
  select e.id, e.nombre, e.suspendida, e.vence
  from empresas e join perfil_empresas m on m.empresa_id = e.id and m.perfil_id = auth.uid() and m.baja_en is null
  where exists (select 1 from perfiles where id = auth.uid() and activo)
  order by e.nombre
$$;

-- ¿Es dueño de la plataforma? ¿está ayudando a alguna compañía?
create or replace function public.plataforma_yo()
returns table (es_plataforma boolean, asistiendo boolean, empresa_id uuid, empresa text)
language sql stable security definer set search_path = public as $$
  select public.es_plataforma(),
         public.es_plataforma() and coalesce(p.asistiendo, false),
         case when public.es_plataforma() and p.asistiendo then p.empresa_activa_id end,
         case when public.es_plataforma() and p.asistiendo then (select nombre from empresas where id = p.empresa_activa_id) end
  from perfiles p where p.id = auth.uid()
$$;

-- Al elegir compañía por el selector normal se deja de "asistir".
create or replace function public.elegir_empresa(p_empresa uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.es_miembro(auth.uid(), p_empresa) then
    raise exception 'No perteneces a esa compañía' using errcode = '42501';
  end if;
  update perfiles set empresa_activa_id = p_empresa, asistiendo = false where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------------
-- Panel del dueño de la plataforma
-- ---------------------------------------------------------------------------
create or replace function public.plataforma_panel()
returns table (empresa_id uuid, nombre text, cliente_id uuid, cliente text, telefono text, email text,
               precio numeric, vence date, suspendida boolean, trabajadores int, obras int, vehiculos int,
               licencia text, creado_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._exigir_plataforma();
  return query
  select e.id, e.nombre::text, e.cliente_id, c.nombre::text, c.telefono::text, c.email::text, e.precio_mensual, e.vence, e.suspendida,
         (select count(*)::int from perfil_empresas m join perfiles p on p.id = m.perfil_id
           where m.empresa_id = e.id and m.baja_en is null and p.activo and 'trabajador' = any (p.roles)),
         (select count(*)::int from proyectos x where x.empresa_id = e.id and x.activo),
         (select count(*)::int from vehiculos v where v.empresa_id = e.id and v.activo),
         e.licencia::text, e.creado_en
  from empresas e left join clientes c on c.id = e.cliente_id
  where not e.interna
  order by c.nombre nulls last, e.nombre;
end $$;

create or replace function public.plataforma_clientes()
returns table (id uuid, nombre text, telefono text, email text, direccion text, notas text, companias int)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._exigir_plataforma();
  return query
  select c.id, c.nombre::text, c.telefono::text, c.email::text, c.direccion::text, c.notas::text,
         (select count(*)::int from empresas e where e.cliente_id = c.id and not e.interna)
  from clientes c order by c.nombre;
end $$;

create or replace function public.plataforma_guardar_cliente(
  p_id uuid, p_nombre text, p_telefono text, p_email text, p_direccion text, p_notas text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._exigir_plataforma();
  if nullif(trim(p_nombre), '') is null then raise exception 'Falta el nombre del dueño'; end if;
  if p_id is null then
    insert into clientes (nombre, telefono, email, direccion, notas)
    values (trim(p_nombre), nullif(trim(p_telefono), ''), nullif(trim(p_email), ''), nullif(trim(p_direccion), ''), nullif(trim(p_notas), ''))
    returning id into v_id;
  else
    update clientes set nombre = trim(p_nombre), telefono = nullif(trim(p_telefono), ''), email = nullif(trim(p_email), ''),
           direccion = nullif(trim(p_direccion), ''), notas = nullif(trim(p_notas), '')
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Cliente no encontrado'; end if;
  end if;
  return v_id;
end $$;

-- Crea o edita una compañía. Al crearla se siembran sus tasas de NIB y NHIP (editables después).
create or replace function public.plataforma_guardar_empresa(
  p_id uuid, p_cliente uuid, p_nombre text, p_licencia text, p_direccion text,
  p_precio numeric, p_vence date, p_zona text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._exigir_plataforma();
  if nullif(trim(p_nombre), '') is null then raise exception 'Falta el nombre de la compañía'; end if;
  if p_precio is null or p_precio < 0 then raise exception 'El precio no es válido'; end if;
  if p_cliente is not null and not exists (select 1 from clientes where id = p_cliente) then raise exception 'Cliente no encontrado'; end if;
  if p_id is null then
    insert into empresas (nombre, cliente_id, licencia, direccion, precio_mensual, vence, zona_horaria)
    values (trim(p_nombre), p_cliente, nullif(trim(p_licencia), ''), nullif(trim(p_direccion), ''), round(p_precio, 2),
            coalesce(p_vence, current_date + 30), coalesce(nullif(trim(p_zona), ''), 'America/Grand_Turk'))
    returning id into v_id;
    perform public._sembrar_tasas(v_id);
    perform public._evento(v_id, 'compania_creada', jsonb_build_object('cliente', p_cliente, 'precio', p_precio));
  else
    update empresas set nombre = trim(p_nombre), cliente_id = p_cliente, licencia = nullif(trim(p_licencia), ''),
           direccion = nullif(trim(p_direccion), ''), precio_mensual = round(p_precio, 2), vence = coalesce(p_vence, vence),
           zona_horaria = coalesce(nullif(trim(p_zona), ''), zona_horaria)
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Compañía no encontrada'; end if;
    perform public._evento(v_id, 'compania_editada', jsonb_build_object('precio', p_precio, 'vence', p_vence));
  end if;
  return v_id;
end $$;

-- Registra un pago: extiende el vencimiento un mes (desde el vencimiento si aún no pasó) y reactiva el acceso.
create or replace function public.plataforma_pago(p_empresa uuid, p_monto numeric default null)
returns date language plpgsql security definer set search_path = public as $$
declare v_e empresas; v_nuevo date; v_monto numeric;
begin
  perform public._exigir_plataforma();
  select * into v_e from empresas where id = p_empresa;
  if not found then raise exception 'Compañía no encontrada'; end if;
  v_monto := coalesce(p_monto, v_e.precio_mensual);
  if v_monto < 0 then raise exception 'El monto no es válido'; end if;
  v_nuevo := (greatest(coalesce(v_e.vence, current_date), current_date) + interval '1 month')::date;
  update empresas set vence = v_nuevo, suspendida = false, suspendida_en = null where id = p_empresa;
  insert into pagos_plataforma (empresa_id, monto, vence_antes, vence_despues, registrado_por)
  values (p_empresa, v_monto, v_e.vence, v_nuevo, auth.uid());
  perform public._evento(p_empresa, 'pago_registrado', jsonb_build_object('monto', v_monto, 'vence', v_nuevo));
  return v_nuevo;
end $$;

create or replace function public.plataforma_suspender(p_empresa uuid, p_suspender boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._exigir_plataforma();
  update empresas set suspendida = coalesce(p_suspender, true),
         suspendida_en = case when coalesce(p_suspender, true) then now() end
  where id = p_empresa;
  if not found then raise exception 'Compañía no encontrada'; end if;
  perform public._evento(p_empresa, case when coalesce(p_suspender, true) then 'compania_suspendida' else 'compania_activada' end, '{}'::jsonb);
end $$;

create or replace function public.plataforma_pagos(p_empresa uuid)
returns table (id uuid, monto numeric, vence_antes date, vence_despues date, creado_en timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._exigir_plataforma();
  return query select x.id, x.monto, x.vence_antes, x.vence_despues, x.creado_en
  from pagos_plataforma x where x.empresa_id = p_empresa order by x.creado_en desc limit 24;
end $$;

-- Entrar a ayudar a una compañía: queda en su historial. Mientras tanto actúas como administrador de ella.
create or replace function public.plataforma_entrar(p_empresa uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._exigir_plataforma();
  if not exists (select 1 from empresas where id = p_empresa) then raise exception 'Compañía no encontrada'; end if;
  update perfiles set empresa_activa_id = p_empresa, asistiendo = true where id = auth.uid();
  perform public._evento(p_empresa, 'asistente_entro', '{}'::jsonb);
end $$;

create or replace function public.plataforma_salir() returns void
language plpgsql security definer set search_path = public as $$
declare v_emp uuid;
begin
  perform public._exigir_plataforma();
  select empresa_activa_id into v_emp from perfiles where id = auth.uid() and asistiendo;
  update perfiles set asistiendo = false, empresa_activa_id = null where id = auth.uid();
  if v_emp is not null then perform public._evento(v_emp, 'asistente_salio', '{}'::jsonb); end if;
end $$;

-- Administradores que ya existen (para darle al mismo usuario otra compañía del mismo cliente).
create or replace function public.plataforma_admins()
returns table (id uuid, usuario text, nombre text, companias text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._exigir_plataforma();
  return query
  select p.id, p.usuario::text, p.nombre::text,
         (select string_agg(e.nombre, ', ' order by e.nombre) from perfil_empresas m join empresas e on e.id = m.empresa_id
           where m.perfil_id = p.id and m.baja_en is null)::text
  from perfiles p where p.activo and 'admin' = any (p.roles) order by p.nombre;
end $$;

-- Obras y vehículos del asistente de alta. Los vehículos pueden traer el usuario del conductor (ya creado).
create or replace function public.plataforma_alta_datos(p_empresa uuid, p_obras jsonb, p_vehiculos jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o jsonb; v jsonb; v_proy uuid; v_cond uuid; n_o int := 0; n_v int := 0; v_tipo text; v_pres numeric;
begin
  perform public._exigir_plataforma();
  if not exists (select 1 from empresas where id = p_empresa) then raise exception 'Compañía no encontrada'; end if;
  for o in select * from jsonb_array_elements(coalesce(p_obras, '[]'::jsonb)) loop
    if nullif(trim(o ->> 'nombre'), '') is null then continue; end if;
    insert into proyectos (empresa_id, nombre, direccion)
    values (p_empresa, trim(o ->> 'nombre'), nullif(trim(o ->> 'direccion'), '')) returning id into v_proy;
    v_pres := nullif(trim(coalesce(o ->> 'presupuesto', '')), '')::numeric;
    if v_pres is not null and v_pres > 0 then
      insert into presupuestos (proyecto_id, empresa_id, mano_obra, materiales, actualizado_por)
      values (v_proy, p_empresa, round(v_pres * 0.5, 2), round(v_pres * 0.5, 2), auth.uid());
    end if;
    n_o := n_o + 1;
  end loop;
  for v in select * from jsonb_array_elements(coalesce(p_vehiculos, '[]'::jsonb)) loop
    if nullif(trim(v ->> 'nombre'), '') is null then continue; end if;
    v_tipo := case when (v ->> 'tipo') in ('camioneta', 'van', 'camion', 'remolque', 'otro') then v ->> 'tipo' else 'camioneta' end;
    v_cond := null;
    if nullif(trim(coalesce(v ->> 'conductor', '')), '') is not null then
      select p.id into v_cond from perfiles p
      where lower(p.usuario) = lower(trim(v ->> 'conductor')) and public._es_de_empresa(p.id, p_empresa);
    end if;
    insert into vehiculos (empresa_id, nombre, placa, tipo, conductor_id, creado_por)
    values (p_empresa, trim(v ->> 'nombre'), nullif(trim(coalesce(v ->> 'placa', '')), ''), v_tipo, v_cond, auth.uid());
    n_v := n_v + 1;
  end loop;
  perform public._evento(p_empresa, 'alta_datos', jsonb_build_object('obras', n_o, 'vehiculos', n_v));
  return jsonb_build_object('obras', n_o, 'vehiculos', n_v);
end $$;

-- Pertenencia real (sin importar suspensión ni asistencia).
create or replace function public._es_de_empresa(p_perfil uuid, p_empresa uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfil_empresas where perfil_id = p_perfil and empresa_id = p_empresa and baja_en is null)
$$;

-- ---------------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------------
revoke all on function public._exigir_plataforma() from public, anon, authenticated;
revoke all on function public._es_de_empresa(uuid, uuid) from public, anon, authenticated;
revoke all on function public.es_plataforma(), public.mi_cuenta(), public.plataforma_yo(),
  public.plataforma_panel(), public.plataforma_clientes(), public.plataforma_pagos(uuid),
  public.plataforma_guardar_cliente(uuid, text, text, text, text, text),
  public.plataforma_guardar_empresa(uuid, uuid, text, text, text, numeric, date, text),
  public.plataforma_pago(uuid, numeric), public.plataforma_suspender(uuid, boolean),
  public.plataforma_entrar(uuid), public.plataforma_salir(), public.plataforma_alta_datos(uuid, jsonb, jsonb),
  public.plataforma_admins()
  from public, anon;
grant execute on function public.es_plataforma(), public.mi_cuenta(), public.plataforma_yo(),
  public.plataforma_panel(), public.plataforma_clientes(), public.plataforma_pagos(uuid),
  public.plataforma_guardar_cliente(uuid, text, text, text, text, text),
  public.plataforma_guardar_empresa(uuid, uuid, text, text, text, numeric, date, text),
  public.plataforma_pago(uuid, numeric), public.plataforma_suspender(uuid, boolean),
  public.plataforma_entrar(uuid), public.plataforma_salir(), public.plataforma_alta_datos(uuid, jsonb, jsonb),
  public.plataforma_admins()
  to authenticated;
grant execute on function public.tengo_rol(text), public.es_miembro(uuid, uuid), public.mi_empresa(),
  public.mis_empresas(), public.elegir_empresa(uuid) to authenticated;
