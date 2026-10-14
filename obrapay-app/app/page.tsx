import { redirect } from 'next/navigation';

// La raíz '/' nunca se muestra de verdad — el middleware ya intercepta
// toda visita a la app y manda a cada quien a /login (sin sesión) o a su
// panel según su rol (con sesión). Este archivo solo existe porque Next.js
// exige que la ruta '/' tenga una página, aunque sea un simple redirect.
export default function Home() {
  redirect('/login');
}
