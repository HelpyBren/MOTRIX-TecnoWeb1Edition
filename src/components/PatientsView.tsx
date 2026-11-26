import { useMemo, useState } from 'react'
import { api, errorMessage } from '../api'
import { useNotice } from '../hooks'
import type { Paciente, PacienteInput } from '../types'
import { Modal } from './Modal'
import { Notice } from './Notice'
import { PatientForm } from './PatientForm'

type Props = {
  pacientes: Paciente[]
  loading: boolean
  error: string
  activeId?: string
  onSelect: (paciente: Paciente) => void
  onReload: () => Promise<void>
}

// Búsqueda sin distinguir mayúsculas ni tildes: "maria" encuentra "María".
const normalize = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export function PatientsView({ pacientes, loading, error, activeId, onSelect, onReload }: Props) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Paciente | null>(null)
  const { notice, show } = useNotice()

  const [deleting, setDeleting] = useState<Paciente | null>(null)

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return pacientes
    return pacientes.filter((p) =>
      normalize(`${p.nombre} ${p.id} ${p.terapia ?? ''} ${p.brazo ?? ''}`).includes(q),
    )
  }, [pacientes, query])

  async function save(data: PacienteInput) {
    if (editing) {
      await api.pacientes.update(editing.id, data)
      show('success', 'Paciente actualizado correctamente.')
    } else {
      const created = await api.pacientes.create(data)
      onSelect(created)
      show('success', `${created.nombre} fue registrado y quedó como paciente activo.`)
    }
    setCreating(false)
    setEditing(null)
    await onReload()
  }

  async function remove(paciente: Paciente) {
    try {
      await api.pacientes.remove(paciente.id)
      show('success', 'Paciente eliminado.')
      await onReload()
    } catch (e) {
      show('error', errorMessage(e))
    } finally {
      setDeleting(null)
    }
  }

  const closeModal = () => {
    setCreating(false)
    setEditing(null)
  }

  return (
    <div className="module-view">
      <div className="module-header">
        <div>
          <span className="module-kicker">GESTIÓN CLÍNICA</span>
          <h1>Pacientes</h1>
          <p>Administra los pacientes registrados en la base de datos.</p>
        </div>
        <button type="button" className="module-btn primary" onClick={() => setCreating(true)}>
          + Nuevo paciente
        </button>
      </div>

      <Notice notice={notice} />

      <div className="module-card">
        <div className="module-toolbar">
          <input
            className="module-search"
            type="search"
            placeholder="Buscar por nombre, ID o terapia..."
            aria-label="Buscar pacientes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="module-count" aria-live="polite">
            {filtered.length} paciente(s)
          </span>
        </div>

        {error && (
          <p className="notice notice--error" role="alert">
            {error}{' '}
            <button type="button" className="table-btn" onClick={() => void onReload()}>Reintentar</button>
          </p>
        )}

        <div className="table-wrap">
          <table className="motrix-table">
            <thead>
              <tr>
                <th>ID</th><th>Paciente</th><th>Edad</th><th>Brazo</th>
                <th>Terapia</th><th>Duración</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="empty-state">Cargando pacientes…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-state">
                    {pacientes.length === 0
                      ? 'Todavía no hay pacientes registrados.'
                      : 'Ningún paciente coincide con la búsqueda.'}
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id}>
                    <td><span className="mono">{p.id.slice(0, 8)}</span></td>
                    <td>
                      <strong>{p.nombre}</strong>
                      {p.id === activeId && <span className="table-sub">Paciente activo</span>}
                    </td>
                    <td>{p.edad}</td>
                    <td>{p.brazo ?? '—'}</td>
                    <td>{p.terapia ?? '—'}</td>
                    <td>{p.duracionMin} min</td>
                    <td>
                      <div className="action-group">
                        <button type="button" className="table-btn" disabled={p.id === activeId} onClick={() => { onSelect(p); show('success', `${p.nombre} es ahora el paciente activo.`) }}>
                          {p.id === activeId ? 'Activo' : 'Seleccionar'}
                        </button>
                        <button type="button" className="table-btn" onClick={() => setEditing(p)}>Editar</button>
                        <button type="button" className="table-btn danger" onClick={() => setDeleting(p)}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {(creating || editing) && (
        <Modal title={editing ? 'Editar paciente' : 'Nuevo paciente'} onClose={closeModal}>
          <PatientForm initial={editing ?? undefined} onSubmit={save} onCancel={closeModal} />
        </Modal>
      )}

      {deleting && (
        <Modal title="Eliminar paciente" onClose={() => setDeleting(null)}>
          <p>¿Eliminar a {deleting.nombre} y todas sus sesiones?</p>
          <div className="form-actions">
            <button type="button" className="module-btn" onClick={() => setDeleting(null)}>Cancelar</button>
            <button type="button" className="module-btn danger" onClick={() => void remove(deleting)}>
              Eliminar
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
