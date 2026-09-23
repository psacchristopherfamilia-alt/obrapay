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
13. Crea `.env.local` en la raíz con:
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
14. ✅ **Ya hecho** — los 5 Products/Prices de Stripe (3 planes + 2 add-ons)
   y la configuración del Customer Portal ya existen en la cuenta de prueba
   conectada. Lo único que falta de Stripe es el **endpoint de webhook**
   apuntando a `/api/stripe/webhook` (eventos `checkout.session.completed`,
   `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`)
   — no se pudo crear porque necesita una URL real y pública; mientras
   desarrollas en local, usa el Stripe CLI: `stripe listen --forward-to
   localhost:3000/api/stripe/webhook` (te da un `whsec_...` temporal para
   `STRIPE_WEBHOOK_SECRET`). Cuando despliegues la app, créalo apuntando a
   tu dominio real.
15. ~~En Stripe: Settings → Billing → Customer portal~~ — ya está
    configurado (ver Corte 21 más abajo).
16. En Supabase: **Database → Webhooks → Create a new webhook** —
    tabla `notificaciones`, evento `Insert`, tipo `HTTP Request`, URL
    `https://tu-dominio.com/api/notificaciones/enviar`, con el header
    `x-notif-secret: <el mismo valor que pusiste en NOTIF_WEBHOOK_SECRET>`.
    Esto es lo que conecta "se creó un aviso" con "se manda de verdad".
17. `npm install`
18. `npm run dev`

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

## Pendiente para el siguiente corte
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

