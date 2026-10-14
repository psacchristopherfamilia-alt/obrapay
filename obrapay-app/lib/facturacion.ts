import type { SupabaseClient } from '@supabase/supabase-js';

export type EstadoCotizacion = 'borrador' | 'enviada' | 'aceptada' | 'rechazada';
export type EstadoFactura = 'pendiente' | 'pagada' | 'vencida' | 'anulada';

export interface Cliente {
  id: string;
  nombre: string;
  contacto: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
}

export interface ItemDocumento {
  id?: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

export interface Cotizacion {
  id: string;
  numero: number;
  cliente_id: string;
  cliente_nombre: string;
  fecha: string;
  valida_hasta: string | null;
  estado: EstadoCotizacion;
  total: number;
}

export interface Factura {
  id: string;
  numero: number;
  cliente_id: string;
  cliente_nombre: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  estado: EstadoFactura;
  total: number;
}

export async function obtenerClientes(supabase: SupabaseClient, empresaId: string): Promise<Cliente[]> {
  const { data } = await supabase
    .from('clientes')
    .select('id, nombre, contacto, telefono, email, direccion')
    .eq('empresa_id', empresaId)
    .order('nombre');
  return data ?? [];
}

export async function crearCliente(supabase: SupabaseClient, empresaId: string, datos: Omit<Cliente, 'id'>) {
  const { data, error } = await supabase
    .from('clientes')
    .insert({ empresa_id: empresaId, ...datos })
    .select('id')
    .single();
  if (error) return { error: error.message };
  return { ok: true, clienteId: data.id as string };
}

function calcularTotal(items: ItemDocumento[]) {
  return items.reduce((sum, i) => sum + i.cantidad * i.precio_unitario, 0);
}

async function siguienteNumero(supabase: SupabaseClient, tabla: 'cotizaciones' | 'facturas', empresaId: string) {
  const { data } = await supabase
    .from(tabla)
    .select('numero')
    .eq('empresa_id', empresaId)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.numero ?? 0) + 1;
}

export async function obtenerCotizaciones(supabase: SupabaseClient, empresaId: string, limite = 30): Promise<Cotizacion[]> {
  const { data } = await supabase
    .from('cotizaciones')
    .select('id, numero, cliente_id, fecha, valida_hasta, estado, total, clientes(nombre)')
    .eq('empresa_id', empresaId)
    .order('numero', { ascending: false })
    .limit(limite);

  return (data ?? []).map((c: any) => ({
    id: c.id,
    numero: c.numero,
    cliente_id: c.cliente_id,
    cliente_nombre: c.clientes?.nombre ?? '—',
    fecha: c.fecha,
    valida_hasta: c.valida_hasta,
    estado: c.estado,
    total: Number(c.total),
  }));
}

export async function obtenerCotizacionCompleta(supabase: SupabaseClient, cotizacionId: string) {
  const { data: cot } = await supabase
    .from('cotizaciones')
    .select('*, clientes(*)')
    .eq('id', cotizacionId)
    .single();
  const { data: items } = await supabase
    .from('cotizacion_items')
    .select('id, descripcion, cantidad, precio_unitario')
    .eq('cotizacion_id', cotizacionId)
    .order('orden');
  return { cotizacion: cot, items: items ?? [] };
}

export async function crearCotizacion(
  supabase: SupabaseClient,
  datos: { empresaId: string; clienteId: string; proyectoId?: string; validaHasta?: string; notas?: string; items: ItemDocumento[]; creadoPor: string }
) {
  const numero = await siguienteNumero(supabase, 'cotizaciones', datos.empresaId);
  const total = calcularTotal(datos.items);

  const { data: cot, error } = await supabase
    .from('cotizaciones')
    .insert({
      empresa_id: datos.empresaId,
      cliente_id: datos.clienteId,
      proyecto_id: datos.proyectoId || null,
      numero,
      valida_hasta: datos.validaHasta || null,
      notas: datos.notas || null,
      subtotal: total,
      total,
      creado_por: datos.creadoPor,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  const filas = datos.items.map((it, i) => ({
    cotizacion_id: cot.id,
    descripcion: it.descripcion,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    orden: i,
  }));
  const { error: errorItems } = await supabase.from('cotizacion_items').insert(filas);
  if (errorItems) return { error: errorItems.message };

  return { ok: true, cotizacionId: cot.id as string };
}

export async function cambiarEstadoCotizacion(supabase: SupabaseClient, cotizacionId: string, estado: EstadoCotizacion) {
  const { error } = await supabase.from('cotizaciones').update({ estado }).eq('id', cotizacionId);
  if (error) return { error: error.message };
  return { ok: true };
}

/** Crea una factura a partir de una cotización aceptada, copiando sus líneas. */
export async function convertirCotizacionAFactura(
  supabase: SupabaseClient,
  datos: { empresaId: string; cotizacionId: string; fechaVencimiento?: string; creadoPor: string }
) {
  const { cotizacion, items } = await obtenerCotizacionCompleta(supabase, datos.cotizacionId);
  if (!cotizacion) return { error: 'Cotización no encontrada' };

  const numero = await siguienteNumero(supabase, 'facturas', datos.empresaId);

  const { data: fact, error } = await supabase
    .from('facturas')
    .insert({
      empresa_id: datos.empresaId,
      cliente_id: cotizacion.cliente_id,
      proyecto_id: cotizacion.proyecto_id,
      cotizacion_id: cotizacion.id,
      numero,
      fecha_vencimiento: datos.fechaVencimiento || null,
      subtotal: cotizacion.total,
      total: cotizacion.total,
      creado_por: datos.creadoPor,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  const filas = items.map((it: any, i: number) => ({
    factura_id: fact.id,
    descripcion: it.descripcion,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    orden: i,
  }));
  const { error: errorItems } = await supabase.from('factura_items').insert(filas);
  if (errorItems) return { error: errorItems.message };

  return { ok: true, facturaId: fact.id as string };
}

export async function crearFacturaDirecta(
  supabase: SupabaseClient,
  datos: { empresaId: string; clienteId: string; proyectoId?: string; fechaVencimiento?: string; notas?: string; items: ItemDocumento[]; creadoPor: string }
) {
  const numero = await siguienteNumero(supabase, 'facturas', datos.empresaId);
  const total = calcularTotal(datos.items);

  const { data: fact, error } = await supabase
    .from('facturas')
    .insert({
      empresa_id: datos.empresaId,
      cliente_id: datos.clienteId,
      proyecto_id: datos.proyectoId || null,
      fecha_vencimiento: datos.fechaVencimiento || null,
      notas: datos.notas || null,
      subtotal: total,
      total,
      creado_por: datos.creadoPor,
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  const filas = datos.items.map((it, i) => ({
    factura_id: fact.id,
    descripcion: it.descripcion,
    cantidad: it.cantidad,
    precio_unitario: it.precio_unitario,
    orden: i,
  }));
  const { error: errorItems } = await supabase.from('factura_items').insert(filas);
  if (errorItems) return { error: errorItems.message };

  return { ok: true, facturaId: fact.id as string };
}

export async function obtenerFacturas(supabase: SupabaseClient, empresaId: string, limite = 30): Promise<Factura[]> {
  const { data } = await supabase
    .from('facturas')
    .select('id, numero, cliente_id, fecha_emision, fecha_vencimiento, estado, total, clientes(nombre)')
    .eq('empresa_id', empresaId)
    .order('numero', { ascending: false })
    .limit(limite);

  return (data ?? []).map((f: any) => ({
    id: f.id,
    numero: f.numero,
    cliente_id: f.cliente_id,
    cliente_nombre: f.clientes?.nombre ?? '—',
    fecha_emision: f.fecha_emision,
    fecha_vencimiento: f.fecha_vencimiento,
    estado: f.estado,
    total: Number(f.total),
  }));
}

export async function obtenerFacturaCompleta(supabase: SupabaseClient, facturaId: string) {
  const { data: fact } = await supabase
    .from('facturas')
    .select('*, clientes(*)')
    .eq('id', facturaId)
    .single();
  const { data: items } = await supabase
    .from('factura_items')
    .select('id, descripcion, cantidad, precio_unitario')
    .eq('factura_id', facturaId)
    .order('orden');
  return { factura: fact, items: items ?? [] };
}

export async function marcarFacturaPagada(supabase: SupabaseClient, facturaId: string) {
  const { error } = await supabase
    .from('facturas')
    .update({ estado: 'pagada', fecha_pago: new Date().toISOString().slice(0, 10) })
    .eq('id', facturaId);
  if (error) return { error: error.message };
  return { ok: true };
}
