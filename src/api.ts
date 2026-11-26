import type {
  Dispositivo,
  DispositivoInput,
  Paciente,
  PacienteInput,
  Sesion,
  SesionInput,
  Usuario,
} from './types'

// En local usa el proxy de Vite (/api -> http://localhost:3001/api).
// Al desplegar, define VITE_API_URL (p. ej. https://mi-api.onrender.com/api).
const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ||
  '/api'

// CSRF protection header required by backend
const AUTH_HEADERS = {
  'X-Requested-With': 'MotrixWeb',
}

export class ApiError extends Error {}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...AUTH_HEADERS,
        ...init.headers,
      },
      credentials: 'include', // Include cookies for session
    })
  } catch {
    throw new ApiError(
      'No se pudo conectar con el servidor. Verifica que la API esté en ejecución (npm run dev:api).',
    )
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const serverMessage =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : ''
    throw new ApiError(serverMessage || `Error ${response.status} del servidor.`)
  }
  return body as T
}

const json = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(data),
})

export const api = {
  // Authentication endpoints
  auth: {
    login: (data: { identificador: string; password: string }) =>
      request<{ usuario: Usuario }>('/auth/login', json('POST', data)),
    logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    register: (data: { nombre: string; usuario: string; correo: string; password: string }) =>
      request<{ mensaje: string }>('/auth/registro', json('POST', data)),
    recover: (correo: string) =>
      request<{ mensaje: string }>('/auth/recuperar', json('POST', { correo })),
    reset: (token: string, password: string) =>
      request<{ mensaje: string }>('/auth/restablecer', json('POST', { token, password })),
    me: () => request<{ usuario: Usuario | null }>('/auth/me', { method: 'GET' }),
  },

  pacientes: {
    list: () => request<Paciente[]>('/pacientes'),
    create: (data: PacienteInput) => request<Paciente>('/pacientes', json('POST', data)),
    update: (id: string, data: PacienteInput) =>
      request<Paciente>(`/pacientes/${encodeURIComponent(id)}`, json('PUT', data)),
    remove: (id: string) =>
      request<{ mensaje: string }>(`/pacientes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  sesiones: {
    list: () => request<Sesion[]>('/sesiones'),
    create: (data: SesionInput) => request<Sesion>('/sesiones', json('POST', data)),
  },
  dispositivos: {
    list: () => request<Dispositivo[]>('/dispositivos'),
    create: (data: DispositivoInput) =>
      request<Dispositivo>('/dispositivos', json('POST', data)),
  },
}