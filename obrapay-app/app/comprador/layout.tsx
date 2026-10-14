'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { useUsuarioActual } from '@/lib/useUsuarioActual';

const TABS = [
  { href: '/comprador', label: 'Marcar' },
  { href: '/comprador/compras', label: 'Compras' },
  { href: '/comprador/vehiculo', label: 'Vehículo' },
  { href: '/comprador/reporte', label: 'Mi reporte' },
  { href: '/comprador/avisos', label: 'Avisos' },
  { href: '/comprador/perfil', label: 'Perfil' },
];

export default function CompradorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const supabase = supabaseBrowser();
  const { usuario } = useUsuarioActual();
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
  }, [supabase, usuario, pathname]);

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
              className={`relative flex-1 min-w-[70px] text-center py-3 text-[10.5px] font-semibold whitespace-nowrap px-1 ${
                active ? 'text-primary' : 'text-gray-400'
              }`}
            >
              {tab.label}
              {tab.href === '/comprador/avisos' && avisosSinLeer > 0 && (
                <span className="absolute top-1.5 right-[28%] w-1.5 h-1.5 rounded-full bg-danger" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
