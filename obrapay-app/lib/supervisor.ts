import type { SupabaseClient } from '@supabase/supabase-js';
import type { Proyecto } from '@/types/database';

export async function obtenerProyectosDeSupervisor(
  supabase: SupabaseClient,
  usuarioId: string
): Promise<Proyecto[]> {
  const [{ data: principales }, { data: extra }] = await Promise.all([
    supabase.from('proyectos').select('*').eq('supervisor_principal_id', usuarioId),
    supabase
      .from('proyecto_supervisores')
      .select('proyectos(*)')
      .eq('usuario_id', usuarioId),
  ]);

  const extraProyectos = (extra ?? []).map((e: any) => e.proyectos as Proyecto);
  const todos = [...(principales ?? []), ...extraProyectos];

  // dedupe por id (un proyecto podría tener al supervisor como principal
  // Y en proyecto_supervisores si se migró mal el dato)
  const porId = new Map(todos.map((p) => [p.id, p]));
  return Array.from(porId.values());
}
