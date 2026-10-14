# OBRAPAY — arranque

## Ya tienes un proyecto real conectado
Este proyecto de Supabase ya existe y tiene las 18 migraciones aplicadas
(incluidas las 3 que encontró el propio validador de seguridad de Supabase
al conectarlo — ver "Corte 20" más abajo):

- **Nombre**: `obrapay`
- **Project ref**: `pxsutkiiwqjevgfvvewb`
- **URL**: `https://pxsutkiiwqjevgfvvewb.supabase.co`
- **Anon key** (pública, segura para el navegador):
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4c3V0a2lpd3FqZXZnZnZ2ZXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4NTY4OTUsImV4cCI6MjEwNTQzMjg5NX0.EzKycgJnOY6czbpdzzJ6NoGFxsZDlZn5bsyyqXGZc-A`

**La `service_role` key no está aquí a propósito** — es la que se salta RLS
por completo, y no debe pasar por un chat ni quedar escrita en ningún
archivo que subas a control de versiones. Cópiala tú mismo desde
**Project Settings → API → service_role** en el dashboard de Supabase, y
pégala solo en tu `.env.local` (nunca en un commit).

Con esto, puedes saltar directo al paso de crear `.env.local` (más abajo) y
"npm install" — las migraciones de los pasos 1 a 11 ya están aplicadas en
este proyecto. Los pasos completos de abajo son para cuando crees tu propio
proyecto desde cero (por ejemplo, para producción, separado del de
desarrollo).

## Pasos completos (si partes de un proyecto nuevo)

1. Corre `sql/001_schema_inicial.sql` en tu proyecto de Supabase (SQL Editor).
2. Corre `sql/002_rls_supervisor.sql` justo después (refina permisos por rol).
3. Corre `sql/003_stripe_columns.sql` (agrega columnas de Stripe a suscripciones).
4. Corre `sql/004_rls_completar.sql` (RLS de suscripciones/planes/catálogo de
   oficios/configuración del sistema, y el permiso de UPDATE que faltaba en
   empresas).
5. Corre `sql/005_cierre_semana.sql`, `sql/006_privacidad_pagos.sql` y
   `sql/007_cierre_diario_turnos.sql` (cierre de semana, nómina y el cierre
   diario de turnos a las 5pm). Requieren la extensión **pg_cron** habilitada
   (Database → Extensions, en el dashboard de Supabase) — actívala antes de
   correr estas tres.
6. Corre `sql/008_rls_insert_empresas.sql` y `sql/009_vencer_trials.sql`
   (alta de empresas y vencimiento de prueba — esta última también necesita
   pg_cron).
7. **Corre `sql/010_revision_seguridad.sql` y `sql/011_fix_recursion_rls.sql`
   — son las más importantes de todas.** Sin ellas, el sistema no funciona
   en absoluto con RLS activado (ver "Corte 9" más abajo).
8. Corre `sql/012_avisar_trial_vencer.sql` (aviso de prueba por vencer —
   también necesita pg_cron).
9. Corre `sql/013_telefono_usuarios.sql` (agrega el teléfono a usuarios,
   necesario para WhatsApp).
10. Corre `sql/014_addon_stripe_item.sql` (columna para rastrear el ítem de
    Stripe de cada servicio extra activo).
11. Corre `sql/015_idempotencia_webhooks.sql` (registro de eventos de
    Stripe ya procesados).
12. Corre `sql/016_fix_search_path_funciones.sql`, `sql/017_revocar_execute_anon.sql`
    y `sql/018_revocar_execute_anon_directo.sql` — encontradas por el
    validador de seguridad de Supabase al conectar un proyecto real (ver
    "Corte 20" más abajo).
13. Corre `sql/019_materiales.sql`, `sql/020_documentos_proyecto.sql`,
    `sql/021_rol_comprador.sql`, `sql/022_compras_y_entregas.sql`,
    `sql/023_equipos.sql`, `sql/024_revocar_execute_trigger_equipo.sql`,
    `sql/025_vehiculos.sql`, `sql/027_facturacion.sql`,
    `sql/028_marcar_facturas_vencidas.sql`, `sql/029_certificaciones.sql`,
    `sql/030_permiso_trabajo.sql` y `sql/031_nib_nhip.sql`, en ese orden — Materiales, Documentos
    (con su bucket de Storage), el rol Comprador, el rediseño de
    compra/entrega, Herramientas/equipo compartido, Vehículos, Facturación
    a clientes, Certificaciones de trabajadores, y Permiso de trabajo
    (Cortes 24, 26, 28, 30, 33, 34, 36 y 37).
    `sql/026_mover_pgtap_a_extensions.sql` es opcional — solo hace falta
    si vas a correr las pruebas pgTAP.
14. Crea `.env.local` en la raíz con:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
   SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key      # server-only, nunca NEXT_PUBLIC_
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   # Price IDs reales — ya existen en la cuenta de prueba conectada
   # (acct_1UHXmTDXh3NbAvef), no hace falta crearlos de nuevo.
   STRIPE_PRICE_BASIC=price_1UHYEyDXh3NbAvefWO24QOHU
   STRIPE_PRICE_PRO=price_1UHYEzDXh3NbAvefa0MeZFOJ
   STRIPE_PRICE_ENTERPRISE=price_1UHYF1DXh3NbAvef0iIE137y
   RESEND_API_KEY=re_...
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_WHATSAPP_NUMBER=+14155238886
   NOTIF_WEBHOOK_SECRET=un-secreto-largo-que-tú-inventes
   STRIPE_PRICE_ADDON_WHATSAPP=price_1UHYF2DXh3NbAvefDbNzdrdV
   STRIPE_PRICE_ADDON_STORAGE=price_1UHYF3DXh3NbAvefuDnWM8wj
   ```
15. ✅ **Ya hecho** — los 5 Products/Prices de Stripe (3 planes + 2 add-ons)
   y la configuración del Customer Portal ya existen en la cuenta de prueba
   conectada. Lo único que falta de Stripe es el **endpoint de webhook**
   apuntando a `/api/stripe/webhook` (eventos `checkout.session.completed`,
   `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`)
   — no se pudo crear porque necesita una URL real y pública; mientras
   desarrollas en local, usa el Stripe CLI: `stripe listen --forward-to
   localhost:3000/api/stripe/webhook` (te da un `whsec_...` temporal para
   `STRIPE_WEBHOOK_SECRET`). Cuando despliegues la app, créalo apuntando a
   tu dominio real.
16. ~~En Stripe: Settings → Billing → Customer portal~~ — ya está
    configurado (ver Corte 21 más abajo).
17. En Supabase: **Database → Webhooks → Create a new webhook** —
    tabla `notificaciones`, evento `Insert`, tipo `HTTP Request`, URL
    `https://tu-dominio.com/api/notificaciones/enviar`, con el header
    `x-notif-secret: <el mismo valor que pusiste en NOTIF_WEBHOOK_SECRET>`.
    Esto es lo que conecta "se creó un aviso" con "se manda de verdad".
18. `npm install`
19. `npm run dev`

## Corte 1 — Login y Trabajador
- **Login** (`app/login/page.tsx`) — Supabase Auth con email/contraseña.
- **Middleware** (`middleware.ts`) — exige sesión y manda a cada rol a su panel
  (`/trabajador`, `/supervisor`, `/admin`, `/owner`) leyendo la tabla `usuarios`.
- **Marcaje del trabajador** (`app/trabajador/page.tsx`) — lista proyectos
  asignados, marca entrada/salida contra `registros_horas`, no deja abrir un
  segundo turno, y calcula horas normales vs. extra (después de las 5:00pm).

## Corte 2 — Supervisor (completo)
- `sql/002_rls_supervisor.sql` — **importante**: la política original dejaba
  ver/editar horas a cualquiera en la empresa. Esta migración la reemplaza
  por reglas reales: un supervisor solo puede aprobar horas de SUS proyectos
  (principal o asignado extra), un admin puede todo dentro de su empresa.
- `lib/usePlan.ts` — hook reutilizable que resuelve el plan activo de la
  empresa (`suscripciones` → `planes`) y expone banderas (`tieneGeofence`,
  `tieneFirmaDigital`, etc.) listas para usar en Admin/Owner. **Nota:** las
  4 pantallas del Supervisor no tienen ninguna función bloqueada por plan
  — los candados (geo-cerca, firma digital, multi-supervisor) se configuran
  y se muestran del lado del Admin, el Supervisor solo los consume. El hook
  ya queda listo para cuando construyamos esas pantallas.
- `app/supervisor/layout.tsx` — encabezado + navegación inferior compartida.
- `app/supervisor/page.tsx` — **Aprobaciones**: horas pendientes o cerradas
  automáticamente a las 5pm, con aprobar/rechazar.
- `app/supervisor/historial/page.tsx` — registros ya resueltos, con quién
  los aprobó.
- `app/supervisor/equipo/page.tsx` — estado en vivo (en turno / fuera de
  turno) de los trabajadores en sus proyectos.
- `app/supervisor/proyectos/page.tsx` — en turno ahora, horas de la semana
  y pendientes por proyecto. **Sin costo ni presupuesto**, como acordamos.

## Corte 19 — Dos ideas de un scaffold externo: Customer Portal + idempotencia de webhooks
El usuario subió un scaffold de Stripe generado en otra sesión/plataforma
(Supabase Edge Functions + tablas `tenants`/`tenant_addons`). No lo
integramos tal cual — usa un runtime y un esquema distintos a los
nuestros — pero tenía dos ideas genuinamente mejores que lo que ya
teníamos, y las adaptamos a nuestro código Next.js existente:

- `sql/015_idempotencia_webhooks.sql` + `app/api/stripe/webhook/route.ts`
  — cada evento de Stripe se registra por su `stripe_event_id` antes de
  procesarse. Si Stripe reintenta la entrega (pasa cuando no respondemos
  2xx a tiempo, y también en condiciones normales), la segunda entrega
  del mismo evento ahora es un no-op en vez de aplicar el cambio dos veces.
- `app/api/stripe/create-portal-session/route.ts` + botón "Gestionar
  facturación →" en `app/admin/plan/page.tsx` — el Admin puede abrir el
  Customer Portal de Stripe (hospedado por Stripe) para actualizar su
  tarjeta, ver facturas pasadas, o cancelar, sin que tengamos que construir
  esa interfaz. **No reemplaza** nuestras tarjetas de "Elegir este plan"
  — esas siguen siendo el camino principal para cambiar de plan porque ya
  tienen el arreglo del Corte 16 (sin doble cobro); el Portal es
  complementario, para lo que no construimos pantalla propia.
- **Requiere un paso de configuración manual en Stripe** antes de
  funcionar (paso 14 de arriba): el Customer Portal no tiene una
  configuración por defecto — hay que guardarla una vez desde el Dashboard,
  o `create-portal-session` falla.

## Corte 21 — Stripe conectado de verdad (cuenta real de prueba)
Se conectó la cuenta de prueba de Stripe ya existente (`acct_1UHXmTDXh3NbAvef`,
"Entorno de prueba de Christopher Familia Pérez") — la misma que ya tenía
los 5 Products/Prices creados por la sesión externa del Corte 19.

- **Verificado, no recreado**: se leyeron los 5 precios reales de la cuenta
  antes de tocar nada, confirmando que ya coinciden exactamente con lo
  acordado (Básico $29, Profesional $79, Empresarial $199, WhatsApp $10,
  Almacenamiento $8). El README ya trae estos Price IDs reales en vez de
  placeholders `price_...`.
- **Customer Portal configurado** — no existía ninguna configuración
  (`GetBillingPortalConfigurations` devolvía vacío), lo que habría hecho
  fallar `create-portal-session` con "no configuration provided". Se creó
  una configuración real: historial de facturas, actualización de tarjeta,
  cancelación al final del período de facturación (no inmediata, para no
  perder tiempo ya pagado), y cambio entre los 3 planes pagos directo
  desde el portal, con prorrateo.
- **Lo que NO se hizo, a propósito**: crear el endpoint de webhook de
  Stripe. Se verificó que no existe ninguno (`GetWebhookEndpoints` vacío),
  pero crearlo apuntando a una URL falsa o local no serviría de nada — un
  webhook de Stripe necesita una URL real y pública. Queda como el único
  pendiente real de Stripe (ver abajo).
- La `STRIPE_SECRET_KEY` de prueba no se muestra aquí ni se pudo "traer" —
  Stripe no permite consultar el valor de una clave secreta ya creada por
  API, solo verla una vez en el Dashboard al crearla. Cópiala tú mismo
  desde **Developers → API keys** en modo de prueba.

## Corte 20 — Conexión real a Supabase (proyecto creado y verificado)
Se creó el proyecto de Supabase real (`obrapay`, ref `pxsutkiiwqjevgfvvewb`,
región `us-east-1`, costo $0/mes confirmado antes de crear) y se aplicaron
las 15 migraciones existentes en orden, más 3 nuevas que encontró el propio
validador de seguridad de Supabase:

- **`sql/016_fix_search_path_funciones.sql`** — 6 funciones `security
  definer` (`cerrar_semana_actual`, `cerrar_semanas_vencidas`,
  `cerrar_turnos_del_dia`, `vencer_trials`, `avisar_trials_por_vencer`,
  `confirmar_pago_semanal`) se quedaron sin `search_path` fijo cuando la
  migración 011 corrigió las otras 4 — un vector clásico de escalación de
  privilegios. Encontrado por `get_advisors`, no por lectura manual del
  código.
- **`sql/017_revocar_execute_anon.sql`** — primer intento de cerrarle el
  paso a `anon` en 5 funciones, revocando de `PUBLIC`. Insuficiente por sí
  solo.
- **`sql/018_revocar_execute_anon_directo.sql`** — el que sí funcionó:
  Supabase le da `EXECUTE` a `anon` de forma explícita y separada de
  `PUBLIC` en cada función nueva del esquema `public`. Confirmado
  consultando `information_schema.routine_privileges` antes y después del
  revoke.
- **Estado final verificado con el propio linter de Supabase**: cero
  advertencias de seguridad reales. Solo quedan 2 categorías marcadas como
  intencionales — `stripe_webhook_events` sin políticas (a propósito, solo
  la toca el service role) y 5 funciones ejecutables por usuarios con
  sesión iniciada (correcto por diseño, ya que la app las necesita así).
- El proyecto real (URL, ref, anon key) queda documentado al inicio de
  este README. La `service_role` key nunca se mostró por chat — se pide
  copiarla directo del Dashboard.

## Corte 22 — `.env.local` real + `.gitignore` (que no existía)
- `.env.local` — ya viene con los valores reales que se pueden rellenar
  desde este chat (URL y anon key de Supabase, los 5 Price ID de Stripe) y
  con `<<< PEGAR AQUÍ >>>` marcado exactamente en los 6 secretos que solo
  el usuario tiene (service_role, Stripe secret key, webhook secret de
  Stripe, Resend, y las 2 credenciales de Twilio) — ninguno de esos se
  puede traer por chat, ni por diseño (Stripe no permite recuperar una
  clave secreta ya creada) ni por seguridad (el resto).
- **`.gitignore` no existía en el proyecto.** Sin él, un `git init` +
  primer commit habría subido `node_modules`, `.next`, y — lo más grave —
  el `.env.local` completo con los secretos reales una vez que el usuario
  los pegue ahí. Se agregó el `.gitignore` estándar de Next.js con
  `.env*.local` explícito, antes de que este riesgo se materializara.

## Corte 26 — Documentos por proyecto (con Supabase Storage de verdad)
Tercer módulo de la ronda de análisis de producto. Es el único de los 3 que
necesitaba algo que el proyecto no usaba todavía: archivos de verdad, no
solo filas en la base de datos.

- `sql/020_documentos_proyecto.sql` — tabla `documentos_proyecto` +
  **bucket privado** `documentos-proyecto` en Supabase Storage (no
  público — un permiso o contrato no debe quedar accesible por link
  directo sin sesión). Las políticas de `storage.objects` reutilizan
  `proyectos_a_cargo()` y `es_admin()`, leyendo el primer segmento de la
  ruta del archivo (`{proyecto_id}/{archivo}`) como el proyecto — mismas
  reglas que ya rigen el resto del esquema, no un sistema de permisos
  aparte.
- `lib/documentos.ts` — subir, listar (con URL firmada temporal de 10
  minutos, porque el bucket es privado), y eliminar (borra el archivo del
  bucket y la fila a la vez, para no dejar huérfanos).
- Sección "Documentos" en el detalle del proyecto: tipo (permiso,
  contrato, seguro, otro), fecha de vencimiento opcional para permisos que
  caducan, y enlace directo a cada archivo.
- Aplicado directo al proyecto real de Supabase — el bucket y las
  políticas ya existen, no hace falta crearlos de nuevo.

## Corte 25 — Presupuesto real vs. gastado (mano de obra + materiales)
Segundo módulo de la ronda. No creó tablas nuevas — extendió lo que ya
existía para que cuente las dos partes reales del costo de un proyecto,
no solo la mitad.

- Antes, el Panel, la lista de Proyectos y el detalle de cada proyecto
  solo contaban mano de obra como "costo". En una constructora real,
  materiales pesa tanto o más — el número ya no reflejaba la realidad.
- `app/admin/page.tsx`, `app/admin/proyectos/page.tsx` y
  `app/admin/proyectos/[id]/page.tsx` — ahora suman `costoPorProyecto()`
  (mano de obra) + `totalMaterialesPorProyecto()` (materiales) para la
  barra de presupuesto usado, y la alerta de sobrepresupuesto (Profesional+)
  ya avisa sobre el total combinado, no solo horas.
- El detalle del proyecto además desglosa las dos partes por separado
  (mano de obra / materiales) arriba de la barra combinada — para que se
  vea de dónde viene el gasto, no solo el total.

## Corte 24 — Materiales (catálogo + compras por proyecto)
Primer módulo de la ronda de análisis de producto — surgió de preguntarle
al usuario qué le quita más tiempo a su papá fuera de las horas
trabajadas, y "materiales" fue una de las respuestas.

- `sql/019_materiales.sql` — `materiales_catalogo` (por empresa: nombre,
  unidad, costo referencial) y `compras_materiales` (por proyecto:
  cantidad, costo total, proveedor, quién la registró).
- RLS pensado para cómo se usa de verdad: el **Admin** administra el
  catálogo, pero tanto el Admin como el **supervisor a cargo del proyecto**
  pueden registrar una compra — es el supervisor quien suele estar
  físicamente en la obra cuando llega el material. Solo el Admin puede
  corregir o borrar un registro ya hecho.
- `lib/materiales.ts` — helpers para el catálogo, las compras de un
  proyecto, y el total de materiales por proyecto (usado también en el
  Corte 25).
- `app/admin/materiales/page.tsx` — pantalla nueva de catálogo (agregar,
  desactivar), enlazada en el menú del Admin.
- Sección "Materiales" agregada al detalle de cada proyecto: registrar una
  compra y ver el historial con su total.
- **Pendiente real, no construido todavía**: una pantalla equivalente del
  lado del Supervisor para registrar una compra desde su propio panel — la
  política de RLS ya se lo permite, pero no tiene dónde hacerlo en la app
  todavía. Es el fast-follow más obvio de este módulo.

## Corte 23 — Cerrar dos huecos antes de seguir: admins y proyectos nuevos
Encontrados al confirmar con el usuario cómo debería comportarse el
sistema, antes de empezar la ronda de análisis de producto.

- **Un Admin podía crear otro Admin para su propia empresa** — el
  formulario "Nuevo trabajador" incluía "admin" como opción de rol, sin
  ninguna validación del lado del servidor. Corregido en
  `app/admin/trabajadores/actions.ts` (rechaza `sysRole: 'admin'` con un
  mensaje claro) y quitado de las opciones visibles en el formulario. Solo
  el Creador SaaS asigna ese rol, vía `crearEmpresa()`.
- **No existía ninguna pantalla para crear un proyecto nuevo.** Solo había
  lista y detalle — la única forma de agregar un proyecto de construcción
  era insertándolo directo en la base de datos. Nueva pantalla
  `app/admin/proyectos/nuevo/page.tsx`: nombre, ubicación, presupuesto,
  supervisor principal (opcional), y geo-cerca si el plan lo incluye.

## Corte 27 — Materiales desde el panel del Supervisor (cerraba el Corte 24)
- `app/supervisor/proyectos/page.tsx` — cada proyecto ahora tiene un
  "+ Registrar compra de material" que expande el mismo formulario que ya
  existe del lado del Admin (mismo catálogo, mismo `compras_materiales`,
  misma política de RLS que ya lo permitía desde el Corte 24 — solo
  faltaba la pantalla).
- A propósito, esta vista **no muestra presupuesto ni % usado** — el
  supervisor ve y registra lo que compró, pero el resumen de presupuesto
  del proyecto sigue siendo exclusivo del Admin, igual que con las horas.

## Corte 28 — Rediseño de Materiales: compra ≠ entrega, y un rol nuevo
El Corte 24 asumía que comprar y entregar en la obra son el mismo momento,
atado directo a un proyecto. Al preguntarle al usuario cómo es de verdad
en la compañía, confirmó que **a veces se sabe el proyecto al comprar y a
veces no** (se compra primero y se reparte después, incluso entre varios
proyectos), que la persona que compra **no siempre es la misma**, y que
**todavía no tiene cuenta en el sistema** — no es el Admin ni un
Supervisor. Los tres hechos juntos obligaban a un rediseño, no a un campo
nuevo.

- **Rol nuevo: `comprador`** (`sql/021_rol_comprador.sql`) — se agregó al
  enum `rol_usuario`. El Admin ya puede darlo de alta desde "Nuevo
  trabajador" (no desde el alta de Admin, por supuesto). Tiene su propio
  panel (`app/comprador/`), chico a propósito: una pantalla para comprar y
  repartir, y un perfil con cerrar sesión.
- **`sql/022_compras_y_entregas.sql`** — el cambio de fondo:
  `compras_materiales` pasó de ser "por proyecto" a ser "por empresa"
  (`proyecto_id` ahora es opcional), y se creó `entregas_materiales`, que
  reparte una compra —completa o en partes— a uno o más proyectos. Se
  migró cualquier compra existente del diseño anterior sin perder datos
  (`update ... set empresa_id = ...` antes de volver la columna
  obligatoria). Nueva función `es_comprador()`, con el mismo tratamiento
  de seguridad que las otras 5 (revocada de `anon`, solo `authenticated`).
- **`lib/materiales.ts`** — reescrito. `registrarCompra()` hace las dos
  cosas en un solo paso cuando ya se sabe el proyecto (crea la compra Y la
  entrega completa de una vez — no obliga a un paso extra cuando no hace
  falta). `obtenerComprasPendientes()` calcula cuánto queda sin repartir
  de cada compra. `entregarMaterial()` reparte una compra pendiente,
  calculando el costo proporcional según cuánto se entrega.
- **Admin y Supervisor** (`app/admin/proyectos/[id]/page.tsx`,
  `app/supervisor/proyectos/page.tsx`) — su formulario de "Registrar
  compra" sigue funcionando exactamente igual para ellos por fuera (porque
  ellos casi siempre saben el proyecto al comprar), pero por dentro ahora
  crea una compra + entrega en un solo paso usando el helper nuevo.
- **`app/comprador/page.tsx`** — la pantalla nueva: registrar una compra
  con o sin proyecto, y una lista de "Pendientes de repartir" para
  cuando llega el momento de decidir a qué obra va cada cosa (o repartirla
  entre varias).
- Todo aplicado directo al proyecto real de Supabase — no quedó solo en
  el código.

## Corte 29 — El Comprador también marca horas
Confirmado con el usuario: el comprador es un empleado pagado por hora
como cualquier trabajador, no solo alguien que compra. Su panel pasó de 1
pantalla a 5, reorganizado igual que el de Trabajador.

- `app/comprador/page.tsx` — ahora es la pantalla de marcaje (entrada/
  salida, cronómetro del turno, lista de proyectos asignados), copiada de
  `app/trabajador/page.tsx`. Pasa a ser la raíz del panel, como en
  Trabajador.
- La pantalla de Compras que antes vivía en `/comprador` se movió a
  `/comprador/compras` — mismo contenido, sin cambios.
- `app/comprador/reporte/page.tsx` y `app/comprador/avisos/page.tsx` —
  copiadas tal cual de sus equivalentes de Trabajador (horas de la semana,
  historial de pagos, avisos con punto rojo de no leídos).
- **Decisión explícita, no descuido**: se duplicó la lógica de marcaje en
  vez de compartir un componente entre Trabajador y Comprador. Cada rol en
  este proyecto ya es autocontenido (Supervisor no comparte código con
  Admin tampoco) — mantenerlo así es consistente, aunque signifique que un
  cambio futuro a la lógica de marcaje haya que aplicarlo en los dos
  lugares.
- No hizo falta tocar ninguna política de RLS: `registros_horas`,
  `pagos_semanales` y `notificaciones` ya estaban escritas de forma
  genérica (`usuario_id = auth.uid()`), sin restricción de rol.

## Corte 30 — Herramientas/equipo compartido entre proyectos
Cuarto módulo surgido de la ronda de análisis de producto. De 3 preguntas
nuevas, "se pierden o dañan seguido" fue la única con dolor activo — las
otras dos (avance a clientes, avisos generales) ya tienen una solución que
le funciona al usuario hoy, así que se dejaron fuera de este corte.

- `sql/023_equipos.sql` — `equipos_catalogo` (por empresa: nombre, tipo,
  número de serie, estado, valor de reemplazo) y `equipo_asignaciones`
  (el préstamo de un equipo a un proyecto: condición al entregar, condición
  al devolver, quién lo entregó/recibió). Mismo patrón de RLS que
  Materiales: el catálogo lo administra el Admin, pero tanto Admin como
  cualquier Supervisor de la empresa pueden marcar un equipo como dañado o
  perdido — **simplificación consciente**: no se restringió a "solo el
  equipo que ese supervisor tiene asignado" para no complicar la regla.
- **Aviso automático de verdad, no solo visual**: un trigger de Postgres
  (`avisar_equipo_danado_perdido`) dispara sin importar desde qué pantalla
  se marque el cambio — el catálogo del Admin o la devolución de un
  Supervisor actualizan la misma columna, y las dos disparan el mismo
  aviso por WhatsApp/correo/push al Admin. Es un trigger, no un Server
  Action, justo para no depender de que todos los caminos pasen por el
  mismo código.
- `sql/024_revocar_execute_trigger_equipo.sql` — el validador de seguridad
  de Supabase encontró que la función del trigger, aunque solo debía
  dispararse como trigger, seguía expuesta como RPC llamable directo
  (`/rest/v1/rpc/avisar_equipo_danado_perdido`) tanto para `anon` como para
  `authenticated`. Se le revocó `EXECUTE` a los tres — el trigger sigue
  funcionando igual, porque Postgres invoca triggers con los privilegios
  del dueño de la función, sin importar los permisos de otros roles.
- `lib/equipos.ts` + `app/admin/equipos/page.tsx` — catálogo con estado
  editable (activo, dañado, perdido, en reparación, de baja).
- Sección "Equipo" en el detalle de proyecto del Admin y en el panel del
  Supervisor (mismo patrón de tarjeta expandible que Materiales): asignar
  equipo disponible, y registrar la devolución con su condición.
- Tarjeta de alerta en el Panel del Admin, con el mismo estilo que la de
  sobrepresupuesto — visual, además del aviso real por WhatsApp/correo.

## Corte 31 — Auditoría técnica rápida (no de negocio)
Después de 4 módulos seguidos a buen ritmo, tocaba revisar qué deuda
técnica se acumuló — sin preguntarle al usuario, porque esto no depende
de cómo trabaja la compañía, depende de que el código esté bien.

- **Arreglado**: `lib/documentos.ts` no validaba tipo ni tamaño de
  archivo — cualquiera podía subir un ejecutable o un archivo de varios
  cientos de MB como si fuera un "permiso". Ahora solo acepta PDF o
  imágenes (JPG, PNG, HEIC), máximo 15MB, con el mismo filtro reflejado en
  el selector de archivo del navegador.
- **Documentado, no resuelto todavía** (ver pendientes): las pruebas
  pgTAP tienen cero cobertura de los 4 módulos nuevos (Materiales, Equipo,
  Documentos, el rol Comprador) — 6 tablas y una separación compra/entrega
  bastante más compleja que el RLS original, sin ninguna prueba. Y ninguna
  lista del sistema tiene paginación — no es un problema al tamaño de hoy,
  pero vale la pena tenerlo anotado antes de que la compañía crezca.

## Corte 32 — Las pruebas pgTAP, escritas y corridas de verdad por primera vez
Se agregó `supabase/tests/database/materiales_equipo_rls.test.sql` (21
aserciones nuevas para Materiales, Equipo, Documentos y el rol Comprador),
y al intentar correrlas contra el proyecto real de Supabase (habilitando
`pgtap` temporalmente) salió a la luz algo importante: **ninguno de los
dos archivos de prueba se había ejecutado nunca de verdad, ni siquiera el
original del Corte 9.**

- **El bug**: los fixtures usaban UUIDs con letras que no son
  hexadecimales válidas — `p1`, `r1`, `r2`, `g1`, `s1` en el archivo
  original; `p1`, `m1`, `c1`, `c2`, `e1` en el nuevo. Un UUID solo acepta
  `0-9` y `a-f`. Esto habría hecho fallar el primer `INSERT` de cualquiera
  de los dos archivos con "invalid input syntax for type uuid" — ni una
  sola aserción llegó a correr jamás. El README citaba la suite original
  como evidencia de bugs reales encontrados (Corte 9) sin que nadie la
  hubiera corrido de verdad.
- **Corregido**: todos los UUIDs de ambos archivos, reemplazados por
  sufijos hexadecimales válidos.
- **Dos errores de diseño de prueba, no de seguridad**, encontrados al
  correrlas de verdad:
  1. Un `UPDATE` bloqueado por RLS no lanza excepción como sí lo hace un
     `INSERT` rechazado — la política simplemente no encuentra la fila
     que actualizar, y el `UPDATE` "tiene éxito" afectando 0 filas, en
     silencio. Dos pruebas (una en cada archivo) esperaban una excepción
     donde debían verificar que el valor no había cambiado.
  2. Una prueba intentaba confirmar "el cambio no se aplicó" leyendo el
     valor con el MISMO usuario bloqueado — que tampoco podía *leer* esa
     fila por la misma política de RLS, así que la lectura daba `NULL` en
     vez del valor real. Se corrigió para verificar con un usuario que sí
     tiene permiso de lectura (el Owner).
- **Verificado de verdad, no solo escrito**: las 36 aserciones (15 del
  archivo original + 21 del nuevo) corren limpias contra el proyecto real
  de Supabase. `pgtap` quedó habilitado en el proyecto para poder seguir
  corriéndolas.

## Corte 33 — Vehículos (segundo módulo de "funciones para mi padre")
Confirmado con el usuario: la compañía tiene vehículos propios y es "un
dolor de cabeza llevarles la cuenta" — las tres cosas que mencionó
(gasto, quién los tiene, mantenimiento que se vence sin avisar) se
resolvieron en un solo módulo.

- `sql/025_vehiculos.sql` — `vehiculos_catalogo`, `vehiculo_asignaciones`
  (mismo patrón que Equipo: Admin o Supervisor a cargo asignan/devuelven),
  y `vehiculo_gastos` con una regla **distinta a todo el resto del
  esquema a propósito**: cualquier usuario autenticado de la empresa —
  trabajador incluido — puede reportar un gasto, porque así confirmó el
  usuario que funciona hoy ("cada trabajador reporta su propio consumo").
- Aviso automático de mantenimiento próximo a vencer (3 días antes), mismo
  patrón que `avisar_trials_por_vencer`: cron diario + notificación real
  por WhatsApp/correo al Admin. `actualizarMantenimiento()` resetea el
  aviso al cambiar la fecha, para que el cron pueda volver a avisar en el
  siguiente ciclo en vez de quedarse callado para siempre.
- Tarjeta de alerta en el Panel, mismo estilo que la de equipo dañado.
- `app/admin/vehiculos/page.tsx` — catálogo con estado y fecha de
  mantenimiento editables, y el total gastado por vehículo a la vista.
- **Nuevo, porque el gasto lo reporta cualquiera**: pestaña "Vehículo" en
  el panel de Trabajador y de Comprador — seleccionar un vehículo y
  reportar gasolina/mantenimiento en dos toques.
- **De paso, encontrado y corregido**: al habilitar `pgtap` para el Corte
  32 quedó instalada en el esquema `public`, lo que el validador de
  seguridad marca como riesgo de colisión de nombres. Se movió a su
  propio esquema (`extensions`) — `sql/026_mover_pgtap_a_extensions.sql`.

## Corte 34 — Facturación a clientes: cotizaciones, facturas, y PDF real
Tercer módulo de la ronda, y el más grande — el primero que maneja
dinero que *entra* (de clientes), no que sale (a trabajadores). El
usuario aclaró que el dolor está en cotizar, y que quiere que el sistema
genere los documentos, no solo lleve el registro — así que se construyó
con generación de PDF de verdad, no solo una tabla de montos.

- `sql/027_facturacion.sql` — `clientes`, `cotizaciones` +
  `cotizacion_items`, `facturas` + `factura_items`. **Acceso mucho más
  cerrado que el resto del sistema, a propósito**: solo Admin y Owner —
  ni Supervisor ni Comprador tocan esto, a diferencia de Materiales/
  Equipo/Vehículos. Es dinero de clientes, no operación de obra del día
  a día.
- `sql/028_marcar_facturas_vencidas.sql` — cron diario que marca una
  factura como "vencida" cuando pasa la fecha sin pagarse. Sin esto se
  hubiera quedado mostrando "pendiente" para siempre.
- **Generación de PDF real** — se agregó `pdfkit` al proyecto (nueva
  dependencia, correr `npm install` después de actualizar). Cada
  cotización y cada factura tiene un botón "Ver PDF" que llama a
  `/api/cotizaciones/[id]/pdf` o `/api/facturas/[id]/pdf`, genera el
  documento al vuelo (encabezado, datos del cliente, tabla de líneas,
  total, notas) y lo sirve directo — no hay archivos guardados en
  ningún lado, se arma cada vez que se pide.
- `lib/facturacion.ts` — el flujo completo: crear cliente, crear
  cotización con líneas, cambiar su estado, **convertir una cotización
  aceptada en factura copiando sus líneas** (no hay que volver a
  escribirlas), crear una factura directa sin pasar por cotización, y
  marcarla pagada.
- `app/admin/facturacion/page.tsx` — una sola pantalla con 3 pestañas
  (Cotizaciones, Facturas, Clientes) en vez de 3 pantallas separadas,
  para no seguir llenando el menú del Admin de entradas nuevas.
- **Limitación conocida, no un bug**: el número de cotización/factura se
  calcula como "el máximo actual + 1" en el momento de crear, no con una
  secuencia de Postgres dedicada. Con el volumen de una compañía como
  esta (un Admin, no docenas creando facturas a la vez) el riesgo de que
  dos números choquen es prácticamente nulo — pero si algún día hay
  varias personas facturando a la vez, esto habría que cambiarlo por una
  secuencia real.
- **El PDF es simple a propósito** — sin logo, sin colores de marca,
  diseño limpio en blanco y negro. Agregarle el logo de la compañía es
  un cambio chico si hace falta después.

## Corte 35 — Vehículo también en el panel del Supervisor
Cerraba el pendiente del Corte 33: el Supervisor ya puede reportar
gasolina/mantenimiento igual que Trabajador y Comprador.

- `app/supervisor/layout.tsx` — quinta pestaña "Vehículo".
- `app/supervisor/vehiculo/page.tsx` — copiada tal cual de la de
  Trabajador. Tiene sentido que sea su propia pestaña y no algo metido
  dentro de "Proyectos": reportar un gasto no está atado a un proyecto
  específico, está atado al vehículo — `vehiculo_gastos` ni siquiera
  tiene una columna `proyecto_id`.

## Corte 36 — Certificaciones de trabajadores por vencer
Cuarto módulo de la ronda. De 3 preguntas nuevas (incidentes de
seguridad, días libres, licencias/certificaciones), solo la tercera tuvo
dolor real — las otras dos ni aplican en esta compañía hoy.

- `sql/029_certificaciones.sql` — `certificaciones_trabajador` (nombre,
  número opcional, fecha de vencimiento). Acceso igual que
  `historial_tarifas`: Admin de la empresa, el propio trabajador (ve las
  suyas), y el Owner — dato de la persona, no operación de obra.
- **Aviso con 15 días de anticipación, no 3** — a propósito, distinto al
  de mantenimiento de vehículos: renovar una licencia de electricista u
  operador de maquinaria toma más tiempo que agendar un taller.
- Sección "Certificaciones" en el detalle de cada trabajador: agregar,
  ver vencidas en rojo, eliminar.
- Tarjeta de alerta en el Panel, mismo estilo que equipo dañado y
  mantenimiento de vehículos.

## Corte 37 — Permiso de trabajo (distinto a Certificaciones, a propósito)
Surgió directo del usuario, no de una pregunta mía — y valía la pena
pararse a pensar antes de meterlo en el módulo de Certificaciones que
acababa de construir en el Corte 36, porque son conceptualmente
distintos: una certificación es una habilidad que alguien puede tener
varias; un permiso de trabajo es elegibilidad legal para trabajar,
normalmente uno solo, y solo le aplica a algunos trabajadores
(extranjeros — confirmado con el usuario).

- `sql/030_permiso_trabajo.sql` — en vez de una tabla de lista, son
  campos directos en `perfil_nomina` (`requiere_permiso_trabajo`,
  `permiso_trabajo_numero`, `permiso_trabajo_vencimiento`) — porque es
  un dato del perfil del trabajador, no una colección de credenciales.
  Con un interruptor explícito (`requiere_permiso_trabajo`), no basta con
  dejar la fecha en blanco, porque "no aplica" y "aplica pero no se sabe
  la fecha todavía" son dos cosas distintas.
- **Aviso a 3 meses, no 15 días como certificaciones** — un trámite de
  permiso de trabajo no se resuelve rápido.
- **Se puede llenar desde el mismo formulario de alta**, tal como pidió
  el usuario — no es algo que se agrega después como si fuera opcional:
  `app/admin/trabajadores/nuevo/page.tsx` tiene el interruptor y los
  campos condicionales desde el día uno.
- También editable después desde el detalle del trabajador
  (`actualizarPermisoTrabajo` en `app/admin/trabajadores/[id]/actions.ts`)
  — resetea el aviso al cambiar la fecha, mismo cuidado que ya aplicamos
  en Vehículos.
- Tarjeta de alerta en el Panel, con enlace directo al trabajador
  afectado.

## Corte 38 — NIB y NHIP separados de verdad + reporte financiero mensual
Surgió de "batallo para juntarle todo al contador". Al investigar el
reporte de Seguro Social apareció un problema de fondo: el sistema solo
tenía **un** "% de seguro" por trabajador, pero en Turks and Caicos son
**dos** contribuciones a **dos** agencias distintas, cada una con su tasa
patronal/empleado y su propio tope mensual (confirmado por búsqueda web):
NIB 6.5% patrono + 5.5% empleado, tope ~$6,000/mes; NHIP 3% + 3%, tope
~$7,800/mes. Un reporte basado en el campo viejo habría estado mal.

- `sql/031_nib_nhip.sql` — tasas y topes como columnas de
  `configuracion_empresa` (**configurables, no fijos en el código** —
  pueden cambiar por ley y deben confirmarse con un contador), y cuatro
  columnas nuevas en `pagos_semanales` (NIB/NHIP empleado y patronal).
- `cerrar_semana_actual()` reescrita. **El reto real**: el tope es
  MENSUAL pero la nómina cierra SEMANAL. Ahora consulta cuánto ganó ya el
  trabajador en semanas cerradas del mismo mes calendario antes de
  calcular cuánto de esta semana todavía cuenta para cada tope.
- **Probado contra la base real, no solo escrito**: se simularon 4
  semanas de junio para un trabajador de $2,000/semana. Resultado
  idéntico al cálculo a mano — semanas 1–3 con NIB $110 / NHIP $60;
  semana 4 con NIB $0 (tope ya alcanzado) y NHIP $54 (el tope de $7,800
  se cruza a mitad de esa semana, solo cuentan $1,800).
- **Bug real encontrado al probar**: la variable del loop se llamaba `r`,
  igual que el alias de la consulta final de `pago_proyecto_detalle` —
  Postgres no sabía a cuál se refería. Renombrada a `v_reg`. El archivo
  local `031_nib_nhip.sql` ya contiene la versión corregida (en el
  proyecto real se aplicó como `031b` sobre la primera).
- `app/admin/ajustes/page.tsx` — sección nueva "NIB y NHIP" para editar
  tasas y topes, con aviso de verificarlos con el contador.
- **Deprecado**: el "% de seguro" por trabajador se quitó del alta y del
  detalle (`porcentaje_seguro` sigue existiendo en la tabla por
  compatibilidad, pero ya nada lo usa para calcular).
- **Reporte financiero mensual** — `lib/reporte-financiero.ts`,
  `lib/pdf-reporte-financiero.ts`, `app/api/reportes/financiero/route.ts`
  y una sección nueva en Reportes con selector de mes: nómina con
  desglose NIB/NHIP por trabajador (retenido, aporte patronal, total a
  remitir), materiales, vehículos, facturado y cobrado. Descargable en
  CSV (abre en Excel) y PDF. Solo Admin.

## Corte 39 — Cerrar los pendientes del Corte 38 (y un bug que apareció)
- **Semanas viejas sin desglose NIB/NHIP — resuelto por verificación, no
  con código.** Se consultó el proyecto real antes de construir un
  recálculo: cero pagos, cero empresas, cero usuarios (todas las pruebas
  corrieron dentro de transacciones revertidas). No existe historial que
  recalcular; la primera semana real ya cierra con el cálculo correcto.
  Construir un recálculo habría sido resolver un problema inexistente, y
  además peligroso (tocaría montos netos ya pagados).
- **Botón muerto "Exportar a Excel"** — conectado de verdad: ahora
  descarga el CSV del reporte financiero del mes en curso.
- **Paginación, hecha del lado del servidor** — no bastaba con paginar lo
  ya cargado, porque la búsqueda y el filtro funcionaban en el navegador
  sobre *todas* las filas:
  - `app/admin/trabajadores/page.tsx` — búsqueda por nombre (con espera
    de 300 ms entre teclas para no consultar en cada letra), filtro de
    método de pago y páginas de 25, todo resuelto con `.range()` /
    `.ilike()` en la base de datos. "Mostrando X de Y" + "Cargar más".
  - `app/admin/proyectos/page.tsx` — pestañas Activos/Cerrados (por
    defecto solo activos: los cerrados se acumulan con los años) y páginas
    de 15. El costo por proyecto, que es la consulta pesada, ahora solo se
    calcula para la página visible.
  - `lib/facturacion.ts` + `app/admin/facturacion/page.tsx` — cotizaciones
    y facturas limitadas a 30, con "Cargar más".
  - **Fuera, a propósito**: los catálogos de materiales, equipo y
    vehículos. Para una sola compañía son decenas de filas, no miles — no
    justifican la complejidad extra.
- **Bug real encontrado de paso**: la lista de Trabajadores filtraba por
  `rol in ('trabajador', 'supervisor')` — **los Compradores nunca
  aparecían**, aunque se dieran de alta desde esa misma pantalla (existía
  desde el Corte 28). Corregido, y ahora se etiquetan como "Comprador".

## Corte 40 — Resend conectado de verdad (modo de prueba)
Se creó una clave de API real en Resend y se mandó un correo de prueba de
verdad — no simulado — para confirmarlo antes de tocar el código.

- **Se descubrió que `obrapay.com` nunca se compró** — solo se había
  escrito el nombre al crear el dominio en Resend, así que su
  verificación estaba destinada a fallar sin importar qué registros DNS
  se agregaran. En vez de fingir que estaba resuelto, se ofrecieron dos
  caminos reales: comprar un dominio de verdad, o probar ya mismo con el
  remitente de pruebas de Resend (`onboarding@resend.dev`), que no
  necesita ningún dominio verificado — el usuario eligió probar ya.
- Se creó una clave de API (`obrapay-notificaciones`, permiso
  `sending_access`) y se envió un correo de prueba real — que reveló un
  detalle útil: el correo que el usuario dio tenía una letra de menos
  (`psachristopherfamilia@gmail.com` en vez de
  `psacchristopherfamilia@gmail.com`, con doble "c"). El mismo mensaje de
  error de Resend trajo el correo correcto, y el segundo envío sí llegó.
- `app/api/notificaciones/enviar/route.ts` — el remitente ya no está fijo
  en el código (`'OBRAPAY <notificaciones@obrapay.app>'`, un dominio que
  ni siquiera existe); ahora lee `RESEND_FROM_EMAIL` del entorno, con el
  remitente de pruebas como valor por defecto.
- `.env.local` — `RESEND_API_KEY` con la clave real, y
  `RESEND_FROM_EMAIL=OBRAPAY <onboarding@resend.dev>`.
- **Limitación real, no de código**: con el remitente de pruebas, Resend
  **solo entrega al correo dueño de la cuenta** — nunca a un trabajador
  de verdad. Esto prueba que Supabase → la API → Resend funciona de
  punta a punta, pero no reemplaza comprar un dominio antes de usar esto
  con trabajadores reales.

## Corte 41 — Constancia de trabajo e ingresos (idea original del proyecto)
El usuario recordó algo que ya estaba en la idea fundacional de OBRAPAY,
guardada desde antes de este chat: "quiere que los trabajadores puedan
ver cuánto cobran por hora, cuánto ganaron y cuánto se les descontó".
Buena noticia al revisar: el cálculo ya existía completo en
`obtenerTotalHistorico()` — solo se mostraba un solo número
("Total pagado") en vez de todo el desglose que ya calculaba por debajo.

- `lib/nomina.ts` — `TotalHistorico` ahora separa `descuentoNibTotal` y
  `descuentoNhipTotal` (antes un solo `descuentoSeguroTotal` combinado,
  que se mantiene por compatibilidad) y agrega `trabajandoDesde` (fecha
  de su primer pago). **Bug corregido de paso**: el historial se
  ordenaba por `semana_id`, que es un UUID — no da orden cronológico.
  Ahora ordena por la fecha real de la semana relacionada.
- **Es el mismo cálculo mostrado desde los dos lados** — lo que el
  trabajador ve como "cuánto he ganado" es exactamente lo que el Admin ve
  como "cuánto le he pagado". Un solo `obtenerTotalHistorico()`, no dos.
- `app/trabajador/reporte/page.tsx` y `app/comprador/reporte/page.tsx` —
  nueva sección "Desde que trabajo aquí": fecha de inicio, semanas
  pagadas, bruto total, NIB y NHIP descontados por separado, préstamos
  descontados, y el neto total recibido.
- `app/admin/trabajadores/[id]/page.tsx` — el panel que ya existía ahí
  ahora desglosa NIB y NHIP por separado en vez de un solo "seguro".
- **Nuevo, porque "constancia" es un documento real en Turks and
  Caicos** (para préstamos, trámites, visas) — `lib/pdf-constancia.ts` +
  `app/api/trabajadores/[id]/constancia/route.ts`: genera un PDF formal
  de constancia de trabajo e ingresos al vuelo, con el mismo desglose,
  accesible tanto por el propio trabajador como por su Admin — la RLS ya
  existente decide quién puede pedir la de quién, sin lógica nueva de
  permisos.

## Corte 42 — Geo-cerca validada de verdad (no solo capturada)
El pendiente que quedaba desde hace varios cortes. Al revisar el código
real antes de tocar nada, apareció más construido de lo recordado (el
radio y el interruptor ya existían) pero faltaba la pieza central: el
punto desde dónde medir ese radio, y la función que compara una cosa con
la otra. Decisión de producto confirmada con el usuario antes de
programar: **no se bloquea el marcaje** — se deja marcar, pero se avisa
al supervisor para que lo revise antes de aprobar. Se valida entrada y
salida por separado.

- `sql/032_geo_cerca_validacion.sql` — `proyectos.geo_cerca_lat/lng`
  (el centro que faltaba), dos banderas en `registros_horas`
  (`fuera_geo_cerca_entrada`, `fuera_geo_cerca_salida`), una función de
  distancia esférica (Haversine) en Postgres, y dos triggers: uno
  calcula las banderas antes de guardar, el otro avisa al supervisor
  después — por WhatsApp, correo y push, respetando sus preferencias de
  canal, igual que el resto del sistema.
- **Probado contra la base real con coordenadas de Providenciales, no
  solo escrito**: un punto a 1,112m del centro quedó marcado fuera
  (radio de prueba: 250m), uno a 111m no — y la notificación al
  supervisor llegó con el mensaje correcto en los 3 canales. Antes de
  eso, un bug real: `point` guarda sus coordenadas como
  `double precision`, no `numeric` — la función de distancia no
  aceptaba lo que el trigger le mandaba. Corregido y vuelto a probar.
- `app/admin/proyectos/nuevo/page.tsx` y `app/admin/proyectos/[id]/page.tsx`
  — botón "Usar mi ubicación actual": el Admin se para en la obra y lo
  toca, ahí queda guardado el centro. Con la geo-cerca activa pero sin
  ubicación guardada, se lo dice explícitamente en vez de fallar en
  silencio.
- `app/supervisor/page.tsx` — insignia roja "Fuera de la geo-cerca" en
  Aprobaciones, para que la revise con más cuidado antes de aprobar.

## Corte 43 — La primera compilación real (y todo lo que reveló)
Después de 42 cortes escribiendo código sin compilarlo ni una vez, el
usuario corrió `npm install` y `npm run build` de verdad en su propia
computadora — el resultado esperado: aparecieron errores reales, uno por
uno, y cada uno se corrigió antes de seguir. Esto es exactamente lo que
se anticipó desde el Corte 38, y es la razón por la que nunca se llamó
"100% funcional" a este proyecto hasta ahora poder probarlo.

**Encontrados corrigiendo build errors, uno a la vez:**
1. `tsconfig.json` **nunca existió** — sin él, ningún import con el atajo
   `@/` resuelve, que es la mayoría del proyecto. Creado.
2. `app/admin/trabajadores/nuevo/page.tsx` importaba `./actions` cuando
   el archivo real está un nivel arriba (`../actions`) — bug real de
   ruta, no de configuración.
3. `types/database.ts` — `Proyecto` no tenía `presupuesto` (el campo
   real de la base de datos sí lo tenía; solo faltaba en el tipo de
   TypeScript). Se aprovechó para completar también los campos que
   faltaban en `PerfilNomina` y `RegistroHoras` (permiso de trabajo,
   geo-cerca, ubicación) comparando contra la base de datos real, en vez
   de esperar a que cada uno diera error por separado.
4. `app/admin/page.tsx` — mezclar `??` con `||` sin paréntesis no es
   válido en TypeScript aunque la lógica sea correcta.

**Encontrado por una auditoría completa, pedida por el usuario, en vez de
seguir descubriendo uno a uno:**
5. `app/layout.tsx`, `app/globals.css` y `postcss.config.js` **nunca
   existieron** — sin estos tres, Next.js no tiene layout raíz y Tailwind
   no procesa ninguna clase. Son los archivos que `create-next-app`
   genera solo al arrancar un proyecto nuevo; como este se construyó
   archivo por archivo a lo largo de 42 cortes, nunca se generaron.
6. `next.config.js` y `app/page.tsx` (la raíz `/`) tampoco existían.
7. `@types/react-dom` faltaba en `package.json`.
8. **Riesgo real, no solo cosmético**: `lib/stripe.ts` y
   `app/api/notificaciones/enviar/route.ts` creaban sus clientes
   (Stripe, Resend, Twilio) al cargar el archivo, no al usarlos. Next.js
   sí ejecuta ese código durante `next build` para poder inspeccionar
   cada ruta — y el SDK de Twilio valida el formato del Account SID de
   inmediato al crear el cliente. Con un valor de relleno en
   `.env.local` (como seguía estando `TWILIO_ACCOUNT_SID`, nunca
   completado), esto habría tronado el build entero, no solo esa
   función. Ambos se corrigieron con carga perezosa — el cliente real
   solo se crea cuando de verdad se necesita.
9. `tsconfig.json` se dejó en `strict: false` a propósito (no
   `true`) — para no destapar de golpe una ola nueva de errores de tipos
   más estrictos justo cuando ya llevábamos varias rondas de idas y
   vueltas. Es una decisión temporal, documentada aquí para no
   olvidarla: vale la pena volver a `strict: true` con calma más
   adelante, no ahora.

**Lección operativa, para el siguiente proyecto**: escribir 180+ archivos
sin compilarlos ni una vez significa que hasta los cimientos más básicos
(el layout raíz, el CSS global) pueden faltar sin que nada lo avise. La
próxima vez, correr `npm run build` mucho antes — no hay que esperar a
tener 42 cortes encima para descubrirlo.

## Pendiente para el siguiente corte
- **Falta comprar un dominio de verdad y verificarlo en Resend** para que
  los correos le lleguen a los trabajadores, no solo al dueño de la
  cuenta. Los 4 registros DNS que pedirá Resend ya se revisaron una vez
  (para `obrapay.com`, que no se compró) — en cuanto haya un dominio
  real, se repite ese mismo paso.
- **El endpoint de webhook de Stripe todavía no existe** — es lo único de
  Stripe que quedó sin hacer, porque crearlo requiere una URL real y
  pública (`/api/stripe/webhook`), y este proyecto todavía no está
  desplegado en ningún lado. Mientras desarrollas en local, usa el Stripe
  CLI (`stripe listen --forward-to localhost:3000/api/stripe/webhook`);
  cuando despliegues, créalo apuntando a tu dominio real escuchando
  `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
  `customer.subscription.deleted`.
- Crear las cuentas en Supabase Auth (el Admin invita al trabajador — no hay
  registro público).
- La validación real de la geo-cerca debe vivir en una función de Postgres
  (RPC), no en el cliente.
- La suite de pgTAP cubre los bugs que ya encontramos y el aislamiento
  básico entre empresas/roles, pero no es exhaustiva.
- **El canal `push` sigue sin entregarse.** A diferencia de WhatsApp/correo,
  las notificaciones push del navegador necesitan su propia infraestructura
  (Web Push API, claves VAPID, un service worker en el frontend, y una
  tabla para guardar la "suscripción" de cada dispositivo) — no es una
  integración de una tarde como Resend/Twilio, es un corte de trabajo
  propio. El endpoint ya está preparado para ignorarlo sin romperse
  mientras tanto.
- **Antes de mandar tráfico real**: Resend exige verificar tu dominio antes
  de poder enviar desde `notificaciones@obrapay.app` (o el que uses), y
  Twilio exige que tu número de WhatsApp Business esté aprobado — mientras
  tanto, Twilio da un número de "sandbox" para probar, pero cada persona
  que reciba el WhatsApp de prueba tiene que sumarse al sandbox primero.
- Los add-ons requieren que la empresa ya tenga una suscripción de Stripe
  activa (no funcionan en el plan Gratuito ni durante la prueba antes de
  convertir). Es una decisión de producto razonable, pero vale la pena
  confirmar que es lo que quieres antes de que un cliente real se tope con
  el mensaje.

## Corte 18 — Editar % de seguro y método de pago
- `app/admin/trabajadores/[id]/actions.ts` — `actualizarDatosPago()`: misma
  validación de que el trabajador sea de la empresa del Admin que llama,
  pero sin historial ni notificación — a propósito, porque el esquema no
  tiene una tabla de auditoría para esto como sí la tiene la tarifa
  (`historial_tarifas`). Si más adelante hace falta, es la misma idea que
  `cambiarTarifa()`, solo que hoy no existía el pedido.
- `app/admin/trabajadores/[id]/page.tsx` — ahora el % de seguro y el
  método de pago (con cuenta bancaria si aplica) se editan desde el mismo
  detalle, con su propio botón "Editar" independiente del de la tarifa —
  cada uno se guarda por separado.

## Corte 17 — Las 2 funciones a medias, terminadas
- `app/admin/trabajadores/[id]/actions.ts` — `cambiarTarifa()`: valida que
  el trabajador sea de la empresa del Admin que llama, actualiza
  `perfil_nomina`, **guarda el historial** en `historial_tarifas` (por fin
  tiene un escritor), y crea la notificación de `cambio_tarifa` por cada
  canal que la empresa tenga activado — el mismo patrón que ya usaba
  `avisar_trials_por_vencer()`, aquí en TypeScript porque corre como Server
  Action.
- `app/admin/trabajadores/[id]/page.tsx` — ahora se puede editar la tarifa
  desde el propio detalle del trabajador (con motivo opcional), y debajo
  aparece el historial completo de cambios.
- `sql/014_addon_stripe_item.sql` + `lib/stripe.ts` +
  `app/api/stripe/toggle-addon/route.ts` — activar un servicio extra ahora
  agrega de verdad una línea a la suscripción de Stripe de la empresa
  (`stripe.subscriptionItems.create`, con prorrateo); quitarlo la elimina.
  Si la empresa no tiene una suscripción de Stripe activa (Gratuito, o en
  prueba sin convertir todavía), el botón queda bloqueado con una
  explicación en vez de fallar en silencio.
- `app/admin/plan/page.tsx` — sección "Servicios extra" nueva, con los
  precios reales del catálogo y el estado activo/inactivo de cada uno para
  la empresa.

## Corte 16 — Revisión general (encontró un bug de facturación doble)
Repasé lo agregado en los Cortes 10 a 15 buscando el mismo tipo de cosas
que aparecieron en el Corte 9 — y encontré algo serio, esta vez en Stripe.

- **El bug**: `app/api/stripe/create-checkout-session/route.ts` tenía dos
  problemas de facturación real:
  1. Bajar a Gratuito nunca cancelaba la suscripción en Stripe. Una empresa
     que bajaba de Empresarial a Gratuito seguía pagando Empresarial para
     siempre — Stripe seguía cobrando aunque la app ya le hubiera quitado
     las funciones.
  2. Cambiar entre dos planes pagos (ej. Profesional → Empresarial) abría
     una **segunda** suscripción en Stripe en vez de reemplazar la
     primera — quedaban pagando ambas a la vez.
- **El arreglo**: ahora, si ya existe una suscripción activa en Stripe, el
  cambio de plan la actualiza directo (`stripe.subscriptions.update`, con
  prorrateo automático) en vez de abrir una nueva; bajar a Gratuito la
  cancela primero. Solo se crea una sesión de Checkout nueva la primera
  vez que una empresa paga de verdad.
- Encontré además dos funciones a medio construir (arriba, en pendientes):
  no hay forma de editar la tarifa de un trabajador después de creado, y
  los servicios extra del catálogo nunca llegaron a tener pantalla en el
  Admin. Ninguna de las dos es un bug — son features documentadas desde
  hace varios cortes que todavía no se han construido.

## Corte 15 — Costo por proyecto: de "recalculado siempre" a "congelado + en vivo"
Este pendiente resultó ser más que prolijidad: era un bug de datos real.

- **El bug**: `costoPorProyecto()` recalculaba TODO el historial de un
  proyecto usando la tarifa **actual** de cada trabajador
  (`perfil_nomina.tarifa_hora`, que cambia con el tiempo). Si alguien
  recibía un aumento, el costo de semanas **ya pagadas** cambiaba solo,
  silenciosamente, para reflejar la tarifa nueva — un número que se supone
  histórico dejaba de serlo.
- **El arreglo** (`lib/admin.ts`): ahora el costo se arma de dos fuentes.
  Las semanas ya cerradas se leen de `pago_proyecto_detalle`, que quedó
  congelado con la tarifa vigente en el momento exacto del cierre (nunca
  cambia después). Solo la semana **actualmente abierta** —que todavía no
  tiene snapshot— se calcula en vivo con la tarifa de hoy, lo cual es
  correcto porque es justo la que se va a usar cuando esa semana cierre.
- Esto también significa menos trabajo por consulta: ya no se
  recalculan semanas que llevan meses cerradas cada vez que alguien abre
  el Panel.
- Se actualizaron los 3 lugares que llamaban a esta función (Panel, lista
  de Proyectos, detalle de Proyecto) para pasarle la empresa, que ahora
  necesita para encontrar la semana abierta.


## Corte 14 — Entrega real de avisos (WhatsApp y correo)
- `sql/013_telefono_usuarios.sql` — agrega `usuarios.telefono`, que no
  existía en ningún lado (solo teníamos el teléfono de la *empresa*, no el
  de cada persona) — indispensable para poder mandarle un WhatsApp a
  alguien. Se agregó también al alta de trabajador y al alta de empresa
  (primer Admin), ambos opcionales pero recomendados.
- `app/api/notificaciones/enviar/route.ts` — el corazón de este corte:
  recibe un **Database Webhook de Supabase** cada vez que se inserta una
  fila en `notificaciones` (configurado en el paso 12 de arriba, sin
  necesidad de tocar SQL para el webhook en sí — Supabase ya lo resuelve
  con pg_net por dentro), y según el `canal` de esa fila:
  - `email` → lo manda con **Resend**.
  - `whatsapp` → lo manda con **Twilio** (si la persona no tiene teléfono
    registrado, simplemente no se envía — no es un error, se queda
    visible igual en "Avisos" dentro de la app).
  - `push` → se ignora por ahora (ver pendientes).
  Protegido con un secreto compartido (`x-notif-secret`) para que nadie más
  pueda llamarlo y hacernos mandar WhatsApps/correos por su cuenta.
  Si Resend o Twilio fallan, el error se registra pero no se relanza — la
  notificación ya está guardada y visible en la app de todos modos; lo
  único que se pierde es el canal externo, no el aviso en sí.


## Corte 13 — Suite de pruebas RLS con pgTAP
- `supabase/tests/database/rls.test.sql` — 15 pruebas que corren con
  `supabase test db`, simulando distintos usuarios autenticados sin
  necesitar cuentas reales en Supabase Auth (cambian el JWT de la sesión
  dentro de la misma transacción, que se revierte al final — no deja
  datos de prueba en la base).
  - **Grupo 1**: reproduce el bug de recursión infinita del Corte 9 — si
    alguien vuelve a quitarle `security definer` a `empresa_actual()` o
    `es_admin()`, estas pruebas fallan de inmediato en vez de descubrirse
    semanas después con un usuario real.
  - **Grupo 2**: reproduce las 7 tablas que se habían quedado con RLS
    activado sin ninguna política.
  - **Grupos 3-4**: un trabajador no ve el pago de un compañero; un
    supervisor no ve las horas del proyecto de otro supervisor.
  - **Grupo 5**: aislamiento completo entre dos empresas — ni proyectos, ni
    usuarios, ni la capacidad de suspender la empresa ajena.
  - **Grupo 6**: el owner sí puede ver todo, en ambas empresas.

## Corte 12 — Total histórico pagado/ganado
- `lib/nomina.ts` — `obtenerTotalHistorico()`: suma todos los pagos ya
  confirmados (`estado = 'pagado'`) de un trabajador. Es un solo cálculo
  compartido: lo que el Admin le ha pagado en total a alguien es
  exactamente lo que esa persona ha ganado en neto en total — no son dos
  números distintos, es el mismo dato mostrado en el contexto de cada quien.
- `app/trabajador/perfil/page.tsx` — el trabajador ve "Total ganado desde
  que trabajas aquí" (neto, horas totales, semanas pagadas) arriba de sus
  datos de nómina.
- `app/admin/trabajadores/[id]/page.tsx` — **pantalla nueva**: antes la
  lista de Trabajadores no llevaba a ningún detalle. Ahora cada fila abre
  el perfil completo del trabajador desde el lado del Admin — mismo total
  histórico, más tarifa, seguro, método de pago y saldo de préstamo.

## Corte 11 — Las 4 pantallas del Trabajador (completo)
- `app/trabajador/layout.tsx` — antes cada pantalla tenía que traer su
  propio encabezado; ahora hay un layout compartido con las 4 pestañas, y
  el marcaje (`page.tsx`) se simplificó para ya no repetirlo.
- `app/trabajador/reporte/page.tsx` — **Mi reporte**: la semana abierta se
  muestra con sus horas por día/proyecto y un bruto **estimado** (aclarando
  que el seguro y el préstamo se calculan al cerrar, no antes — el
  trabajador nunca ve un número de descuentos inventado). El historial
  debajo lee de `pagos_semanales` ya confirmados — a diferencia de los
  Reportes del Admin, aquí **no hay candado de plan**: es la nómina del
  propio trabajador, no una función premium de la empresa.
- `app/trabajador/avisos/page.tsx` — lista `notificaciones` reales del
  usuario, con punto sin leer y se marca como leída al tocarla. La pestaña
  "Avisos" en la navegación también muestra un punto rojo cuando hay
  pendientes, contado en el layout.
- `app/trabajador/perfil/page.tsx` — tarifa, % de seguro y método de pago
  propios, más cerrar sesión.


## Corte 10 — Aviso de prueba por vencer
- `sql/012_avisar_trial_vencer.sql` — `avisar_trials_por_vencer()` corre
  una vez al día por cron: a las empresas en prueba a 3 días o menos de
  vencer (y que no se les haya avisado ya para esta prueba —
  `empresas.aviso_trial_enviado`), les crea una notificación por cada canal
  que tengan activado en Ajustes, dirigida a su(s) Admin(s).
- `app/admin/plan/page.tsx` — además del aviso asíncrono, agregué un
  banner que se calcula en el momento (no depende de que la notificación se
  haya "entregado"): mientras la empresa esté en prueba, muestra cuántos
  días quedan, con un tono más urgente los últimos 3 días.


## Corte 9 — Revisión general de seguridad (encontró 2 problemas graves)
Antes de seguir agregando funciones, hice una pasada completa por las 22
tablas del esquema y las 4 funciones auxiliares de RLS. Encontré:

1. **`sql/010_revision_seguridad.sql`** — 7 tablas (`perfil_nomina`,
   `proyecto_trabajadores`, `proyecto_supervisores`, `prestamos`,
   `auditoria`, `configuracion_empresa`, `semanas_pago`) tenían RLS
   **activado pero sin ninguna política**. En Postgres eso bloquea el 100%
   del acceso — ni siquiera el dueño legítimo de una fila puede leerla. En
   la práctica esto rompía Ajustes, el marcaje de horas, Mi equipo y la
   lista de Trabajadores. Además, `historial_tarifas` y
   `prestamo_descuentos` (datos de sueldo y préstamos) nunca habían tenido
   RLS activado — lo opuesto: cualquier usuario autenticado podía leerlas
   completas, sin restricción.
2. **`sql/011_fix_recursion_rls.sql`** — el hallazgo más serio: las 4
   funciones auxiliares (`empresa_actual()`, `es_owner()`, `es_admin()`,
   `proyectos_a_cargo()`) consultan la tabla `usuarios`, pero la propia
   política de `usuarios` usa `empresa_actual()` para decidir qué se puede
   leer. Como ninguna de las 4 era `security definer`, esa consulta interna
   volvía a pasar por RLS — que volvía a llamar a la función — en un ciclo
   que Postgres corta con **"infinite recursion detected in policy for
   relation usuarios"**. Esto afecta a *cualquier* política de *cualquier*
   tabla que dependa de estas funciones — es decir, casi todo el esquema.
   Este bug estaba desde el primer script (`sql/001_schema_inicial.sql`) y desde
   `002_rls_supervisor.sql`; nunca se había manifestado en esta
   conversación porque hasta ahora solo habíamos revisado el código de las
   pantallas, no ejecutado las políticas contra una base de datos real.

**Por qué importa contarte esto así de directo:** las migraciones 010 y 011
no son una mejora — sin ellas, el proyecto tal como está hoy no funcionaría
en absoluto apenas conectaras Supabase de verdad con RLS activado. Es
exactamente el tipo de cosa que uno quiere encontrar en una revisión, antes
de que la encuentre un usuario real.


## Corte 8 — Vencimiento de prueba (14 días de Profesional → Gratuito)
- `sql/009_vencer_trials.sql` — `empresas.trial_termina_en` guarda cuándo
  vence; `vencer_trials()` corre cada hora por cron y solo baja a Gratuito
  a las empresas que **nunca completaron un Stripe Checkout real**
  (`stripe_subscription_id` sigue null) — si ya se convirtieron a un plan
  pago durante la prueba, el webhook de Stripe manda y aquí solo se les
  quita la etiqueta de "trial".
- `crearEmpresa()` ahora da de alta la suscripción inicial en **Profesional**
  (no Gratuito) con `trial_termina_en` a 14 días — así prueban las funciones
  que de verdad empujan a pagar (geo-cerca, alertas de sobrepresupuesto,
  firma digital) antes de decidir.
- `app/owner/page.tsx` — la lista de Empresas ahora muestra "Prueba vence en
  N días" en vez de solo la etiqueta "Prueba" sin contexto.


## Corte 7 — "+ Nueva empresa" (alta de tenant completo)
- `sql/008_rls_insert_empresas.sql` — agrega el permiso de `INSERT` en
  `empresas` para el owner (mismo patrón que el `UPDATE` que faltó antes).
- `app/owner/actions.ts` — `crearEmpresa()`: crea la empresa, su
  `configuracion_empresa` (heredando el umbral de hora extra desde
  `configuracion_sistema`, para que arranque igual que el resto), su
  primera suscripción (Gratuito), e invita al primer Admin — mismo patrón
  de `inviteUserByEmail` que ya usábamos para trabajadores.
- `app/owner/nueva-empresa/page.tsx` — el formulario. El botón "+ Nueva
  empresa" en `/owner`, que hasta ahora no hacía nada, ya quedó conectado.


## Corte 6 — Aprobar turnos cerrados automáticamente (y un bug real que corrigió)
- **El bug**: antes, si un supervisor aprobaba un registro `cerrado_automatico`
  (sin `hora_salida`), el sistema lo marcaba aprobado pero las horas se
  quedaban en 0 para siempre — nunca se calculaban. Ya no es posible: ahora
  aprobar ese tipo de registro exige primero escribir la hora de salida real.
- `lib/horas.ts` — la lógica de normales-vs-extra ahora vive en un solo
  lugar y la usan tanto el marcaje del trabajador (`app/trabajador/page.tsx`)
  como la aprobación del supervisor — antes estaba duplicada (y con un
  umbral fijo de 5pm en el código); ahora ambas leen
  `configuracion_empresa.hora_inicio_extra` de verdad.
- `app/supervisor/page.tsx` — si el registro es `cerrado_automatico`, pide
  la hora de salida real antes de habilitar "Aprobar"; al aprobar, calcula
  horas_normales/horas_extra con esa hora y recién entonces cambia el
  estado. "Rechazar" no necesita la hora (el registro no entra a nómina).


## Corte 5 — Cierre de semana y cálculo de nómina
- `sql/005_cierre_semana.sql` — el corazón de la nómina:
  - `cerrar_semana_actual(empresa_id)`: cierra la semana abierta, marca como
    `cerrado_automatico` los turnos sin salida, calcula horas × tarifa +
    seguro por trabajador y genera el pago **en borrador** (descuento de
    préstamo en $0 — eso lo confirma el Admin), y abre la semana siguiente.
  - El barrido es por horas **no pagadas todavía** (columna nueva
    `registros_horas.pago_semanal_id`), no por semana — así una hora
    aprobada tarde simplemente se paga en la corrida siguiente, sin
    necesitar lógica ni tabla aparte para "atrasados".
  - `cerrar_semanas_vencidas()`: se agenda con `pg_cron` cada 15 minutos y
    compara contra `fecha_cierre` (un timestamp ya correcto), no contra una
    hora fija de cron — así no se rompe con el cambio de horario de verano.
  - Ambas funciones quedan bloqueadas para clientes normales
    (`revoke execute ... from authenticated`) — solo el cron o una ruta de
    servidor con el service role pueden dispararlas.
  - `confirmar_pago_semanal(pago_id, descuento_prestamo)`: esta sí la llama
    el Admin desde la app. Valida que quien llama sea admin del trabajador
    correspondiente, aplica el descuento, recalcula el neto, marca el pago
    como pagado, y **descuenta el saldo del préstamo** (lo salda si llega a
    cero).
- `sql/007_cierre_diario_turnos.sql` — el cierre automático de las 5:00pm
  que habíamos dejado pendiente desde el diseño original: es una función
  **separada** del cierre semanal (corre cada 10 min, compara contra
  `configuracion_empresa.hora_inicio_extra` en hora de Turks and Caicos) —
  cierra el turno ese mismo día para que el supervisor lo vea de inmediato,
  no hasta el cierre del miércoles.
- `sql/006_privacidad_pagos.sql` — corrigió un hueco: la política de
  `pagos_semanales` original dejaba que cualquiera en la empresa viera el
  pago de un compañero. También le agregó RLS a `pago_proyecto_detalle`,
  que se había quedado sin proteger.
- `app/api/cerrar-semana/route.ts` — dispara el cierre manualmente (botón
  "Cerrar semana y generar reporte" en el Panel), verificando que quien
  llama sea Admin antes de usar el service role.
- `app/admin/reportes/confirmar/page.tsx` — **Confirmar pagos**: lista los
  pagos en borrador, muestra el saldo del préstamo activo de cada
  trabajador como referencia, el Admin escribe cuánto descontar esta
  semana, ve el neto recalculado en vivo, y confirma uno por uno.


## Corte 4 — Creador SaaS (completo)
- `sql/004_rls_completar.sql` — **importante**: nunca había escrito RLS para
  `suscripciones`, `planes`, `addons_catalogo`, `empresa_addons`,
  `catalogo_oficios` ni `configuracion_sistema` — sin esta migración esas
  tablas quedaban sin protección (o inaccesibles) según el motor de
  Supabase. También agrega el permiso de `UPDATE` en `empresas` que
  faltaba — sin él, la pantalla "Empresa" del Admin no podía guardar.
- El catálogo de oficios dejó de estar hardcodeado en el frontend — ahora
  vive en `catalogo_oficios` y el formulario de alta de trabajador
  (`app/admin/trabajadores/nuevo/page.tsx`) lo lee de ahí. Así, cuando el
  Creador SaaS agrega un oficio nuevo, aparece de inmediato en el formulario
  de cualquier empresa — es exactamente el patrón que pediste hace unas
  vueltas atrás ("que las opciones nuevas estén listas para usar").
- `app/owner/page.tsx` — **Empresas**: KPIs de la plataforma, plan y
  cantidad de trabajadores por empresa, suspender/activar (de verdad, sobre
  `empresas.estado`).
- `app/owner/facturacion/page.tsx` — **MRR real**, calculado sumando
  `planes.precio_mensual` de las empresas activas (no suspendidas),
  distribución por plan, tabla completa. Nota: esto asume que
  `planes.precio_mensual` se mantiene igual al Price configurado en
  Stripe — si ajustas un precio, hazlo en ambos lados.
- `app/owner/ajustes/page.tsx` — registro de empresas, modo mantenimiento,
  umbral de extra por defecto, y el catálogo de oficios editable
  (agregar/quitar — quitar desactiva, no borra, para no romper historial).


## Corte 3 — Admin (completo, con candados de plan reales)
- `lib/admin.ts` — helpers compartidos: semana abierta, costo por proyecto.
- `app/admin/layout.tsx` — navegación de 7 secciones.
- `app/admin/page.tsx` — **Panel**: KPIs, alerta real de sobrepresupuesto
  (Profesional+, calculada contra `presupuesto` de cada proyecto), costo por
  proyecto. Las gráficas de tendencia/distribución de costos NO están
  bloqueadas por plan a propósito — son datos propios de la empresa, no una
  función premium.
- `app/admin/proyectos/page.tsx` + `[id]/page.tsx` — lista y detalle. El
  detalle tiene **geo-cerca** (toggle real sobre `proyectos.geo_cerca_activa`)
  y **multi-supervisor** (inserta en `proyecto_supervisores`), ambos con
  candado si el plan no los incluye.
- `app/admin/trabajadores/` — lista con buscador + filtro por método de
  pago, y alta de trabajador. **Importante:** crear una cuenta real requiere
  la *service role key* de Supabase, así que el alta corre como **Server
  Action** (`actions.ts`) usando `lib/supabase/admin.ts` — esa key nunca
  llega al navegador. Se usa `inviteUserByEmail` (el trabajador recibe
  correo para poner su contraseña, no se le asigna una).
- `app/admin/reportes/page.tsx` — historial con candado Básico+, exportación
  automática con candado Profesional+.
- `app/admin/empresa/page.tsx` y `app/admin/ajustes/page.tsx` — perfil de
  empresa y configuración (horario, canales de notificación, firma digital
  con candado Profesional+).
- `app/admin/plan/page.tsx` + `lib/stripe.ts` + dos Route Handlers —
  **Stripe Checkout real**: "Elegir este plan" crea una sesión de Stripe de
  verdad; el webhook (`/api/stripe/webhook`) es quien realmente actualiza
  `suscripciones` cuando Stripe confirma el pago. El plan Gratuito no pasa
  por Stripe. Un pago fallido no baja el plan de inmediato — solo muestra un
  aviso, dando margen de reintento (así lo decidimos: "se paga la próxima
  semana" aplica al trabajador, pero para la propia suscripción de la
  empresa lo correcto es el reintento estándar de Stripe).


---

## Corte 44 — Servidor calcula horas, recuperar contraseña, Excel, ayuda, importación, idiomas
- **sql/033** (aplicar en Supabase): trigger `registros_horas_servidor` (el servidor fija hora, horas y estado; el trabajador solo puede cerrar su turno abierto), `calcular_horas_turno` con descuento de almuerzo configurable, tarifa congelada por registro (`tarifa_aplicada`), cierre automático configurable (23:00) que ya no corta las horas extra, fechas de semana en America/Grand_Turk, primera semana automática al crear empresa.
- **Recuperar contraseña**: `/recuperar` y `/nueva-clave`. En Supabase → Authentication → URL Configuration agrega la URL de la app en *Site URL* y `https://TU-APP/nueva-clave` en *Redirect URLs*.
- **Excel real (.xlsx)** en Reportes (`exceljs`; ejecutar `npm install`).
- **Ayuda** (`/ayuda`, FAQ). Opcional: variables `NEXT_PUBLIC_SOPORTE_EMAIL` y `NEXT_PUBLIC_SOPORTE_WHATSAPP` para mostrar contacto.
- **Registro público** (`/registro`, con campo trampa anti-bots; CAPTCHA sigue pendiente) e **importación CSV** de trabajadores (`/admin/trabajadores/importar`).
- **Idiomas es/en/ht** (`lib/i18n.ts`) aplicados a la navegación y la pantalla de inicio del trabajador; el resto de pantallas sigue en español.
- Sin compilar todavía: ejecutar `npm install && npm run build` y corregir lo que salga.

## Corte 45 — Radar de oportunidades: seguros (NIB/NHIP)
Se añadió `docs/radar-seguros-nib-nhip.md` con la especificación del Radar de oportunidades TCI
(OPP-1): tasas, topes, fechas de vencimiento (NHIP día 14, NIB día 15), brecha de work permits,
salario mínimo de construcción ($9/h), modelo de datos, historias y casos de prueba.
Las tasas deben confirmarse con el NIB y un contador antes de producción.

## Corte 46 — Remesas NIB/NHIP y prueba de 1 mes
- Prueba gratis de 30 días (antes 14) en registro público y alta por owner; después cae al plan Gratuito.
- `sql/034_remesas_nib_nhip.sql`: números NIB/NHIP, fechas de permiso, salario mínimo ($9/h) y vencimientos (14/15) configurables; función `remesa_mensual` y vista `v_brecha_registro_nhip`.
- Nueva pantalla `/admin/remesas`: totales por agencia con fecha límite, brecha NHIP y tarifas bajo el mínimo.
