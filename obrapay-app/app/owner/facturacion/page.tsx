'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

interface FilaFacturacion {
  empresa: string;
  estado: string;
  plan_clave: string;
  plan_nombre: string;
  precio: number;
}

const NOMBRE_PLAN: Record<string, string> = {
  free: 'Gratuito',
  basic: 'Básico',
  pro: 'Profesional',
  enterprise: 'Empresarial',
};

export default function FacturacionPage() {
  const supabase = supabaseBrowser();
  const [filas, setFilas] = useState<FilaFacturacion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('empresas')
        .select('nombre, estado, suscripciones(planes(clave, precio_mensual))');

      setFilas(
        (data ?? []).map((e: any) => {
          const plan = e.suscripciones?.planes;
          return {
            empresa: e.nombre,
            estado: e.estado,
            plan_clave: plan?.clave ?? 'free',
            plan_nombre: NOMBRE_PLAN[plan?.clave ?? 'free'],
            precio: plan?.precio_mensual ?? 0,
          };
        })
      );
      setLoading(false);
    }
    cargar();
  }, [supabase]);

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  // MRR: solo empresas activas cuentan — una suspendida no está pagando
  const activas = filas.filter((f) => f.estado !== 'suspended');
  const mrr = activas.reduce((s, f) => s + f.precio, 0);

  const distribucion = ['free', 'basic', 'pro', 'enterprise'].map((clave) => ({
    clave,
    nombre: NOMBRE_PLAN[clave],
    cantidad: filas.filter((f) => f.plan_clave === clave).length,
  }));

  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-card border border-line rounded p-3">
          <p className="font-heading font-extrabold text-2xl text-ink">${mrr.toLocaleString()}</p>
          <p className="text-[11px] text-inkSoft">Ingreso mensual recurrente</p>
        </div>
        <div className="bg-card border border-line rounded p-3">
          <p className="font-heading font-extrabold text-2xl text-ink">{filas.length}</p>
          <p className="text-[11px] text-inkSoft">Empresas totales</p>
        </div>
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-3">Plan</p>
      <div className="bg-card border border-line rounded p-4 space-y-3 mb-5">
        {distribucion.map((d) => (
          <div key={d.clave}>
            <div className="flex justify-between text-xs mb-1">
              <span>{d.nombre}</span>
              <span className="font-semibold">{d.cantidad} empresas</span>
            </div>
            <div className="bg-line h-1.5 rounded-full">
              <div
                className="bg-steel h-1.5 rounded-full"
                style={{ width: `${filas.length ? (d.cantidad / filas.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-line rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-inkSoft border-b border-line">
              <th className="py-2 pl-3 font-semibold">Empresas</th>
              <th className="font-semibold">Plan</th>
              <th className="font-semibold pr-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="py-2.5 pl-3">{f.empresa}</td>
                <td>{f.plan_nombre}</td>
                <td className="pr-3">{f.estado === 'suspended' ? 'Suspendida' : f.estado === 'trial' ? 'Prueba' : 'Activa'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
