// Textos para compañías que pagan por quincena o por mes: donde la app dice "semana", dice "periodo".
// El español se escribe a mano (género: "el periodo cerrado"); inglés y kreyòl se derivan cambiando la palabra,
// salvo los textos que mencionan el día de cierre o de pago, que van a mano.

export const PERIODO_ES = {
  "nav.nomina": "Nómina del periodo", "comun.semana": "Periodo",
  "semana.abierta": "abierto", "semana.cerrada": "cerrado", "semana.pagada": "pagado",
  "reloj.cierra": "el periodo cierra su último día, 11:59 p.m.", "reloj.semana": "Este periodo",
  "horas.vacio": "No hay turnos en este periodo.", "horas.total": "Total del periodo",
  "pago.en_curso": "periodo en curso, puede cambiar", "pago.vacio": "Todavía no hay horas aprobadas en este periodo.",
  "pago.sin_cia": "No hay horas aprobadas en ninguna compañía en este periodo.",
  "recibo.titulo": "Recibo de pago", "recibo.cerrada": "Periodo cerrado",
  "recibo.nota_provisional": "El periodo sigue abierto: las cifras pueden cambiar hasta el cierre.",
  "pres.nota_mo": "La mano de obra cuenta hasta el último periodo cerrado. Los aportes NIB/NHIP del empleador no se reparten por obra.",
  "ay.horas": "Tus turnos del periodo y si ya fueron aprobados.",
  "ay.pago.p": "Elige el periodo.|Mira el bruto, los descuentos y el neto.|Revisa tus horas si algo no cuadra.",
  "ay.pago.o": "Los montos de un periodo abierto pueden cambiar hasta que se cierre.",
  "ay.aprobar.p": "Revisa las horas de entrada y salida.|Aprueba o corrige.|Hazlo antes de que cierre el periodo.",
  "ay.aprobar.o": "El periodo cierra solo: lo que no apruebes a tiempo puede quedar fuera del pago.",
  "ay.resumen.p": "Mira los totales del periodo.|Revisa las alertas.|Entra a Reportes para ver el detalle.",
  "ay.nomina": "Lo que se paga en este periodo a cada trabajador.",
  "ay.nomina.p": "Aprueba los turnos pendientes.|Revisa descuentos y préstamos.|Cierra el periodo y luego márcalo como pagado.",
  "ay.nomina.o": "Un periodo cerrado se puede reabrir, pero queda anotado en el Historial.",
  "ay.trabajadores.o": "Cambiar una tarifa no altera los periodos ya cerrados.",
  "ay.prestamos": "Préstamos internos a trabajadores que se descuentan en cada periodo.",
  "ay.prestamos.p": "Registra el monto y la cuota por periodo.|El descuento sale solo en la nómina.|Revisa el saldo pendiente.",
  "ay.reportes.o": "Los totales de nómina usan los periodos cerrados.",
  "tour.nomina": "Aquí cierras el periodo y marcas el pago.",
  "hist.f_semanas": "Periodos y pagos",
  "hist.t_semana_cerrada": "{quien} cerró el periodo {sem}", "hist.t_semana_reabierta": "{quien} reabrió el periodo {sem}",
  "hist.t_semana_pagada": "{quien} marcó como pagado el periodo {sem}",
  "hist.t_descuento_ajustado_al_cierre": "Se ajustó el descuento de préstamo de {sobre} al cerrar el periodo {sem}",
  "cfg.cal_resumen": "Periodo de {ini} a {fin} · se paga el {pago}",
  "aprobar.cierre": "Los turnos que terminan antes de las 5 p.m. se aprueban solos: aquí solo ves los que pasan de las 5 p.m. o se marcaron fuera del área. El periodo cierra su último día a las 11:59 p.m. Lo que no apruebes lo puede aprobar el admin, pero queda marcado.",
  "nomina.titulo": "Nómina del periodo", "nomina.vacia": "No hay horas aprobadas en este periodo.",
  "nomina.cerrar": "Cerrar periodo ahora", "nomina.reabrir": "Reabrir periodo",
  "nomina.en_vivo": "Periodo abierto: los montos se calculan en vivo con lo aprobado y pueden cambiar hasta el cierre.",
  "nomina.cerrar_t": "¿Cerrar el periodo ahora?",
  "nomina.cerrar_txt": "Se congela la nómina con lo aprobado. Lo que esté por aprobar pasa al periodo siguiente. El sistema lo cierra solo su último día a las 11:59 p.m.",
  "nomina.cerrada_ok": "Periodo cerrado", "nomina.pagada_t": "¿Marcar el periodo como pagado?",
  "nomina.pagada_txt": "Confirma que se pagó {neto}. Un periodo pagado ya no se puede reabrir.", "nomina.pagada_ok": "Periodo marcado como pagado",
  "nomina.reabrir_t": "Reabrir periodo", "nomina.reabierta_ok": "Periodo reabierto",
  "ciclo.cierre": "Cierre del periodo", "turnos.semana": "Todo el periodo",
  "trab.aviso_tarifa": "El trabajador recibe un aviso con el cambio. Los periodos ya cerrados no cambian.",
  "prest.semana": "Descuentos del periodo {semana}",
  "prest.nota": "El descuento se aplica al cerrar el periodo. Cámbialo en cada periodo según lo que gane el trabajador; el saldo baja solo.",
  "prest.bruto_semana": "Bruto este periodo {bruto}", "prest.descontar": "Descontar este periodo",
  "rep.semanas": "Periodos", "rep.nota": "Incluye los periodos cerrados cuyo día de pago cae en el mes.",
  "rep.vacio": "No hay periodos cerrados en este mes.",
  "aj.semana_fija": "Los periodos de pago los define la frecuencia de pago de la compañía.",
  "dueno.vs_anterior": "contra el periodo anterior", "dueno.tendencia": "Costo bruto por periodo", "dueno.nota": "Periodo {semana} · {estado}.",
  "comp.nota": "Mano de obra: periodos cerrados o pagados cuyo día de pago cae en el mes. Gastos: por su fecha.",
  "seg.nota": "Las tasas y topes de más abajo son los de partida: confírmalos con el NIB o un contador. Cada periodo cuenta en el mes de su día de pago y el tope se acumula dentro del mes.",
  "seg.semanas": "Periodos",
  "cont.una_semana": "Un periodo", "cont.semana": "Periodo", "cont.sin_semanas": "Todavía no hay periodos cerrados en esta compañía.",
  "cont.nota_mes": "Cada periodo cuenta en el mes de su día de pago.",
  "cont.nota_nib_mes": "El NIB del mes sigue el formulario INS.007: Parte A (ganancias por periodo, N si no hubo), Parte B (empezaron) y Parte C (dejaron).",
  "cont.nota_nib_semana": "El NIB del periodo trae lo ganado, la base y los aportes de cada trabajador.",
  "aviso.semana_cierre": "<strong>El periodo cierra hoy</strong> ({inicio} – {fin}). Aprueba los turnos pendientes antes de las 11:59 p.m.",
};

const MANUAL = {
  en: {
    "reloj.cierra": "the period closes on its last day, 11:59 p.m.",
    "recibo.titulo": "Pay stub",
    "aprobar.cierre": "Shifts that end before 5 p.m. are approved automatically: you only see the ones that run past 5 p.m. or were clocked outside the area. The period closes on its last day at 11:59 p.m. Anything you don't approve can be approved by the admin, but it gets flagged.",
    "nomina.cerrar_txt": "Payroll is frozen with what is approved. Anything still pending moves to the next period. The system closes it on its own on its last day at 11:59 p.m.",
    "prest.nota": "The deduction is applied when the period closes. Change it each period based on what the worker earns; the balance updates itself.",
    "aj.semana_fija": "Pay periods follow the company's pay frequency.",
    "rep.nota": "Includes closed periods whose payday falls in the month.",
    "seg.nota": "The rates and caps below are starting values: confirm them with the NIB or an accountant. Each period counts in the month of its pay date and the cap accumulates within the month.",
    "cont.nota_mes": "Each period counts in the month of its pay date.",
    "comp.nota": "Labor: closed or paid periods whose payday falls in the month. Expenses: by their date.",
  },
  ht: {
    "reloj.cierra": "peryòd la fèmen dènye jou li a, 11:59 p.m.",
    "recibo.titulo": "Resi peman",
    "aprobar.cierre": "Vire ki fini anvan 5 p.m. apwouve poukont yo: isit la ou wè sèlman sa ki pase 5 p.m. oswa ki make deyò zòn nan. Peryòd la fèmen dènye jou li a a 11:59 p.m. Sa ou pa apwouve, admin ka apwouve l, men l ap make.",
    "nomina.cerrar_txt": "Pewòl la ap fikse ak sa ki apwouve. Sa ki ap tann ap pase nan peryòd apre a. Sistèm nan fèmen l pou kont li dènye jou a a 11:59 p.m.",
    "prest.nota": "Dediksyon an aplike lè peryòd la fèmen. Chanje l chak peryòd dapre sa travayè a fè; balans lan desann pou kont li.",
    "aj.semana_fija": "Peryòd peman yo swiv frekans peman konpayi a.",
    "rep.nota": "Li gen peryòd ki fèmen yo ki gen jou peman an nan mwa a.",
    "seg.nota": "Pousantaj ak plafon ki anba yo se valè pou kòmanse: konfime yo ak NIB oswa yon kontab. Chak peryòd konte nan mwa jou peman li a e plafon an akimile andedan mwa a.",
    "cont.nota_mes": "Chak peryòd konte nan mwa jou peman li a.",
    "comp.nota": "Men-d-èv: peryòd fèmen oswa peye ki gen jou peman an nan mwa a. Depans: dapre dat yo.",
  },
};

const DERIVA = {
  en: [[/\bWeeks\b/g, "Periods"], [/\bweeks\b/g, "periods"], [/\bWeek\b/g, "Period"], [/\bweek\b/g, "period"]],
  ht: [[/Semèn/g, "Peryòd"], [/semèn/g, "peryòd"]],
};

// Devuelve el texto para una compañía por periodos, o undefined si esa clave no cambia.
export function textoPeriodo(idioma, clave, base) {
  if (idioma === "es") return PERIODO_ES[clave];
  if (MANUAL[idioma]?.[clave] !== undefined) return MANUAL[idioma][clave];
  if (PERIODO_ES[clave] === undefined || !DERIVA[idioma]) return undefined;
  return DERIVA[idioma].reduce((s, [de, a]) => s.replace(de, a), base);
}
