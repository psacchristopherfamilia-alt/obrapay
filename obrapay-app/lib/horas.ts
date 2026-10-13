import type { SupabaseClient } from '@supabase/supabase-js';

export interface HorasCalculadas {
  horasNormales: number;
  horasExtra: number;
}

/**
 * Divide el tiempo trabajado en normales vs. extra según la hora de corte
 * de la empresa (ej. "17:00"). Misma lógica para el marcaje del trabajador
 * y para cuando un supervisor le pone la hora de salida real a un turno
 * que se cerró automáticamente.
 */
export function calcularHoras(entrada: Date, salida: Date, horaInicioExtra: string): HorasCalculadas {
  const [h, m] = horaInicioExtra.split(':').map(Number);
  const limite = new Date(entrada);
  limite.setHours(h, m, 0, 0);

  if (salida <= limite) {
    return { horasNormales: (salida.getTime() - entrada.getTime()) / 3_600_000, horasExtra: 0 };
  }

  const inicioBloqueNormal = entrada > limite ? entrada : limite;
  const horasNormales = Math.max(0, (inicioBloqueNormal.getTime() - entrada.getTime()) / 3_600_000);
  const horasExtra = (salida.getTime() - inicioBloqueNormal.getTime()) / 3_600_000;
  return { horasNormales, horasExtra };
}

export async function obtenerHoraInicioExtra(supabase: SupabaseClient, empresaId: string): Promise<string> {
  const { data } = await supabase
    .from('configuracion_empresa')
    .select('hora_inicio_extra')
    .eq('empresa_id', empresaId)
    .maybeSingle();
  return data?.hora_inicio_extra ?? '17:00';
}
