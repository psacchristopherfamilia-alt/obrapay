import type { SupabaseClient } from '@supabase/supabase-js';

export interface Certificacion {
  id: string;
  nombre: string;
  numero_certificado: string | null;
  fecha_vencimiento: string | null;
}

export async function obtenerCertificaciones(supabase: SupabaseClient, usuarioId: string): Promise<Certificacion[]> {
  const { data } = await supabase
    .from('certificaciones_trabajador')
    .select('id, nombre, numero_certificado, fecha_vencimiento')
    .eq('usuario_id', usuarioId)
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false });
  return data ?? [];
}

export async function agregarCertificacion(
  supabase: SupabaseClient,
  datos: { usuarioId: string; nombre: string; numeroCertificado?: string; fechaVencimiento?: string }
) {
  const { error } = await supabase.from('certificaciones_trabajador').insert({
    usuario_id: datos.usuarioId,
    nombre: datos.nombre,
    numero_certificado: datos.numeroCertificado || null,
    fecha_vencimiento: datos.fechaVencimiento || null,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function eliminarCertificacion(supabase: SupabaseClient, certificacionId: string) {
  const { error } = await supabase.from('certificaciones_trabajador').delete().eq('id', certificacionId);
  if (error) return { error: error.message };
  return { ok: true };
}

export interface CertificacionPorVencer extends Certificacion {
  trabajador_nombre: string;
}

/** Certificaciones de la empresa a 15 días o menos de vencer (o ya vencidas) — para la alerta del Panel. */
export async function obtenerCertificacionesPorVencer(supabase: SupabaseClient, empresaId: string): Promise<CertificacionPorVencer[]> {
  const limite = new Date();
  limite.setDate(limite.getDate() + 15);
  const { data } = await supabase
    .from('certificaciones_trabajador')
    .select('id, nombre, numero_certificado, fecha_vencimiento, usuarios!inner(nombre, empresa_id)')
    .eq('usuarios.empresa_id', empresaId)
    .not('fecha_vencimiento', 'is', null)
    .lte('fecha_vencimiento', limite.toISOString().slice(0, 10));

  return (data ?? []).map((c: any) => ({
    id: c.id,
    nombre: c.nombre,
    numero_certificado: c.numero_certificado,
    fecha_vencimiento: c.fecha_vencimiento,
    trabajador_nombre: c.usuarios?.nombre ?? '—',
  }));
}
