# Seguros en TCI: NIB + NHIP (del Radar de oportunidades TCI)

Origen: base de Notion "Radar de oportunidades TCI", ficha OPP-1
(semana 2026-10-12, estado: Pendiente de aprobar, SaaS: Nómina).
Puntajes: Relevancia TCI 5, Encaje SaaS 5, Frecuencia 5, Dolor 4, Disposición a pagar 4.

> AVISO: las tasas y topes de abajo vienen de fuentes que NO coinciden entre sí.
> Deben confirmarse con el NIB y con un contador antes de usarse en producción.
> Por eso en OBRAPAY son configurables por empresa y nunca van fijas en el código.

## Problema
El empleador en TCI remite a dos agencias distintas: NIB (seguro nacional) y
NHIP (seguro de salud). Cada una tiene su tope mensual y su fecha límite.
Aplicar un solo tope, o pagar ambas el día 15, produce errores y pagos tardíos de NHIP.

## Datos de las fuentes
| Concepto | Valor | Fuente |
|---|---|---|
| NIB total | 12% (6.5% empleador / 5.5% empleado) | TriblockHR, 6-abr-2026 |
| NIB (otra versión) | 6% / 6% | Rivermate (no coincide) |
| Tope mensual NIB | cercano a $6,000 | TriblockHR |
| NHIP total | 6% (3% + 3%) | TriblockHR |
| Tope mensual NHIP | cercano a $7,800 | TriblockHR |
| Vencimiento NHIP | día 14 del mes siguiente | TriblockHR |
| Vencimiento NIB | día 15 del mes siguiente | TriblockHR |
| Salario mínimo construcción | $9.00/h (resto de sectores $8.00) | Newsline TCI |

Fuentes:
- https://triblockhr.com/turks-caicos-nib-nhip-dual-agency-payroll/
- https://rivermate.com/guides/turks-and-caicos-islands/taxes
- https://www.newslinetci.com/post/government-increases-minimum-wage-to-8-per-hour-establishes-living-wage-support-system
- https://www.tcinib.tc/wp-content/uploads/2026/05/National-Insurance-Board-Budget-2026-27.pdf

## Brecha de work permits
Las contribuciones corren desde la aprobación del permiso, pero la tarjeta física
necesaria para registrarse en NHIP puede tardar meses. El error suele aparecer en
auditoría. La construcción tiene muchos titulares de permiso.

## Solución propuesta
1. Motor de deducciones configurable por año (tasas y topes NIB/NHIP separados).
2. Reporte de remesa mensual con dos fechas límite (NHIP día 14, NIB día 15) y aviso 3 días antes.
3. Alerta de trabajadores con permiso aprobado pero sin número NHIP.
4. Validación de salario mínimo de construcción ($9/h) al aprobar horas.

## Historias de usuario
1. Admin: configura por año tasas y topes de NIB y NHIP (empleado/empleador).
2. Admin: al cerrar la semana (miércoles 23:59) ve por trabajador la deducción NIB y NHIP con su tope mensual acumulado.
3. Admin: recibe reporte mensual de remesa por agencia con fecha límite y recordatorio 3 días antes.
4. Supervisor: al aprobar horas, avisa si la tarifa queda bajo el mínimo de construcción.
5. Admin: lista de trabajadores con permiso aprobado y sin número NHIP, con contribución acumulada pendiente.

## Modelo de datos propuesto (adaptar a los nombres actuales de OBRAPAY)
- `tasas_legales`: empresa_id, agencia ('NIB'|'NHIP'), vigente_desde, vigente_hasta, pct_empleado, pct_empleador, tope_mensual, dia_vencimiento.
- `perfiles` (trabajadores): añadir `numero_nib`, `numero_nhip`, `permiso_aprobado_el`, `tarjeta_recibida_el`, `sector` (default 'construccion').
- `deducciones_nomina`: empresa_id, semana_id, trabajador_id, agencia, base_bruta, monto_empleado, monto_empleador, base_acumulada_mes.
- `salarios_minimos`: empresa_id, sector, minimo_hora, vigente_desde.
- RLS: todo filtrado por empresa; solo admin escribe tasas y mínimos; supervisores solo lectura.
- Vista `v_brecha_registro_nhip`.

## Casos de prueba obligatorios (toca dinero)
1. $7,000/mes: NIB topado en $6,000; NHIP sobre $7,000.
2. $8,500/mes: NHIP topado en $7,800; NIB en $6,000.
3. Semana que cruza el tope mensual: solo se descuenta la diferencia restante, nunca negativo.
4. Semana que cruza dos meses: repartir por fecha de pago (decisión por confirmar).
5. Cambio de tasa a mitad de año: semanas anteriores conservan la tasa anterior.
6. Redondeo a 2 decimales; empleado + empleador = total del reporte.
7. Tarifa $8.50/h en construcción: advertencia; $9.00: OK.
8. Permiso aprobado 1-jul y tarjeta 15-sep: aparece en la vista de brecha con contribución jul-sep.
9. RLS: usuario de otra empresa no puede leer deducciones.

## Esfuerzo estimado
4-6 días: 1 modelo+RLS, 2 cálculo+pruebas, 1 reportes, 1 UI y avisos.

## Estado en OBRAPAY
- Ya existe: configuración de NIB/NHIP por empresa (tasas y topes editables) y cierre semanal.
- Pendiente: topes mensuales acumulados por agencia, reporte de remesa con fechas 14/15,
  alerta de brecha NHIP, validación de salario mínimo $9/h.
