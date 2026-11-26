import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import logo from '../assets/logo.png'
import { api, errorMessage } from '../api'
import { DevicesView } from './DevicesView'
import { PatientsView } from './PatientsView'
import { SessionsView } from './SessionsView'
import { useResource } from '../hooks'
import { getActivePatientId, setActivePatientId } from '../storage'
import type { Paciente } from '../types'

const NO_PATIENTS: Paciente[] = []

function Brand() {
  return (
    <Link className="brand" to="/" aria-label="MOTRIX, página principal">
      <div className="brand__mark">
        <img src={logo} alt="" width="45" height="45" />
      </div>
      <span className="brand__name">MOTRIX<span>.</span></span>
    </Link>
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

export function DashboardPage() {
  const navigate = useNavigate()
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
            {navItems.slice(0, 4).map((item) => (
              <button
                key={item}
                className={`nav-item${activeView === item ? ' active' : ''}`}
                onClick={() => {
                  setActiveView(item)
                  setMenuOpen(false)
                }}
              >
                {item}
              </button>
            ))}
            <span className="nav-section-label">Registros</span>
            {navItems.slice(4).map((item) => (
              <button
                key={item}
                className={`nav-item${activeView === item ? ' active' : ''}`}
                onClick={() => {
                  setActiveView(item)
                  setMenuOpen(false)
                }}
              >
                {item}
              </button>
            ))}
          </nav>
          <div className="sidebar__footer">
            <div className="sidebar__device-mini">
              <span className="ind offline" />
              <span>ESP32 desconectado</span>
            </div>
          </div>
        </aside>
        <main className="main">
          <header className="topbar">
            <div className="topbar__left">
              <button className="topbar__menu-btn" aria-label="Abrir menú" onClick={() => setMenuOpen(!menuOpen)}>
                ☰
              </button>
              <div>
                <strong>{activeView} de rehabilitación</strong>
                <div className="muted">Sesión clínica · {patient?.nombre || 'Sin paciente'}</div>
              </div>
            </div>
            <div className="topbar__right">
              <div className="chip clock">{clock}</div>
              <div className="chip">
                <span className="dot bad" />MQTT
              </div>
              <div className="chip">
                <span className="dot bad" />ESP32
              </div>
              <div className="topbar__user">
                <div className="avatar">FT</div>
                <div>
                  <div className="uname">Fisioterapeuta</div>
                  <div className="urole">Sesión clínica</div>
                </div>
              </div>
            </div>
          </header>
          <div className="content">
            {activeView === 'Dashboard' ? (
              <>
                {pacientes.error && (
                  <p className="notice notice--error" role="alert">
                    {pacientes.error}{' '}
                    <button type="button" className="table-btn" onClick={() => void pacientes.reload()}>
                      Reintentar
                    </button>
                  </p>
                )}
                <div className="content__row-top">
                  <section className="patient-card">
                    <div className="patient-card__top">
                      <div className="patient-card__avatar">{patient?.nombre?.[0] || 'P'}</div>
                      <div>
                        <div className="patient-card__name">{patient?.nombre || 'Paciente sin registrar'}</div>
                        <div className="patient-card__id">ID: {patient?.id || 'MTX-000000'}</div>
                      </div>
                    </div>
                    <div className="patient-card__meta">
                      <Meta label="Edad" value={patient ? `${patient.edad} años` : '—'} />
                      <Meta label="Brazo" value={patient?.brazo || '—'} />
                      <Meta label="Terapia" value={patient?.terapia || '—'} />
                      <Meta label="Duración" value={patient ? `${patient.duracionMin} min` : '—'} />
                    </div>
                    <div className="patient-card__progress">
                      <div className="ring-wrap">
                        <svg viewBox="0 0 84 84">
                          <circle className="ring-bg" cx="42" cy="42" r="36" />
                          <circle className="ring-fg" cx="42" cy="42" r="36" strokeDasharray="226" strokeDashoffset="226" />
                        </svg>
                        <div className="ring-label">0%</div>
                      </div>
                      <div className="progress-info">
                        <div className="p-title">Progreso de la sesión</div>
                        <div className="p-sub">Esperando conexión con el dispositivo</div>
                      </div>
                    </div>
                  </section>
                  <section className="system-status">
                    <div className="section-title">
                      Estado del sistema <span className="live-tag">SIN CONEXIÓN</span>
                    </div>
                    <div className="status-grid">
                      <Status label="ESP32" value="Desconectado" />
                      <Status label="MQTT (HiveMQ)" value="No conectado" />
                      <Status label="Internet" value={navigator.onLine ? 'Estable' : 'Sin conexión'} />
                      <Status label="Calidad de señal" value="Sin datos" />
                    </div>
                  </section>
                </div>
                <section className="chart-card">
                  <div className="chart-card__head">
                    <div>
                      <h2>Señal EMG en tiempo real</h2>
                      <p>Esperando datos del dispositivo</p>
                    </div>
                  </div>
                  <div className="chart-canvas-wrap dashboard-chart-placeholder">
                    Conecta el dispositivo MOTRIX para visualizar la señal EMG
                  </div>
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
                  <div className="controls-bar__label">
                    <strong>Control del dispositivo</strong>
                    <span>Los controles se habilitarán cuando se conecte la ESP32 vía MQTT.</span>
                  </div>
                  <div className="control-buttons">
                    {['Iniciar', 'Pausar', 'Detener', 'Calibrar'].map((action) => (
                      <button key={action} className="ctrl-btn" disabled>
                        {action}
                      </button>
                    ))}
                  </div>
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
                <div className="module-header">
                  <div>
                    <span className="module-kicker">MOTRIX</span>
                    <h1>{activeView}</h1>
                  </div>
                </div>
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
  return (
    <div className="meta-box">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
    </div>
  )
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-item">
      <div className="status-item__icon off" aria-hidden="true">●</div>
      <div className="status-item__text">
        <div className="st-label">{label}</div>
        <div className="st-value">{value}</div>
      </div>
    </div>
  )
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="metric-card">
      <div className="metric-card__label">{label}</div>
      <div className="metric-card__value">
        {value}{unit && <span className="unit">{unit}</span>}
      </div>
      <div className="metric-card__trend">Esperando datos</div>
    </div>
  )
}