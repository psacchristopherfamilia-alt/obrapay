'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import {
  obtenerCatalogoMateriales, obtenerComprasPendientes, registrarCompra, entregarMaterial,
  type MaterialCatalogo, type CompraPendiente,
} from '@/lib/materiales';
import type { Proyecto } from '@/types/database';

export default function CompradorPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();

  const [catalogo, setCatalogo] = useState<MaterialCatalogo[]>([]);
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [pendientes, setPendientes] = useState<CompraPendiente[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ materialId: '', cantidad: '', costo: '', proveedor: '', proyectoId: '' });
  const [guardando, setGuardando] = useState(false);

  const [repartiendo, setRepartiendo] = useState<string | null>(null);
  const [proyectoReparto, setProyectoReparto] = useState('');
  const [cantidadReparto, setCantidadReparto] = useState('');

  async function cargar() {
    if (!usuario?.empresa_id) return;
    const [cat, pend, { data: proys }] = await Promise.all([
      obtenerCatalogoMateriales(supabase, usuario.empresa_id),
      obtenerComprasPendientes(supabase, usuario.empresa_id),
      supabase.from('proyectos').select('*').eq('empresa_id', usuario.empresa_id).eq('estado', 'activo'),
    ]);
    setCatalogo(cat);
    setPendientes(pend);
    setProyectos(proys ?? []);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
  }, [supabase, usuario]);

  async function manejarRegistrarCompra() {
    if (!form.materialId || !form.cantidad || !form.costo || !usuario?.empresa_id) return;
    setGuardando(true);
    const resultado = await registrarCompra(supabase, {
      empresaId: usuario.empresa_id,
      materialId: form.materialId,
      cantidad: parseFloat(form.cantidad),
      costoTotal: parseFloat(form.costo),
      proveedor: form.proveedor || undefined,
      compradoPor: usuario.id,
      proyectoId: form.proyectoId || undefined,
    });
    setGuardando(false);
    if (resultado.error) {
      alert('No se pudo registrar: ' + resultado.error);
      return;
    }
    setForm({ materialId: '', cantidad: '', costo: '', proveedor: '', proyectoId: '' });
    await cargar();
  }

  async function manejarEntregar(compra: CompraPendiente) {
    if (!proyectoReparto || !cantidadReparto || !usuario) return;
    const cantidad = parseFloat(cantidadReparto);
    if (cantidad > compra.cantidad_pendiente) {
      alert(`Solo quedan ${compra.cantidad_pendiente} ${compra.unidad} sin repartir de esta compra.`);
      return;
    }
    const costoUnitario = compra.costo_total / compra.cantidad_total;
    const resultado = await entregarMaterial(supabase, {
      compraId: compra.id,
      proyectoId: proyectoReparto,
      cantidad,
      costoUnitario,
      entregadoPor: usuario.id,
    });
    if (resultado.error) {
      alert('No se pudo entregar: ' + resultado.error);
      return;
    }
    setRepartiendo(null);
    setProyectoReparto('');
    setCantidadReparto('');
    await cargar();
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-1">Compras</h1>
      <p className="text-sm text-inkSoft mb-5">
        Si ya sabes a qué proyecto va, selecciónalo de una vez. Si no, la compra queda pendiente para repartir después.
      </p>

      <div className="bg-card border border-line rounded p-4 mb-5 space-y-2">
        <p className="text-[11px] font-bold uppercase text-inkSoft">Nueva compra</p>
        <select
          value={form.materialId}
          onChange={(e) => setForm({ ...form, materialId: e.target.value })}
          className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white"
        >
          <option value="">Selecciona un material…</option>
          {catalogo.filter((m) => m.activo).map((m) => (
            <option key={m.id} value={m.id}>{m.nombre} (por {m.unidad})</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            type="number"
            value={form.cantidad}
            onChange={(e) => setForm({ ...form, cantidad: e.target.value })}
            placeholder="Cantidad"
            className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={form.costo}
            onChange={(e) => setForm({ ...form, costo: e.target.value })}
            placeholder="Costo total $"
            className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
          />
        </div>
        <input
          value={form.proveedor}
          onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
          placeholder="Proveedor (opcional)"
          className="w-full border border-line rounded-sm px-3 py-2 text-sm"
        />
        <select
          value={form.proyectoId}
          onChange={(e) => setForm({ ...form, proyectoId: e.target.value })}
          className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white"
        >
          <option value="">Sin proyecto todavía (reparto después)</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <button
          onClick={manejarRegistrarCompra}
          disabled={guardando}
          className="w-full bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60"
        >
          {guardando ? 'Registrando…' : '+ Registrar compra'}
        </button>
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-3">
        Pendientes de repartir
      </p>
      <div className="space-y-2">
        {pendientes.map((c) => (
          <div key={c.id} className="bg-card border border-line rounded p-3">
            <div className="flex justify-between items-start mb-1">
              <p className="font-semibold text-sm text-ink">{c.material_nombre}</p>
              <span className="text-xs text-inkSoft">
                {new Date(c.comprado_en).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}
              </span>
            </div>
            <p className="text-xs text-inkSoft mb-2">
              Quedan {c.cantidad_pendiente} de {c.cantidad_total} {c.unidad} sin repartir
              {c.proveedor ? ` · ${c.proveedor}` : ''}
            </p>

            {repartiendo === c.id ? (
              <div className="space-y-2">
                <select
                  value={proyectoReparto}
                  onChange={(e) => setProyectoReparto(e.target.value)}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white"
                >
                  <option value="">Selecciona el proyecto…</option>
                  {proyectos.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
                <input
                  type="number"
                  value={cantidadReparto}
                  onChange={(e) => setCantidadReparto(e.target.value)}
                  placeholder={`Cantidad (máx. ${c.cantidad_pendiente})`}
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setRepartiendo(null)}
                    className="flex-1 border border-line rounded-sm py-2 text-xs font-bold text-ink"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => manejarEntregar(c)}
                    className="flex-1 bg-primary text-white rounded-sm py-2 text-xs font-bold"
                  >
                    Entregar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setRepartiendo(c.id)}
                className="text-[11px] font-bold text-primary"
              >
                Repartir a un proyecto →
              </button>
            )}
          </div>
        ))}
        {pendientes.length === 0 && (
          <p className="text-sm text-inkSoft">No hay compras pendientes de repartir.</p>
        )}
      </div>
    </>
  );
}
