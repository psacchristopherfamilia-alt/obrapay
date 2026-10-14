'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';

interface Fila { agencia: string; aporte_empleado: number; aporte_empleador: number; total: number; vence: string }
interface Brecha { usuario_id: string; nombre: string; permiso_aprobado_el: string; nhip_acumulado: number }
interface BajoMinimo { usuario_id: string; nombre: string; tarifa_hora: number }

export default function RemesasPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [brecha, setBrecha] = useState<Brecha[]>([]);
  const [bajos, setBajos] = useState<BajoMinimo[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargar() {
      if (!usuario?.empresa_id) return;
      setCargando(true);
      const { data: r } = await supabase.rpc('remesa_mensual', { p_empresa_id: usuario.empresa_id, p_anio: anio, p_mes: mes });
      setFilas((r as Fila[]) ?? []);
      const { data: b } = await supabase.from('v_brecha_registro_nhip').select('*').eq('empresa_id', usuario.empresa_id);
      setBrecha((b as Brecha[]) ?? []);
      const { data: cfg } = await supabase.from('configuracion_empresa').select('salario_minimo_hora').eq('empresa_id', usuario.empresa_id).maybeSingle();
      const minimo = Number(cfg?.salario_minimo_hora ?? 9);
      const { data: t } = await supabase.from('perfil_nomina').select('usuario_id, tarifa_hora, usuarios!inner(nombre, empresa_id)').eq('usuarios.empresa_id', usuario.empresa_id).lt('tarifa_hora', minimo);
      setBajos(((t as any[]) ?? []).map((x) => ({ usuario_id: x.usuario_id, nombre: x.usuarios.nombre, tarifa_hora: Number(x.tarifa_hora) })));
      setCargando(false);
    }
    cargar();
  }, [supabase, usuario, anio, mes]);

  const dinero = (n: number) => `$${Number(n).toFixed(2)}`;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Remesas NIB / NHIP</h1>
      <p className="text-xs text-inkSoft">Las tasas y topes deben confirmarse con el NIB o un contador. Se reparte por fecha de pago.</p>
      <div className="flex gap-2">
        <input type="number" value={anio} onChange={(e) => setAnio(parseInt(e.target.value) || anio)} className="border rounded px-2 py-1 w-24" />
        <select value={mes} onChange={(e) => setMes(parseInt(e.target.value))} className="border rounded px-2 py-1">
          {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
        </select>
      </div>
      {cargando ? <p className="text-sm text-inkSoft">Cargando…</p> : (
        <table className="w-full text-sm">
          <thead><tr className="text-left"><th>Agencia</th><th>Empleados</th><th>Empleador</th><th>Total</th><th>Vence</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.agencia} className="border-t">
                <td className="py-2 font-medium">{f.agencia}</td>
                <td>{dinero(f.aporte_empleado)}</td><td>{dinero(f.aporte_empleador)}</td>
                <td className="font-semibold">{dinero(f.total)}</td><td>{f.vence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <section>
        <h2 className="font-semibold mb-2">Permiso aprobado sin registro NHIP</h2>
        {brecha.length === 0 ? <p className="text-sm text-inkSoft">Ninguno.</p> : (
          <ul className="text-sm space-y-1">
            {brecha.map((b) => <li key={b.usuario_id}>{b.nombre} — permiso desde {b.permiso_aprobado_el}, acumulado NHIP {dinero(b.nhip_acumulado)}</li>)}
          </ul>
        )}
      </section>
      <section>
        <h2 className="font-semibold mb-2">Tarifa bajo el mínimo</h2>
        {bajos.length === 0 ? <p className="text-sm text-inkSoft">Todos cumplen el mínimo.</p> : (
          <ul className="text-sm space-y-1">{bajos.map((b) => <li key={b.usuario_id}>{b.nombre} — {dinero(b.tarifa_hora)}/h</li>)}</ul>
        )}
      </section>
    </div>
  );
}
