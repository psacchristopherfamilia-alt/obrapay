'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { obtenerTotalHistorico, type TotalHistorico } from '@/lib/nomina';
import { fmtUSD } from '@/lib/admin';
import { cambiarTarifa, actualizarDatosPago, actualizarPermisoTrabajo } from './actions';
import { obtenerCertificaciones, agregarCertificacion, eliminarCertificacion, type Certificacion } from '@/lib/certificaciones';
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
  requiere_permiso_trabajo: boolean;
  permiso_trabajo_numero: string | null;
  permiso_trabajo_vencimiento: string | null;
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
  const [certificaciones, setCertificaciones] = useState<Certificacion[]>([]);
  const [editandoPermiso, setEditandoPermiso] = useState(false);
  const [formPermiso, setFormPermiso] = useState({ requiere: false, numero: '', vencimiento: '' });
  const [guardandoPermiso, setGuardandoPermiso] = useState(false);
  const [errorPermiso, setErrorPermiso] = useState<string | null>(null);
  const [nuevaCert, setNuevaCert] = useState({ nombre: '', numero: '', vencimiento: '' });
  const [guardandoCert, setGuardandoCert] = useState(false);
  const [loading, setLoading] = useState(true);

  const [editandoTarifa, setEditandoTarifa] = useState(false);
  const [nuevaTarifa, setNuevaTarifa] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardandoTarifa, setGuardandoTarifa] = useState(false);
  const [errorTarifa, setErrorTarifa] = useState<string | null>(null);

  const [editandoPago, setEditandoPago] = useState(false);
  const [metodoForm, setMetodoForm] = useState<MetodoPago>('transfer');
  const [cuentaForm, setCuentaForm] = useState('');
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [errorPago, setErrorPago] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [{ data: u }, historico, { data: hist }] = await Promise.all([
      supabase
        .from('usuarios')
        .select('nombre, rol, creado_en, perfil_nomina(oficio, tarifa_hora, porcentaje_seguro, metodo_pago, cuenta_bancaria, requiere_permiso_trabajo, permiso_trabajo_numero, permiso_trabajo_vencimiento), prestamos(saldo_pendiente, estado)')
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
        requiere_permiso_trabajo: perfil?.requiere_permiso_trabajo ?? false,
        permiso_trabajo_numero: perfil?.permiso_trabajo_numero ?? null,
        permiso_trabajo_vencimiento: perfil?.permiso_trabajo_vencimiento ?? null,
        saldo_prestamo: ((u.prestamos ?? []) as any[]).find((p) => p.estado === 'activo')?.saldo_pendiente ?? 0,
      });
    }
    setTotal(historico);
    setHistorial(hist ?? []);
    setCertificaciones(await obtenerCertificaciones(supabase, id));
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
    setMetodoForm(t.metodo_pago);
    setCuentaForm(t.cuenta_bancaria ?? '');
    setEditandoPago(true);
  }

  async function guardarDatosPago() {
    setGuardandoPago(true);
    setErrorPago(null);
    const resultado = await actualizarDatosPago(id, {
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

  function abrirEdicionPermiso() {
    setFormPermiso({
      requiere: t?.requiere_permiso_trabajo ?? false,
      numero: t?.permiso_trabajo_numero ?? '',
      vencimiento: t?.permiso_trabajo_vencimiento ?? '',
    });
    setEditandoPermiso(true);
  }

  async function guardarPermiso() {
    setGuardandoPermiso(true);
    setErrorPermiso(null);
    const resultado = await actualizarPermisoTrabajo(id, {
      requierePermisoTrabajo: formPermiso.requiere,
      numero: formPermiso.numero || undefined,
      vencimiento: formPermiso.vencimiento || undefined,
    });
    setGuardandoPermiso(false);
    if (resultado.error) {
      setErrorPermiso(resultado.error);
      return;
    }
    setEditandoPermiso(false);
    await cargar();
  }

  async function manejarAgregarCert() {
    if (!nuevaCert.nombre.trim()) return;
    setGuardandoCert(true);
    const resultado = await agregarCertificacion(supabase, {
      usuarioId: id,
      nombre: nuevaCert.nombre,
      numeroCertificado: nuevaCert.numero || undefined,
      fechaVencimiento: nuevaCert.vencimiento || undefined,
    });
    setGuardandoCert(false);
    if (resultado.error) {
      alert('No se pudo agregar: ' + resultado.error);
      return;
    }
    setNuevaCert({ nombre: '', numero: '', vencimiento: '' });
    await cargar();
  }

  async function manejarEliminarCert(certId: string) {
    await eliminarCertificacion(supabase, certId);
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
              <span>Descontado de NIB (retiro)</span><span>-{fmtUSD(total.descuentoNibTotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-blue-200">
              <span>Descontado de NHIP (salud)</span><span>-{fmtUSD(total.descuentoNhipTotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-blue-200">
              <span>Descontado por préstamos</span><span>-{fmtUSD(total.descuentoPrestamoTotal)}</span>
            </div>
          </div>
          <a
            href={`/api/trabajadores/${id}/constancia`}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-center bg-white text-charcoal rounded-sm py-2 text-xs font-bold mt-3"
          >
            Descargar constancia de trabajo
          </a>
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
              <span className="text-inkSoft">Método de pago</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{ETIQUETA_PAGO[t.metodo_pago]}</span>
                <button onClick={abrirEdicionPago} className="text-[11px] font-bold text-primary">
                  Editar
                </button>
              </div>
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
            <p className="text-[11px] text-inkSoft">
              El descuento de NIB/NHIP ya no se define aquí — se configura una sola vez para toda
              la empresa en Ajustes.
            </p>
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

      <p className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-3">
        Certificaciones
      </p>
      <div className="bg-card border border-line rounded p-3 mb-3 space-y-2">
        <input
          value={nuevaCert.nombre}
          onChange={(e) => setNuevaCert({ ...nuevaCert, nombre: e.target.value })}
          placeholder="Nombre — ej. Licencia de electricista"
          className="w-full border border-line rounded-sm px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={nuevaCert.numero}
            onChange={(e) => setNuevaCert({ ...nuevaCert, numero: e.target.value })}
            placeholder="N.º (opcional)"
            className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={nuevaCert.vencimiento}
            onChange={(e) => setNuevaCert({ ...nuevaCert, vencimiento: e.target.value })}
            title="Fecha de vencimiento (opcional)"
            className="flex-1 border border-line rounded-sm px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={manejarAgregarCert}
          disabled={guardandoCert}
          className="w-full bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60"
        >
          {guardandoCert ? 'Agregando…' : '+ Agregar certificación'}
        </button>
      </div>
      <div className="bg-card border border-line rounded divide-y divide-line mb-4">
        {certificaciones.map((c) => {
          const vencida = c.fecha_vencimiento && new Date(c.fecha_vencimiento) <= new Date();
          return (
            <div key={c.id} className="flex justify-between items-center px-4 py-3">
              <div>
                <p className="font-semibold text-sm text-ink">{c.nombre}</p>
                {c.fecha_vencimiento && (
                  <p className={`text-xs ${vencida ? 'text-danger font-semibold' : 'text-inkSoft'}`}>
                    {vencida ? 'Venció el ' : 'Vence el '}
                    {new Date(c.fecha_vencimiento).toLocaleDateString('es-DO')}
                  </p>
                )}
              </div>
              <button onClick={() => manejarEliminarCert(c.id)} className="text-[11px] font-bold text-danger">
                Eliminar
              </button>
            </div>
          );
        })}
        {certificaciones.length === 0 && (
          <p className="px-4 py-4 text-sm text-inkSoft">Sin certificaciones registradas.</p>
        )}
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-3">
        Permiso de trabajo
      </p>
      {!editandoPermiso ? (
        <div className="bg-card border border-line rounded p-4 mb-4">
          {t.requiere_permiso_trabajo ? (
            <>
              <p className="text-sm text-ink">
                {t.permiso_trabajo_numero ? `N.º ${t.permiso_trabajo_numero}` : 'Sin número registrado'}
              </p>
              {t.permiso_trabajo_vencimiento && (
                <p className={`text-xs ${new Date(t.permiso_trabajo_vencimiento) <= new Date() ? 'text-danger font-semibold' : 'text-inkSoft'}`}>
                  Vence el {new Date(t.permiso_trabajo_vencimiento).toLocaleDateString('es-DO')}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-inkSoft">No necesita permiso de trabajo.</p>
          )}
          <button onClick={abrirEdicionPermiso} className="text-[11px] font-bold text-primary mt-2">
            Editar
          </button>
        </div>
      ) : (
        <div className="bg-card border border-line rounded p-4 mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-ink">¿Necesita permiso de trabajo?</span>
            <button
              onClick={() => setFormPermiso({ ...formPermiso, requiere: !formPermiso.requiere })}
              className={`w-10 h-5.5 rounded-full relative ${formPermiso.requiere ? 'bg-primary' : 'bg-line'}`}
            >
              <span className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full transition-transform ${formPermiso.requiere ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {formPermiso.requiere && (
            <>
              <input
                value={formPermiso.numero}
                onChange={(e) => setFormPermiso({ ...formPermiso, numero: e.target.value })}
                placeholder="N.º de permiso (opcional)"
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={formPermiso.vencimiento}
                onChange={(e) => setFormPermiso({ ...formPermiso, vencimiento: e.target.value })}
                className="w-full border border-line rounded-sm px-3 py-2 text-sm"
              />
            </>
          )}
          {errorPermiso && <p className="text-danger text-xs">{errorPermiso}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setEditandoPermiso(false); setErrorPermiso(null); }} className="flex-1 border border-line rounded-sm py-2 text-xs font-bold text-ink">
              Cancelar
            </button>
            <button onClick={guardarPermiso} disabled={guardandoPermiso} className="flex-1 bg-primary text-white rounded-sm py-2 text-xs font-bold disabled:opacity-60">
              {guardandoPermiso ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
