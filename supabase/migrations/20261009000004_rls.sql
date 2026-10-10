-- ObraPay · Permisos por rol (Row Level Security)
-- Regla general: la app solo LEE las tablas; todo cambio de dinero u horas va por las funciones RPC.
-- Excepciones de escritura directa: el admin administra proyectos, asignaciones, perfiles,
-- ajustes de la empresa y el estado de préstamos; cada quien marca sus avisos como leídos.

-- ---------------------------------------------------------------------------
-- Activar RLS en todo
-- ---------------------------------------------------------------------------
alter table public.empresas              enable row level security;
alter table public.perfiles              enable row level security;
alter table public.tarifas               enable row level security;
alter table public.seguros               enable row level security;
alter table public.proyectos             enable row level security;
alter table public.proyecto_supervisores enable row level security;
alter table public.proyecto_trabajadores enable row level security;
alter table public.semanas               enable row level security;
alter table public.turnos                enable row level security;
alter table public.turno_cambios         enable row level security;
alter table public.prestamos             enable row level security;
alter table public.descuentos_prestamo   enable row level security;
alter table public.nomina_semanal        enable row level security;
alter table public.nomina_proyecto       enable row level security;
alter table public.notificaciones        enable row level security;
alter table public.eventos_admin         enable row level security;

-- Nadie anónimo toca nada. Usuarios: solo lectura salvo lo que se concede abajo.
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;

grant update (zona_horaria, gps_activo, gps_modo, hora_extra_desde, hora_cierre_turno, almuerzo_inicio, almuerzo_fin, nombre)
  on public.empresas to authenticated;
grant update (nombre, oficio, roles, activo) on public.perfiles to authenticated;
grant insert, update, delete on public.proyectos, public.proyecto_supervisores, public.proyecto_trabajadores to authenticated;
grant update (activo, nota) on public.prestamos to authenticated;
grant update (leida) on public.notificaciones to authenticated;

-- Atajos legibles
create or replace function public.es_gerencia() returns boolean
language sql stable security definer set search_path = public as $$
  select public.tengo_rol('admin') or public.tengo_rol('dueno')
$$;
grant execute on function public.es_gerencia() to authenticated;

-- ---------------------------------------------------------------------------
-- Empresa
-- ---------------------------------------------------------------------------
create policy empresa_ver on public.empresas for select to authenticated
  using (id = public.mi_empresa());
create policy empresa_admin_editar on public.empresas for update to authenticated
  using (id = public.mi_empresa() and public.tengo_rol('admin'))
  with check (id = public.mi_empresa());

-- ---------------------------------------------------------------------------
-- Perfiles: cada quien el suyo; gerencia todos; supervisor los de sus proyectos
-- ---------------------------------------------------------------------------
create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = auth.uid()
         or (empresa_id = public.mi_empresa() and (public.es_gerencia() or public.supervisa_a(id))));
create policy perfiles_admin_editar on public.perfiles for update to authenticated
  using (empresa_id = public.mi_empresa() and public.tengo_rol('admin'))
  with check (empresa_id = public.mi_empresa());

-- ---------------------------------------------------------------------------
-- Dinero personal: tarifa, seguro, préstamos, nómina → dueño del dato o gerencia
-- ---------------------------------------------------------------------------
create policy tarifas_ver on public.tarifas for select to authenticated
  using (perfil_id = auth.uid() or (empresa_id = public.mi_empresa() and public.es_gerencia()));
create policy seguros_ver on public.seguros for select to authenticated
  using (perfil_id = auth.uid() or (empresa_id = public.mi_empresa() and public.es_gerencia()));
create policy prestamos_ver on public.prestamos for select to authenticated
  using (perfil_id = auth.uid() or (empresa_id = public.mi_empresa() and public.es_gerencia()));
create policy prestamos_admin_editar on public.prestamos for update to authenticated
  using (empresa_id = public.mi_empresa() and public.tengo_rol('admin'))
  with check (empresa_id = public.mi_empresa());
create policy descuentos_ver on public.descuentos_prestamo for select to authenticated
  using (empresa_id = public.mi_empresa()
         and (public.es_gerencia()
              or exists (select 1 from public.prestamos p where p.id = prestamo_id and p.perfil_id = auth.uid())));
create policy nomina_semanal_ver on public.nomina_semanal for select to authenticated
  using (perfil_id = auth.uid() or (empresa_id = public.mi_empresa() and public.es_gerencia()));
create policy nomina_proyecto_ver on public.nomina_proyecto for select to authenticated
  using (perfil_id = auth.uid() or (empresa_id = public.mi_empresa() and public.es_gerencia()));

-- ---------------------------------------------------------------------------
-- Proyectos y asignaciones: toda la empresa ve; el admin administra
-- ---------------------------------------------------------------------------
create policy proyectos_ver on public.proyectos for select to authenticated
  using (empresa_id = public.mi_empresa());
create policy proyectos_admin on public.proyectos for all to authenticated
  using (empresa_id = public.mi_empresa() and public.tengo_rol('admin'))
  with check (empresa_id = public.mi_empresa() and public.tengo_rol('admin'));

create policy psup_ver on public.proyecto_supervisores for select to authenticated
  using (empresa_id = public.mi_empresa());
create policy psup_admin on public.proyecto_supervisores for all to authenticated
  using (empresa_id = public.mi_empresa() and public.tengo_rol('admin'))
  with check (empresa_id = public.mi_empresa() and public.tengo_rol('admin'));

create policy ptra_ver on public.proyecto_trabajadores for select to authenticated
  using (empresa_id = public.mi_empresa());
create policy ptra_admin on public.proyecto_trabajadores for all to authenticated
  using (empresa_id = public.mi_empresa() and public.tengo_rol('admin'))
  with check (empresa_id = public.mi_empresa() and public.tengo_rol('admin'));

create policy semanas_ver on public.semanas for select to authenticated
  using (empresa_id = public.mi_empresa());

-- ---------------------------------------------------------------------------
-- Turnos: el propio, los de los proyectos que supervisa, o gerencia
-- ---------------------------------------------------------------------------
create policy turnos_ver on public.turnos for select to authenticated
  using (perfil_id = auth.uid()
         or (empresa_id = public.mi_empresa()
             and (public.es_gerencia() or public.supervisa_proyecto(proyecto_id))));
-- Se apoya en la política de turnos: solo ve cambios de turnos que ya puede ver.
create policy cambios_ver on public.turno_cambios for select to authenticated
  using (exists (select 1 from public.turnos t where t.id = turno_id));

-- ---------------------------------------------------------------------------
-- Avisos y bitácora
-- ---------------------------------------------------------------------------
create policy avisos_ver on public.notificaciones for select to authenticated
  using (perfil_id = auth.uid());
create policy avisos_leer on public.notificaciones for update to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());
create policy eventos_ver on public.eventos_admin for select to authenticated
  using (empresa_id = public.mi_empresa() and public.es_gerencia());

-- ---------------------------------------------------------------------------
-- Ajustes personales (sin dar permiso de editar el propio perfil completo)
-- ---------------------------------------------------------------------------
create or replace function public.cambiar_idioma(p_idioma text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_idioma not in ('es', 'en', 'ht') then raise exception 'Idioma no válido'; end if;
  update perfiles set idioma = p_idioma where id = auth.uid();
end $$;

create or replace function public.confirmar_clave_cambiada() returns void
language sql security definer set search_path = public as $$
  update perfiles set debe_cambiar_clave = false where id = auth.uid()
$$;

revoke execute on function public.cambiar_idioma(text), public.confirmar_clave_cambiada() from public, anon;
grant execute on function public.cambiar_idioma(text), public.confirmar_clave_cambiada() to authenticated;
