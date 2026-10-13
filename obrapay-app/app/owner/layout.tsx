'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/owner', label: 'Empresas' },
  { href: '/owner/facturacion', label: 'Facturación' },
  { href: '/owner/ajustes', label: 'Ajustes del sistema' },
];

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="bg-charcoal text-white px-5 py-5">
        <p className="font-heading font-extrabold text-lg">OBRAPAY</p>
        <p className="text-[11px] text-blue-200 font-semibold">Creador SaaS</p>
      </header>

      <main className="flex-1 px-4 py-5 pb-24">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 bg-charcoal border-t-2 border-primary flex">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 text-center py-3 text-[11px] font-semibold px-1 ${
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
