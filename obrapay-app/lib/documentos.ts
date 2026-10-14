import type { SupabaseClient } from '@supabase/supabase-js';

export type TipoDocumento = 'permiso' | 'contrato' | 'seguro' | 'otro';

export interface DocumentoProyecto {
  id: string;
  nombre: string;
  tipo: TipoDocumento;
  storage_path: string;
  fecha_vencimiento: string | null;
  subido_en: string;
  url: string | null;
}

const BUCKET = 'documentos-proyecto';

// Un permiso, contrato o seguro es un documento — no hay razón para
// aceptar ejecutables, videos, o archivos de varios cientos de MB.
const TIPOS_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic'];
const TAMAÑO_MAXIMO_MB = 15;

/**
 * Lista los documentos de un proyecto junto con una URL firmada temporal
 * para cada uno — el bucket es privado a propósito (un permiso o contrato
 * no debe quedar accesible por link directo sin sesión), así que no hay
 * una URL pública fija que guardar.
 */
export async function obtenerDocumentosProyecto(supabase: SupabaseClient, proyectoId: string): Promise<DocumentoProyecto[]> {
  const { data } = await supabase
    .from('documentos_proyecto')
    .select('id, nombre, tipo, storage_path, fecha_vencimiento, subido_en')
    .eq('proyecto_id', proyectoId)
    .order('subido_en', { ascending: false });

  const documentos = data ?? [];
  const conUrl = await Promise.all(
    documentos.map(async (d) => {
      const { data: firmada } = await supabase.storage.from(BUCKET).createSignedUrl(d.storage_path, 60 * 10);
      return { ...d, url: firmada?.signedUrl ?? null };
    })
  );
  return conUrl;
}

export async function subirDocumento(
  supabase: SupabaseClient,
  proyectoId: string,
  archivo: File,
  tipo: TipoDocumento,
  fechaVencimiento: string | null,
  subidoPor: string
) {
  if (!TIPOS_PERMITIDOS.includes(archivo.type)) {
    return { error: 'Solo se aceptan PDF o imágenes (JPG, PNG, HEIC).' };
  }
  if (archivo.size > TAMAÑO_MAXIMO_MB * 1024 * 1024) {
    return { error: `El archivo no puede pesar más de ${TAMAÑO_MAXIMO_MB}MB.` };
  }

  const path = `${proyectoId}/${Date.now()}-${archivo.name}`;

  const { error: errorSubida } = await supabase.storage.from(BUCKET).upload(path, archivo);
  if (errorSubida) return { error: errorSubida.message };

  const { error: errorFila } = await supabase.from('documentos_proyecto').insert({
    proyecto_id: proyectoId,
    nombre: archivo.name,
    tipo,
    storage_path: path,
    fecha_vencimiento: fechaVencimiento || null,
    subido_por: subidoPor,
  });

  if (errorFila) {
    // La fila falló pero el archivo ya se subió — lo limpiamos para no
    // dejar basura huérfana en el bucket.
    await supabase.storage.from(BUCKET).remove([path]);
    return { error: errorFila.message };
  }

  return { ok: true };
}

export async function eliminarDocumento(supabase: SupabaseClient, documentoId: string, storagePath: string) {
  await supabase.storage.from(BUCKET).remove([storagePath]);
  const { error } = await supabase.from('documentos_proyecto').delete().eq('id', documentoId);
  if (error) return { error: error.message };
  return { ok: true };
}
