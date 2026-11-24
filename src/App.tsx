import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import logo from './assets/logo.png'
import { api, errorMessage } from './api'
import { DevicesView } from './components/DevicesView'
import { PatientsView } from './components/PatientsView'
import { SessionsView } from './components/SessionsView'
import { useResource } from './hooks'
import { getActivePatientId, setActivePatientId } from './storage'
import type { Paciente } from './types'
import './styles/style.css'
import './styles/dashboard.css'
import './styles/modules.css'
import './styles/responsive.css'
import './App.css'

const NO_PATIENTS: Paciente[] = []

function Brand() {
  return (
    <a className="brand" href="/" aria-label="MOTRIX, página principal">
      <div className="brand__mark">
        <img src={logo} alt="" width="45" height="45" />
      </div>
      <span className="brand__name">MOTRIX<span>.</span></span>
    </a>
  )
}

function Background() {
  return (
    <>
      <div className="grid-canvas" />
      <div className="glow-orb glow-orb--blue" />
      <div className="glow-orb glow-orb--turquoise" />
    </>
  )
}

function LandingPage() {
  return (
    <>
      <Background />
      <div className="landing">
        <nav className="landing__nav">
          <Brand />
          <div className="badge-live">
            <span className="dot-only" />
            <span>Sistema IoT en línea</span>
          </div>
        </nav>

        <section className="landing__hero">
          <div className="hero__copy">
            <div className="hero__eyebrow"><span className="dot" /> Rehabilitación de miembros superiores</div>
            <h1 className="hero__title">Terapia física guiada<br />por <span className="accent">datos en tiempo real</span></h1>
            <p className="hero__desc">
              MOTRIX conecta un dispositivo de rehabilitación basado en ESP32 con sensores EMG y de ángulo
              a un panel clínico inteligente, permitiendo monitorear cada repetición, cada grado de movimiento
              y cada señal muscular del paciente durante su terapia.
            </p>
            <div className="hero__actions">
              <a href="/registro" className="btn btn--primary">
                Comenzar
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </a>
              <a href="#caracteristicas" className="btn btn--ghost">Ver características</a>
            </div>
            <div className="hero__stats">
              <div><div className="stat-num">4</div><div className="stat-label">Tipos de terapia</div></div>
              <div><div className="stat-num">&lt;80ms</div><div className="stat-label">Latencia MQTT</div></div>
              <div><div className="stat-num">24/7</div><div className="stat-label">Monitoreo remoto</div></div>
            </div>
          </div>

          <div className="hero__panel">
            <div className="hero__panel-head">
              <div className="hero__panel-title">Señal EMG<small>motrix/paciente1/emg</small></div>
              <span className="status-pill"><span className="dot" /> En vivo</span>
            </div>
            <div className="hero__panel-chart">
              <svg viewBox="0 0 400 110" width="100%" height="110" preserveAspectRatio="none" aria-label="Vista previa de señal EMG">
                <polyline fill="none" stroke="#0B5FFF" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round"
                  points="0,55 20,55 30,20 40,90 50,55 70,55 90,58 100,52 120,55 140,55 150,25 160,85 170,55 190,55 210,54 220,56 240,55 260,55 270,15 280,95 290,55 310,55 330,53 340,57 360,55 380,55 400,55" />
              </svg>
            </div>
            <div className="hero__panel-metrics">
              <div className="mini-metric"><div className="val">62°</div><div className="lbl">Ángulo</div></div>
              <div className="mini-metric"><div className="val">14</div><div className="lbl">Reps</div></div>
              <div className="mini-metric"><div className="val">3.2N</div><div className="lbl">Fuerza</div></div>
            </div>
          </div>
        </section>

        <section className="landing__features" id="caracteristicas">
          <Feature title="Biosensado EMG en vivo" text="Visualiza la actividad electromiográfica del paciente en tiempo real mediante MQTT sobre WebSockets." icon="wave" />
          <Feature title="Seguimiento de sesiones" text="Cada ejercicio queda registrado con repeticiones, ángulo, fuerza y duración exacta de la terapia." icon="time" />
          <Feature title="Control remoto del dispositivo" text="Inicia, pausa, detén y calibra el motor de rehabilitación directamente desde el dashboard." icon="grid" />
        </section>
        <footer className="landing__footer">
          MOTRIX Smart Rehabilitation System · Plataforma IoT para fisioterapia de miembros superiores
        </footer>
      </div>
    </>
  )
}

function Feature({ title, text, icon }: { title: string; text: string; icon: 'wave' | 'time' | 'grid' }) {
  return (
    <article className="feature-card">
      <div className="feature-card__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {icon === 'wave' && <path d="M2 12h4l2 8 4-16 2 8h8" />}
          {icon === 'time' && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>}
          {icon === 'grid' && <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>}
        </svg>
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  )
}

function RegistrationPage() {
  const [duration, setDuration] = useState(20)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const formData = new FormData(event.currentTarget)
    const nombre = String(formData.get('nombre') || '').trim()
    const edad = Number(formData.get('edad'))
    const sexo = String(formData.get('sexo') || '')
    const brazo = String(formData.get('brazo') || '')
    const terapia = String(formData.get('terapia') || '')

    if (!nombre || !Number.isInteger(edad) || edad < 1 || edad > 120 || !sexo || !brazo || !terapia) {
      setError('Completa todos los campos obligatorios con valores válidos.')
      return
    }

    setSaving(true)
    try {
      const paciente = await api.pacientes.create({
        nombre,
        edad,
        sexo,
        brazo,
        terapia,
        duracionMin: duration,
        observaciones: String(formData.get('observaciones') || '').trim() || null,
      })
      setActivePatientId(paciente.id)
      window.location.assign('/dashboard')
    } catch (e) {
      setError(errorMessage(e))
      setSaving(false)
    }
  }

  return (
    <>
      <Background />
      <div className="registro">
        <nav className="registro__nav landing__nav"><Brand /></nav>
        <section className="registro__card">
          <div className="registro__head">
            <div className="hero__eyebrow"><span className="dot" /> Nueva sesión clínica</div>
            <h1>Registro del paciente</h1>
            <p>Completa los datos clínicos antes de iniciar la sesión de rehabilitación con el dispositivo MOTRIX.</p>
          </div>
          <form onSubmit={submitRegistration} noValidate>
            <div className="form-grid">
              <Field label="Nombre completo" htmlFor="nombre" required><input id="nombre" name="nombre" type="text" placeholder="Ej. María Fernanda Rojas" autoComplete="name" required /></Field>
              <Field label="Edad" htmlFor="edad" required><input id="edad" name="edad" type="number" placeholder="Ej. 34" min="1" max="120" required /></Field>
              <Field label="Sexo" htmlFor="sexo" required>
                <select id="sexo" name="sexo" defaultValue="" required>
                  <option value="" disabled>Selecciona una opción</option>
                  <option>Femenino</option><option>Masculino</option><option>Otro</option>
                </select>
              </Field>
              <Field label="Brazo afectado" required>
                <div className="segmented" role="group" aria-label="Brazo afectado">
                  <input type="radio" id="brazoDer" name="brazo" value="Derecho" required /><label htmlFor="brazoDer">Derecho</label>
                  <input type="radio" id="brazoIzq" name="brazo" value="Izquierdo" /><label htmlFor="brazoIzq">Izquierdo</label>
                </div>
              </Field>
              <Field label="Tipo de terapia" required full>
                <div className="segmented" role="group" aria-label="Tipo de terapia">
                  <input type="radio" id="terFlex" name="terapia" value="Flexión" required /><label htmlFor="terFlex">Flexión-Extensión</label>
                  <input type="radio" id="terExt" name="terapia" value="Extensión" /><label htmlFor="terExt">Abducción-Aducción</label>
                  <input type="radio" id="terPro" name="terapia" value="Pronación" /><label htmlFor="terPro">Rotación interna y externa</label>
                  <input type="radio" id="terSup" name="terapia" value="Supinación" /><label htmlFor="terSup">Circunducción plana</label>
                </div>
              </Field>
              <Field label="Duración de la sesión" htmlFor="duracion" full>
                <div className="range-row">
                  <input id="duracion" name="duracion" type="range" min="5" max="60" step="5" value={duration} onChange={(event) => setDuration(Number(event.target.value))} />
                  <span className="range-val">{duration} min</span>
                </div>
              </Field>
              <Field label="Observaciones clínicas" htmlFor="observaciones" full>
                <textarea id="observaciones" name="observaciones" placeholder="Antecedentes, restricciones de movimiento, notas del fisioterapeuta..." />
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

function Field({ label, htmlFor, required, full, children }: { label: string; htmlFor?: string; required?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <div className={`form-field${full ? ' form-field--full' : ''}`}>
      {htmlFor ? <label htmlFor={htmlFor}>{label} {required && <span className="req">*</span>}</label> : <div className="form-field__label">{label} {required && <span className="req">*</span>}</div>}
      {children}
    </div>
  )
}

function DashboardPage() {
  const pacientes = useResource(api.pacientes.list)
  const patientList = pacientes.data ?? NO_PATIENTS
  const [activeId, setActiveId] = useState(getActivePatientId)
  const patient = patientList.find((p) => p.id === activeId) ?? patientList[0] ?? null

  function selectPatient(selected: Paciente) {
    setActivePatientId(selected.id)
    setActiveId(selected.id)
  }

  const [activeView, setActiveView] = useState('Dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('es-BO', { hour12: false }))

  useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date().toLocaleTimeString('es-BO', { hour12: false })), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const navItems = ['Dashboard', 'Pacientes', 'Sesiones', 'Dispositivos', 'Historial', 'Configuración']

  return (
    <>
      <div className="grid-canvas" />
      <div className={`sidebar-overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />
      <div className="dash">
        <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
          <div className="sidebar__brand"><Brand /></div>
          <nav className="sidebar__nav">
            <span className="nav-section-label">Clínico</span>
            {navItems.slice(0, 4).map((item) => <button key={item} className={`nav-item${activeView === item ? ' active' : ''}`} onClick={() => { setActiveView(item); setMenuOpen(false) }}>{item}</button>)}
            <span className="nav-section-label">Registros</span>
            {navItems.slice(4).map((item) => <button key={item} className={`nav-item${activeView === item ? ' active' : ''}`} onClick={() => { setActiveView(item); setMenuOpen(false) }}>{item}</button>)}
          </nav>
          <div className="sidebar__footer"><div className="sidebar__device-mini"><span className="ind offline" /><span>ESP32 desconectado</span></div></div>
        </aside>
        <main className="main">
          <header className="topbar">
            <div className="topbar__left">
              <button className="topbar__menu-btn" aria-label="Abrir menú" onClick={() => setMenuOpen(!menuOpen)}>☰</button>
              <div><strong>{activeView} de rehabilitación</strong><div className="muted">Sesión clínica · {patient?.nombre || 'Sin paciente'}</div></div>
            </div>
            <div className="topbar__right">
              <div className="chip clock">{clock}</div>
              <div className="chip"><span className="dot bad" />MQTT</div>
              <div className="chip"><span className="dot bad" />ESP32</div>
              <div className="topbar__user"><div className="avatar">FT</div><div><div className="uname">Fisioterapeuta</div><div className="urole">Sesión clínica</div></div></div>
            </div>
          </header>
          <div className="content">
            {activeView === 'Dashboard' ? (
              <>
                {pacientes.error && (
                  <p className="notice notice--error" role="alert">
                    {pacientes.error}{' '}
                    <button type="button" className="table-btn" onClick={() => void pacientes.reload()}>Reintentar</button>
                  </p>
                )}
                <div className="content__row-top">
                  <section className="patient-card">
                    <div className="patient-card__top"><div className="patient-card__avatar">{patient?.nombre?.[0] || 'P'}</div><div><div className="patient-card__name">{patient?.nombre || 'Paciente sin registrar'}</div><div className="patient-card__id">ID: {patient?.id || 'MTX-000000'}</div></div></div>
                    <div className="patient-card__meta">
                      <Meta label="Edad" value={patient ? `${patient.edad} años` : '—'} />
                      <Meta label="Brazo" value={patient?.brazo || '—'} />
                      <Meta label="Terapia" value={patient?.terapia || '—'} />
                      <Meta label="Duración" value={patient ? `${patient.duracionMin} min` : '—'} />
                    </div>
                    <div className="patient-card__progress"><div className="ring-wrap"><svg viewBox="0 0 84 84"><circle className="ring-bg" cx="42" cy="42" r="36" /><circle className="ring-fg" cx="42" cy="42" r="36" strokeDasharray="226" strokeDashoffset="226" /></svg><div className="ring-label">0%</div></div><div className="progress-info"><div className="p-title">Progreso de la sesión</div><div className="p-sub">Esperando conexión con el dispositivo</div></div></div>
                  </section>
                  <section className="system-status">
                    <div className="section-title">Estado del sistema <span className="live-tag">SIN CONEXIÓN</span></div>
                    <div className="status-grid">
                      <Status label="ESP32" value="Desconectado" />
                      <Status label="MQTT (HiveMQ)" value="No conectado" />
                      <Status label="Internet" value={navigator.onLine ? 'Estable' : 'Sin conexión'} />
                      <Status label="Calidad de señal" value="Sin datos" />
                    </div>
                  </section>
                </div>
                <section className="chart-card">
                  <div className="chart-card__head"><div><h2>Señal EMG en tiempo real</h2><p>Esperando datos del dispositivo</p></div></div>
                  <div className="chart-canvas-wrap dashboard-chart-placeholder">Conecta el dispositivo MOTRIX para visualizar la señal EMG</div>
                </section>
                <div className="metrics-row">
                  <Metric label="RMS" value="0.00" unit="mV" />
                  <Metric label="Ángulo" value="0" unit="°" />
                  <Metric label="Repeticiones" value="0" />
                  <Metric label="Fuerza" value="0.0" unit="N" />
                  <Metric label="Temperatura" value="--" unit="°C" />
                  <Metric label="Batería" value="--" unit="%" />
                </div>
                <section className="controls-bar">
                  <div className="controls-bar__label"><strong>Control del dispositivo</strong><span>Los controles se habilitarán cuando se conecte la ESP32 vía MQTT.</span></div>
                  <div className="control-buttons">{['Iniciar', 'Pausar', 'Detener', 'Calibrar'].map((action) => <button key={action} className="ctrl-btn" disabled>{action}</button>)}</div>
                </section>
              </>
            ) : activeView === 'Pacientes' ? (
              <PatientsView
                pacientes={patientList}
                loading={pacientes.loading}
                error={pacientes.error}
                activeId={patient?.id}
                onSelect={selectPatient}
                onReload={pacientes.reload}
              />
            ) : activeView === 'Sesiones' ? (
              <SessionsView pacientes={patientList} activeId={patient?.id} />
            ) : activeView === 'Dispositivos' ? (
              <DevicesView />
            ) : (
              <section className="module-card">
                <div className="module-header"><div><span className="module-kicker">MOTRIX</span><h1>{activeView}</h1></div></div>
                <p>Esta sección estará disponible próximamente.</p>
              </section>
            )}
          </div>
        </main>
      </div>
    </>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="meta-box"><div className="lbl">{label}</div><div className="val">{value}</div></div>
}

function Status({ label, value }: { label: string; value: string }) {
  return <div className="status-item"><div className="status-item__icon off" aria-hidden="true">●</div><div className="status-item__text"><div className="st-label">{label}</div><div className="st-value">{value}</div></div></div>
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return <div className="metric-card"><div className="metric-card__label">{label}</div><div className="metric-card__value">{value}{unit && <span className="unit">{unit}</span>}</div><div className="metric-card__trend">Esperando datos</div></div>
}

export default function App() {
  const route = window.location.pathname.replace(/\/+$/, '')
  if (route.endsWith('/registro') || route.endsWith('/registro.html')) return <RegistrationPage />
  if (route.endsWith('/dashboard') || route.endsWith('/dashboard.html')) return <DashboardPage />
  return <LandingPage />
}
