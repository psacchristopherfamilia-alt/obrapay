'use client';

import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';

export default function EmpresaPage() {
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const [form, setForm] = useState({ nombre: '', industria: '', direccion: '', telefono: '', rnc_id_fiscal: '' });
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    async function cargar() {
      if (!usuario?.empresa_id) return;
      const { data } = await supabase.from('empresas').select('*').eq('id', usuario.empresa_id).single();
      if (data) {
        setForm({
          nombre: data.nombre ?? '',
          industria: data.industria ?? '',
          direccion: data.direccion ?? '',
          telefono: data.telefono ?? '',
          rnc_id_fiscal: data.rnc_id_fiscal ?? '',
        });
      }
      setLoading(false);
    }
    cargar();
  }, [supabase, usuario]);

  async function guardar() {
    if (!usuario?.empresa_id) return;
    setGuardando(true);
    const { error } = await supabase.from('empresas').update(form).eq('id', usuario.empresa_id);
    setGuardando(false);
    if (error) alert('No se pudo guardar: ' + error.message);
  }

  if (loading) return <p className="text-sm text-inkSoft">Cargando…</p>;

  const campo = (label: string, key: keyof typeof form, placeholder = '') => (
    <div>
      <label className="block text-xs font-semibold text-inkSoft mb-1">{label}</label>
      <input
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        className="w-full border border-line rounded-sm px-3 py-2 text-sm"
      />
    </div>
  );

  return (
    <>
      <h1 className="font-heading font-extrabold text-2xl text-ink mb-4">Empresa</h1>
      <div className="bg-card border border-line rounded p-4 space-y-4">
        {campo('Nombre de la empresa', 'nombre')}
        {campo('Industria', 'industria')}
        {campo('Dirección', 'direccion')}
        {campo('Teléfono', 'telefono')}
        {campo('RNC / ID fiscal', 'rnc_id_fiscal', '—')}
        <button
          onClick={guardar}
          disabled={guardando}
          className="bg-primary text-white text-sm font-bold px-5 py-3 rounded-sm disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </>
  );
}
