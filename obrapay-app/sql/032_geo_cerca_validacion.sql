-- ============================================================================
-- 032 — Geo-cerca validada de verdad (no solo capturada)
-- Hasta ahora se guardaba la ubicación del trabajador al marcar, y existía
-- un radio (geo_cerca_radio_m), pero nada comparaba una cosa con la otra:
-- faltaba el punto central del proyecto, y faltaba la función que mide la
-- distancia. Decisión de producto confirmada con el usuario: NO se
-- bloquea el marcaje — se dejar marcar, pero se avisa al supervisor para
-- que lo revise antes de aprobar. Se valida tanto entrada como salida.
-- ============================================================================

alter table proyectos
  add column if not exists geo_cerca_lat numeric(10,7),
  add column if not exists geo_cerca_lng numeric(10,7);

alter table registros_horas
  add column if not exists fuera_geo_cerca_entrada boolean not null default false,
  add column if not exists fuera_geo_cerca_salida boolean not null default false;

-- Distancia entre dos puntos geográficos, en metros (fórmula esférica,
-- radio medio de la Tierra = 6,371,000 m). El least/greatest evita que un
-- error de punto flotante en el mismo punto exacto (coseno = 1.0000000001)
-- rompa acos() al salirse de su dominio [-1, 1].
create or replace function distancia_metros(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
returns numeric
language sql
immutable
set search_path = public
as $$
  select 6371000 * acos(
    least(1::numeric, greatest(-1::numeric,
      cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2 - lng1)) +
      sin(radians(lat1)) * sin(radians(lat2))
    ))
  );
$$;

revoke execute on function distancia_metros(numeric, numeric, numeric, numeric) from public, authenticated, anon;

-- ----------------------------------------------------------------------------
-- BEFORE INSERT/UPDATE: calcula si la entrada y/o salida quedaron fuera
-- del radio permitido. `point` guarda (longitud, latitud) porque así lo
-- manda el cliente — point[0] = longitud, point[1] = latitud.
-- ----------------------------------------------------------------------------
create or replace function verificar_geo_cerca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activa boolean;
  v_lat numeric; v_lng numeric; v_radio int;
begin
  select geo_cerca_activa, geo_cerca_lat, geo_cerca_lng, geo_cerca_radio_m
    into v_activa, v_lat, v_lng, v_radio
    from proyectos where id = NEW.proyecto_id;

  if v_activa and v_lat is not null and v_lng is not null then
    if NEW.ubicacion_entrada is not null then
      NEW.fuera_geo_cerca_entrada := distancia_metros(v_lat, v_lng, NEW.ubicacion_entrada[1], NEW.ubicacion_entrada[0]) > v_radio;
    end if;
    if NEW.ubicacion_salida is not null then
      NEW.fuera_geo_cerca_salida := distancia_metros(v_lat, v_lng, NEW.ubicacion_salida[1], NEW.ubicacion_salida[0]) > v_radio;
    end if;
  end if;

  return NEW;
end;
$$;

revoke execute on function verificar_geo_cerca() from public, authenticated, anon;

drop trigger if exists trg_verificar_geo_cerca on registros_horas;
create trigger trg_verificar_geo_cerca
  before insert or update on registros_horas
  for each row execute function verificar_geo_cerca();

-- ----------------------------------------------------------------------------
-- AFTER INSERT/UPDATE: si quedó marcado fuera de la geo-cerca, avisa a
-- los supervisores del proyecto (no al trabajador — es al supervisor a
-- quien le toca revisar antes de aprobar).
-- ----------------------------------------------------------------------------
create or replace function avisar_fuera_geo_cerca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supervisor record;
  v_trabajador_nombre text;
  v_proyecto_nombre text;
  v_empresa_id uuid;
  v_mensaje text;
  v_debe_avisar boolean := false;
  v_tipo_evento text;
begin
  if TG_OP = 'INSERT' and NEW.fuera_geo_cerca_entrada then
    v_debe_avisar := true; v_tipo_evento := 'entrada';
  elsif TG_OP = 'UPDATE' and NEW.fuera_geo_cerca_salida and not coalesce(OLD.fuera_geo_cerca_salida, false) then
    v_debe_avisar := true; v_tipo_evento := 'salida';
  end if;

  if not v_debe_avisar then
    return NEW;
  end if;

  select nombre into v_trabajador_nombre from usuarios where id = NEW.usuario_id;
  select nombre, empresa_id into v_proyecto_nombre, v_empresa_id from proyectos where id = NEW.proyecto_id;
  v_mensaje := v_trabajador_nombre || ' marcó ' || v_tipo_evento || ' fuera del área de ' || v_proyecto_nombre || '. Revisa antes de aprobar sus horas.';

  for v_supervisor in
    select u.id, coalesce(ce.canal_whatsapp, true) as canal_whatsapp,
           coalesce(ce.canal_email, true) as canal_email,
           coalesce(ce.canal_push, true) as canal_push
    from proyecto_supervisores ps
    join usuarios u on u.id = ps.usuario_id
    left join configuracion_empresa ce on ce.empresa_id = v_empresa_id
    where ps.proyecto_id = NEW.proyecto_id
  loop
    if v_supervisor.canal_whatsapp then
      insert into notificaciones (usuario_id, tipo, canal, mensaje) values (v_supervisor.id, 'fuera_geo_cerca', 'whatsapp', v_mensaje);
    end if;
    if v_supervisor.canal_email then
      insert into notificaciones (usuario_id, tipo, canal, mensaje) values (v_supervisor.id, 'fuera_geo_cerca', 'email', v_mensaje);
    end if;
    if v_supervisor.canal_push then
      insert into notificaciones (usuario_id, tipo, canal, mensaje) values (v_supervisor.id, 'fuera_geo_cerca', 'push', v_mensaje);
    end if;
  end loop;

  return NEW;
end;
$$;

revoke execute on function avisar_fuera_geo_cerca() from public, authenticated, anon;

drop trigger if exists trg_avisar_fuera_geo_cerca on registros_horas;
create trigger trg_avisar_fuera_geo_cerca
  after insert or update on registros_horas
  for each row execute function avisar_fuera_geo_cerca();
