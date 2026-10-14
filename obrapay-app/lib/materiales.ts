import type { SupabaseClient } from '@supabase/supabase-js';

export interface MaterialCatalogo {
  id: string;
  nombre: string;
  unidad: string;
  costo_referencial: number | null;
  activo: boolean;
}

export interface CompraPendiente {
  id: string;
  material_id: string;
  material_nombre: string;
  unidad: string;
  cantidad_total: number;
  cantidad_pendiente: number;
  costo_total: number;
  proveedor: string | null;
  comprado_en: string;
}

export interface EntregaProyecto {
  id: string;
  material_nombre: string;
  unidad: string;
  cantidad: number;
  costo_asignado: number;
  entregado_en: string;
}

export async function obtenerCatalogoMateriales(supabase: SupabaseClient, empresaId: string): Promise<MaterialCatalogo[]> {
  const { data } = await supabase
    .from('materiales_catalogo')
    .select('id, nombre, unidad, costo_referencial, activo')
    .eq('empresa_id', empresaId)
    .order('nombre');
  return data ?? [];
}

/**
 * Registra una compra a nivel empresa. Si se pasa proyectoId (el caso
 * "sabía el proyecto desde que compré"), de una vez se crea la entrega
 * completa a ese proyecto en el mismo paso — no obliga a repartir después
 * cuando ya se sabe.
 */
export async function registrarCompra(
  supabase: SupabaseClient,
  datos: {
    empresaId: string;
    materialId: string;
    cantidad: number;
    costoTotal: number;
    proveedor?: string;
    compradoPor: string;
    proyectoId?: string;
  }
) {
  const { data: compra, error } = await supabase
    .from('compras_materiales')
    .insert({
      empresa_id: datos.empresaId,
      material_id: datos.materialId,
      cantidad: datos.cantidad,
      costo_total: datos.costoTotal,
      proveedor: datos.proveedor || null,
      registrado_por: datos.compradoPor,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  if (datos.proyectoId) {
    const { error: errorEntrega } = await supabase.from('entregas_materiales').insert({
      compra_id: compra.id,
      proyecto_id: datos.proyectoId,
      cantidad: datos.cantidad,
      costo_asignado: datos.costoTotal,
      entregado_por: datos.compradoPor,
    });
    if (errorEntrega) return { error: errorEntrega.message };
  }

  return { ok: true, compraId: compra.id as string };
}

/** Compras que todavía tienen cantidad sin repartir a ningún proyecto. */
export async function obtenerComprasPendientes(supabase: SupabaseClient, empresaId: string): Promise<CompraPendiente[]> {
  const { data: compras } = await supabase
    .from('compras_materiales')
    .select('id, material_id, cantidad, costo_total, proveedor, comprado_en, materiales_catalogo(nombre, unidad)')
    .eq('empresa_id', empresaId)
    .order('comprado_en', { ascending: false });

  if (!compras || compras.length === 0) return [];

  const ids = compras.map((c) => c.id);
  const { data: entregas } = await supabase
    .from('entregas_materiales')
    .select('compra_id, cantidad')
    .in('compra_id', ids);

  const entregadoPorCompra = new Map<string, number>();
  (entregas ?? []).forEach((e) => {
    entregadoPorCompra.set(e.compra_id, (entregadoPorCompra.get(e.compra_id) ?? 0) + Number(e.cantidad));
  });

  return compras
    .map((c: any) => {
      const cantidadTotal = Number(c.cantidad);
      const entregado = entregadoPorCompra.get(c.id) ?? 0;
      return {
        id: c.id,
        material_id: c.material_id,
        material_nombre: c.materiales_catalogo?.nombre ?? '—',
        unidad: c.materiales_catalogo?.unidad ?? '',
        cantidad_total: cantidadTotal,
        cantidad_pendiente: cantidadTotal - entregado,
        costo_total: Number(c.costo_total),
        proveedor: c.proveedor,
        comprado_en: c.comprado_en,
      };
    })
    .filter((c) => c.cantidad_pendiente > 0);
}

/** Reparte (total o parcialmente) una compra ya existente a un proyecto. */
export async function entregarMaterial(
  supabase: SupabaseClient,
  datos: { compraId: string; proyectoId: string; cantidad: number; costoUnitario: number; entregadoPor: string }
) {
  const { error } = await supabase.from('entregas_materiales').insert({
    compra_id: datos.compraId,
    proyecto_id: datos.proyectoId,
    cantidad: datos.cantidad,
    costo_asignado: datos.cantidad * datos.costoUnitario,
    entregado_por: datos.entregadoPor,
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function obtenerEntregasPorProyecto(supabase: SupabaseClient, proyectoId: string): Promise<EntregaProyecto[]> {
  const { data } = await supabase
    .from('entregas_materiales')
    .select('id, cantidad, costo_asignado, entregado_en, compras_materiales(materiales_catalogo(nombre, unidad))')
    .eq('proyecto_id', proyectoId)
    .order('entregado_en', { ascending: false });

  return (data ?? []).map((e: any) => ({
    id: e.id,
    material_nombre: e.compras_materiales?.materiales_catalogo?.nombre ?? '—',
    unidad: e.compras_materiales?.materiales_catalogo?.unidad ?? '',
    cantidad: Number(e.cantidad),
    costo_asignado: Number(e.costo_asignado),
    entregado_en: e.entregado_en,
  }));
}

/** Total de materiales ya entregados a uno o varios proyectos, sumado. */
export async function totalMaterialesPorProyecto(supabase: SupabaseClient, proyectoIds: string[]): Promise<Map<string, number>> {
  const totales = new Map<string, number>();
  if (proyectoIds.length === 0) return totales;

  const { data } = await supabase
    .from('entregas_materiales')
    .select('proyecto_id, costo_asignado')
    .in('proyecto_id', proyectoIds);

  (data ?? []).forEach((e) => {
    totales.set(e.proyecto_id, (totales.get(e.proyecto_id) ?? 0) + Number(e.costo_asignado));
  });
  return totales;
}
