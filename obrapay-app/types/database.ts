// Tipos alineados 1:1 con obrapay_schema.sql

export type RolUsuario = 'trabajador' | 'supervisor' | 'admin' | 'owner';
export type MetodoPago = 'transfer' | 'cash' | 'check' | 'wallet';
export type EstadoRegistroHoras =
  | 'pendiente'
  | 'aprobado_supervisor'
  | 'aprobado_admin_tarde'
  | 'rechazado'
  | 'cerrado_automatico';

export interface Usuario {
  id: string;
  empresa_id: string | null;
  nombre: string;
  email: string;
  telefono: string | null;
  rol: RolUsuario;
  idioma_preferido: 'es' | 'en' | 'ht';
  estado: 'activo' | 'inactivo';
  creado_en: string;
}

export interface PerfilNomina {
  usuario_id: string;
  oficio: string;
  tarifa_hora: number;
  porcentaje_seguro: number;
  metodo_pago: MetodoPago;
  requiere_gps: boolean;
}

export interface Proyecto {
  id: string;
  empresa_id: string;
  nombre: string;
  ubicacion: string | null;
  geo_cerca_activa: boolean;
  geo_cerca_radio_m: number;
  estado: 'activo' | 'cerrado';
}

export interface SemanaPago {
  id: string;
  empresa_id: string;
  fecha_inicio: string;
  fecha_cierre: string;
  estado: 'abierta' | 'cerrada' | 'pagada';
}

export interface RegistroHoras {
  id: string;
  usuario_id: string;
  proyecto_id: string;
  semana_id: string;
  hora_entrada: string;
  hora_salida: string | null;
  horas_normales: number;
  horas_extra: number;
  estado: EstadoRegistroHoras;
}

// Fila combinada que usa la pantalla de marcaje
export interface ProyectoAsignado extends Proyecto {
  entradaAbierta?: RegistroHoras | null;
}
