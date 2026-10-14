// Fechas "solo día" (YYYY-MM-DD) se muestran tal cual, sin corrimiento por zona horaria.
export function fechaCorta(valor: string, opciones: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) {
  const soloDia = /^\d{4}-\d{2}-\d{2}$/.test(valor);
  const d = soloDia ? new Date(valor + 'T12:00:00Z') : new Date(valor);
  return d.toLocaleDateString('es-DO', { ...opciones, timeZone: soloDia ? 'UTC' : 'America/Grand_Turk' });
}
