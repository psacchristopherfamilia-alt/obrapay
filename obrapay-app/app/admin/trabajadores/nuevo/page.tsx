'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { crearTrabajador } from './actions';
import type { RolUsuario, MetodoPago, Proyecto } from '@/types/database';

export default function NuevoTrabajadorPage() {
  const router = useRouter();
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();

  const [oficios, setOficios] = useState<string[]>([]);
  const [proyectosDisponibles, setProyectosDisponibles] = useState<Proyecto[]>([]);
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    telefono: '',
    sysRole: 'trabajador' as RolUsuario,
    oficio: '',
    tarifaHora: '',
    porcentajeSeguro: 5,
    prestamoInicial: '',
    metodoPago: 'transfer' as MetodoPago,
    cuentaBancaria: '',
    proyectoIds: [] as string[],
    idioma: 'es' as 'es' | 'en' | 'ht',
    requiereGps: true,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function cargar() {
      if (!usuario?.empresa_id) return;
      const [{ data: proys }, { data: oficiosDb }] = await Promise.all([
        supabase.from('proyectos').select('*').eq('empresa_id', usuario.empresa_id).eq('estado', 'activo'),
        supabase.from('catalogo_oficios').select('nombre').eq('activo', true).order('nombre'),
      ]);
      setProyectosDisponibles(proys ?? []);
      const listaOficios = (oficiosDb ?? []).map((o) => o.nombre);
      setOficios(listaOficios);
      if (listaOficios.length) setForm((f) => ({ ...f, oficio: listaOficios[0] }));
    }
    cargar();
  }, [supabase, usuario]);

  function toggleProyecto(id: string) {
    setForm((f) => ({
      ...f,
      proyectoIds: f.proyectoIds.includes(id) ? f.proyectoIds.filter((x) => x !== id) : [...f.proyectoIds, id],
    }));
  }

  async function guardar() {
    if (!form.nombre || !form.email || !form.tarifaHora) {
      setError('Nombre, correo y tarifa son obligatorios.');
      return;
    }
    setGuardando(true);
    setError(null);

    const resultado = await crearTrabajador({
      nombre: form.nombre,
      email: form.email,
      telefono: form.telefono || undefined,
      sysRole: form.sysRole,
      oficio: form.oficio,
      tarifaHora: parseFloat(form.tarifaHora),
      porcentajeSeguro: Number(form.porcentajeSeguro),
      prestamoInicial: parseFloat(form.prestamoInicial || '0'),
      metodoPago: form.metodoPago,
      cuentaBancaria: form.cuentaBancaria || undefined,
      proyectoIds: form.proyectoIds,
      idioma: form.idioma,
      requiereGps: form.requiereGps,
    });

    setGuardando(false);
    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    router.push('/admin/trabajadores');
  }

  const chip = (activo: boolean) =>
    `text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${
      activo ? 'bg-charcoal text-white border-charcoal' : 'border-line text-ink'
    }`;

  return (
    <>
      <a href="/admin/trabajadores" className="text-xs text-inkSoft">← Volver</a>
      <h1 className="font-heading font-extrabold text-2xl text-ink mt-2 mb-4">+ Nuevo trabajador</h1>

      <div className="bg-card border border-line rounded p-4 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Nombre completo</label>
          <input
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            placeholder="Ej. José Manuel Reyes"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Correo</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            placeholder="jose.reyes@obrapay.com"
          />
          <p className="text-[11px] text-inkSoft mt-1">Se le enviará un correo para crear su contraseña.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Teléfono (WhatsApp)</label>
          <input
            value={form.telefono}
            onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            placeholder="+1 649 000 0000"
          />
          <p className="text-[11px] text-inkSoft mt-1">Para avisos por WhatsApp. Opcional, pero recomendado.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Rol en el sistema</label>
          <div className="flex gap-1.5">
            {(['trabajador', 'supervisor', 'admin'] as RolUsuario[]).map((r) => (
              <span key={r} className={chip(form.sysRole === r)} onClick={() => setForm({ ...form, sysRole: r })}>
                {r === 'trabajador' ? 'Trabajador' : r === 'supervisor' ? 'Supervisor' : 'Admin'}
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Oficio</label>
          <select
            value={form.oficio}
            onChange={(e) => setForm({ ...form, oficio: e.target.value })}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          >
            {oficios.map((o) => <option key={o}>{o}</option>)}
          </select>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-inkSoft mb-1">Tarifa por hora</label>
            <input
              type="number"
              value={form.tarifaHora}
              onChange={(e) => setForm({ ...form, tarifaHora: e.target.value })}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              placeholder="10.00"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-inkSoft mb-1">% de seguro</label>
            <input
              type="number"
              value={form.porcentajeSeguro}
              onChange={(e) => setForm({ ...form, porcentajeSeguro: Number(e.target.value) })}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Préstamo inicial (opcional)</label>
          <input
            type="number"
            value={form.prestamoInicial}
            onChange={(e) => setForm({ ...form, prestamoInicial: e.target.value })}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            placeholder="0"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Método de pago</label>
          <div className="flex gap-1.5 flex-wrap">
            {(['transfer', 'cash', 'check', 'wallet'] as MetodoPago[]).map((m) => (
              <span key={m} className={chip(form.metodoPago === m)} onClick={() => setForm({ ...form, metodoPago: m })}>
                {m === 'transfer' ? 'Transferencia' : m === 'cash' ? 'Efectivo' : m === 'check' ? 'Cheque' : 'Billetera'}
              </span>
            ))}
          </div>
        </div>

        {form.metodoPago === 'transfer' && (
          <div>
            <label className="block text-xs font-semibold text-inkSoft mb-1">Cuenta bancaria</label>
            <input
              value={form.cuentaBancaria}
              onChange={(e) => setForm({ ...form, cuentaBancaria: e.target.value })}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              placeholder="Número de cuenta"
            />
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Proyectos asignados</label>
          <div className="flex gap-1.5 flex-wrap">
            {proyectosDisponibles.map((p) => (
              <span key={p.id} className={chip(form.proyectoIds.includes(p.id))} onClick={() => toggleProyecto(p.id)}>
                {p.nombre}
              </span>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Idioma preferido</label>
          <div className="flex gap-1.5">
            {(['es', 'en', 'ht'] as const).map((l) => (
              <span key={l} className={chip(form.idioma === l)} onClick={() => setForm({ ...form, idioma: l })}>
                {l.toUpperCase()}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-ink">Requerir ubicación GPS</span>
          <button
            onClick={() => setForm({ ...form, requiereGps: !form.requiereGps })}
            className={`w-10 h-5.5 rounded-full relative ${form.requiereGps ? 'bg-primary' : 'bg-line'}`}
          >
            <span className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full transition-transform ${form.requiereGps ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      </div>

      {error && <p className="text-danger text-sm mt-3">{error}</p>}

      <div className="flex gap-2 mt-4">
        <a href="/admin/trabajadores" className="flex-1 text-center border border-line rounded-sm py-3 text-sm font-bold text-ink">
          Cancelar
        </a>
        <button
          onClick={guardar}
          disabled={guardando}
          className="flex-1 bg-primary text-white rounded-sm py-3 text-sm font-bold disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar trabajador'}
        </button>
      </div>
    </>
  );
}
