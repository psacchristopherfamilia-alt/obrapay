-- ============================================================================
-- 020 — Documentos por proyecto (permisos, contratos, seguros)
-- Este es el único de los 3 módulos nuevos que necesita Supabase Storage
-- de verdad (archivos), no solo filas en la base de datos.
-- ============================================================================

create table documentos_proyecto (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  nombre text not null,
  tipo text not null default 'otro', -- permiso | contrato | seguro | otro
  storage_path text not null,
  fecha_vencimiento date,
  subido_por uuid references usuarios(id),
  subido_en timestamptz not null default now()
);
create index idx_documentos_proyecto on documentos_proyecto(proyecto_id);

alter table documentos_proyecto enable row level security;

create policy documentos_proyecto_select on documentos_proyecto
  for select using (
    es_owner()
    or proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  );

create policy documentos_proyecto_insert on documentos_proyecto
  for insert with check (
    proyecto_id in (select proyectos_a_cargo())
    or (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()))
  );

create policy documentos_proyecto_delete on documentos_proyecto
  for delete using (es_admin() and proyecto_id in (select id from proyectos where empresa_id = empresa_actual()));

-- ----------------------------------------------------------------------------
-- Storage: bucket privado (no público — un permiso o contrato no debe ser
-- accesible por URL directa sin autenticación).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documentos-proyecto', 'documentos-proyecto', false)
on conflict (id) do nothing;

-- Convención de ruta dentro del bucket: {proyecto_id}/{archivo}. Las
-- políticas de storage.objects usan foldername(name)[1] para leer ese
-- primer segmento como el proyecto_id y reutilizar exactamente las mismas
-- reglas que ya rigen proyecto_trabajadores/proyecto_supervisores.

create policy documentos_storage_select on storage.objects
  for select using (
    bucket_id = 'documentos-proyecto'
    and (
      es_owner()
      or (storage.foldername(name))[1]::uuid in (select proyectos_a_cargo())
      or (es_admin() and (storage.foldername(name))[1]::uuid in (
        select id from proyectos where empresa_id = empresa_actual()
      ))
    )
  );

create policy documentos_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'documentos-proyecto'
    and (
      (storage.foldername(name))[1]::uuid in (select proyectos_a_cargo())
      or (es_admin() and (storage.foldername(name))[1]::uuid in (
        select id from proyectos where empresa_id = empresa_actual()
      ))
    )
  );

create policy documentos_storage_delete on storage.objects
  for delete using (
    bucket_id = 'documentos-proyecto'
    and es_admin()
    and (storage.foldername(name))[1]::uuid in (
      select id from proyectos where empresa_id = empresa_actual()
    )
  );
