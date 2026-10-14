// Tipos alineados 1:1 con obrapay_schema.sql

export type RolUsuario = 'trabajador' | 'supervisor' | 'comprador' | 'admin' | 'owner';
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
  cuenta_bancaria: string | null;
  requiere_gps: boolean;
  requiere_permiso_trabajo: boolean;
  permiso_trabajo_numero: string | null;
  permiso_trabajo_vencimiento: string | null;
  permiso_trabajo_aviso_enviado: boolean;
}

export interface Proyecto {
  id: string;
  empresa_id: string;
  nombre: string;
  ubicacion: string | null;
  supervisor_principal_id: string | null;
  presupuesto: number | null;
  geo_cerca_activa: boolean;
  geo_cerca_radio_m: number;
  geo_cerca_lat: number | null;
  geo_cerca_lng: number | null;
  estado: 'activo' | 'cerrado';
  creado_en: string;
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
  pago_semanal_id: string | null;
  hora_entrada: string;
  hora_salida: string | null;
  horas_normales: number;
  horas_extra: number;
  estado: EstadoRegistroHoras;
  aprobado_por: string | null;
  fecha_aprobacion: string | null;
  ubicacion_entrada: { x: number; y: number } | null;
  ubicacion_salida: { x: number; y: number } | null;
  fuera_geo_cerca_entrada: boolean;
  fuera_geo_cerca_salida: boolean;
  creado_en: string;
}

// Fila combinada que usa la pantalla de marcaje
export interface ProyectoAsignado extends Proyecto {
  entradaAbierta?: RegistroHoras | null;
}
