import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type Usuario } from '../api'

type User = {
  id: string
  nombre: string
  usuario: string
  correo: string
  rol: string
}

type AuthContextType = {
  user: User | null
  loading: boolean
  login: (identificador: string, password: string) => Promise<void>
  logout: () => Promise<void>
  register: (data: { nombre: string; usuario: string; correo: string; password: string }) => Promise<void>
  recover: (correo: string) => Promise<void>
  reset: (token: string, password: string) => Promise<void>
} & {
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // Check auth status on mount
  useEffect(() => {
    api.auth.me()
      .then((res) => setUser(res.usuario))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (identificador: string, password: string) => {
    const res = await api.auth.login({ identificador, password })
    setUser(res.usuario)
  }, [])

  const logout = useCallback(async () => {
    await api.auth.logout()
    setUser(null)
  }, [])

  const register = useCallback(async (data: { nombre: string; usuario: string; correo: string; password: string }) => {
    await api.auth.register(data)
  }, [])

  const recover = useCallback(async (correo: string) => {
    await api.auth.recover(correo)
  }, [])

  const reset = useCallback(async (token: string, password: string) => {
    await api.auth.reset(token, password)
  }, [])

  const value: AuthContextType = {
    user,
    loading,
    login,
    logout,
    register,
    recover,
    reset,
    isAuthenticated: !!user,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}