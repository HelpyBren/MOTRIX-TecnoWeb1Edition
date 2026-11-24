import { useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api'
import { DEVICE_STATES } from '../constants'
import { useNotice, useResource } from '../hooks'
import type { Dispositivo } from '../types'
import { Modal } from './Modal'
import { Notice } from './Notice'

const EMPTY: Dispositivo[] = []

export function DevicesView() {
  const { data, loading, error, reload } = useResource(api.dispositivos.list)
  const dispositivos = data ?? EMPTY
  const [creating, setCreating] = useState(false)
  const { notice, show } = useNotice()

  const connected = dispositivos.filter((d) => d.estado === 'Conectado').length

  return (
    <div className="module-view">
      <div className="module-header">
        <div>
          <span className="module-kicker">HARDWARE</span>
          <h1>Dispositivos</h1>
          <p>Dispositivos MOTRIX registrados en la base de datos.</p>
        </div>
        <button type="button" className="module-btn primary" onClick={() => setCreating(true)}>
          + Registrar dispositivo
        </button>
      </div>

      <Notice notice={notice} />

      <div className="module-card">
        <div className="module-toolbar">
          <span className="module-count" aria-live="polite">
            {dispositivos.length} dispositivo(s) · {connected} conectado(s)
          </span>
        </div>

        {error && (
          <p className="notice notice--error" role="alert">
            {error}{' '}
            <button type="button" className="table-btn" onClick={() => void reload()}>Reintentar</button>
          </p>
        )}

        <div className="table-wrap">
          <table className="motrix-table">
            <thead>
              <tr><th>ID</th><th>Nombre</th><th>Estado</th><th>Registrado</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="empty-state">Cargando dispositivos…</td></tr>
              ) : dispositivos.length === 0 ? (
                <tr><td colSpan={4} className="empty-state">Todavía no hay dispositivos registrados.</td></tr>
              ) : (
                dispositivos.map((d) => (
                  <tr key={d.id}>
                    <td><span className="mono">#{d.id}</span></td>
                    <td><strong>{d.nombre}</strong></td>
                    <td>
                      <span className={`status-pill ${d.estado === 'Conectado' ? 'online' : 'idle'}`}>
                        {d.estado === 'Conectado' ? '● CONECTADO' : '○ DESCONECTADO'}
                      </span>
                    </td>
                    <td>{new Date(d.creadoEn).toLocaleString('es-BO')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <Modal title="Registrar dispositivo" small onClose={() => setCreating(false)}>
          <DeviceForm
            onCancel={() => setCreating(false)}
            onSaved={async () => {
              setCreating(false)
              show('success', 'Dispositivo registrado correctamente.')
              await reload()
            }}
          />
        </Modal>
      )}
    </div>
  )
}

function DeviceForm({ onCancel, onSaved }: { onCancel: () => void; onSaved: () => Promise<void> }) {
  const [nombre, setNombre] = useState('')
  const [estado, setEstado] = useState<string>('Desconectado')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!nombre.trim()) return setError('El nombre del dispositivo es obligatorio.')
    setSaving(true)
    try {
      await api.dispositivos.create({ nombre: nombre.trim(), estado })
      await onSaved()
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  return (
    <form className="module-form" onSubmit={handleSubmit} noValidate>
      <label className="full">
        Nombre *
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. ESP32-MOTRIX-01" autoFocus required />
      </label>
      <label className="full">
        Estado
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          {DEVICE_STATES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      {error && <p className="notice notice--error form-actions-full" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="module-btn" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="submit" className="module-btn primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar dispositivo'}
        </button>
      </div>
    </form>
  )
}
