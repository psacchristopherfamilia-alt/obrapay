'use client';

import { useUsuarioActual } from '@/lib/useUsuarioActual';

export type Idioma = 'es' | 'en' | 'ht';

const D = {
  es: {
    tab_inicio: 'Inicio', tab_reporte: 'Mi reporte', tab_vehiculo: 'Vehículo', tab_avisos: 'Avisos', tab_perfil: 'Perfil', tab_ayuda: 'Ayuda',
    hola: 'Hola', cargando: 'Cargando…', en_curso: 'En curso', marcar_salida: 'Marcar salida', marcar_entrada: 'Marcar entrada',
    sin_turno: 'Sin turno activo', toca_proyecto: 'Toca un proyecto para marcar entrada', toca_marcar: 'Toca para marcar entrada',
    cierra_turno: 'Cierra tu turno actual para cambiar de proyecto', sin_proyectos: 'No tienes proyectos asignados todavía.',
    sin_semana: 'No hay una semana de pago abierta. Contacta a tu administrador.',
    err_entrada: 'No se pudo marcar entrada: ', err_salida: 'No se pudo marcar salida: ',
  },
  en: {
    tab_inicio: 'Home', tab_reporte: 'My report', tab_vehiculo: 'Vehicle', tab_avisos: 'Alerts', tab_perfil: 'Profile', tab_ayuda: 'Help',
    hola: 'Hi', cargando: 'Loading…', en_curso: 'In progress', marcar_salida: 'Clock out', marcar_entrada: 'Clock in',
    sin_turno: 'No active shift', toca_proyecto: 'Tap a project to clock in', toca_marcar: 'Tap to clock in',
    cierra_turno: 'Clock out of your current shift to switch projects', sin_proyectos: 'You have no projects assigned yet.',
    sin_semana: 'There is no open pay week. Contact your administrator.',
    err_entrada: 'Could not clock in: ', err_salida: 'Could not clock out: ',
  },
  ht: {
    tab_inicio: 'Akèy', tab_reporte: 'Rapò mwen', tab_vehiculo: 'Veyikil', tab_avisos: 'Avi', tab_perfil: 'Pwofil', tab_ayuda: 'Èd',
    hola: 'Bonjou', cargando: 'Y ap chaje…', en_curso: 'Ap fèt', marcar_salida: 'Make soti', marcar_entrada: 'Make antre',
    sin_turno: 'Pa gen travay ki aktif', toca_proyecto: 'Peze yon pwojè pou make antre', toca_marcar: 'Peze pou make antre',
    cierra_turno: 'Fèmen travay ou a pou chanje pwojè', sin_proyectos: 'Yo poko ba ou okenn pwojè.',
    sin_semana: 'Pa gen semèn peman ouvè. Kontakte administratè ou a.',
    err_entrada: 'Pa t kapab make antre: ', err_salida: 'Pa t kapab make soti: ',
  },
} as const;

export type Clave = keyof typeof D.es;

export function traducir(idioma: string | null | undefined, clave: Clave): string {
  const i: Idioma = idioma === 'en' || idioma === 'ht' ? idioma : 'es';
  return D[i][clave] ?? D.es[clave];
}

/** Hook: devuelve t('clave') en el idioma preferido del usuario. */
export function useT() {
  const { usuario } = useUsuarioActual();
  const idioma = (usuario as any)?.idioma_preferido as string | undefined;
  return (clave: Clave) => traducir(idioma, clave);
}
