'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { usePlanEmpresa } from '@/lib/usePlan';

export default function NuevoProyectoPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const { usuario } = useUsuarioActual();
  const { tieneGeofence } = usePlanEmpresa();
  const [capturando, setCapturando] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState<string | null>(null);

  function capturarUbicacion() {
    if (!navigator.geolocation) {
      setErrorUbicacion('Este navegador no puede obtener tu ubicación.');
      return;
    }
    setCapturando(true);
    setErrorUbicacion(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          geoCercaLat: pos.coords.latitude.toFixed(7),
          geoCercaLng: pos.coords.longitude.toFixed(7),
        }));
        setCapturando(false);
      },
      () => {
        setErrorUbicacion('No se pudo obtener tu ubicación — revisa el permiso de ubicación del navegador.');
        setCapturando(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const [supervisores, setSupervisores] = useState<{ id: string; nombre: string }[]>([]);
  const [form, setForm] = useState({
    nombre: '',
    ubicacion: '',
    presupuesto: '',
    supervisorPrincipalId: '',
    geoCercaActiva: false,
    geoCercaRadioM: '250',
    geoCercaLat: '',
    geoCercaLng: '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function cargar() {
      if (!usuario?.empresa_id) return;
      const { data } = await supabase
        .from('usuarios')
        .select('id, nombre')
        .eq('empresa_id', usuario.empresa_id)
        .eq('rol', 'supervisor')
        .eq('estado', 'activo');
      setSupervisores(data ?? []);
    }
    cargar();
  }, [supabase, usuario]);

  async function guardar() {
    if (!form.nombre.trim()) {
      setError('El proyecto necesita un nombre.');
      return;
    }
    if (!usuario?.empresa_id) return;

    setGuardando(true);
    setError(null);

    const { data, error: errorInsert } = await supabase
      .from('proyectos')
      .insert({
        empresa_id: usuario.empresa_id,
        nombre: form.nombre,
        ubicacion: form.ubicacion || null,
        presupuesto: form.presupuesto ? parseFloat(form.presupuesto) : null,
        supervisor_principal_id: form.supervisorPrincipalId || null,
        geo_cerca_activa: tieneGeofence ? form.geoCercaActiva : false,
        geo_cerca_radio_m: parseInt(form.geoCercaRadioM, 10) || 250,
        geo_cerca_lat: tieneGeofence && form.geoCercaLat ? parseFloat(form.geoCercaLat) : null,
        geo_cerca_lng: tieneGeofence && form.geoCercaLng ? parseFloat(form.geoCercaLng) : null,
        estado: 'activo',
      })
      .select('id')
      .single();

    setGuardando(false);

    if (errorInsert) {
      setError(errorInsert.message);
      return;
    }
    router.push(`/admin/proyectos/${data.id}`);
  }

  return (
    <>
      <a href="/admin/proyectos" className="text-xs text-inkSoft">← Volver</a>
      <h1 className="font-heading font-extrabold text-2xl text-ink mt-2 mb-5">Nuevo proyecto</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Nombre del proyecto</label>
          <input
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Ej. Villa Ocean View — Fase 2"
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Ubicación</label>
          <input
            value={form.ubicacion}
            onChange={(e) => setForm({ ...form, ubicacion: e.target.value })}
            placeholder="Ej. Providenciales, Grace Bay"
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Presupuesto (opcional)</label>
          <input
            type="number"
            value={form.presupuesto}
            onChange={(e) => setForm({ ...form, presupuesto: e.target.value })}
            placeholder="$"
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Supervisor principal</label>
          <select
            value={form.supervisorPrincipalId}
            onChange={(e) => setForm({ ...form, supervisorPrincipalId: e.target.value })}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm bg-white"
          >
            <option value="">Sin asignar todavía</option>
            {supervisores.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
          {supervisores.length === 0 && (
            <p className="text-[11px] text-inkSoft mt-1">
              No tienes ningún supervisor activo — puedes asignarlo después desde el detalle del proyecto.
            </p>
          )}
        </div>

        {tieneGeofence && (
          <div className="bg-card border border-line rounded p-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-bold text-ink">Geo-cerca</span>
              <button
                onClick={() => setForm({ ...form, geoCercaActiva: !form.geoCercaActiva })}
                className={`w-11 h-6 rounded-full relative transition-colors ${form.geoCercaActiva ? 'bg-primary' : 'bg-line'}`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    form.geoCercaActiva ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
            {form.geoCercaActiva && (
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-semibold text-inkSoft mb-1">Radio permitido (metros)</label>
                  <input
                    type="number"
                    value={form.geoCercaRadioM}
                    onChange={(e) => setForm({ ...form, geoCercaRadioM: e.target.value })}
                    className="w-full border border-line rounded-sm px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-inkSoft mb-1">Centro de la obra</label>
                  {form.geoCercaLat && form.geoCercaLng ? (
                    <p className="text-xs text-ink bg-paper border border-line rounded-sm px-3 py-2">
                      Ubicación guardada ({form.geoCercaLat}, {form.geoCercaLng})
                    </p>
                  ) : (
                    <p className="text-[11px] text-inkSoft mb-1.5">
                      Párate en la obra y toca el botón — así queda guardado el centro desde donde se mide el radio.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={capturarUbicacion}
                    disabled={capturando}
                    className="w-full border border-primary text-primary rounded-sm py-2 text-xs font-bold disabled:opacity-60"
                  >
                    {capturando ? 'Obteniendo ubicación…' : form.geoCercaLat ? 'Volver a capturar aquí' : 'Usar mi ubicación actual'}
                  </button>
                  {errorUbicacion && <p className="text-danger text-xs mt-1">{errorUbicacion}</p>}
                  {!form.geoCercaLat && !errorUbicacion && (
                    <p className="text-[11px] text-warning mt-1">
                      Sin esto, la geo-cerca queda activada pero no valida nada — falta el punto desde dónde medir.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-danger text-xs">{error}</p>}

        <button
          onClick={guardar}
          disabled={guardando}
          className="w-full bg-primary text-white rounded-sm py-3 text-sm font-bold disabled:opacity-60"
        >
          {guardando ? 'Creando…' : 'Crear proyecto'}
        </button>
      </div>
    </>
  );
}
