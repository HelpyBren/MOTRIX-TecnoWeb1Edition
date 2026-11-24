import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from './api'

/** Carga un recurso de la API y expone data / loading / error / reload. */
export function useResource<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  // Carga inicial (y si cambia el fetcher). `cancelled` evita pisar estado
  // si el componente se desmonta antes de que responda el servidor.
  useEffect(() => {
    let cancelled = false
    fetcher()
      .then((result) => {
        if (cancelled) return
        setData(result)
        setError('')
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetcher])

  // Recarga manual (después de crear / editar / eliminar o al pulsar "Reintentar").
  const reload = useCallback(async () => {
    try {
      setData(await fetcher())
      setError('')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [fetcher])

  return { data, error, loading, reload }
}

export type NoticeState = { type: 'success' | 'error'; text: string } | null

/** Mensaje temporal (éxito / error) que desaparece solo a los 4 segundos. */
export function useNotice() {
  const [notice, setNotice] = useState<NoticeState>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const show = useCallback((type: 'success' | 'error', text: string) => {
    setNotice({ type, text })
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setNotice(null), 4000)
  }, [])

  return { notice, show }
}
