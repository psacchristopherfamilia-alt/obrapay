import Link from 'next/link';

const FAQ: Array<{ p: string; r: string }> = [
  { p: '¿Cómo marco mi entrada y salida?', r: 'En Inicio, elige tu proyecto y toca "Marcar entrada". Al terminar, toca "Marcar salida". La hora la pone el sistema, no el teléfono.' },
  { p: 'Olvidé marcar la salida', r: 'El turno se cierra solo más tarde ese día (o al día siguiente) y queda pendiente. Tu supervisor le pone la hora real y lo aprueba.' },
  { p: '¿Cuándo me pagan?', r: 'La semana cierra el miércoles a las 11:59 p.m., el reporte sale el jueves y el pago es el viernes. Las horas aprobadas tarde se pagan la semana siguiente.' },
  { p: '¿Qué son NIB y NHIP?', r: 'Son los descuentos de seguro social y seguro de salud. Los ves detallados en "Mi reporte".' },
  { p: '¿Por qué las horas después de las 5:00 p.m. aparecen aparte?', r: 'Son horas extra. Se muestran separadas para que el reporte sea claro.' },
  { p: 'Olvidé mi contraseña', r: 'En la pantalla de entrada toca "¿Olvidaste tu contraseña?" y te llega un enlace por correo.' },
  { p: 'La app me dice que estoy fuera de la obra', r: 'Puedes marcar igual: el supervisor recibe un aviso y lo revisa. Activa la ubicación del teléfono para evitarlo.' },
  { p: '(Administrador) ¿Cómo agrego muchos trabajadores?', r: 'En Trabajadores → Importar desde Excel (CSV). Cada persona recibe un correo para crear su contraseña.' },
];

export default function AyudaPage() {
  const email = process.env.NEXT_PUBLIC_SOPORTE_EMAIL;
  const wa = (process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP ?? '').replace(/\D/g, '');

  return (
    <div className="min-h-screen bg-paper px-4 py-6">
      <div className="max-w-xl mx-auto">
        <Link href="/login" className="text-xs text-inkSoft">← Volver</Link>
        <h1 className="font-heading font-extrabold text-2xl text-ink mt-2 mb-4">Ayuda</h1>
        <div className="space-y-2">
          {FAQ.map((x) => (
            <details key={x.p} className="bg-card rounded border border-line px-4 py-3">
              <summary className="font-semibold text-sm text-ink cursor-pointer">{x.p}</summary>
              <p className="text-sm text-inkSoft mt-2">{x.r}</p>
            </details>
          ))}
        </div>
        {(email || wa) && (
          <div className="bg-card rounded border border-line p-4 mt-5">
            <p className="font-semibold text-sm text-ink mb-2">¿Sigues con dudas?</p>
            {wa && <a className="block text-primary font-semibold text-sm mb-1" href={`https://wa.me/${wa}`}>Escríbenos por WhatsApp</a>}
            {email && <a className="block text-primary font-semibold text-sm" href={`mailto:${email}`}>{email}</a>}
          </div>
        )}
      </div>
    </div>
  );
}
