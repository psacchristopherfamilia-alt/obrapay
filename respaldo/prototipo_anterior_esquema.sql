-- Respaldo del esquema del prototipo anterior en el proyecto Supabase 'obrapay'
-- Tomado el 2026-10-10 antes de instalar el sistema nuevo. Solo referencia; no se ejecuta.

create table public.addons_catalogo (
  id uuid not null default gen_random_uuid(),
  clave text not null,
  nombre text not null,
  precio_mensual numeric(10,2) not null,
  activo boolean not null default true,
  constraint addons_catalogo_clave_key UNIQUE (clave),
  constraint addons_catalogo_pkey PRIMARY KEY (id)
);

create table public.auditoria (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null,
  usuario_id uuid,
  accion text not null,
  entidad text not null,
  entidad_id uuid,
  detalle jsonb,
  creado_en timestamp with time zone not null default now(),
  constraint auditoria_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  constraint auditoria_pkey PRIMARY KEY (id),
  constraint auditoria_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

create table public.catalogo_oficios (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  constraint catalogo_oficios_nombre_key UNIQUE (nombre),
  constraint catalogo_oficios_pkey PRIMARY KEY (id)
);

create table public.certificaciones_trabajador (
  id uuid not null default gen_random_uuid(),
  usuario_id uuid not null,
  nombre text not null,
  numero_certificado text,
  fecha_vencimiento date,
  aviso_enviado boolean not null default false,
  creado_en timestamp with time zone not null default now(),
  constraint certificaciones_trabajador_pkey PRIMARY KEY (id),
  constraint certificaciones_trabajador_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

create table public.clientes (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null,
  nombre text not null,
  contacto text,
  telefono text,
  email text,
  direccion text,
  creado_en timestamp with time zone not null default now(),
  constraint clientes_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  constraint clientes_pkey PRIMARY KEY (id)
);

create table public.compras_materiales (
  id uuid not null default gen_random_uuid(),
  proyecto_id uuid,
  material_id uuid not null,
  cantidad numeric(10,2) not null,
  costo_total numeric(10,2) not null,
  proveedor text,
  registrado_por uuid,
  comprado_en timestamp with time zone not null default now(),
  empresa_id uuid not null,
  constraint compras_materiales_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  constraint compras_materiales_material_id_fkey FOREIGN KEY (material_id) REFERENCES materiales_catalogo(id),
  constraint compras_materiales_pkey PRIMARY KEY (id),
  constraint compras_materiales_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
  constraint compras_materiales_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES usuarios(id)
);

create table public.configuracion_empresa (
  empresa_id uuid not null,
  dia_cierre text not null default 'Miércoles'::text,
  hora_cierre time without time zone not null default '23:59:00'::time without time zone,
  hora_inicio_extra time without time zone not null default '17:00:00'::time without time zone,
  seguro_default_pct numeric(5,2) not null default 5,
  idioma_default text not null default 'es'::text,
  requiere_gps_default boolean not null default true,
  firma_digital_activa boolean not null default false,
  canal_whatsapp boolean not null default true,
  canal_email boolean not null default true,
  canal_push boolean not null default true,
  nib_tasa_empleador numeric(5,2) not null default 6.5,
  nib_tasa_empleado numeric(5,2) not null default 5.5,
  nib_tope_mensual numeric(10,2) not null default 6000,
  nhip_tasa_empleador numeric(5,2) not null default 3.0,
  nhip_tasa_empleado numeric(5,2) not null default 3.0,
  nhip_tope_mensual numeric(10,2) not null default 7800,
  constraint configuracion_empresa_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  constraint configuracion_empresa_pkey PRIMARY KEY (empresa_id)
);

create table public.configuracion_sistema (
  id boolean not null default true,
  permitir_registro_empresas boolean not null default true,
  modo_mantenimiento boolean not null default false,
  umbral_extra_default time without time zone not null default '17:00:00'::time without time zone,
  constraint configuracion_sistema_id_check CHECK (id),
  constraint configuracion_sistema_pkey PRIMARY KEY (id)
);

create table public.cotizacion_items (
  id uuid not null default gen_random_uuid(),
  cotizacion_id uuid not null,
  descripcion text not null,
  cantidad numeric(10,2) not null default 1,
  precio_unitario numeric(10,2) not null,
  orden integer not null default 0,
  constraint cotizacion_items_cotizacion_id_fkey FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE,
  constraint cotizacion_items_pkey PRIMARY KEY (id)
);

create table public.cotizaciones (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null,
  cliente_id uuid not null,
  proyecto_id uuid,
  numero integer not null,
  fecha date not null default CURRENT_DATE,
  valida_hasta date,
  estado estado_cotizacion not null default 'borrador'::estado_cotizacion,
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notas text,
  creado_por uuid,
  creado_en timestamp with time zone not null default now(),
  constraint cotizaciones_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  constraint cotizaciones_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES usuarios(id),
  constraint cotizaciones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  constraint cotizaciones_empresa_id_numero_key UNIQUE (empresa_id, numero),
  constraint cotizaciones_pkey PRIMARY KEY (id),
  constraint cotizaciones_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES proyectos(id)
);

create table public.documentos_proyecto (
  id uuid not null default gen_random_uuid(),
  proyecto_id uuid not null,
  nombre text not null,
  tipo text not null default 'otro'::text,
  storage_path text not null,
  fecha_vencimiento date,
  subido_por uuid,
  subido_en timestamp with time zone not null default now(),
  constraint documentos_proyecto_pkey PRIMARY KEY (id),
  constraint documentos_proyecto_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
  constraint documentos_proyecto_subido_por_fkey FOREIGN KEY (subido_por) REFERENCES usuarios(id)
);

create table public.empresa_addons (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null,
  addon_id uuid not null,
  activo boolean not null default true,
  activado_en timestamp with time zone not null default now(),
  stripe_subscription_item_id text,
  constraint empresa_addons_addon_id_fkey FOREIGN KEY (addon_id) REFERENCES addons_catalogo(id),
  constraint empresa_addons_empresa_id_addon_id_key UNIQUE (empresa_id, addon_id),
  constraint empresa_addons_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  constraint empresa_addons_pkey PRIMARY KEY (id)
);

create table public.empresas (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  industria text,
  direccion text,
  telefono text,
  rnc_id_fiscal text,
  logo_url text,
  estado estado_empresa not null default 'trial'::estado_empresa,
  creado_en timestamp with time zone not null default now(),
  trial_termina_en timestamp with time zone,
  aviso_trial_enviado boolean not null default false,
  constraint empresas_pkey PRIMARY KEY (id)
);

create table public.entregas_materiales (
  id uuid not null default gen_random_uuid(),
  compra_id uuid not null,
  proyecto_id uuid not null,
  cantidad numeric(10,2) not null,
  costo_asignado numeric(10,2) not null,
  entregado_por uuid,
  entregado_en timestamp with time zone not null default now(),
  constraint entregas_materiales_compra_id_fkey FOREIGN KEY (compra_id) REFERENCES compras_materiales(id) ON DELETE CASCADE,
  constraint entregas_materiales_entregado_por_fkey FOREIGN KEY (entregado_por) REFERENCES usuarios(id),
  constraint entregas_materiales_pkey PRIMARY KEY (id),
  constraint entregas_materiales_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES proyectos(id)
);

create table public.equipo_asignaciones (
  id uuid not null default gen_random_uuid(),
  equipo_id uuid not null,
  proyecto_id uuid not null,
  condicion_entrega condicion_equipo not null default 'buena'::condicion_equipo,
  nota_entrega text,
  entregado_por uuid,
  entregado_en timestamp with time zone not null default now(),
  condicion_devolucion condicion_equipo,
  nota_devolucion text,
  recibido_por uuid,
  devuelto_en timestamp with time zone,
  constraint equipo_asignaciones_entregado_por_fkey FOREIGN KEY (entregado_por) REFERENCES usuarios(id),
  constraint equipo_asignaciones_equipo_id_fkey FOREIGN KEY (equipo_id) REFERENCES equipos_catalogo(id) ON DELETE CASCADE,
  constraint equipo_asignaciones_pkey PRIMARY KEY (id),
  constraint equipo_asignaciones_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
  constraint equipo_asignaciones_recibido_por_fkey FOREIGN KEY (recibido_por) REFERENCES usuarios(id)
);

create table public.equipos_catalogo (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null,
  nombre text not null,
  tipo text,
  numero_serie text,
  estado estado_equipo not null default 'activo'::estado_equipo,
  valor_reemplazo numeric(10,2),
  creado_en timestamp with time zone not null default now(),
  constraint equipos_catalogo_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  constraint equipos_catalogo_pkey PRIMARY KEY (id)
);

create table public.factura_items (
  id uuid not null default gen_random_uuid(),
  factura_id uuid not null,
  descripcion text not null,
  cantidad numeric(10,2) not null default 1,
  precio_unitario numeric(10,2) not null,
  orden integer not null default 0,
  constraint factura_items_factura_id_fkey FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE,
  constraint factura_items_pkey PRIMARY KEY (id)
);

create table public.facturas (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null,
  cliente_id uuid not null,
  proyecto_id uuid,
  cotizacion_id uuid,
  numero integer not null,
  fecha_emision date not null default CURRENT_DATE,
  fecha_vencimiento date,
  estado estado_factura not null default 'pendiente'::estado_factura,
  subtotal numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  fecha_pago date,
  notas text,
  creado_por uuid,
  creado_en timestamp with time zone not null default now(),
  constraint facturas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  constraint facturas_cotizacion_id_fkey FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id),
  constraint facturas_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES usuarios(id),
  constraint facturas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  constraint facturas_empresa_id_numero_key UNIQUE (empresa_id, numero),
  constraint facturas_pkey PRIMARY KEY (id),
  constraint facturas_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES proyectos(id)
);

create table public.historial_tarifas (
  id uuid not null default gen_random_uuid(),
  usuario_id uuid not null,
  tarifa_anterior numeric(10,2) not null,
  tarifa_nueva numeric(10,2) not null,
  motivo text,
  fecha_cambio timestamp with time zone not null default now(),
  constraint historial_tarifas_pkey PRIMARY KEY (id),
  constraint historial_tarifas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

create table public.materiales_catalogo (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null,
  nombre text not null,
  unidad text not null,
  costo_referencial numeric(10,2),
  activo boolean not null default true,
  creado_en timestamp with time zone not null default now(),
  constraint materiales_catalogo_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  constraint materiales_catalogo_pkey PRIMARY KEY (id)
);

create table public.notificaciones (
  id uuid not null default gen_random_uuid(),
  usuario_id uuid not null,
  tipo text not null,
  canal canal_notificacion not null,
  mensaje text not null,
  leido boolean not null default false,
  creado_en timestamp with time zone not null default now(),
  constraint notificaciones_pkey PRIMARY KEY (id),
  constraint notificaciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

create table public.pago_proyecto_detalle (
  id uuid not null default gen_random_uuid(),
  pago_id uuid not null,
  proyecto_id uuid not null,
  horas numeric(6,2) not null default 0,
  costo numeric(10,2) not null default 0,
  constraint pago_proyecto_detalle_pago_id_fkey FOREIGN KEY (pago_id) REFERENCES pagos_semanales(id) ON DELETE CASCADE,
  constraint pago_proyecto_detalle_pkey PRIMARY KEY (id),
  constraint pago_proyecto_detalle_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES proyectos(id)
);

create table public.pagos_semanales (
  id uuid not null default gen_random_uuid(),
  usuario_id uuid not null,
  semana_id uuid not null,
  horas_normales numeric(6,2) not null default 0,
  horas_extra numeric(6,2) not null default 0,
  bruto numeric(10,2) not null default 0,
  descuento_seguro numeric(10,2) not null default 0,
  descuento_prestamo numeric(10,2) not null default 0,
  neto numeric(10,2) not null default 0,
  firma_digital_en timestamp with time zone,
  estado text not null default 'pendiente'::text,
  descuento_nib numeric(10,2) not null default 0,
  descuento_nhip numeric(10,2) not null default 0,
  aporte_patronal_nib numeric(10,2) not null default 0,
  aporte_patronal_nhip numeric(10,2) not null default 0,
  constraint pagos_semanales_pkey PRIMARY KEY (id),
  constraint pagos_semanales_semana_id_fkey FOREIGN KEY (semana_id) REFERENCES semanas_pago(id),
  constraint pagos_semanales_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  constraint pagos_semanales_usuario_id_semana_id_key UNIQUE (usuario_id, semana_id)
);

create table public.perfil_nomina (
  usuario_id uuid not null,
  oficio text not null,
  tarifa_hora numeric(10,2) not null,
  porcentaje_seguro numeric(5,2) not null default 0,
  metodo_pago metodo_pago not null default 'transfer'::metodo_pago,
  cuenta_bancaria text,
  requiere_gps boolean not null default true,
  requiere_permiso_trabajo boolean not null default false,
  permiso_trabajo_numero text,
  permiso_trabajo_vencimiento date,
  permiso_trabajo_aviso_enviado boolean not null default false,
  constraint perfil_nomina_pkey PRIMARY KEY (usuario_id),
  constraint perfil_nomina_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

create table public.planes (
  id uuid not null default gen_random_uuid(),
  clave clave_plan not null,
  nombre text not null,
  precio_mensual numeric(10,2) not null default 0,
  limite_trabajadores integer,
  limite_proyectos integer,
  historial_semanas integer,
  activo boolean not null default true,
  constraint planes_clave_key UNIQUE (clave),
  constraint planes_pkey PRIMARY KEY (id)
);

create table public.prestamo_descuentos (
  id uuid not null default gen_random_uuid(),
  prestamo_id uuid not null,
  semana_id uuid not null,
  monto numeric(10,2) not null,
  constraint prestamo_descuentos_pkey PRIMARY KEY (id),
  constraint prestamo_descuentos_prestamo_id_fkey FOREIGN KEY (prestamo_id) REFERENCES prestamos(id) ON DELETE CASCADE,
  constraint prestamo_descuentos_semana_id_fkey FOREIGN KEY (semana_id) REFERENCES semanas_pago(id)
);

create table public.prestamos (
  id uuid not null default gen_random_uuid(),
  usuario_id uuid not null,
  monto_total numeric(10,2) not null,
  saldo_pendiente numeric(10,2) not null,
  estado estado_prestamo not null default 'activo'::estado_prestamo,
  otorgado_en timestamp with time zone not null default now(),
  constraint prestamos_pkey PRIMARY KEY (id),
  constraint prestamos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

create table public.proyecto_supervisores (
  proyecto_id uuid not null,
  usuario_id uuid not null,
  constraint proyecto_supervisores_pkey PRIMARY KEY (proyecto_id, usuario_id),
  constraint proyecto_supervisores_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
  constraint proyecto_supervisores_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

create table public.proyecto_trabajadores (
  proyecto_id uuid not null,
  usuario_id uuid not null,
  asignado_en timestamp with time zone not null default now(),
  constraint proyecto_trabajadores_pkey PRIMARY KEY (proyecto_id, usuario_id),
  constraint proyecto_trabajadores_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
  constraint proyecto_trabajadores_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

create table public.proyectos (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null,
  nombre text not null,
  ubicacion text,
  supervisor_principal_id uuid,
  presupuesto numeric(12,2),
  geo_cerca_activa boolean not null default false,
  geo_cerca_radio_m integer default 250,
  estado estado_proyecto not null default 'activo'::estado_proyecto,
  creado_en timestamp with time zone not null default now(),
  geo_cerca_lat numeric(10,7),
  geo_cerca_lng numeric(10,7),
  constraint proyectos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  constraint proyectos_pkey PRIMARY KEY (id),
  constraint proyectos_supervisor_principal_id_fkey FOREIGN KEY (supervisor_principal_id) REFERENCES usuarios(id)
);

create table public.registros_horas (
  id uuid not null default gen_random_uuid(),
  usuario_id uuid not null,
  proyecto_id uuid not null,
  semana_id uuid not null,
  hora_entrada timestamp with time zone not null,
  hora_salida timestamp with time zone,
  ubicacion_entrada point,
  ubicacion_salida point,
  horas_normales numeric(5,2) not null default 0,
  horas_extra numeric(5,2) not null default 0,
  estado estado_registro_horas not null default 'pendiente'::estado_registro_horas,
  aprobado_por uuid,
  fecha_aprobacion timestamp with time zone,
  creado_en timestamp with time zone not null default now(),
  pago_semanal_id uuid,
  fuera_geo_cerca_entrada boolean not null default false,
  fuera_geo_cerca_salida boolean not null default false,
  constraint registros_horas_aprobado_por_fkey FOREIGN KEY (aprobado_por) REFERENCES usuarios(id),
  constraint registros_horas_pago_semanal_id_fkey FOREIGN KEY (pago_semanal_id) REFERENCES pagos_semanales(id),
  constraint registros_horas_pkey PRIMARY KEY (id),
  constraint registros_horas_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES proyectos(id) ON DELETE CASCADE,
  constraint registros_horas_semana_id_fkey FOREIGN KEY (semana_id) REFERENCES semanas_pago(id),
  constraint registros_horas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

create table public.semanas_pago (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null,
  fecha_inicio date not null,
  fecha_cierre timestamp with time zone not null,
  fecha_pago date not null,
  estado estado_semana not null default 'abierta'::estado_semana,
  constraint semanas_pago_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  constraint semanas_pago_pkey PRIMARY KEY (id)
);

create table public.stripe_webhook_events (
  stripe_event_id text not null,
  type text not null,
  received_at timestamp with time zone not null default now(),
  constraint stripe_webhook_events_pkey PRIMARY KEY (stripe_event_id)
);

create table public.suscripciones (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null,
  plan_id uuid not null,
  facturacion text not null default 'monthly'::text,
  fecha_inicio date not null default CURRENT_DATE,
  fecha_renovacion date not null,
  estado text not null default 'active'::text,
  stripe_customer_id text,
  stripe_subscription_id text,
  constraint suscripciones_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  constraint suscripciones_empresa_id_key UNIQUE (empresa_id),
  constraint suscripciones_pkey PRIMARY KEY (id),
  constraint suscripciones_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES planes(id)
);

create table public.usuarios (
  id uuid not null,
  empresa_id uuid,
  nombre text not null,
  email text not null,
  rol rol_usuario not null default 'trabajador'::rol_usuario,
  idioma_preferido text not null default 'es'::text,
  estado text not null default 'activo'::text,
  creado_en timestamp with time zone not null default now(),
  telefono text,
  constraint usuarios_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  constraint usuarios_pkey PRIMARY KEY (id)
);

create table public.vehiculo_asignaciones (
  id uuid not null default gen_random_uuid(),
  vehiculo_id uuid not null,
  proyecto_id uuid not null,
  conductor_id uuid,
  entregado_por uuid,
  entregado_en timestamp with time zone not null default now(),
  recibido_por uuid,
  devuelto_en timestamp with time zone,
  constraint vehiculo_asignaciones_conductor_id_fkey FOREIGN KEY (conductor_id) REFERENCES usuarios(id),
  constraint vehiculo_asignaciones_entregado_por_fkey FOREIGN KEY (entregado_por) REFERENCES usuarios(id),
  constraint vehiculo_asignaciones_pkey PRIMARY KEY (id),
  constraint vehiculo_asignaciones_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES proyectos(id),
  constraint vehiculo_asignaciones_recibido_por_fkey FOREIGN KEY (recibido_por) REFERENCES usuarios(id),
  constraint vehiculo_asignaciones_vehiculo_id_fkey FOREIGN KEY (vehiculo_id) REFERENCES vehiculos_catalogo(id) ON DELETE CASCADE
);

create table public.vehiculo_gastos (
  id uuid not null default gen_random_uuid(),
  vehiculo_id uuid not null,
  tipo text not null default 'gasolina'::text,
  monto numeric(10,2) not null,
  nota text,
  reportado_por uuid,
  reportado_en timestamp with time zone not null default now(),
  constraint vehiculo_gastos_pkey PRIMARY KEY (id),
  constraint vehiculo_gastos_reportado_por_fkey FOREIGN KEY (reportado_por) REFERENCES usuarios(id),
  constraint vehiculo_gastos_vehiculo_id_fkey FOREIGN KEY (vehiculo_id) REFERENCES vehiculos_catalogo(id) ON DELETE CASCADE
);

create table public.vehiculos_catalogo (
  id uuid not null default gen_random_uuid(),
  empresa_id uuid not null,
  nombre text not null,
  placa text,
  tipo text,
  estado estado_vehiculo not null default 'activo'::estado_vehiculo,
  proximo_mantenimiento date,
  aviso_mantenimiento_enviado boolean not null default false,
  creado_en timestamp with time zone not null default now(),
  constraint vehiculos_catalogo_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  constraint vehiculos_catalogo_pkey PRIMARY KEY (id)
);

CREATE OR REPLACE FUNCTION public.avisar_certificacion_por_vencer()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cert record;
  admin_row record;
  v_mensaje text;
  v_empresa_id uuid;
  v_nombre_trabajador text;
begin
  for cert in
    select ct.id, ct.usuario_id, ct.nombre, ct.fecha_vencimiento, u.empresa_id, u.nombre as trabajador_nombre
    from certificaciones_trabajador ct
    join usuarios u on u.id = ct.usuario_id
    where ct.aviso_enviado = false
      and ct.fecha_vencimiento is not null
      and ct.fecha_vencimiento <= (current_date + interval '15 days')
  loop
    v_mensaje := 'La certificación "' || cert.nombre || '" de ' || cert.trabajador_nombre ||
                 ' vence el ' || to_char(cert.fecha_vencimiento, 'DD/MM/YYYY') || '.';

    for admin_row in
      select u.id, coalesce(ce.canal_whatsapp, true) as canal_whatsapp,
             coalesce(ce.canal_email, true) as canal_email,
             coalesce(ce.canal_push, true) as canal_push
      from usuarios u
      left join configuracion_empresa ce on ce.empresa_id = u.empresa_id
      where u.empresa_id = cert.empresa_id and u.rol = 'admin'
    loop
      if admin_row.canal_whatsapp then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'certificacion_por_vencer', 'whatsapp', v_mensaje);
      end if;
      if admin_row.canal_email then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'certificacion_por_vencer', 'email', v_mensaje);
      end if;
      if admin_row.canal_push then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'certificacion_por_vencer', 'push', v_mensaje);
      end if;
    end loop;

    update certificaciones_trabajador set aviso_enviado = true where id = cert.id;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.avisar_equipo_danado_perdido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  admin_row record;
  v_mensaje text;
begin
  if NEW.estado not in ('dañado', 'perdido') or OLD.estado is not distinct from NEW.estado then
    return NEW;
  end if;

  v_mensaje := 'El equipo "' || NEW.nombre || '" se marcó como ' || NEW.estado || '.';

  for admin_row in
    select u.id, coalesce(ce.canal_whatsapp, true) as canal_whatsapp,
           coalesce(ce.canal_email, true) as canal_email,
           coalesce(ce.canal_push, true) as canal_push
    from usuarios u
    left join configuracion_empresa ce on ce.empresa_id = u.empresa_id
    where u.empresa_id = NEW.empresa_id and u.rol = 'admin'
  loop
    if admin_row.canal_whatsapp then
      insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'equipo_danado', 'whatsapp', v_mensaje);
    end if;
    if admin_row.canal_email then
      insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'equipo_danado', 'email', v_mensaje);
    end if;
    if admin_row.canal_push then
      insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'equipo_danado', 'push', v_mensaje);
    end if;
  end loop;

  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.avisar_fuera_geo_cerca()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.avisar_mantenimiento_por_vencer()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v record;
  admin_row record;
  v_mensaje text;
begin
  for v in
    select id, empresa_id, nombre, proximo_mantenimiento
    from vehiculos_catalogo
    where estado = 'activo'
      and aviso_mantenimiento_enviado = false
      and proximo_mantenimiento is not null
      and proximo_mantenimiento <= (current_date + interval '3 days')
  loop
    v_mensaje := 'El vehículo "' || v.nombre || '" tiene mantenimiento programado para el ' ||
                 to_char(v.proximo_mantenimiento, 'DD/MM/YYYY') || '.';

    for admin_row in
      select u.id, coalesce(ce.canal_whatsapp, true) as canal_whatsapp,
             coalesce(ce.canal_email, true) as canal_email,
             coalesce(ce.canal_push, true) as canal_push
      from usuarios u
      left join configuracion_empresa ce on ce.empresa_id = u.empresa_id
      where u.empresa_id = v.empresa_id and u.rol = 'admin'
    loop
      if admin_row.canal_whatsapp then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'mantenimiento_vehiculo', 'whatsapp', v_mensaje);
      end if;
      if admin_row.canal_email then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'mantenimiento_vehiculo', 'email', v_mensaje);
      end if;
      if admin_row.canal_push then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'mantenimiento_vehiculo', 'push', v_mensaje);
      end if;
    end loop;

    update vehiculos_catalogo set aviso_mantenimiento_enviado = true where id = v.id;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.avisar_permiso_trabajo_por_vencer()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  perm record;
  admin_row record;
  v_mensaje text;
begin
  for perm in
    select pn.usuario_id, pn.permiso_trabajo_vencimiento, u.nombre as trabajador_nombre, u.empresa_id
    from perfil_nomina pn
    join usuarios u on u.id = pn.usuario_id
    where pn.requiere_permiso_trabajo = true
      and pn.permiso_trabajo_aviso_enviado = false
      and pn.permiso_trabajo_vencimiento is not null
      and pn.permiso_trabajo_vencimiento <= (current_date + interval '3 months')
  loop
    v_mensaje := 'El permiso de trabajo de ' || perm.trabajador_nombre ||
                 ' vence el ' || to_char(perm.permiso_trabajo_vencimiento, 'DD/MM/YYYY') || '.';

    for admin_row in
      select u.id, coalesce(ce.canal_whatsapp, true) as canal_whatsapp,
             coalesce(ce.canal_email, true) as canal_email,
             coalesce(ce.canal_push, true) as canal_push
      from usuarios u
      left join configuracion_empresa ce on ce.empresa_id = u.empresa_id
      where u.empresa_id = perm.empresa_id and u.rol = 'admin'
    loop
      if admin_row.canal_whatsapp then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'permiso_trabajo_por_vencer', 'whatsapp', v_mensaje);
      end if;
      if admin_row.canal_email then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'permiso_trabajo_por_vencer', 'email', v_mensaje);
      end if;
      if admin_row.canal_push then
        insert into notificaciones (usuario_id, tipo, canal, mensaje) values (admin_row.id, 'permiso_trabajo_por_vencer', 'push', v_mensaje);
      end if;
    end loop;

    update perfil_nomina set permiso_trabajo_aviso_enviado = true where usuario_id = perm.usuario_id;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.avisar_trials_por_vencer()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e record;
  admin_row record;
  v_mensaje text;
begin
  for e in
    select id, nombre, trial_termina_en
    from empresas
    where estado = 'trial'
      and aviso_trial_enviado = false
      and trial_termina_en > now()
      and trial_termina_en <= now() + interval '3 days'
  loop
    v_mensaje := 'Tu prueba de OBRAPAY vence el ' || to_char(e.trial_termina_en, 'DD/MM/YYYY') ||
                 '. Elige un plan para no perder geo-cerca, alertas de sobrepresupuesto y firma digital.';

    for admin_row in
      select u.id, coalesce(ce.canal_whatsapp, true) as canal_whatsapp,
             coalesce(ce.canal_email, true) as canal_email,
             coalesce(ce.canal_push, true) as canal_push
      from usuarios u
      left join configuracion_empresa ce on ce.empresa_id = u.empresa_id
      where u.empresa_id = e.id and u.rol = 'admin'
    loop
      if admin_row.canal_whatsapp then
        insert into notificaciones (usuario_id, tipo, canal, mensaje)
          values (admin_row.id, 'prueba_por_vencer', 'whatsapp', v_mensaje);
      end if;
      if admin_row.canal_email then
        insert into notificaciones (usuario_id, tipo, canal, mensaje)
          values (admin_row.id, 'prueba_por_vencer', 'email', v_mensaje);
      end if;
      if admin_row.canal_push then
        insert into notificaciones (usuario_id, tipo, canal, mensaje)
          values (admin_row.id, 'prueba_por_vencer', 'push', v_mensaje);
      end if;
    end loop;

    update empresas set aviso_trial_enviado = true where id = e.id;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cerrar_semana_actual(p_empresa_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_semana_id uuid;
  v_semana_fecha_inicio date;
  v_nueva_semana_id uuid;
  v_nib_tasa_empleador numeric; v_nib_tasa_empleado numeric; v_nib_tope numeric;
  v_nhip_tasa_empleador numeric; v_nhip_tasa_empleado numeric; v_nhip_tope numeric;
  v_reg record;
  v_bruto_acumulado_antes numeric;
  v_nib_contribuible numeric;
  v_nhip_contribuible numeric;
  v_descuento_seguro numeric;
  v_pago_id uuid;
begin
  select id, fecha_inicio into v_semana_id, v_semana_fecha_inicio from semanas_pago
    where empresa_id = p_empresa_id and estado = 'abierta'
    order by fecha_inicio desc limit 1;

  if v_semana_id is null then
    raise exception 'No hay semana abierta para la empresa %', p_empresa_id;
  end if;

  select coalesce(nib_tasa_empleador, 6.5), coalesce(nib_tasa_empleado, 5.5), coalesce(nib_tope_mensual, 6000),
         coalesce(nhip_tasa_empleador, 3.0), coalesce(nhip_tasa_empleado, 3.0), coalesce(nhip_tope_mensual, 7800)
    into v_nib_tasa_empleador, v_nib_tasa_empleado, v_nib_tope,
         v_nhip_tasa_empleador, v_nhip_tasa_empleado, v_nhip_tope
    from configuracion_empresa where empresa_id = p_empresa_id;

  update registros_horas
    set estado = 'cerrado_automatico'
    where usuario_id in (select id from usuarios where empresa_id = p_empresa_id)
      and hora_salida is null
      and estado = 'pendiente';

  update semanas_pago set estado = 'cerrada' where id = v_semana_id;

  for v_reg in
    select rh.usuario_id, sum(rh.horas_normales) as horas_normales, sum(rh.horas_extra) as horas_extra,
           sum((rh.horas_normales + rh.horas_extra) * pn.tarifa_hora) as bruto
    from registros_horas rh
    join perfil_nomina pn on pn.usuario_id = rh.usuario_id
    where rh.usuario_id in (select id from usuarios where empresa_id = p_empresa_id)
      and rh.estado in ('aprobado_supervisor', 'aprobado_admin_tarde')
      and rh.pago_semanal_id is null
    group by rh.usuario_id
  loop
    v_pago_id := null;

    select coalesce(sum(ps.bruto), 0) into v_bruto_acumulado_antes
      from pagos_semanales ps
      join semanas_pago sp on sp.id = ps.semana_id
      where ps.usuario_id = v_reg.usuario_id
        and date_trunc('month', sp.fecha_inicio) = date_trunc('month', v_semana_fecha_inicio);

    v_nib_contribuible := least(v_bruto_acumulado_antes + v_reg.bruto, v_nib_tope) - least(v_bruto_acumulado_antes, v_nib_tope);
    v_nhip_contribuible := least(v_bruto_acumulado_antes + v_reg.bruto, v_nhip_tope) - least(v_bruto_acumulado_antes, v_nhip_tope);

    v_descuento_seguro := v_nib_contribuible * (v_nib_tasa_empleado / 100.0) + v_nhip_contribuible * (v_nhip_tasa_empleado / 100.0);

    insert into pagos_semanales
      (usuario_id, semana_id, horas_normales, horas_extra, bruto,
       descuento_nib, descuento_nhip, aporte_patronal_nib, aporte_patronal_nhip,
       descuento_seguro, descuento_prestamo, neto, estado)
    values (
      v_reg.usuario_id, v_semana_id, v_reg.horas_normales, v_reg.horas_extra, v_reg.bruto,
      v_nib_contribuible * (v_nib_tasa_empleado / 100.0),
      v_nhip_contribuible * (v_nhip_tasa_empleado / 100.0),
      v_nib_contribuible * (v_nib_tasa_empleador / 100.0),
      v_nhip_contribuible * (v_nhip_tasa_empleador / 100.0),
      v_descuento_seguro, 0, v_reg.bruto - v_descuento_seguro, 'pendiente'
    )
    on conflict (usuario_id, semana_id) do nothing
    returning id into v_pago_id;

    if v_pago_id is not null then
      update registros_horas
        set pago_semanal_id = v_pago_id
        where usuario_id = v_reg.usuario_id
          and estado in ('aprobado_supervisor', 'aprobado_admin_tarde')
          and pago_semanal_id is null;
    end if;
  end loop;

  insert into pago_proyecto_detalle (pago_id, proyecto_id, horas, costo)
  select
    p.id,
    r.proyecto_id,
    sum(r.horas_normales + r.horas_extra),
    sum((r.horas_normales + r.horas_extra) * pn.tarifa_hora)
  from registros_horas r
  join perfil_nomina pn on pn.usuario_id = r.usuario_id
  join pagos_semanales p on p.usuario_id = r.usuario_id and p.semana_id = v_semana_id
  where r.pago_semanal_id = p.id
  group by p.id, r.proyecto_id;

  insert into semanas_pago (empresa_id, fecha_inicio, fecha_cierre, fecha_pago, estado)
  select
    p_empresa_id,
    (fecha_cierre::date + 1),
    (fecha_cierre + interval '7 days'),
    (fecha_cierre::date + 2),
    'abierta'
  from semanas_pago where id = v_semana_id
  returning id into v_nueva_semana_id;

  return v_nueva_semana_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cerrar_semanas_vencidas()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
begin
  for s in
    select distinct empresa_id from semanas_pago
    where estado = 'abierta' and fecha_cierre <= now()
  loop
    perform cerrar_semana_actual(s.empresa_id);
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cerrar_turnos_del_dia()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
begin
  for r in
    select rh.id, rh.hora_entrada, rh.usuario_id, ce.hora_inicio_extra
    from registros_horas rh
    join usuarios u on u.id = rh.usuario_id
    join configuracion_empresa ce on ce.empresa_id = u.empresa_id
    where rh.hora_salida is null
      and rh.estado = 'pendiente'
      and (now() at time zone 'America/Grand_Turk')::time >= ce.hora_inicio_extra
      and (rh.hora_entrada at time zone 'America/Grand_Turk')::date
        = (now() at time zone 'America/Grand_Turk')::date
  loop
    update registros_horas
      set estado = 'cerrado_automatico'
      where id = r.id;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.confirmar_pago_semanal(p_pago_id uuid, p_descuento_prestamo numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pago record;
  v_prestamo_id uuid;
begin
  select * into v_pago from pagos_semanales where id = p_pago_id;
  if v_pago is null then
    raise exception 'Pago no encontrado';
  end if;

  if not exists (
    select 1 from usuarios admin
    join usuarios trabajador on trabajador.empresa_id = admin.empresa_id
    where admin.id = auth.uid() and admin.rol = 'admin' and trabajador.id = v_pago.usuario_id
  ) then
    raise exception 'No autorizado';
  end if;

  update pagos_semanales
    set descuento_prestamo = p_descuento_prestamo,
        neto = bruto - descuento_seguro - p_descuento_prestamo,
        estado = 'pagado'
    where id = p_pago_id;

  if p_descuento_prestamo > 0 then
    select id into v_prestamo_id from prestamos
      where usuario_id = v_pago.usuario_id and estado = 'activo'
      order by otorgado_en asc limit 1;

    if v_prestamo_id is not null then
      insert into prestamo_descuentos (prestamo_id, semana_id, monto)
        values (v_prestamo_id, v_pago.semana_id, p_descuento_prestamo);

      update prestamos
        set saldo_pendiente = greatest(0, saldo_pendiente - p_descuento_prestamo),
            estado = case when saldo_pendiente - p_descuento_prestamo <= 0 then 'pagado' else 'activo' end
        where id = v_prestamo_id;
    end if;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.distancia_metros(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select 6371000 * acos(
    least(1::double precision, greatest(-1::double precision,
      cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2 - lng1)) +
      sin(radians(lat1)) * sin(radians(lat2))
    ))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.empresa_actual()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select empresa_id from usuarios where id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.es_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from usuarios
    where id = auth.uid() and rol = 'admin' and empresa_id = empresa_actual()
  )
$function$
;

CREATE OR REPLACE FUNCTION public.es_comprador()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from usuarios where id = auth.uid() and rol = 'comprador' and empresa_id = empresa_actual()
  )
$function$
;

CREATE OR REPLACE FUNCTION public.es_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from usuarios where id = auth.uid() and rol = 'owner'
  )
$function$
;

CREATE OR REPLACE FUNCTION public.marcar_facturas_vencidas()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update facturas
    set estado = 'vencida'
    where estado = 'pendiente' and fecha_vencimiento is not null and fecha_vencimiento < current_date;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.proyectos_a_cargo()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from proyectos where supervisor_principal_id = auth.uid()
  union
  select proyecto_id from proyecto_supervisores where usuario_id = auth.uid()
$function$
;

CREATE OR REPLACE FUNCTION public.vencer_trials()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e record;
  v_plan_gratuito uuid;
begin
  select id into v_plan_gratuito from planes where clave = 'free';

  for e in
    select em.id, s.stripe_subscription_id
    from empresas em
    join suscripciones s on s.empresa_id = em.id
    where em.estado = 'trial' and em.trial_termina_en <= now()
  loop
    if e.stripe_subscription_id is null then
      update suscripciones
        set plan_id = v_plan_gratuito,
            fecha_renovacion = now() + interval '30 days'
        where empresa_id = e.id;
    end if;

    update empresas set estado = 'active' where id = e.id;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.verificar_geo_cerca()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_activa boolean;
  v_lat double precision; v_lng double precision; v_radio int;
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
$function$
;

create policy addons_catalogo_select on public.addons_catalogo for SELECT to public using (true);

create policy addons_catalogo_write on public.addons_catalogo for ALL to public using (es_owner()) with check (es_owner());

create policy auditoria_select on public.auditoria for SELECT to public using ((es_owner() OR (es_admin() AND (empresa_id = empresa_actual()))));

create policy catalogo_oficios_select on public.catalogo_oficios for SELECT to public using (true);

create policy catalogo_oficios_write on public.catalogo_oficios for ALL to public using (es_owner()) with check (es_owner());

create policy certificaciones_select on public.certificaciones_trabajador for SELECT to public using ((es_owner() OR (usuario_id = auth.uid()) OR (es_admin() AND (usuario_id IN ( SELECT usuarios.id
   FROM usuarios
  WHERE (usuarios.empresa_id = empresa_actual()))))));

create policy certificaciones_write on public.certificaciones_trabajador for ALL to public using ((es_admin() AND (usuario_id IN ( SELECT usuarios.id
   FROM usuarios
  WHERE (usuarios.empresa_id = empresa_actual()))))) with check ((es_admin() AND (usuario_id IN ( SELECT usuarios.id
   FROM usuarios
  WHERE (usuarios.empresa_id = empresa_actual())))));

create policy clientes_acceso on public.clientes for ALL to public using ((es_owner() OR (es_admin() AND (empresa_id = empresa_actual())))) with check ((es_owner() OR (es_admin() AND (empresa_id = empresa_actual()))));

create policy compras_materiales_delete on public.compras_materiales for DELETE to public using ((es_admin() AND (empresa_id = empresa_actual())));

create policy compras_materiales_insert on public.compras_materiales for INSERT to public with check (((empresa_id = empresa_actual()) AND (auth.uid() IN ( SELECT usuarios.id
   FROM usuarios
  WHERE ((usuarios.empresa_id = empresa_actual()) AND (usuarios.rol = ANY (ARRAY['admin'::rol_usuario, 'supervisor'::rol_usuario, 'comprador'::rol_usuario])))))));

create policy compras_materiales_select on public.compras_materiales for SELECT to public using ((es_owner() OR ((empresa_id = empresa_actual()) AND (auth.uid() IN ( SELECT usuarios.id
   FROM usuarios
  WHERE ((usuarios.empresa_id = empresa_actual()) AND (usuarios.rol = ANY (ARRAY['admin'::rol_usuario, 'supervisor'::rol_usuario, 'comprador'::rol_usuario]))))))));

create policy compras_materiales_update on public.compras_materiales for UPDATE to public using ((es_admin() AND (empresa_id = empresa_actual()))) with check ((es_admin() AND (empresa_id = empresa_actual())));

create policy configuracion_empresa_select on public.configuracion_empresa for SELECT to public using ((es_owner() OR (empresa_id = empresa_actual())));

create policy configuracion_empresa_write on public.configuracion_empresa for ALL to public using ((es_admin() AND (empresa_id = empresa_actual()))) with check ((es_admin() AND (empresa_id = empresa_actual())));

create policy configuracion_sistema_acceso on public.configuracion_sistema for ALL to public using (es_owner()) with check (es_owner());

create policy cotizacion_items_acceso on public.cotizacion_items for ALL to public using ((es_owner() OR (EXISTS ( SELECT 1
   FROM cotizaciones c
  WHERE ((c.id = cotizacion_items.cotizacion_id) AND es_admin() AND (c.empresa_id = empresa_actual())))))) with check ((es_owner() OR (EXISTS ( SELECT 1
   FROM cotizaciones c
  WHERE ((c.id = cotizacion_items.cotizacion_id) AND es_admin() AND (c.empresa_id = empresa_actual()))))));

create policy cotizaciones_acceso on public.cotizaciones for ALL to public using ((es_owner() OR (es_admin() AND (empresa_id = empresa_actual())))) with check ((es_owner() OR (es_admin() AND (empresa_id = empresa_actual()))));

create policy documentos_proyecto_delete on public.documentos_proyecto for DELETE to public using ((es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual())))));

create policy documentos_proyecto_insert on public.documentos_proyecto for INSERT to public with check (((proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR (es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual()))))));

create policy documentos_proyecto_select on public.documentos_proyecto for SELECT to public using ((es_owner() OR (proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR (es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual()))))));

create policy empresa_addons_acceso on public.empresa_addons for ALL to public using ((es_owner() OR (empresa_id = empresa_actual()))) with check ((es_owner() OR (empresa_id = empresa_actual())));

create policy empresas_acceso on public.empresas for SELECT to public using ((es_owner() OR (id = empresa_actual())));

create policy empresas_insert on public.empresas for INSERT to public with check (es_owner());

create policy empresas_update on public.empresas for UPDATE to public using ((es_owner() OR (id = empresa_actual())));

create policy entregas_materiales_delete on public.entregas_materiales for DELETE to public using ((es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual())))));

create policy entregas_materiales_insert on public.entregas_materiales for INSERT to public with check (((proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR (es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual())))) OR (es_comprador() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual()))))));

create policy entregas_materiales_select on public.entregas_materiales for SELECT to public using ((es_owner() OR (proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR (es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual())))) OR (EXISTS ( SELECT 1
   FROM compras_materiales c
  WHERE ((c.id = entregas_materiales.compra_id) AND es_comprador() AND (c.empresa_id = empresa_actual()))))));

create policy equipo_asignaciones_insert on public.equipo_asignaciones for INSERT to public with check (((proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR (es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual()))))));

create policy equipo_asignaciones_select on public.equipo_asignaciones for SELECT to public using ((es_owner() OR (proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR (es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual()))))));

create policy equipo_asignaciones_update on public.equipo_asignaciones for UPDATE to public using (((proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR (es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual())))))) with check (((proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR (es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual()))))));

create policy equipos_catalogo_delete on public.equipos_catalogo for DELETE to public using ((es_admin() AND (empresa_id = empresa_actual())));

create policy equipos_catalogo_insert on public.equipos_catalogo for INSERT to public with check ((es_admin() AND (empresa_id = empresa_actual())));

create policy equipos_catalogo_select on public.equipos_catalogo for SELECT to public using ((es_owner() OR (empresa_id = empresa_actual())));

create policy equipos_catalogo_update on public.equipos_catalogo for UPDATE to public using ((es_admin() OR ((empresa_id = empresa_actual()) AND (auth.uid() IN ( SELECT usuarios.id
   FROM usuarios
  WHERE ((usuarios.empresa_id = empresa_actual()) AND (usuarios.rol = 'supervisor'::rol_usuario))))))) with check ((es_admin() OR ((empresa_id = empresa_actual()) AND (auth.uid() IN ( SELECT usuarios.id
   FROM usuarios
  WHERE ((usuarios.empresa_id = empresa_actual()) AND (usuarios.rol = 'supervisor'::rol_usuario)))))));

create policy factura_items_acceso on public.factura_items for ALL to public using ((es_owner() OR (EXISTS ( SELECT 1
   FROM facturas f
  WHERE ((f.id = factura_items.factura_id) AND es_admin() AND (f.empresa_id = empresa_actual())))))) with check ((es_owner() OR (EXISTS ( SELECT 1
   FROM facturas f
  WHERE ((f.id = factura_items.factura_id) AND es_admin() AND (f.empresa_id = empresa_actual()))))));

create policy facturas_acceso on public.facturas for ALL to public using ((es_owner() OR (es_admin() AND (empresa_id = empresa_actual())))) with check ((es_owner() OR (es_admin() AND (empresa_id = empresa_actual()))));

create policy historial_tarifas_select on public.historial_tarifas for SELECT to public using ((es_owner() OR (usuario_id = auth.uid()) OR (es_admin() AND (usuario_id IN ( SELECT usuarios.id
   FROM usuarios
  WHERE (usuarios.empresa_id = empresa_actual()))))));

create policy materiales_catalogo_select on public.materiales_catalogo for SELECT to public using ((es_owner() OR (empresa_id = empresa_actual())));

create policy materiales_catalogo_write on public.materiales_catalogo for ALL to public using ((es_admin() AND (empresa_id = empresa_actual()))) with check ((es_admin() AND (empresa_id = empresa_actual())));

create policy notificaciones_acceso on public.notificaciones for SELECT to public using ((usuario_id = auth.uid()));

create policy pago_proyecto_detalle_select on public.pago_proyecto_detalle for SELECT to public using ((es_owner() OR (EXISTS ( SELECT 1
   FROM pagos_semanales p
  WHERE ((p.id = pago_proyecto_detalle.pago_id) AND ((p.usuario_id = auth.uid()) OR (es_admin() AND (p.usuario_id IN ( SELECT usuarios.id
           FROM usuarios
          WHERE (usuarios.empresa_id = empresa_actual()))))))))));

create policy pagos_semanales_select on public.pagos_semanales for SELECT to public using ((es_owner() OR (usuario_id = auth.uid()) OR (es_admin() AND (usuario_id IN ( SELECT usuarios.id
   FROM usuarios
  WHERE (usuarios.empresa_id = empresa_actual()))))));

create policy perfil_nomina_select on public.perfil_nomina for SELECT to public using ((es_owner() OR (usuario_id = auth.uid()) OR (es_admin() AND (usuario_id IN ( SELECT usuarios.id
   FROM usuarios
  WHERE (usuarios.empresa_id = empresa_actual())))) OR (usuario_id IN ( SELECT ut.usuario_id
   FROM proyecto_trabajadores ut
  WHERE (ut.proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo))))));

create policy perfil_nomina_write on public.perfil_nomina for ALL to public using ((es_admin() AND (usuario_id IN ( SELECT usuarios.id
   FROM usuarios
  WHERE (usuarios.empresa_id = empresa_actual()))))) with check ((es_admin() AND (usuario_id IN ( SELECT usuarios.id
   FROM usuarios
  WHERE (usuarios.empresa_id = empresa_actual())))));

create policy planes_select on public.planes for SELECT to public using (true);

create policy planes_write on public.planes for ALL to public using (es_owner()) with check (es_owner());

create policy prestamo_descuentos_select on public.prestamo_descuentos for SELECT to public using ((es_owner() OR (EXISTS ( SELECT 1
   FROM prestamos p
  WHERE ((p.id = prestamo_descuentos.prestamo_id) AND (p.usuario_id = auth.uid())))) OR (es_admin() AND (EXISTS ( SELECT 1
   FROM (prestamos p
     JOIN usuarios u ON ((u.id = p.usuario_id)))
  WHERE ((p.id = prestamo_descuentos.prestamo_id) AND (u.empresa_id = empresa_actual())))))));

create policy prestamos_select on public.prestamos for SELECT to public using ((es_owner() OR (usuario_id = auth.uid()) OR (es_admin() AND (usuario_id IN ( SELECT usuarios.id
   FROM usuarios
  WHERE (usuarios.empresa_id = empresa_actual()))))));

create policy proyecto_supervisores_select on public.proyecto_supervisores for SELECT to public using ((es_owner() OR (usuario_id = auth.uid()) OR (es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual()))))));

create policy proyecto_supervisores_write on public.proyecto_supervisores for ALL to public using ((es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual()))))) with check ((es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual())))));

create policy proyecto_trabajadores_select on public.proyecto_trabajadores for SELECT to public using ((es_owner() OR (usuario_id = auth.uid()) OR (proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR (es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual()))))));

create policy proyecto_trabajadores_write on public.proyecto_trabajadores for ALL to public using ((es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual()))))) with check ((es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual())))));

create policy proyectos_acceso on public.proyectos for ALL to public using ((es_owner() OR (empresa_id = empresa_actual())));

create policy registros_horas_aprobar on public.registros_horas for UPDATE to public using (((proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR es_admin()));

create policy registros_horas_insert on public.registros_horas for INSERT to public with check ((usuario_id = auth.uid()));

create policy registros_horas_select on public.registros_horas for SELECT to public using ((es_owner() OR (usuario_id = auth.uid()) OR (proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR es_admin()));

create policy registros_horas_update_propio on public.registros_horas for UPDATE to public using ((usuario_id = auth.uid())) with check ((usuario_id = auth.uid()));

create policy semanas_pago_select on public.semanas_pago for SELECT to public using ((es_owner() OR (empresa_id = empresa_actual())));

create policy suscripciones_select on public.suscripciones for SELECT to public using ((es_owner() OR (empresa_id = empresa_actual())));

create policy suscripciones_write on public.suscripciones for ALL to public using (es_owner()) with check (es_owner());

create policy usuarios_acceso on public.usuarios for SELECT to public using ((es_owner() OR (empresa_id = empresa_actual())));

create policy vehiculo_asignaciones_insert on public.vehiculo_asignaciones for INSERT to public with check (((proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR (es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual()))))));

create policy vehiculo_asignaciones_select on public.vehiculo_asignaciones for SELECT to public using ((es_owner() OR (proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR (es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual()))))));

create policy vehiculo_asignaciones_update on public.vehiculo_asignaciones for UPDATE to public using (((proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR (es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual())))))) with check (((proyecto_id IN ( SELECT proyectos_a_cargo() AS proyectos_a_cargo)) OR (es_admin() AND (proyecto_id IN ( SELECT proyectos.id
   FROM proyectos
  WHERE (proyectos.empresa_id = empresa_actual()))))));

create policy vehiculo_gastos_delete on public.vehiculo_gastos for DELETE to public using ((es_admin() AND (EXISTS ( SELECT 1
   FROM vehiculos_catalogo v
  WHERE ((v.id = vehiculo_gastos.vehiculo_id) AND (v.empresa_id = empresa_actual()))))));

create policy vehiculo_gastos_insert on public.vehiculo_gastos for INSERT to public with check ((EXISTS ( SELECT 1
   FROM vehiculos_catalogo v
  WHERE ((v.id = vehiculo_gastos.vehiculo_id) AND (v.empresa_id = empresa_actual())))));

create policy vehiculo_gastos_select on public.vehiculo_gastos for SELECT to public using ((es_owner() OR (EXISTS ( SELECT 1
   FROM vehiculos_catalogo v
  WHERE ((v.id = vehiculo_gastos.vehiculo_id) AND (v.empresa_id = empresa_actual()))))));

create policy vehiculos_catalogo_delete on public.vehiculos_catalogo for DELETE to public using ((es_admin() AND (empresa_id = empresa_actual())));

create policy vehiculos_catalogo_insert on public.vehiculos_catalogo for INSERT to public with check ((es_admin() AND (empresa_id = empresa_actual())));

create policy vehiculos_catalogo_select on public.vehiculos_catalogo for SELECT to public using ((es_owner() OR (empresa_id = empresa_actual())));

create policy vehiculos_catalogo_update on public.vehiculos_catalogo for UPDATE to public using ((es_admin() AND (empresa_id = empresa_actual()))) with check ((es_admin() AND (empresa_id = empresa_actual())));

CREATE TRIGGER trg_avisar_equipo_danado_perdido AFTER UPDATE ON public.equipos_catalogo FOR EACH ROW EXECUTE FUNCTION avisar_equipo_danado_perdido();

CREATE TRIGGER trg_avisar_fuera_geo_cerca AFTER INSERT OR UPDATE ON public.registros_horas FOR EACH ROW EXECUTE FUNCTION avisar_fuera_geo_cerca();

CREATE TRIGGER trg_verificar_geo_cerca BEFORE INSERT OR UPDATE ON public.registros_horas FOR EACH ROW EXECUTE FUNCTION verificar_geo_cerca();

-- tipo: canal_notificacion = 'whatsapp', 'email', 'push'

-- tipo: clave_plan = 'free', 'basic', 'pro', 'enterprise'

-- tipo: condicion_equipo = 'buena', 'regular', 'dañada'

-- tipo: estado_cotizacion = 'borrador', 'enviada', 'aceptada', 'rechazada'

-- tipo: estado_empresa = 'active', 'trial', 'suspended'

-- tipo: estado_equipo = 'activo', 'dañado', 'perdido', 'en_reparacion', 'de_baja'

-- tipo: estado_factura = 'pendiente', 'pagada', 'vencida', 'anulada'

-- tipo: estado_prestamo = 'activo', 'pagado'

-- tipo: estado_proyecto = 'activo', 'cerrado'

-- tipo: estado_registro_horas = 'pendiente', 'aprobado_supervisor', 'aprobado_admin_tarde', 'rechazado', 'cerrado_automatico'

-- tipo: estado_semana = 'abierta', 'cerrada', 'pagada'

-- tipo: estado_vehiculo = 'activo', 'en_reparacion', 'de_baja'

-- tipo: metodo_pago = 'transfer', 'cash', 'check', 'wallet'

-- tipo: rol_usuario = 'trabajador', 'supervisor', 'admin', 'owner', 'comprador'
