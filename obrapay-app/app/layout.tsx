import type { Metadata, Viewport } from 'next';
import { Manrope, Inter } from 'next/font/google';
import './globals.css';

// Mismas fuentes que tailwind.config.ts espera (fontFamily.heading /
// fontFamily.body) — sin cargarlas aquí, esos nombres no resuelven a
// ninguna tipografía real y el navegador cae en su fuente por defecto.
const manrope = Manrope({ subsets: ['latin'], weight: ['700', '800'], variable: '--font-manrope' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'OBRAPAY',
  description: 'Nómina y operación para constructoras del Caribe',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${manrope.variable} ${inter.variable}`}>
      <body className="font-body">{children}</body>
    </html>
  );
}
