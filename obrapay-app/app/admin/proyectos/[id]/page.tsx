'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { usePlanEmpresa } from '@/lib/usePlan';
import { costoPorProyecto, fmtUSD } from '@/lib/admin';
import type { Proyecto } from '@/types/database';

interface Supervisor {
  usuario_id: string;
  nombre: string;
}
interface Miembro {
  usuario_id: string;
  nombre: string;
  oficio: string;
  tarifa_hora: number;
}

function CandadoPlan({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <div className="bg-card border border-line rounded p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">🔒</div>
      <div className="flex-1">
        <p className="font-bold text-sm text-ink">{titulo}</p>
        <p className="text-xs text-inkSoft">{descripcion}</p>
      </div>
      <a href="/admin/plan" className="bg-primary text-white text-xs font-bold px-3 py-2 rounded-sm whitespace-nowrap">
        Ver planes
      </a>
    </div>
  );
}

export default function DetalleProyectoPage() {
  const { id } = useParams<{ id: string }>();
  const supabase = supabaseBrowser();
  const { tieneGeofence, tieneMultiSupervisor } = usePlanEmpresa();

  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [costo, setCosto] = useState(0);
  const [supervisores, setSupervisores] = useState<Supervisor[]>([]);
  const [candidatos, setCandidatos] = useState<Supervisor[]>([]);
  const [equipo, setEquipo] = useState<Miembro[]>([]);

  const cargar = useCallback(async () => {
    const { data: p } = await supabase.from('proyectos').select('*').eq('id', id).single();
    if (!p) return;
    setProyecto(p);

    const costos = await costoPorProyecto(supabase, [id], p.empresa_id);
    setCosto(costos.get(id) ?? 0);

    const { data: principal } = await supabase.from('usuarios').select('id, nombre').eq('id', p.supervisor_principal_id).single();
    const { data: extra } = await supabase
      .from('proyecto_supervisores')
      .select('usuarios(id, nombre)')
      .eq('proyecto_id', id);

    const lista: Supervisor[] = [];
    if (principal) lista.push({ usuario_id: principal.id, nombre: principal.nombre });
    (extra ?? []).forEach((e: any) => lista.push({ usuario_id: e.usuarios.id, nombre: e.usuarios.nombre }));
    setSupervisores(lista);

    const { data: todosSupervisores } = await supabase
      .from('usuarios')
      .select('id, nombre')
      .eq('empresa_id', p.empresa_id)
      .eq('rol', 'supervisor');
    const idsYaAsignados = new Set(lista.map((s) => s.usuario_id));
    setCandidatos(
      (todosSupervisores ?? [])
        .filter((s) => !idsYaAsignados.has(s.id))
        .map((s) => ({ usuario_id: s.id, nombre: s.nombre }))
    );

    const { data: asignados } = await supabase
      .from('proyecto_trabajadores')
      .select('usuarios(id, nombre, perfil_nomina(oficio, tarifa_hora))')
      .eq('proyecto_id', id);
    setEquipo(
      (asignados ?? []).map((a: any) => ({
        usuario_id: a.usuarios.id,
        nombre: a.usuarios.nombre,
        oficio: a.usuarios.perfil_nomina?.oficio ?? '—',
        tarifa_hora: a.usuarios.perfil_nomina?.tarifa_hora ?? 0,
      }))
    );
  }, [supabase, id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function toggleGeofence() {
    if (!proyecto) return;
    const { error } = await supabase
      .from('proyectos')
      .update({ geo_cerca_activa: !proyecto.geo_cerca_activa })
      .eq('id', proyecto.id);
    if (!error) setProyecto({ ...proyecto, geo_cerca_activa: !proyecto.geo_cerca_activa });
  }

  async function agregarSupervisor(usuarioId: string) {
    if (!usuarioId) return;
    const { error } = await supabase
      .from('proyecto_supervisores')
      .insert({ proyecto_id: id, usuario_id: usuarioId });
    if (error) alert('No se pudo agregar: ' + error.message);
    await cargar();
  }

  if (!proyecto) return <p className="text-sm text-inkSoft">Cargando…</p>;

  const pct = proyecto.presupuesto ? Math.min(100, (costo / proyecto.presupuesto) * 100) : 0;

  return (
    <>
      <a href="/admin/proyectos" className="text-xs text-inkSoft">← Volver</a>
      <h1 className="font-heading font-extrabold text-2xl text-ink mt-2">{proyecto.nombre}</h1>

      <div className="grid grid-cols-2 gap-3 my-4">
        <div className="bg-card border border-line rounded p-3">
          <p className="font-heading font-extrabold text-xl text-ink">{fmtUSD(costo)}</p>
          <p className="text-[11px] text-inkSoft">Costo mano de obra</p>
        </div>
        <div className="bg-card border border-line rounded p-3">
          <p className="font-heading font-extrabold text-xl text-ink">{equipo.length}</p>
          <p className="text-[11px] text-inkSoft">Trabajadores</p>
        </div>
      </div>

      <div className="bg-card border border-line rounded p-4 mb-4">
        <div className="flex justify-between text-xs mb-1.5">
          <span className="text-inkSoft">Presupuesto usado</span>
          <span className="text-inkSoft">
            {fmtUSD(costo)} / {proyecto.presupuesto ? fmtUSD(proyecto.presupuesto) : '—'}
          </span>
        </div>
        <div className="bg-line h-1.5 rounded-full">
          <div className={`h-1.5 rounded-full ${pct >= 80 ? 'bg-danger' : 'bg-steel'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Geo-cerca — candado Profesional+ */}
      {tieneGeofence ? (
        <div className="bg-card border border-line rounded p-4 mb-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-sm text-ink">Geo-cerca anti-fraude</p>
            <p className="text-xs text-inkSoft max-w-[220px]">
              Exige marcar dentro de {proyecto.geo_cerca_radio_m}m del proyecto.
            </p>
          </div>
          <button
            onClick={toggleGeofence}
            className={`w-10 h-5.5 rounded-full relative transition-colors ${
              proyecto.geo_cerca_activa ? 'bg-primary' : 'bg-line'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4.5 h-4.5 bg-white rounded-full transition-transform ${
                proyecto.geo_cerca_activa ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      ) : (
        <div className="mb-3">
          <CandadoPlan
            titulo="Geo-cerca anti-fraude"
            descripcion="Bloquea el marcaje fuera del sitio de trabajo — disponible desde el plan Profesional."
          />
        </div>
      )}

      {/* Multi-supervisor — candado Profesional+ */}
      {tieneMultiSupervisor ? (
        <div className="bg-card border border-line rounded p-4 mb-4">
          <p className="text-xs font-bold text-ink mb-2">Supervisor</p>
          {supervisores.map((s) => (
            <p key={s.usuario_id} className="text-sm text-ink py-1.5 border-b border-line last:border-0">
              {s.nombre}
            </p>
          ))}
          {candidatos.length > 0 && (
            <select
              onChange={(e) => agregarSupervisor(e.target.value)}
              defaultValue=""
              className="mt-2 w-full border border-line rounded-sm text-sm px-2 py-2"
            >
              <option value="" disabled>+ Agregar supervisor</option>
              {candidatos.map((c) => (
                <option key={c.usuario_id} value={c.usuario_id}>{c.nombre}</option>
              ))}
            </select>
          )}
        </div>
      ) : (
        <div className="mb-4">
          <CandadoPlan
            titulo="+ Agregar supervisor"
            descripcion="Asignar más de un supervisor por proyecto — disponible desde el plan Profesional."
          />
        </div>
      )}

      <h2 className="text-[11px] font-bold uppercase tracking-wide text-inkSoft border-b border-line pb-1.5 mb-2">
        Trabajadores
      </h2>
      <div className="bg-card border border-line rounded divide-y divide-line">
        {equipo.map((m) => (
          <div key={m.usuario_id} className="flex justify-between px-4 py-3">
            <div>
              <p className="font-semibold text-sm text-ink">{m.nombre}</p>
              <p className="text-xs text-inkSoft">{m.oficio}</p>
            </div>
            <span className="text-xs text-inkSoft">${m.tarifa_hora.toFixed(2)}/h</span>
          </div>
        ))}
        {equipo.length === 0 && <p className="px-4 py-4 text-sm text-inkSoft">—</p>}
      </div>
    </>
  );
}
