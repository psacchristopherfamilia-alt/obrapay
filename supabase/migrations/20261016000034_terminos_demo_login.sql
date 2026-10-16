-- ObraPay · Fase D: aceptación de términos y usuario de la demostración con clave pública.
create table if not exists public.aceptaciones (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  version text not null,
  aceptado_en timestamptz not null default clock_timestamp()
);
create index if not exists aceptaciones_perfil on public.aceptaciones (perfil_id, aceptado_en desc);
alter table public.aceptaciones enable row level security;
revoke all on public.aceptaciones from anon, authenticated;

create or replace function public.mi_aceptacion() returns text
language sql stable security definer set search_path = public as $f$
  select version from aceptaciones where perfil_id = auth.uid() order by aceptado_en desc limit 1 $f$;

create or replace function public.aceptar_terminos(p_version text) returns void
language plpgsql security definer set search_path = public as $f$
begin
  if auth.uid() is null then raise exception 'permiso' using errcode = '42501'; end if;
  if coalesce(btrim(p_version), '') = '' or length(p_version) > 40 then raise exception 'Versión inválida'; end if;
  insert into aceptaciones (perfil_id, version) values (auth.uid(), btrim(p_version));
end $f$;
revoke all on function public.mi_aceptacion(), public.aceptar_terminos(text) from public, anon;
grant execute on function public.mi_aceptacion(), public.aceptar_terminos(text) to authenticated;

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
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
    values (v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            case when i = 1 then 'demo.obrapay@obrapay.local' else 'demo' || i || '.' || substr(p_empresa::text, 1, 8) || '@demo.invalid' end,
            case when i = 1 then extensions.crypt('ObraPayDemo2026', extensions.gen_salt('bf')) end,
            now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
    if i = 1 then
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text, jsonb_build_object('sub', v_id::text, 'email', 'demo.obrapay@obrapay.local'), 'email', now(), now(), now());
    end if;
    insert into perfiles (id, empresa_id, usuario, nombre, oficio, roles, debe_cambiar_clave, numero_nib, numero_nhip)
    values (v_id, p_empresa, case when i = 1 then 'demo.obrapay' else 'demo' || i end, nom[i], ofi[i],
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


-- Reinicio automático de la demo (cron de cada noche).
create or replace function public._demo_reiniciar_auto() returns void
language plpgsql security definer set search_path = public as $f$
declare v uuid;
begin
  select id into v from empresas where demo limit 1;
  if v is null then return; end if;
  perform public._demo_limpiar(v);
  perform public._demo_poblar(v);
end $f$;
revoke all on function public._demo_reiniciar_auto() from public, anon, authenticated;
