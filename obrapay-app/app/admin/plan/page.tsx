'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';

type ClavePlan = 'free' | 'basic' | 'pro' | 'enterprise';
type ClaveAddon = 'whatsapp' | 'storage';

const PLANES: { clave: ClavePlan; nombre: string; precio: number }[] = [
  { clave: 'free', nombre: 'Gratuito', precio: 0 },
  { clave: 'basic', nombre: 'Básico', precio: 29 },
  { clave: 'pro', nombre: 'Profesional', precio: 79 },
  { clave: 'enterprise', nombre: 'Empresarial', precio: 199 },
];

interface Addon {
  clave: ClaveAddon;
  nombre: string;
  descripcion: string;
  precio: number;
  activo: boolean;
}

const DESCRIPCION_ADDON: Record<ClaveAddon, string> = {
  whatsapp: 'Envía el recibo de pago semanal a cada trabajador por WhatsApp.',
  storage: 'Guarda historial de horas y reportes por más de 2 años.',
};

export default function PlanPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [planActual, setPlanActual] = useState<ClavePlan | null>(null);
  const [estadoPago, setEstadoPago] = useState<string>('active');
  const [renuevaEl, setRenuevaEl] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<ClavePlan | null>(null);
  const [enPrueba, setEnPrueba] = useState(false);
  const [trialTerminaEn, setTrialTerminaEn] = useState<string | null>(null);
  const [tieneSuscripcionStripe, setTieneSuscripcionStripe] = useState(false);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [addonProcesando, setAddonProcesando] = useState<ClaveAddon | null>(null);
  const [procesandoPortal, setProcesandoPortal] = useState(false);

  async function cargar() {
    if (!usuario?.empresa_id) return;
    const [{ data }, { data: empresa }, { data: catalogo }, { data: activos }] = await Promise.all([
      supabase
        .from('suscripciones')
        .select('estado, fecha_renovacion, stripe_subscription_id, planes(clave)')
        .eq('empresa_id', usuario.empresa_id)
        .single(),
      supabase.from('empresas').select('estado, trial_termina_en').eq('id', usuario.empresa_id).single(),
      supabase.from('addons_catalogo').select('clave, nombre, precio_mensual'),
      supabase
        .from('empresa_addons')
        .select('addon_id, activo, addons_catalogo(clave)')
        .eq('empresa_id', usuario.empresa_id)
        .eq('activo', true),
    ]);

    setPlanActual(((data?.planes as any)?.clave as ClavePlan) ?? 'free');
    setEstadoPago(data?.estado ?? 'active');
    setRenuevaEl(data?.fecha_renovacion ?? null);
    setTieneSuscripcionStripe(!!data?.stripe_subscription_id);
    setEnPrueba(empresa?.estado === 'trial');
    setTrialTerminaEn(empresa?.trial_termina_en ?? null);

    const clavesActivas = new Set((activos ?? []).map((a: any) => a.addons_catalogo.clave));
    setAddons(
      (catalogo ?? []).map((a: any) => ({
        clave: a.clave,
        nombre: a.nombre,
        descripcion: DESCRIPCION_ADDON[a.clave as ClaveAddon] ?? '',
        precio: Number(a.precio_mensual),
        activo: clavesActivas.has(a.clave),
      }))
    );
  }

  useEffect(() => {
    cargar();
  }, [supabase, usuario]);

  async function cambiarPlan(clave: ClavePlan) {
    setProcesando(clave);
    const res = await fetch('/api/stripe/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planClave: clave }),
    });
    const data = await res.json();
    setProcesando(null);

    if (data.error) {
      alert(data.error);
      return;
    }
    window.location.href = data.redirigirA;
  }

  async function toggleAddon(clave: ClaveAddon, activarAhora: boolean) {
    setAddonProcesando(clave);
    const res = await fetch('/api/stripe/toggle-addon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addonClave: clave, activar: activarAhora }),
    });
    const data = await res.json();
    setAddonProcesando(null);

    if (data.error) {
      alert(data.error);
      return;
    }
    await cargar();
  }

  async function abrirPortalFacturacion() {
    setProcesandoPortal(true);
    const res = await fetch('/api/stripe/create-portal-session', { method: 'POST' });
    const data = await res.json();
    setProcesandoPortal(false);

    if (data.error) {
      alert(data.error);
      return;
    }
    window.location.href = data.redirigirA;
  }

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-4">Plan</h1>

      {enPrueba && trialTerminaEn && (() => {
        const dias = Math.max(0, Math.ceil((new Date(trialTerminaEn).getTime() - Date.now()) / 86400000));
        return (
          <div className={`bg-card border-l-4 rounded p-3 mb-4 ${dias <= 3 ? 'border-warning' : 'border-primary'}`}>
            <p className="font-bold text-sm text-ink">
              {dias === 0 ? 'Tu prueba vence hoy' : `Tu prueba vence en ${dias} día${dias !== 1 ? 's' : ''}`}
            </p>
            <p className="text-xs text-inkSoft">
              Estás probando el plan Profesional. Si no eliges un plan pago antes de que termine, pasas
              automáticamente a Gratuito y pierdes geo-cerca, alertas de sobrepresupuesto y firma digital.
            </p>
          </div>
        );
      })()}

      {estadoPago === 'pago_fallido' && (
        <div className="bg-card border-l-4 border-danger rounded p-3 mb-4">
          <p className="font-bold text-sm text-ink">No pudimos cobrar tu último pago</p>
          <p className="text-xs text-inkSoft">Actualiza tu método de pago para no perder acceso a tus funciones.</p>
        </div>
      )}

      <div className="bg-card border border-line rounded p-4 mb-5">
        <div className="flex justify-between items-center mb-1">
          <p className="text-[11px] font-bold uppercase text-inkSoft">Tu plan actual</p>
          <span className="bg-primary text-white text-[11px] font-bold px-2.5 py-1 rounded-full">
            {PLANES.find((p) => p.clave === planActual)?.nombre ?? '—'}
          </span>
        </div>
        <p className="font-heading font-extrabold text-2xl text-ink">
          ${PLANES.find((p) => p.clave === planActual)?.precio ?? 0}
          <span className="text-sm font-semibold text-inkSoft">/mes</span>
        </p>
        {renuevaEl && (
          <p className="text-xs text-inkSoft">Se renueva el {new Date(renuevaEl).toLocaleDateString('es-DO')}</p>
        )}
        {tieneSuscripcionStripe && (
          <button
            onClick={abrirPortalFacturacion}
            disabled={procesandoPortal}
            className="text-xs font-bold text-primary mt-2 disabled:opacity-60"
          >
            {procesandoPortal ? 'Abriendo…' : 'Gestionar facturación →'}
          </button>
        )}
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-3">
        Cambiar de plan
      </p>
      <div className="grid grid-cols-2 gap-3 mb-5">
        {PLANES.map((p) => (
          <div
            key={p.clave}
            className={`bg-card border rounded p-4 ${p.clave === planActual ? 'border-primary border-2' : 'border-line'}`}
          >
            <p className="font-bold text-sm text-ink">{p.nombre}</p>
            <p className="font-heading font-extrabold text-lg text-ink my-1">
              ${p.precio}<span className="text-[11px] font-semibold text-inkSoft">/mes</span>
            </p>
            {p.clave !== planActual && (
              <button
                onClick={() => cambiarPlan(p.clave)}
                disabled={procesando !== null}
                className="w-full bg-steel text-white text-xs font-bold py-2 rounded-sm disabled:opacity-60"
              >
                {procesando === p.clave ? 'Procesando…' : 'Elegir este plan'}
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-1">
        Servicios extra
      </p>
      <p className="text-xs text-inkSoft mb-3">Agrega funciones adicionales a tu plan con un pago mensual.</p>

      {!tieneSuscripcionStripe && (
        <div className="bg-card border border-line rounded p-3 mb-3">
          <p className="text-xs text-inkSoft">
            Necesitas un plan pago activo para agregar servicios extra.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {addons.map((a) => (
          <div key={a.clave} className="bg-card border border-line rounded p-3">
            <div className="flex justify-between items-start mb-2">
              <div className="pr-3">
                <p className="font-bold text-sm text-ink">{a.nombre}</p>
                <p className="text-xs text-inkSoft mt-0.5">{a.descripcion}</p>
              </div>
              <span className="font-semibold text-sm text-ink whitespace-nowrap">${a.precio}/mes</span>
            </div>
            <button
              onClick={() => toggleAddon(a.clave, !a.activo)}
              disabled={addonProcesando === a.clave || (!tieneSuscripcionStripe && !a.activo)}
              className={`w-full text-xs font-bold py-2 rounded-sm disabled:opacity-50 ${
                a.activo ? 'border border-danger text-danger' : 'bg-primary text-white'
              }`}
            >
              {addonProcesando === a.clave ? 'Procesando…' : a.activo ? 'Quitar' : 'Agregar'}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
