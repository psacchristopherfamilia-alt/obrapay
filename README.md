# ObraPay

Reloj de trabajo y nómina semanal para una empresa de construcción en Turks and Caicos.
Trabajador marca por proyecto → supervisor aprueba → el sistema cierra el miércoles 11:59 p.m. →
el admin revisa → se paga el viernes. El dueño ve todo en solo lectura.

## Estado

| Parte | Estado |
| --- | --- |
| Base de datos (esquema, cálculo, operaciones, permisos) | Hecha y probada (122 pruebas) |
| Edge Function `crear-trabajador` | Escrita; se prueba al desplegar en Supabase |
| Tareas programadas (pg_cron) | Escritas; se activan en Supabase |
| App Next.js (pantallas) | Siguiente paso |

## Estructura

```
supabase/
  migrations/
    ..._esquema.sql       tablas y restricciones
    ..._calculo.sql       reglas de nómina (regular/extra, almuerzo, tarifa vigente, seguro)
    ..._operaciones.sql   RPC: marcar, aprobar, corregir, tarifas, préstamos, cierres, reportes
    ..._rls.sql           permisos por rol
    ..._cron.sql          cierres automáticos cada 5 minutos (solo Supabase)
  functions/crear-trabajador/   alta de trabajadores sin correo y restablecer contraseña
tests/db/                 pruebas SQL (cálculo, operaciones, permisos)
scripts/test-db.sh        corre migraciones + pruebas en un Postgres local
```

## Reglas de nómina

1. Regular = minutos antes de las 5:00 p.m. (hora local); extra = después. Misma tarifa.
2. Almuerzo fijo de 12:00 a 1:00 p.m.: el tiempo marcado en ese horario no se paga (configurable: `empresas.almuerzo_inicio`, `almuerzo_fin`).
3. Tarifa = la vigente en la fecha del turno; un aumento a mitad de semana aplica desde ese día.
4. Bruto se redondea a centavos al final de la semana. Seguro = % × bruto, redondeado.
5. Préstamo: lo fija el admin cada semana; nunca más que el saldo ni más que el pago.
6. Solo cuentan turnos aprobados. Lo aprobado tarde pasa a la semana siguiente.
7. Al cerrar, la nómina se congela; corregir exige que el admin reabra la semana.

## Correr las pruebas

Requiere PostgreSQL 15+ local.

```bash
PGHOST=/tmp PGUSER=postgres ./scripts/test-db.sh
```

## Desplegar la base de datos

```bash
supabase link --project-ref <ref>
supabase db push
supabase functions deploy crear-trabajador
supabase secrets set APP_ORIGIN=https://<tu-dominio>
```
