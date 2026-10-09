-- Datos de prueba: los mismos del prototipo. Ids fijos para leer las pruebas con facilidad.
--   empresa ...e1 · admin ...a1 · dueño ...d1 · supervisores ...b1 (Ramón), ...b2 (A. Louis)
--   trabajadores ...c1 Juan, ...c2 Marie, ...c3 Carlos, ...c4 Jean, ...c5 Pedro
--   proyectos ...f1 Villa Grace Bay, ...f2 Leeward Plaza, ...f3 Taylor Bay Residence

insert into public.empresas (id, nombre) values
  ('00000000-0000-0000-0000-0000000000e1', 'Empresa de prueba');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@obrapay.local'),
  ('00000000-0000-0000-0000-0000000000d1', 'dueno@obrapay.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'ramon.gomez@obrapay.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'a.louis@obrapay.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'juan.perez@obrapay.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'marie.joseph@obrapay.local'),
  ('00000000-0000-0000-0000-0000000000c3', 'carlos.mendez@obrapay.local'),
  ('00000000-0000-0000-0000-0000000000c4', 'jean.baptiste@obrapay.local'),
  ('00000000-0000-0000-0000-0000000000c5', 'pedro.santos@obrapay.local');

insert into public.perfiles (id, empresa_id, usuario, nombre, oficio, roles) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1', 'admin',         'Administración', null,         array['admin']),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1', 'dueno',         'Dueño',          null,         array['dueno']),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1', 'ramon.gomez',   'Ramón Gómez',    'Supervisor', array['supervisor']),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000e1', 'a.louis',       'A. Louis',       'Supervisor', array['supervisor', 'trabajador']),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1', 'juan.perez',    'Juan Pérez',     'Plomero',    array['trabajador']),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000e1', 'marie.joseph',  'Marie Joseph',   'Electricista', array['trabajador']),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000e1', 'carlos.mendez', 'Carlos Méndez',  'Ayudante',   array['trabajador']),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000e1', 'jean.baptiste', 'Jean Baptiste',  'Albañil',    array['trabajador']),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000e1', 'pedro.santos',  'Pedro Santos',   'Carpintero', array['trabajador']);

insert into public.tarifas (empresa_id, perfil_id, monto_hora, vigente_desde) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 17.00, '2026-09-01'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 18.00, '2026-10-01'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c2', 20.00, '2026-09-01'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c3', 13.00, '2026-09-01'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c4', 16.00, '2026-09-01'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c5', 17.00, '2026-09-01');

insert into public.seguros (empresa_id, perfil_id, porcentaje, vigente_desde)
select '00000000-0000-0000-0000-0000000000e1', id, 3.00, '2026-09-01'
from public.perfiles where 'trabajador' = any (roles);

insert into public.proyectos (id, empresa_id, nombre, lat, lng, radio_m) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1', 'Villa Grace Bay',      21.7960, -72.1700, 150),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e1', 'Leeward Plaza',        21.8000, -72.1500, 150),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000e1', 'Taylor Bay Residence', 21.7400, -72.2700, 150);

insert into public.proyecto_supervisores (empresa_id, proyecto_id, perfil_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000b2');

insert into public.proyecto_trabajadores (empresa_id, proyecto_id, perfil_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c3'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000c4'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000c5'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000c5'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000b2');

-- Semana del prototipo: jueves 1 – miércoles 7 oct 2026.
do $$ begin perform public.asegurar_semana('00000000-0000-0000-0000-0000000000e1', '2026-10-01'); end $$;

-- Ayuda: crea un turno con horas locales de Grand Turk.
create or replace function test.turno(
  p_perfil text, p_proyecto text, p_fecha date, p_entrada time, p_salida time,
  p_estado text default 'aprobado'
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.turnos (empresa_id, perfil_id, proyecto_id, entrada, salida, estado)
  values (
    '00000000-0000-0000-0000-0000000000e1',
    ('00000000-0000-0000-0000-0000000000' || p_perfil)::uuid,
    ('00000000-0000-0000-0000-0000000000' || p_proyecto)::uuid,
    (p_fecha + p_entrada) at time zone 'America/Grand_Turk',
    case when p_salida is null then null else (p_fecha + p_salida) at time zone 'America/Grand_Turk' end,
    p_estado
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function test.semana(p_fecha date) returns uuid
language sql as $$
  select id from public.semanas
  where empresa_id = '00000000-0000-0000-0000-0000000000e1'
    and inicio = public.semana_inicio_de(p_fecha)
$$;
