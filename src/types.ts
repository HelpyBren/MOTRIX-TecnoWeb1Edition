export type Paciente = {
  id: string
  nombre: string
  edad: number
  sexo: string | null
  brazo: string | null
  terapia: string | null
  duracionMin: number
  observaciones: string | null
  creadoEn: string
}

export type PacienteInput = Omit<Paciente, 'id' | 'creadoEn'>

export type Sesion = {
  id: string
  pacienteId: string
  pacienteNombre: string
  fecha: string
  terapia: string | null
  duracionSeg: number
  repeticiones: number
  rmsPromedio: number
  anguloPromedio: number
  fuerzaMaxima: number
  temperaturaPromedio: number
}

export type SesionInput = {
  pacienteId: string
  pacienteNombre: string
  terapia?: string | null
  duracionSeg: number
  repeticiones: number
  rmsPromedio: number
  anguloPromedio: number
  fuerzaMaxima: number
  temperaturaPromedio: number
}

export type Dispositivo = {
  id: number
  nombre: string
  estado: string
  codigo: string
  topicBase: string
  creadoEn: string
}

export type Usuario = {
  id: string
  nombre: string
  usuario: string
  correo: string
  rol: string
  mqttConnected?: boolean
  esp32Connected?: boolean
}

export type DispositivoInput = {
  nombre: string
  estado?: string
  codigo: string
  topicBase: string
}