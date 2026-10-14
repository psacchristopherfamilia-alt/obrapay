'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { crearEmpresa } from '../actions';

export default function NuevaEmpresaPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    nombreEmpresa: '',
    industria: '',
    direccion: '',
    telefono: '',
    nombreAdmin: '',
    emailAdmin: '',
    telefonoAdmin: '',
    idioma: 'es' as 'es' | 'en' | 'ht',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    if (!form.nombreEmpresa || !form.nombreAdmin || !form.emailAdmin) {
      setError('Nombre de la empresa, nombre y correo del Admin son obligatorios.');
      return;
    }
    setGuardando(true);
    setError(null);

    const resultado = await crearEmpresa(form);
    setGuardando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }
    router.push('/owner');
  }

  const chip = (activo: boolean) =>
    `text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer ${
      activo ? 'bg-charcoal text-white border-charcoal' : 'border-line text-ink'
    }`;

  return (
    <>
      <a href="/owner" className="text-xs text-inkSoft">← Volver</a>
      <h1 className="font-heading font-extrabold text-2xl text-ink mt-2 mb-1">+ Nueva empresa</h1>
      <p className="text-sm text-inkSoft mb-4">
        Arranca con 30 días de prueba del plan Profesional. Si no se convierte a un plan pago, cae sola a Gratuito.
      </p>

      <div className="bg-card border border-line rounded p-4 space-y-4 mb-4">
        <p className="text-[11px] font-bold uppercase text-inkSoft">Datos de la empresa</p>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Nombre de la empresa</label>
          <input
            value={form.nombreEmpresa}
            onChange={(e) => setForm({ ...form, nombreEmpresa: e.target.value })}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            placeholder="Ej. Villas del Caribe SRL"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Industria</label>
          <input
            value={form.industria}
            onChange={(e) => setForm({ ...form, industria: e.target.value })}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            placeholder="Construcción"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Dirección</label>
          <input
            value={form.direccion}
            onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Teléfono</label>
          <input
            value={form.telefono}
            onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="bg-card border border-line rounded p-4 space-y-4">
        <p className="text-[11px] font-bold uppercase text-inkSoft">Primer Admin de la empresa</p>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Nombre completo</label>
          <input
            value={form.nombreAdmin}
            onChange={(e) => setForm({ ...form, nombreAdmin: e.target.value })}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Correo</label>
          <input
            type="email"
            value={form.emailAdmin}
            onChange={(e) => setForm({ ...form, emailAdmin: e.target.value })}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-inkSoft mt-1">Se le enviará un correo para crear su contraseña.</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-inkSoft mb-1">Teléfono (WhatsApp)</label>
          <input
            value={form.telefonoAdmin}
            onChange={(e) => setForm({ ...form, telefonoAdmin: e.target.value })}
            className="w-full border border-line rounded-sm px-3 py-2 text-sm"
            placeholder="+1 649 000 0000"
          />
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
      </div>

      {error && <p className="text-danger text-sm mt-3">{error}</p>}

      <div className="flex gap-2 mt-4">
        <a href="/owner" className="flex-1 text-center border border-line rounded-sm py-3 text-sm font-bold text-ink">
          Cancelar
        </a>
        <button
          onClick={guardar}
          disabled={guardando}
          className="flex-1 bg-primary text-white rounded-sm py-3 text-sm font-bold disabled:opacity-60"
        >
          {guardando ? 'Creando…' : 'Crear empresa'}
        </button>
      </div>
    </>
  );
}
