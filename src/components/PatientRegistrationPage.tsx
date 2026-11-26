import { useState, FormEvent, ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, errorMessage } from '../api'
import logoMark from '../assets/logo_motrix.png'
import '../styles/sitio.css'
import '../styles/style.css'
import '../styles/responsive.css'

interface PatientFormData {
  nombre: string
  edad: string
  sexo: string
  brazo: string
  terapia: string
  duracion: string
  observaciones: string
}

export function PatientRegistrationPage() {
  const navigate = useNavigate()
  const [duration, setDuration] = useState(20)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [formData, setFormData] = useState<PatientFormData>({
    nombre: '',
    edad: '',
    sexo: '',
    brazo: '',
    terapia: '',
    duracion: '20',
    observaciones: '',
  })

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    if (name === 'duracion') {
      setDuration(parseInt(value) || 20)
    }
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    if (!formData.nombre || !formData.edad || !formData.sexo || !formData.brazo || !formData.terapia) {
      setError('Completa todos los campos obligatorios con valores válidos.')
      return
    }

    const edad = parseInt(formData.edad)
    if (!Number.isInteger(edad) || edad < 1 || edad > 120) {
      setError('La edad debe ser un número entre 1 y 120.')
      return
    }

    setSaving(true)

    try {
      const paciente = await api.pacientes.create({
        nombre: formData.nombre,
        edad,
        sexo: formData.sexo,
        brazo: formData.brazo,
        terapia: formData.terapia,
        duracionMin: duration,
        observaciones: formData.observaciones.trim() || null,
      })

      // Store active patient ID in localStorage
      localStorage.setItem('motrix-active-patient', paciente.id)
      navigate('/dashboard')
    } catch (err) {
      setError(errorMessage(err))
      setSaving(false)
    }
  }

  return (
    <>
      <div className="grid-canvas" />
      <div className="registro">
        <nav className="registro__nav landing__nav">
          <Link to="/" className="brand" aria-label="MOTRIX, volver a la portada">
            <div className="brand__mark"><img src={logoMark} alt="" width="45" height="45" /></div>
            <span className="brand__name">MOTRIX<span>.</span></span>
          </Link>
        </nav>
        <section className="registro__card">
          <div className="registro__head">
            <div className="hero__eyebrow"><span className="dot" /> Nueva sesión clínica</div>
            <h1>Registro del paciente</h1>
            <p>Completa los datos clínicos antes de iniciar la sesión de rehabilitación con el dispositivo MOTRIX.</p>
          </div>
          <form onSubmit={handleSubmit} noValidate>
            <div className="form-grid">
              <Field label="Nombre completo" htmlFor="nombre" required>
                <input
                  id="nombre"
                  name="nombre"
                  type="text"
                  placeholder="Ej. María Fernanda Rojas"
                  autoComplete="name"
                  required
                  value={formData.nombre}
                  onChange={handleChange}
                />
              </Field>
              <Field label="Edad" htmlFor="edad" required>
                <input
                  id="edad"
                  name="edad"
                  type="number"
                  placeholder="Ej. 34"
                  min="1"
                  max="120"
                  required
                  value={formData.edad}
                  onChange={handleChange}
                />
              </Field>
              <Field label="Sexo" htmlFor="sexo" required>
                <select
                  id="sexo"
                  name="sexo"
                  defaultValue=""
                  required
                  value={formData.sexo}
                  onChange={handleChange}
                >
                  <option value="" disabled>Selecciona una opción</option>
                  <option value="Femenino">Femenino</option>
                  <option value="Masculino">Masculino</option>
                  <option value="Otro">Otro</option>
                </select>
              </Field>
              <Field label="Brazo afectado" required>
                <div className="segmented" role="group" aria-label="Brazo afectado">
                  <input
                    type="radio"
                    id="brazoDer"
                    name="brazo"
                    value="Derecho"
                    required
                    checked={formData.brazo === 'Derecho'}
                    onChange={handleChange}
                  />
                  <label htmlFor="brazoDer">Derecho</label>
                  <input
                    type="radio"
                    id="brazoIzq"
                    name="brazo"
                    value="Izquierdo"
                    checked={formData.brazo === 'Izquierdo'}
                    onChange={handleChange}
                  />
                  <label htmlFor="brazoIzq">Izquierdo</label>
                </div>
              </Field>
              <Field label="Tipo de terapia" required full>
                <div className="segmented" role="group" aria-label="Tipo de terapia">
                  <input
                    type="radio"
                    id="terFlex"
                    name="terapia"
                    value="Flexión"
                    required
                    checked={formData.terapia === 'Flexión'}
                    onChange={handleChange}
                  />
                  <label htmlFor="terFlex">Flexión-Extensión</label>
                  <input
                    type="radio"
                    id="terExt"
                    name="terapia"
                    value="Extensión"
                    checked={formData.terapia === 'Extensión'}
                    onChange={handleChange}
                  />
                  <label htmlFor="terExt">Abducción-Aducción</label>
                  <input
                    type="radio"
                    id="terPro"
                    name="terapia"
                    value="Pronación"
                    checked={formData.terapia === 'Pronación'}
                    onChange={handleChange}
                  />
                  <label htmlFor="terPro">Rotación interna y externa</label>
                  <input
                    type="radio"
                    id="terSup"
                    name="terapia"
                    value="Supinación"
                    checked={formData.terapia === 'Supinación'}
                    onChange={handleChange}
                  />
                  <label htmlFor="terSup">Circunducción plana</label>
                </div>
              </Field>
              <Field label="Duración de la sesión" htmlFor="duracion" full>
                <div className="range-row">
                  <input
                    id="duracion"
                    name="duracion"
                    type="range"
                    min="5"
                    max="60"
                    step="5"
                    value={duration}
                    onChange={handleChange}
                  />
                  <span className="range-val">{duration} min</span>
                </div>
              </Field>
              <Field label="Observaciones clínicas" htmlFor="observaciones" full>
                <textarea
                  id="observaciones"
                  name="observaciones"
                  placeholder="Antecedentes, restricciones de movimiento, notas del fisioterapeuta..."
                  value={formData.observaciones}
                  onChange={handleChange}
                />
              </Field>
            </div>
            {error && <p className="field-error" role="alert">{error}</p>}
            <div className="registro__footer">
              <small>Los datos del paciente se guardan en la base de datos.</small>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Guardando…' : 'Iniciar sesión'}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </div>
          </form>
        </section>
      </div>
    </>
  )
}

function Field({
  label,
  htmlFor,
  required,
  full,
  children,
}: {
  label: string
  htmlFor?: string
  required?: boolean
  full?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`form-field${full ? ' form-field--full' : ''}`}>
      {htmlFor ? (
        <label htmlFor={htmlFor}>
          {label} {required && <span className="req">*</span>}
        </label>
      ) : (
        <div className="form-field__label">
          {label} {required && <span className="req">*</span>}
        </div>
      )}
      {children}
    </div>
  )
}