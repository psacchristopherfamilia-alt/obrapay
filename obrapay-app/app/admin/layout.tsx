'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin', label: 'Panel' },
  { href: '/admin/proyectos', label: 'Proyectos' },
  { href: '/admin/materiales', label: 'Materiales' },
  { href: '/admin/equipos', label: 'Equipo' },
  { href: '/admin/vehiculos', label: 'Vehículos' },
  { href: '/admin/facturacion', label: 'Facturación' },
  { href: '/admin/trabajadores', label: 'Trabajadores' },
  { href: '/admin/reportes', label: 'Reportes' },
  { href: '/admin/remesas', label: 'Remesas' },
  { href: '/admin/plan', label: 'Plan' },
  { href: '/admin/empresa', label: 'Empresa' },
  { href: '/admin/ajustes', label: 'Ajustes' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
              className={`flex-1 min-w-[74px] text-center py-3 text-[10.5px] font-semibold whitespace-nowrap px-2 ${
                active ? 'text-primary' : 'text-gray-400'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
