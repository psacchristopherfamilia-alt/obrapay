'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { usePlanEmpresa } from '@/lib/usePlan';

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function AjustesPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const { tieneFirmaDigital } = usePlanEmpresa();

  const [f, setF] = useState({
    dia_cierre: 'Miércoles',
    hora_cierre: '23:59',
    hora_inicio_extra: '17:00',
    seguro_default_pct: 5,
    nib_tasa_empleador: 6.5,
    nib_tasa_empleado: 5.5,
    nib_tope_mensual: 6000,
    nhip_tasa_empleador: 3.0,
    nhip_tasa_empleado: 3.0,
    nhip_tope_mensual: 7800,
    requiere_gps_default: true,
    firma_digital_activa: false,
    canal_whatsapp: true,
    canal_email: true,
    canal_push: true,
  });
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    async function cargar() {
      if (!usuario?.empresa_id) return;
      const { data } = await supabase
        .from('configuracion_empresa')
        .select('*')
        .eq('empresa_id', usuario.empresa_id)
        .maybeSingle();
      if (data) setF((prev) => ({ ...prev, ...data }));
      setLoading(false);
    }
    cargar();
  }, [supabase, usuario]);

  async function guardar() {
    if (!usuario?.empresa_id) return;
    setGuardando(true);
    const { error } = await supabase
      .from('configuracion_empresa')
      .upsert({ empresa_id: usuario.empresa_id, ...f });
    setGuardando(false);
    if (error) alert('No se pudo guardar: ' + error.message);
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  const Toggle = ({ valor, onChange }: { valor: boolean; onChange: () => void }) => (
    <button onClick={onChange} className={`w-10 h-5.5 rounded-full relative ${valor ? 'bg-primary' : 'bg-line'}`}>
      <span className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full transition-transform ${valor ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-4">Ajustes</h1>

      <div className="bg-card border border-line rounded p-4 space-y-3 mb-3">
        <p className="text-[11px] font-bold uppercase text-inkSoft">Horario laboral</p>
        <div className="flex gap-3">
          <select
            value={f.dia_cierre}
            onChange={(e) => setF({ ...f, dia_cierre: e.target.value })}
            className="flex-1 border border-line rounded-sm px-2 py-2 text-sm"
          >
            {DIAS.map((d) => <option key={d}>{d}</option>)}
          </select>
          <input
            value={f.hora_cierre}
            onChange={(e) => setF({ ...f, hora_cierre: e.target.value })}
            className="flex-1 border border-line rounded-sm px-2 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Hora en que inician las horas extra</label>
          <input
            value={f.hora_inicio_extra}
            onChange={(e) => setF({ ...f, hora_inicio_extra: e.target.value })}
            className="w-full border border-line rounded-sm px-2 py-2 text-sm"
          />
        </div>
      </div>

      <div className="bg-card border border-line rounded p-4 mb-3">
        <p className="text-[11px] font-bold uppercase text-inkSoft mb-1">NIB y NHIP (Seguro Social)</p>
        <p className="text-xs text-inkSoft mb-3">
          Verifica estas tasas y topes con tu contador — pueden cambiar por ley. Se aplican
          automáticamente a toda la nómina desde el cierre de la próxima semana.
        </p>
        <p className="text-xs font-bold text-ink mb-1.5">NIB (retiro/pensión)</p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div>
            <label className="block text-[10px] text-inkSoft mb-1">% patrono</label>
            <input type="number" step="0.1" value={f.nib_tasa_empleador}
              onChange={(e) => setF({ ...f, nib_tasa_empleador: parseFloat(e.target.value) || 0 })}
              className="w-full border border-line rounded-sm px-2 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-[10px] text-inkSoft mb-1">% empleado</label>
            <input type="number" step="0.1" value={f.nib_tasa_empleado}
              onChange={(e) => setF({ ...f, nib_tasa_empleado: parseFloat(e.target.value) || 0 })}
              className="w-full border border-line rounded-sm px-2 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-[10px] text-inkSoft mb-1">Tope mensual $</label>
            <input type="number" value={f.nib_tope_mensual}
              onChange={(e) => setF({ ...f, nib_tope_mensual: parseFloat(e.target.value) || 0 })}
              className="w-full border border-line rounded-sm px-2 py-2 text-sm" />
          </div>
        </div>
        <p className="text-xs font-bold text-ink mb-1.5">NHIP (seguro de salud)</p>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] text-inkSoft mb-1">% patrono</label>
            <input type="number" step="0.1" value={f.nhip_tasa_empleador}
              onChange={(e) => setF({ ...f, nhip_tasa_empleador: parseFloat(e.target.value) || 0 })}
              className="w-full border border-line rounded-sm px-2 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-[10px] text-inkSoft mb-1">% empleado</label>
            <input type="number" step="0.1" value={f.nhip_tasa_empleado}
              onChange={(e) => setF({ ...f, nhip_tasa_empleado: parseFloat(e.target.value) || 0 })}
              className="w-full border border-line rounded-sm px-2 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-[10px] text-inkSoft mb-1">Tope mensual $</label>
            <input type="number" value={f.nhip_tope_mensual}
              onChange={(e) => setF({ ...f, nhip_tope_mensual: parseFloat(e.target.value) || 0 })}
              className="w-full border border-line rounded-sm px-2 py-2 text-sm" />
          </div>
        </div>
      </div>

      <div className="bg-card border border-line rounded p-4 space-y-2 mb-3">
        <p className="text-[11px] font-bold uppercase text-inkSoft mb-1">Canales de notificación</p>
        <div className="flex justify-between items-center py-1"><span className="text-sm">WhatsApp</span><Toggle valor={f.canal_whatsapp} onChange={() => setF({ ...f, canal_whatsapp: !f.canal_whatsapp })} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-sm">Correo electrónico</span><Toggle valor={f.canal_email} onChange={() => setF({ ...f, canal_email: !f.canal_email })} /></div>
        <div className="flex justify-between items-center py-1"><span className="text-sm">Notificación push</span><Toggle valor={f.canal_push} onChange={() => setF({ ...f, canal_push: !f.canal_push })} /></div>
      </div>

      <div className="bg-card border border-line rounded p-4 space-y-2 mb-3">
        <p className="text-[11px] font-bold uppercase text-inkSoft mb-1">Seguridad</p>
        <div className="flex justify-between items-center py-1">
          <span className="text-sm">Requerir GPS por defecto</span>
          <Toggle valor={f.requiere_gps_default} onChange={() => setF({ ...f, requiere_gps_default: !f.requiere_gps_default })} />
        </div>
      </div>

      {tieneFirmaDigital ? (
        <div className="bg-card border border-line rounded p-4 mb-4 flex items-center justify-between">
          <div>
            <p className="font-bold text-sm text-ink">Firma digital de horas</p>
            <p className="text-xs text-inkSoft max-w-[220px]">El trabajador firma electrónicamente al cerrar su semana.</p>
          </div>
          <Toggle valor={f.firma_digital_activa} onChange={() => setF({ ...f, firma_digital_activa: !f.firma_digital_activa })} />
        </div>
      ) : (
        <div className="bg-card border border-line rounded p-4 mb-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">🔒</div>
          <div className="flex-1">
            <p className="font-bold text-sm text-ink">Firma digital de horas</p>
            <p className="text-xs text-inkSoft">Respaldo legal para tu nómina — disponible desde el plan Profesional.</p>
          </div>
          <a href="/admin/plan" className="bg-primary text-white text-xs font-bold px-3 py-2 rounded-sm">Ver planes</a>
        </div>
      )}

      <button onClick={guardar} disabled={guardando} className="bg-primary text-white text-sm font-bold px-5 py-3 rounded-sm disabled:opacity-60">
        {guardando ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </>
  );
}
