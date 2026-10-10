// Consultas compartidas entre vistas.
import { api } from "./api.js";
import { deLocal, sumarDias } from "./ui.js";

// Turnos tienen dos llaves hacia perfiles (perfil_id y aprobado_por): hay que nombrar la relación.
export const P_TURNO = "perfiles!turnos_perfil_id_fkey(nombre,usuario)";
export const P_PRESTAMO = "perfiles!prestamos_perfil_id_fkey(nombre)";

export async function semanaActual() {
  const id = await api.rpc("semana_actual");
  const filas = await api.sel("semanas", `select=*&id=eq.${id}`);
  return filas[0];
}

export async function listaSemanas(limite = 26) {
  await api.rpc("semana_actual"); // asegura que exista la semana en curso
  return api.sel("semanas", `select=*&order=inicio.desc&limit=${limite}`);
}

// Rango [desde, hasta) en ISO UTC para filtrar turnos por fecha local de la semana.
export function rangoSemana(semana, tz) {
  return {
    desde: deLocal(`${semana.inicio}T00:00`, tz),
    hasta: deLocal(`${sumarDias(semana.fin, 1)}T00:00`, tz),
  };
}

// Valor vigente en una fecha a partir de una lista de {vigente_desde, ...}
export function vigente(lista, fecha, campo) {
  const ok = lista.filter((x) => x.vigente_desde <= fecha).sort((a, b) => (a.vigente_desde < b.vigente_desde ? 1 : -1));
  return ok.length ? Number(ok[0][campo]) : null;
}

// Préstamos con saldo: [{...prestamo, pagado, saldo, descuentos: [...] }]
export async function prestamosConSaldo(filtroPerfil) {
  const filtro = filtroPerfil ? `&perfil_id=eq.${filtroPerfil}` : "";
  const [prestamos, descuentos] = await Promise.all([
    api.sel("prestamos", `select=*,${P_PRESTAMO}${filtro}&order=fecha.desc`),
    api.sel("descuentos_prestamo", "select=prestamo_id,semana_id,monto"),
  ]);
  return prestamos.map((p) => {
    const ds = descuentos.filter((d) => d.prestamo_id === p.id);
    const pagado = ds.reduce((s, d) => s + Number(d.monto), 0);
    return { ...p, descuentos: ds, pagado, saldo: Math.round((Number(p.monto_total) - pagado) * 100) / 100 };
  });
}

// La semana que la gerencia quiere ver primero: la última cerrada sin pagar; si no hay, la abierta.
export function semanaPorDefecto(semanas) {
  return semanas.find((s) => s.estado === "cerrada") || semanas.find((s) => s.estado === "abierta") || semanas[0];
}
