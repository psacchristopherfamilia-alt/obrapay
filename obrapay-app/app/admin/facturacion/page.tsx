'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { fmtUSD } from '@/lib/admin';
import {
  obtenerClientes, crearCliente,
  obtenerCotizaciones, crearCotizacion, cambiarEstadoCotizacion, convertirCotizacionAFactura,
  obtenerFacturas, crearFacturaDirecta, marcarFacturaPagada,
  type Cliente, type Cotizacion, type Factura, type ItemDocumento, type EstadoCotizacion,
} from '@/lib/facturacion';

type Pestana = 'clientes' | 'cotizaciones' | 'facturas';

const ETIQUETA_COT: Record<EstadoCotizacion, string> = {
  borrador: 'Borrador', enviada: 'Enviada', aceptada: 'Aceptada', rechazada: 'Rechazada',
};
const COLOR_COT: Record<EstadoCotizacion, string> = {
  borrador: 'bg-line text-inkSoft', enviada: 'bg-blue-50 text-primary',
  aceptada: 'bg-green-50 text-success', rechazada: 'bg-red-50 text-danger',
};
const COLOR_FACT: Record<string, string> = {
  pendiente: 'bg-blue-50 text-primary', pagada: 'bg-green-50 text-success',
  vencida: 'bg-red-50 text-danger', anulada: 'bg-line text-inkSoft',
};

function FormularioItems({ items, setItems }: { items: ItemDocumento[]; setItems: (i: ItemDocumento[]) => void }) {
  function actualizar(i: number, campo: keyof ItemDocumento, valor: string) {
    const copia = [...items];
    copia[i] = { ...copia[i], [campo]: campo === 'descripcion' ? valor : parseFloat(valor) || 0 };
    setItems(copia);
  }
  const total = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0);

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-1.5">
          <input
            value={item.descripcion}
            onChange={(e) => actualizar(i, 'descripcion', e.target.value)}
            placeholder="Descripción"
            className="flex-1 border border-line rounded-sm px-2 py-1.5 text-xs"
          />
          <input
            type="number"
            value={item.cantidad || ''}
            onChange={(e) => actualizar(i, 'cantidad', e.target.value)}
            placeholder="Cant."
            className="w-14 border border-line rounded-sm px-2 py-1.5 text-xs"
          />
          <input
            type="number"
            value={item.precio_unitario || ''}
            onChange={(e) => actualizar(i, 'precio_unitario', e.target.value)}
            placeholder="Precio"
            className="w-20 border border-line rounded-sm px-2 py-1.5 text-xs"
          />
          <button onClick={() => setItems(items.filter((_, j) => j !== i))} className="text-danger text-xs px-1">✕</button>
        </div>
      ))}
      <button
        onClick={() => setItems([...items, { descripcion: '', cantidad: 1, precio_unitario: 0 }])}
        className="text-[11px] font-bold text-primary"
      >
        + Agregar línea
      </button>
      <p className="text-right text-sm font-bold text-ink">Total: {fmtUSD(total)}</p>
    </div>
  );
}

export default function FacturacionPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [pestana, setPestana] = useState<Pestana>('cotizaciones');

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [limite, setLimite] = useState(30);

  // Formulario de cliente
  const [formCliente, setFormCliente] = useState({ nombre: '', contacto: '', telefono: '', email: '', direccion: '' });
  const [mostrarFormCliente, setMostrarFormCliente] = useState(false);

  // Formulario de cotización / factura directa
  const [mostrarFormDoc, setMostrarFormDoc] = useState<'cotizacion' | 'factura' | null>(null);
  const [clienteId, setClienteId] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [notas, setNotas] = useState('');
  const [items, setItems] = useState<ItemDocumento[]>([{ descripcion: '', cantidad: 1, precio_unitario: 0 }]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar() {
    if (!usuario?.empresa_id) return;
    const [c, cot, f] = await Promise.all([
      obtenerClientes(supabase, usuario.empresa_id),
      obtenerCotizaciones(supabase, usuario.empresa_id, limite),
      obtenerFacturas(supabase, usuario.empresa_id, limite),
    ]);
    setClientes(c);
    setCotizaciones(cot);
    setFacturas(f);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
  }, [supabase, usuario, limite]);

  function limpiarFormDoc() {
    setMostrarFormDoc(null);
    setClienteId('');
    setFechaLimite('');
    setNotas('');
    setItems([{ descripcion: '', cantidad: 1, precio_unitario: 0 }]);
    setError(null);
  }

  async function guardarCliente() {
    if (!formCliente.nombre.trim() || !usuario?.empresa_id) return;
    setGuardando(true);
    const resultado = await crearCliente(supabase, usuario.empresa_id, {
      nombre: formCliente.nombre,
      contacto: formCliente.contacto || null,
      telefono: formCliente.telefono || null,
      email: formCliente.email || null,
      direccion: formCliente.direccion || null,
    });
    setGuardando(false);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    setFormCliente({ nombre: '', contacto: '', telefono: '', email: '', direccion: '' });
    setMostrarFormCliente(false);
    await cargar();
  }

  async function guardarDocumento() {
    if (!clienteId || items.every((i) => !i.descripcion) || !usuario?.empresa_id) {
      setError('Selecciona un cliente y agrega al menos una línea.');
      return;
    }
    setGuardando(true);
    setError(null);
    const itemsValidos = items.filter((i) => i.descripcion.trim());

    const resultado = mostrarFormDoc === 'cotizacion'
      ? await crearCotizacion(supabase, {
          empresaId: usuario.empresa_id, clienteId, validaHasta: fechaLimite || undefined,
          notas: notas || undefined, items: itemsValidos, creadoPor: usuario.id,
        })
      : await crearFacturaDirecta(supabase, {
          empresaId: usuario.empresa_id, clienteId, fechaVencimiento: fechaLimite || undefined,
          notas: notas || undefined, items: itemsValidos, creadoPor: usuario.id,
        });

    setGuardando(false);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    limpiarFormDoc();
    await cargar();
  }

  async function manejarCambiarEstadoCot(id: string, estado: EstadoCotizacion) {
    await cambiarEstadoCotizacion(supabase, id, estado);
    await cargar();
  }

  async function manejarConvertir(cotizacionId: string) {
    if (!usuario?.empresa_id) return;
    const resultado = await convertirCotizacionAFactura(supabase, {
      empresaId: usuario.empresa_id, cotizacionId, creadoPor: usuario.id,
    });
    if (resultado.error) {
      alert('No se pudo convertir: ' + resultado.error);
      return;
    }
    setPestana('facturas');
    await cargar();
  }

  async function manejarMarcarPagada(id: string) {
    await marcarFacturaPagada(supabase, id);
    await cargar();
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-4">Facturación</h1>

      <div className="flex gap-1 mb-5 bg-line rounded-sm p-1">
        {(['cotizaciones', 'facturas', 'clientes'] as Pestana[]).map((p) => (
          <button
            key={p}
            onClick={() => setPestana(p)}
            className={`flex-1 py-2 text-xs font-bold rounded-sm capitalize ${
              pestana === p ? 'bg-white text-ink shadow-sm' : 'text-inkSoft'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {pestana === 'clientes' && (
        <>
          {!mostrarFormCliente ? (
            <button
              onClick={() => setMostrarFormCliente(true)}
              className="w-full bg-primary text-white rounded-sm py-2 text-xs font-bold mb-4"
            >
              + Nuevo cliente
            </button>
          ) : (
            <div className="bg-card border border-line rounded p-4 mb-4 space-y-2">
              <input value={formCliente.nombre} onChange={(e) => setFormCliente({ ...formCliente, nombre: e.target.value })}
                placeholder="Nombre" className="w-full border border-line rounded-sm px-3 py-2 text-sm" />
              <input value={formCliente.contacto} onChange={(e) => setFormCliente({ ...formCliente, contacto: e.target.value })}
                placeholder="Contacto (opcional)" className="w-full border border-line rounded-sm px-3 py-2 text-sm" />
              <input value={formCliente.telefono} onChange={(e) => setFormCliente({ ...formCliente, telefono: e.target.value })}
                placeholder="Teléfono (opcional)" className="w-full border border-line rounded-sm px-3 py-2 text-sm" />
              <input value={formCliente.email} onChange={(e) => setFormCliente({ ...formCliente, email: e.target.value })}
                placeholder="Correo (opcional)" className="w-full border border-line rounded-sm px-3 py-2 text-sm" />
              <input value={formCliente.direccion} onChange={(e) => setFormCliente({ ...formCliente, direccion: e.target.value })}
                placeholder="Dirección (opcional)" className="w-full border border-line rounded-sm px-3 py-2 text-sm" />
              {error && <p className="text-danger text-xs">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setMostrarFormCliente(false); setError(null); }} className="flex-1 border border-line rounded-sm py-2 text-xs font-bold">Cancelar</button>
                <button onClick={guardarCliente} disabled={guardando} className="flex-1 bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60">
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
          <div className="bg-card border border-line rounded divide-y divide-line">
            {clientes.map((c) => (
              <div key={c.id} className="px-4 py-3">
                <p className="font-semibold text-sm text-ink">{c.nombre}</p>
                <p className="text-xs text-inkSoft">{[c.contacto, c.telefono, c.email].filter(Boolean).join(' · ')}</p>
              </div>
            ))}
            {clientes.length === 0 && <p className="px-4 py-4 text-sm text-inkSoft">Sin clientes todavía.</p>}
          </div>
        </>
      )}

      {(pestana === 'cotizaciones' || pestana === 'facturas') && (
        <>
          {mostrarFormDoc === null ? (
            <button
              onClick={() => setMostrarFormDoc(pestana === 'cotizaciones' ? 'cotizacion' : 'factura')}
              disabled={clientes.length === 0}
              className="w-full bg-primary text-white rounded-sm py-2 text-xs font-bold mb-4 disabled:opacity-50"
            >
              + Nueva {pestana === 'cotizaciones' ? 'cotización' : 'factura'}
            </button>
          ) : (
            <div className="bg-card border border-line rounded p-4 mb-4 space-y-2">
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white">
                <option value="">Selecciona un cliente…</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <div>
                <label className="block text-[11px] font-semibold text-inkSoft mb-1">
                  {mostrarFormDoc === 'cotizacion' ? 'Válida hasta (opcional)' : 'Fecha de vencimiento (opcional)'}
                </label>
                <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className="w-full border border-line rounded-sm px-3 py-2 text-sm" />
              </div>
              <FormularioItems items={items} setItems={setItems} />
              <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas (opcional)" className="w-full border border-line rounded-sm px-3 py-2 text-sm" />
              {error && <p className="text-danger text-xs">{error}</p>}
              <div className="flex gap-2">
                <button onClick={limpiarFormDoc} className="flex-1 border border-line rounded-sm py-2 text-xs font-bold">Cancelar</button>
                <button onClick={guardarDocumento} disabled={guardando} className="flex-1 bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60">
                  {guardando ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
          {clientes.length === 0 && mostrarFormDoc === null && (
            <p className="text-[11px] text-inkSoft mb-4">Agrega un cliente primero, en la pestaña "Clientes".</p>
          )}

          {pestana === 'cotizaciones' && (
            <div className="bg-card border border-line rounded divide-y divide-line">
              {cotizaciones.map((c) => (
                <div key={c.id} className="px-4 py-3">
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <p className="font-semibold text-sm text-ink">N.º {c.numero} — {c.cliente_nombre}</p>
                      <p className="text-xs text-inkSoft">{new Date(c.fecha).toLocaleDateString('es-DO')} · {fmtUSD(c.total)}</p>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${COLOR_COT[c.estado]}`}>
                      {ETIQUETA_COT[c.estado]}
                    </span>
                  </div>
                  <div className="flex gap-2 items-center mt-1.5">
                    <a href={`/api/cotizaciones/${c.id}/pdf`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-primary">
                      Ver PDF
                    </a>
                    <select
                      value={c.estado}
                      onChange={(e) => manejarCambiarEstadoCot(c.id, e.target.value as EstadoCotizacion)}
                      className="text-[11px] border border-line rounded-sm px-1.5 py-1 bg-white"
                    >
                      {(Object.keys(ETIQUETA_COT) as EstadoCotizacion[]).map((s) => (
                        <option key={s} value={s}>{ETIQUETA_COT[s]}</option>
                      ))}
                    </select>
                    {c.estado === 'aceptada' && (
                      <button onClick={() => manejarConvertir(c.id)} className="text-[11px] font-bold text-success">
                        Convertir a factura →
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {cotizaciones.length === 0 && <p className="px-4 py-4 text-sm text-inkSoft">Sin cotizaciones todavía.</p>}
            </div>
          )}
          {pestana === 'cotizaciones' && cotizaciones.length >= limite && (
            <button onClick={() => setLimite(limite + 30)} className="w-full mt-3 border border-line rounded-sm py-2.5 text-xs font-bold text-ink">
              Cargar más cotizaciones
            </button>
          )}

          {pestana === 'facturas' && (
            <div className="bg-card border border-line rounded divide-y divide-line">
              {facturas.map((f) => (
                <div key={f.id} className="px-4 py-3">
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <p className="font-semibold text-sm text-ink">N.º {f.numero} — {f.cliente_nombre}</p>
                      <p className="text-xs text-inkSoft">
                        {new Date(f.fecha_emision).toLocaleDateString('es-DO')} · {fmtUSD(f.total)}
                        {f.fecha_vencimiento ? ` · vence ${new Date(f.fecha_vencimiento).toLocaleDateString('es-DO')}` : ''}
                      </p>
                    </div>
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${COLOR_FACT[f.estado]}`}>
                      {f.estado}
                    </span>
                  </div>
                  <div className="flex gap-2 items-center mt-1.5">
                    <a href={`/api/facturas/${f.id}/pdf`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-bold text-primary">
                      Ver PDF
                    </a>
                    {f.estado === 'pendiente' && (
                      <button onClick={() => manejarMarcarPagada(f.id)} className="text-[11px] font-bold text-success">
                        Marcar pagada
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {facturas.length === 0 && <p className="px-4 py-4 text-sm text-inkSoft">Sin facturas todavía.</p>}
            </div>
          )}
          {pestana === 'facturas' && facturas.length >= limite && (
            <button onClick={() => setLimite(limite + 30)} className="w-full mt-3 border border-line rounded-sm py-2.5 text-xs font-bold text-ink">
              Cargar más facturas
            </button>
          )}
        </>
      )}
    </>
  );
}
