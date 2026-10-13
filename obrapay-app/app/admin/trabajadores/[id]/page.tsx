'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { obtenerTotalHistorico, type TotalHistorico } from '@/lib/nomina';
import { fmtUSD } from '@/lib/admin';
import { cambiarTarifa, actualizarDatosPago } from './actions';
import type { MetodoPago } from '@/types/database';

interface DetalleTrabajador {
  nombre: string;
  rol: string;
  creado_en: string;
  oficio: string;
  tarifa_hora: number;
  porcentaje_seguro: number;
  metodo_pago: MetodoPago;
  cuenta_bancaria: string | null;
  saldo_prestamo: number;
}

interface CambioTarifa {
  id: string;
  tarifa_anterior: number;
  tarifa_nueva: number;
  motivo: string | null;
  fecha_cambio: string;
}

const ETIQUETA_PAGO: Record<MetodoPago, string> = {
  transfer: 'Transferencia bancaria',
  cash: 'Efectivo',
  check: 'Cheque',
  wallet: 'Billetera móvil',
};

export default function DetalleTrabajadorPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = supabaseBrowser();
  const [t, setT] = useState<DetalleTrabajador | null>(null);
  const [total, setTotal] = useState<TotalHistorico | null>(null);
  const [historial, setHistorial] = useState<CambioTarifa[]>([]);
  const [loading, setLoading] = useState(true);

  const [editandoTarifa, setEditandoTarifa] = useState(false);
  const [nuevaTarifa, setNuevaTarifa] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardandoTarifa, setGuardandoTarifa] = useState(false);
  const [errorTarifa, setErrorTarifa] = useState<string | null>(null);

  const [editandoPago, setEditandoPago] = useState(false);
  const [seguroForm, setSeguroForm] = useState('');
  const [metodoForm, setMetodoForm] = useState<MetodoPago>('transfer');
  const [cuentaForm, setCuentaForm] = useState('');
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [{ data: u }, historico, { data: hist }] = await Promise.all([
      supabase
        .from('usuarios')
        .select('nombre, rol, creado_en, perfil_nomina(oficio, tarifa_hora, porcentaje_seguro, metodo_pago, cuenta_bancaria), prestamos(saldo_pendiente, estado)')
        .eq('id', id)
        .single(),
      obtenerTotalHistorico(supabase, id),
      supabase
        .from('historial_tarifas')
        .select('id, tarifa_anterior, tarifa_nueva, motivo, fecha_cambio')
        .eq('usuario_id', id)
        .order('fecha_cambio', { ascending: false }),
    ]);

    if (u) {
      const perfil = u.perfil_nomina as any;
      setT({
        nombre: u.nombre,
        rol: u.rol,
        creado_en: u.creado_en,
        oficio: perfil?.oficio ?? '—',
        tarifa_hora: perfil?.tarifa_hora ?? 0,
        porcentaje_seguro: perfil?.porcentaje_seguro ?? 0,
        metodo_pago: perfil?.metodo_pago ?? 'transfer',
        cuenta_bancaria: perfil?.cuenta_bancaria ?? null,
        saldo_prestamo: ((u.prestamos ?? []) as any[]).find((p) => p.estado === 'activo')?.saldo_pendiente ?? 0,
      });
    }
    setTotal(historico);
    setHistorial(hist ?? []);
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardarTarifa() {
    const valor = parseFloat(nuevaTarifa);
    if (!valor || valor <= 0) {
      setErrorTarifa('Ingresa una tarifa válida.');
      return;
    }
    setGuardandoTarifa(true);
    setErrorTarifa(null);
    const resultado = await cambiarTarifa(id, valor, motivo || undefined);
    setGuardandoTarifa(false);

    if (resultado.error) {
      setErrorTarifa(resultado.error);
      return;
    }
    setEditandoTarifa(false);
    setNuevaTarifa('');
    setMotivo('');
    await cargar();
  }

  function abrirEdicionPago() {
    if (!t) return;
    setSeguroForm(String(t.porcentaje_seguro));
    setMetodoForm(t.metodo_pago);
    setCuentaForm(t.cuenta_bancaria ?? '');
    setEditandoPago(true);
  }

  async function guardarDatosPago() {
    const seguro = parseFloat(seguroForm);
    if (isNaN(seguro) || seguro < 0) {
      setErrorPago('Ingresa un % de seguro válido.');
      return;
    }
    setGuardandoPago(true);
    setErrorPago(null);
    const resultado = await actualizarDatosPago(id, {
      porcentajeSeguro: seguro,
      metodoPago: metodoForm,
      cuentaBancaria: cuentaForm || undefined,
    });
    setGuardandoPago(false);

    if (resultado.error) {
      setErrorPago(resultado.error);
      return;
    }
    setEditandoPago(false);
    await cargar();
  }

  if (loading || !t) return <p className="text-sm text-inkSoft">Cargando…</p>;

  const chip = (activo: boolean) =>
    `text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${
      activo ? 'bg-charcoal text-white border-charcoal' : 'border-line text-ink'
    }`;

  return (
    <>
      <a href="/admin/trabajadores" className="text-xs text-inkSoft">← Volver</a>
      <h1 className="font-heading font-extrabold text-2xl text-ink mt-2">{t.nombre}</h1>
      <p className="text-sm text-inkSoft mb-1">
        {t.oficio} {t.rol === 'supervisor' ? '· Supervisor' : ''}
      </p>
      <p className="text-xs text-inkSoft mb-4">
        Trabajando aquí desde {new Date(t.creado_en).toLocaleDateString('es-DO', { month: 'long', year: 'numeric' })}
      </p>

      {total && total.semanasPagadas > 0 && (
        <div className="bg-charcoal rounded p-4 mb-4">
          <p className="text-[11px] font-bold uppercase text-blue-200 mb-1">
            Total pagado desde que trabaja aquí
          </p>
          <p className="font-heading font-extrabold text-3xl text-white">{fmtUSD(total.netoTotal)}</p>
          <p className="text-xs text-blue-200 mt-1">
            {total.horasTotales.toFixed(0)}h · {total.semanasPagadas} semana{total.semanasPagadas !== 1 ? 's' : ''} pagadas
          </p>
          <div className="border-t border-white/20 mt-3 pt-3 space-y-1">
            <div className="flex justify-between text-xs text-blue-200">
              <span>Bruto total</span><span>{fmtUSD(total.brutoTotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-blue-200">
              <span>Descontado por seguro</span><span>-{fmtUSD(total.descuentoSeguroTotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-blue-200">
              <span>Descontado por préstamos</span><span>-{fmtUSD(total.descuentoPrestamoTotal)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-line rounded p-4 mb-4">
        <div className="flex justify-between items-center text-sm py-2 border-b border-dashed border-line">
          <span className="text-inkSoft">Tarifa por hora</span>
          <div className="flex items-center gap-2">
            <span className="font-semibold">${t.tarifa_hora.toFixed(2)}</span>
            {!editandoTarifa && (
              <button onClick={() => setEditandoTarifa(true)} className="text-[11px] font-bold text-primary">
                Editar
              </button>
            )}
          </div>
        </div>

        {editandoTarifa && (
          <div className="py-3 border-b border-dashed border-line space-y-2">
            <input
              type="number"
              value={nuevaTarifa}
              onChange={(e) => setNuevaTarifa(e.target.value)}
              placeholder={`Nueva tarifa (actual $${t.tarifa_hora.toFixed(2)})`}
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            />
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Motivo (opcional) — ej. aumento anual"
              className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            />
            {errorTarifa && <p className="text-danger text-xs">{errorTarifa}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setEditandoTarifa(false); setErrorTarifa(null); }}
                className="flex-1 border border-line rounded-sm py-2 text-xs font-bold text-ink"
              >
                Cancelar
              </button>
              <button
                onClick={guardarTarifa}
                disabled={guardandoTarifa}
                className="flex-1 bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60"
              >
                {guardandoTarifa ? 'Guardando…' : 'Guardar y avisar al trabajador'}
              </button>
            </div>
          </div>
        )}

        {!editandoPago ? (
          <>
            <div className="flex justify-between items-center text-sm py-2 border-b border-dashed border-line">
              <span className="text-inkSoft">% de seguro</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{t.porcentaje_seguro}%</span>
                <button onClick={abrirEdicionPago} className="text-[11px] font-bold text-primary">
                  Editar
                </button>
              </div>
            </div>
            <div className="flex justify-between text-sm py-2 border-b border-dashed border-line">
              <span className="text-inkSoft">Método de pago</span>
              <span className="font-semibold">{ETIQUETA_PAGO[t.metodo_pago]}</span>
            </div>
            {t.metodo_pago === 'transfer' && t.cuenta_bancaria && (
              <div className="flex justify-between text-sm py-2 border-b border-dashed border-line">
                <span className="text-inkSoft">Cuenta bancaria</span>
                <span className="font-semibold">{t.cuenta_bancaria}</span>
              </div>
            )}
          </>
        ) : (
          <div className="py-3 border-b border-dashed border-line space-y-3">
            <div>
              <label className="block text-xs font-semibold text-inkSoft mb-1">% de seguro</label>
              <input
                type="number"
                value={seguroForm}
                onChange={(e) => setSeguroForm(e.target.value)}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-inkSoft mb-1">Método de pago</label>
              <div className="flex gap-1.5 flex-wrap">
                {(['transfer', 'cash', 'check', 'wallet'] as MetodoPago[]).map((m) => (
                  <span key={m} className={chip(metodoForm === m)} onClick={() => setMetodoForm(m)}>
                    {ETIQUETA_PAGO[m]}
                  </span>
                ))}
              </div>
            </div>
            {metodoForm === 'transfer' && (
              <div>
                <label className="block text-xs font-semibold text-inkSoft mb-1">Cuenta bancaria</label>
                <input
                  value={cuentaForm}
                  onChange={(e) => setCuentaForm(e.target.value)}
                  placeholder="Número de cuenta"
                  className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                />
              </div>
            )}
            {errorPago && <p className="text-danger text-xs">{errorPago}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => { setEditandoPago(false); setErrorPago(null); }}
                className="flex-1 border border-line rounded-sm py-2 text-xs font-bold text-ink"
              >
                Cancelar
              </button>
              <button
                onClick={guardarDatosPago}
                disabled={guardandoPago}
                className="flex-1 bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60"
              >
                {guardandoPago ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-between text-sm py-2">
          <span className="text-inkSoft">Saldo de préstamo</span>
          <span className="font-semibold">{t.saldo_prestamo > 0 ? fmtUSD(t.saldo_prestamo) : 'Sin préstamo activo'}</span>
        </div>
      </div>

      {historial.length > 0 && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-3">
            Historial de tarifa
          </p>
          <div className="bg-card border border-line rounded divide-y divide-line mb-4">
            {historial.map((h) => (
              <div key={h.id} className="px-4 py-3">
                <div className="flex justify-between text-sm">
                  <span>${h.tarifa_anterior.toFixed(2)} → ${h.tarifa_nueva.toFixed(2)}</span>
                  <span className="text-xs text-inkSoft">
                    {new Date(h.fecha_cambio).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                {h.motivo && <p className="text-xs text-inkSoft mt-0.5">{h.motivo}</p>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
