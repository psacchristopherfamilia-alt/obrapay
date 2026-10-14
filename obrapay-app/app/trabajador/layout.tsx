'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';
import { useT, type Clave } from '@/lib/i18n';

const TABS: Array<{ href: string; label: Clave }> = [
  { href: '/trabajador', label: 'tab_inicio' },
  { href: '/trabajador/reporte', label: 'tab_reporte' },
  { href: '/trabajador/vehiculo', label: 'tab_vehiculo' },
  { href: '/trabajador/avisos', label: 'tab_avisos' },
  { href: '/trabajador/perfil', label: 'tab_perfil' },
  { href: '/ayuda', label: 'tab_ayuda' },
];

export default function TrabajadorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
  const t = useT();
  const [avisosSinLeer, setAvisosSinLeer] = useState(0);

  useEffect(() => {
    async function contar() {
      if (!usuario) return;
      const { count } = await supabase
        .from('notificaciones')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', usuario.id)
        .eq('leido', false);
      setAvisosSinLeer(count ?? 0);
    }
    contar();
  }, [supabase, usuario, pathname]); // re-contar al volver de Avisos, donde se marcan como leídas

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="bg-charcoal text-white px-5 py-5">
        <p className="font-heading font-extrabold text-lg">OBRAPAY</p>
      </header>

      <main className="flex-1 px-4 py-5 pb-24">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 bg-charcoal border-t-2 border-primary flex overflow-x-auto">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex-1 min-w-[68px] text-center py-3 text-[10.5px] font-semibold whitespace-nowrap px-1 ${
                active ? 'text-primary' : 'text-gray-400'
              }`}
            >
              {t(tab.label)}
              {tab.href === '/trabajador/avisos' && avisosSinLeer > 0 && (
                <span className="absolute top-1.5 right-[28%] w-1.5 h-1.5 rounded-full bg-danger" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
