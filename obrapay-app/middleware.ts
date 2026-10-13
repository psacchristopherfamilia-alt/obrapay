import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Ruta de inicio para cada rol una vez autenticado
const HOME_BY_ROL: Record<string, string> = {
  trabajador: '/trabajador',
  supervisor: '/supervisor',
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

  // Sin sesión → todo redirige a login, excepto el propio login
  if (!session && !isLoginPage) {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
