import { useState, type FormEvent } from 'react'
import { errorMessage } from '../api'
import { ARMS, SEXES, THERAPIES } from '../constants'
import type { Paciente, PacienteInput } from '../types'

type Props = {
  initial?: Paciente
  onSubmit: (data: PacienteInput) => Promise<void>
  onCancel: () => void
}

type Errors = Partial<Record<'nombre' | 'edad' | 'duracionMin', string>>

export function PatientForm({ initial, onSubmit, onCancel }: Props) {
  const [nombre, setNombre] = useState(initial?.nombre ?? '')
  const [edad, setEdad] = useState(initial ? String(initial.edad) : '')
  const [sexo, setSexo] = useState(initial?.sexo ?? '')
  const [brazo, setBrazo] = useState(initial?.brazo ?? '')
  const [terapia, setTerapia] = useState(initial?.terapia ?? '')
  const [duracionMin, setDuracionMin] = useState(String(initial?.duracionMin ?? 20))
  const [observaciones, setObservaciones] = useState(initial?.observaciones ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [serverError, setServerError] = useState('')
  const [saving, setSaving] = useState(false)

  // Si el paciente tiene una terapia que no está en la lista, igual se muestra.
  const therapyOptions: { value: string; label: string }[] = [...THERAPIES]
  if (terapia && !therapyOptions.some((t) => t.value === terapia)) {
    therapyOptions.push({ value: terapia, label: terapia })
  }

  function validate(): Errors {
    const found: Errors = {}
    if (!nombre.trim()) found.nombre = 'El nombre es obligatorio.'
    const age = Number(edad)
    if (!edad || !Number.isInteger(age) || age < 1 || age > 120) {
      found.edad = 'Ingresa una edad entera entre 1 y 120.'
    }
    const duration = Number(duracionMin)
    if (!Number.isInteger(duration) || duration < 5 || duration > 120) {
      found.duracionMin = 'La duración debe estar entre 5 y 120 minutos.'
    }
    return found
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setServerError('')
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSaving(true)
    try {
      await onSubmit({
        nombre: nombre.trim(),
        edad: Number(edad),
        sexo: sexo || null,
        brazo: brazo || null,
        terapia: terapia || null,
        duracionMin: Number(duracionMin),
        observaciones: observaciones.trim() || null,
      })
    } catch (e) {
      setServerError(errorMessage(e))
      setSaving(false)
    }
  }

  return (
    <form className="module-form" onSubmit={handleSubmit} noValidate>
      <label>
        Nombre completo *
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          aria-invalid={!!errors.nombre}
          aria-describedby={errors.nombre ? 'err-nombre' : undefined}
          autoFocus
          required
        />
        {errors.nombre && <span id="err-nombre" className="field-error-text">{errors.nombre}</span>}
      </label>
      <label>
        Edad *
        <input
          type="number"
          min="1"
          max="120"
          value={edad}
          onChange={(e) => setEdad(e.target.value)}
          aria-invalid={!!errors.edad}
          aria-describedby={errors.edad ? 'err-edad' : undefined}
          required
        />
        {errors.edad && <span id="err-edad" className="field-error-text">{errors.edad}</span>}
      </label>
      <label>
        Sexo
        <select value={sexo} onChange={(e) => setSexo(e.target.value)}>
          <option value="">Seleccionar</option>
          {SEXES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label>
        Brazo afectado
        <select value={brazo} onChange={(e) => setBrazo(e.target.value)}>
          <option value="">Seleccionar</option>
          {ARMS.map((a) => <option key={a}>{a}</option>)}
        </select>
      </label>
      <label>
        Terapia
        <select value={terapia} onChange={(e) => setTerapia(e.target.value)}>
          <option value="">Seleccionar</option>
          {therapyOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
      <label>
        Duración (min)
        <input
          type="number"
          min="5"
          max="120"
          value={duracionMin}
          onChange={(e) => setDuracionMin(e.target.value)}
          aria-invalid={!!errors.duracionMin}
          aria-describedby={errors.duracionMin ? 'err-duracion' : undefined}
        />
        {errors.duracionMin && <span id="err-duracion" className="field-error-text">{errors.duracionMin}</span>}
      </label>
      <label className="full">
        Observaciones
        <textarea rows={3} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
      </label>

      {serverError && <p className="notice notice--error form-actions-full" role="alert">{serverError}</p>}

      <div className="form-actions">
        <button type="button" className="module-btn" onClick={onCancel} disabled={saving}>Cancelar</button>
        <button type="submit" className="module-btn primary" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar paciente'}
        </button>
      </div>
    </form>
  )
}
