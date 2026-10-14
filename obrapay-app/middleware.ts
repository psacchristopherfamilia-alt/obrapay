import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Ruta de inicio para cada rol una vez autenticado
const HOME_BY_ROL: Record<string, string> = {
  trabajador: '/trabajador',
  supervisor: '/supervisor',
  comprador: '/comprador',
  admin: '/admin',
  owner: '/owner',
};

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options) => res.cookies.set({ name, value, ...options }),
        remove: (name, options) => res.cookies.set({ name, value: '', ...options }),
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const path = req.nextUrl.pathname;
  const isLoginPage = path.startsWith('/login');
  const RUTAS_PUBLICAS = ['/login', '/recuperar', '/nueva-clave', '/registro', '/ayuda'];
  const esPublica = RUTAS_PUBLICAS.some((r) => path.startsWith(r));

  // Sin sesión → todo redirige a login, excepto el propio login
  if (!session && !esPublica) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Con sesión y está en login → mandarlo a su panel según rol
  if (session && isLoginPage) {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('rol')
      .eq('id', session.user.id)
      .single();

    const destino = usuario ? HOME_BY_ROL[usuario.rol] ?? '/trabajador' : '/trabajador';
    return NextResponse.redirect(new URL(destino, req.url));
  }

  return res;
}

export const config = {
  // "api" queda afuera a propósito: esas rutas las llaman Stripe, Supabase
  // (Database Webhooks) u otros servicios externos sin ninguna cookie de
  // sesión de navegador. Cada route handler bajo /api/ ya valida su propia
  // autorización por dentro (headers de firma de Stripe, secreto
  // compartido, o supabaseServer().auth.getUser()) — no necesitan, y no
  // deben, pasar por este chequeo de sesión primero.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
