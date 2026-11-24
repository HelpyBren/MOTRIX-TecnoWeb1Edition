import { useMemo, useState, type FormEvent } from 'react'
import { api, errorMessage } from '../api'
import { useNotice, useResource } from '../hooks'
import type { Paciente, Sesion } from '../types'
import { Modal } from './Modal'
import { Notice } from './Notice'

const normalize = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function formatDuration(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const EMPTY: Sesion[] = []

export function SessionsView({ pacientes, activeId }: { pacientes: Paciente[]; activeId?: string }) {
  const { data, loading, error, reload } = useResource(api.sesiones.list)
  const sesiones = data ?? EMPTY
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const { notice, show } = useNotice()

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return sesiones
    return sesiones.filter((s) => normalize(`${s.pacienteNombre} ${s.terapia ?? ''}`).includes(q))
  }, [sesiones, query])

  return (
    <div className="module-view">
      <div className="module-header">
        <div>
          <span className="module-kicker">REHABILITACIÓN</span>
          <h1>Sesiones</h1>
          <p>Historial de sesiones de terapia guardadas en la base de datos.</p>
        </div>
        <button type="button" className="module-btn primary" onClick={() => setCreating(true)} disabled={pacientes.length === 0}>
          + Registrar sesión
        </button>
      </div>

      <Notice notice={notice} />

      <div className="module-card">
        <div className="module-toolbar">
          <input
            className="module-search"
            type="search"
            placeholder="Buscar por paciente o terapia..."
            aria-label="Buscar sesiones"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="module-count" aria-live="polite">{filtered.length} sesión(es)</span>
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
              <tr>
                <th>Fecha</th><th>Paciente</th><th>Terapia</th><th>Duración</th><th>Reps</th>
                <th>RMS (mV)</th><th>Ángulo</th><th>Fuerza máx.</th><th>Temp.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="empty-state">Cargando sesiones…</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-state">
                    {sesiones.length === 0 ? 'Todavía no hay sesiones guardadas.' : 'Ninguna sesión coincide con la búsqueda.'}
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.fecha).toLocaleString('es-BO')}</td>
                    <td><strong>{s.pacienteNombre}</strong></td>
                    <td>{s.terapia ?? '—'}</td>
                    <td><span className="mono">{formatDuration(s.duracionSeg)}</span></td>
                    <td>{s.repeticiones}</td>
                    <td>{s.rmsPromedio.toFixed(2)}</td>
                    <td>{s.anguloPromedio.toFixed(0)}°</td>
                    <td>{s.fuerzaMaxima.toFixed(1)} N</td>
                    <td>{s.temperaturaPromedio.toFixed(1)} °C</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {creating && (
        <Modal title="Registrar sesión" onClose={() => setCreating(false)}>
          <SessionForm
            pacientes={pacientes}
            defaultId={activeId}
            onCancel={() => setCreating(false)}
            onSaved={async () => {
              setCreating(false)
              show('success', 'Sesión registrada correctamente.')
              await reload()
            }}
          />
        </Modal>
      )}
    </div>
  )
}

type SessionFormProps = {
  pacientes: Paciente[]
  defaultId?: string
  onCancel: () => void
  onSaved: () => Promise<void>
}

function SessionForm({ pacientes, defaultId, onCancel, onSaved }: SessionFormProps) {
  const [pacienteId, setPacienteId] = useState(defaultId ?? pacientes[0]?.id ?? '')
  const [values, setValues] = useState({
    duracionSeg: '0', repeticiones: '0', rmsPromedio: '0',
    anguloPromedio: '0', fuerzaMaxima: '0', temperaturaPromedio: '0',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (key: keyof typeof values) => (e: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [key]: e.target.value }))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const paciente = pacientes.find((p) => p.id === pacienteId)
    if (!paciente) return setError('Selecciona un paciente.')
    const numbers = Object.values(values).map(Number)
    if (numbers.some((n) => !Number.isFinite(n) || n < 0)) {
      return setError('Todos los valores deben ser números mayores o iguales a 0.')
    }
    setSaving(true)
    try {
      await api.sesiones.create({
        pacienteId: paciente.id,
        pacienteNombre: paciente.nombre,
        terapia: paciente.terapia,
        duracionSeg: Number(values.duracionSeg),
        repeticiones: Number(values.repeticiones),
        rmsPromedio: Number(values.rmsPromedio),
        anguloPromedio: Number(values.anguloPromedio),
        fuerzaMaxima: Number(values.fuerzaMaxima),
        temperaturaPromedio: Number(values.temperaturaPromedio),
      })
      await onSaved()
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  const numberField = (key: keyof typeof values, label: string, step = '1') => (
    <label>
      {label}
      <input type="number" min="0" step={step} value={values[key]} onChange={set(key)} />
    </label>
  )

  return (
    <form className="module-form" onSubmit={handleSubmit} noValidate>
      <label className="full">
        Paciente *
        <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} required>
          {pacientes.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </label>
      {numberField('duracionSeg', 'Duración (segundos)')}
      {numberField('repeticiones', 'Repeticiones')}
      {numberField('rmsPromedio', 'RMS promedio (mV)', '0.01')}
      {numberField('anguloPromedio', 'Ángulo promedio (°)', '0.1')}
      {numberField('fuerzaMaxima', 'Fuerza máxima (N)', '0.1')}
      {numberField('temperaturaPromedio', 'Temperatura promedio (°C)', '0.1')}
      {error && <p className="notice notice--error form-actions-full" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="module-btn" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="submit" className="module-btn primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar sesión'}
        </button>
      </div>
    </form>
  )
}
