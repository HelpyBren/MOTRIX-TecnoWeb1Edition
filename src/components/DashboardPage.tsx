import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import logo from '../assets/logo.png'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { DevicesView } from './DevicesView'
import { PatientsView } from './PatientsView'
import { SessionsView } from './SessionsView'
import { ConfigurationPage } from './ConfigurationPage'
import { useResource } from '../hooks'
import { getActivePatientId, setActivePatientId } from '../storage'
import type { Paciente, Dispositivo } from '../types'
import type { Chart } from 'chart.js/auto'

const NO_PATIENTS: Paciente[] = []
const NO_DEVICES: Dispositivo[] = []

// EMG data type for SSE
interface EMGDataPoint {
  timestamp: number
  emg: number
  rms: number
  angulo: number
}

// Telemetry event from SSE stream
interface TelemetryEvent {
  k: string  // key: 'emg', 'rms', 'angulo', etc.
  v: number  // value
  ts: number // timestamp
}

// SSE connection management - endpoint is /stream?topicBase=<topic>
const SSE_ENDPOINT = '/tiempo-real/stream'

// Default topic - in production this should map to the active device/patient
const DEFAULT_TOPIC_BASE = 'paciente1'

function useSSEEmg(patientId: string | null, deviceTopicBase: string | null = null) {
  const [data, setData] = useState<EMGDataPoint[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Use device topic if available, otherwise use default or patientId-based topic
  const effectiveTopic = deviceTopicBase || (patientId ? `paciente${patientId.slice(-4)}` : DEFAULT_TOPIC_BASE)

  useEffect(() => {
    // Always try to connect with a valid topic
    const url = `${SSE_ENDPOINT}?topicBase=${encodeURIComponent(effectiveTopic)}`
    const eventSource = new EventSource(url, { withCredentials: true })
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      setConnected(true)
      setError(null)
      console.log('EMG SSE connected to:', url)
    }

    eventSource.onerror = (event) => {
      console.error('EMG SSE error:', event)
      setConnected(false)
      setError('Error de conexión con el dispositivo')
    }

    // Handle broker status
    eventSource.addEventListener('broker', (event: MessageEvent) => {
      try {
        const brokerData = JSON.parse(event.data)
        console.log('Broker status:', brokerData)
        setConnected(brokerData?.conectado || false)
      } catch (e) {
        console.error('Error parsing broker data:', e)
      }
    })

    // Handle telemetry events with key-value-timestamp format
    eventSource.addEventListener('t', (event: MessageEvent) => {
      try {
        const telemetry: TelemetryEvent = JSON.parse(event.data)
        setData(prev => {
          // If we don't have data yet, initialize with the new point
          if (prev.length === 0) {
            const point: EMGDataPoint = {
              timestamp: telemetry.ts,
              emg: telemetry.k === 'emg' ? telemetry.v : 0,
              rms: telemetry.k === 'rms' ? telemetry.v : 0,
              angulo: telemetry.k === 'angulo' ? telemetry.v : 0,
            }
            return [point]
          }

          // Update existing point with new telemetry value (treating each event as a new data point)
          const latest = prev[prev.length - 1]
          const updated: EMGDataPoint = {
            timestamp: telemetry.ts || Date.now(),
            emg: telemetry.k === 'emg' ? telemetry.v : latest.emg,
            rms: telemetry.k === 'rms' ? telemetry.v : latest.rms,
            angulo: telemetry.k === 'angulo' ? telemetry.v : latest.angulo,
          }

          const next = [...prev, updated]
          // Keep only last 200 points for performance
          return next.length > 200 ? next.slice(next.length - 200) : next
        })
      } catch (e) {
        console.error('Error parsing EMG data:', e)
      }
    })

    return () => {
      eventSource.close()
      eventSourceRef.current = null
    }
  }, [effectiveTopic])

  return { data, connected, error }
}

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

export function DashboardPage() {
  const { user } = useAuth()
  const pacientes = useResource(api.pacientes.list)
  const deviceList = useResource(api.dispositivos.list)
  const patientList = pacientes.data ?? NO_PATIENTS
  const devices = deviceList.data ?? NO_DEVICES
  const [activeId, setActiveId] = useState<string | null>(getActivePatientId())
  const patient = patientList.find((p) => p.id === activeId) ?? patientList[0] ?? null

  function selectPatient(selected: Paciente) {
    setActivePatientId(selected.id)
    setActiveId(selected.id)
  }

  // Get the first connected device's topicBase for SSE
  const activeDevice = devices.find((d) => d.estado === 'Conectado')
  const deviceTopicBase = activeDevice?.topicBase ?? null

  const [activeView, setActiveView] = useState('Dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('es-BO', { hour12: false }))

  // SSE hook for EMG data - using device topic
  const { data: emgData, connected: emgConnected, error: emgError } = useSSEEmg(activeId, deviceTopicBase)

  // Calculate metrics from EMG data
  const lastEmgValue = emgData.length > 0 ? emgData[emgData.length - 1].emg : 0
  const lastRms = emgData.length > 0 ? emgData[emgData.length - 1].rms : 0
  const lastAngulo = emgData.length > 0 ? emgData[emgData.length - 1].angulo : 0

  // Determine user role display
  const sessionType = user?.rol === 'admin' ? 'Gestión' : 'Sesión clínica'

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
                <div className="avatar">{user?.usuario?.[0]?.toUpperCase() || 'U'}</div>
                <div>
                  <div className="uname">{user?.usuario || 'Usuario'}</div>
                  <div className="urole">{sessionType}</div>
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
                      Estado del sistema <span className={`live-tag ${emgConnected ? 'live' : ''}`}>{emgConnected ? 'CONECTADO' : 'SIN CONEXIÓN'}</span>
                    </div>
                    <div className="status-grid">
                      <Status label="ESP32" value={emgConnected ? 'Conectado' : 'Desconectado'} status={emgConnected} />
                      <Status label="MQTT (HiveMQ)" value={emgConnected ? 'Conectado' : 'No conectado'} status={emgConnected} />
                      <Status label="Internet" value={navigator.onLine ? 'Estable' : 'Sin conexión'} />
                      <Status label="Calidad de señal" value={emgData.length > 0 ? 'Alta' : 'Sin datos'} status={emgData.length > 0} />
                    </div>
                  </section>
                </div>
                {/* EMG Chart Section */}
                {emgConnected && emgData.length > 0 ? (
                  <EMGChart data={emgData} />
                ) : emgError ? (
                  <section className="chart-card">
                    <div className="chart-card__head">
                      <div>
                        <h2>Señal EMG en tiempo real</h2>
                        <p className="error-text">{emgError}</p>
                      </div>
                    </div>
                    <div className="chart-canvas-wrap dashboard-chart-placeholder">
                      Reintenta conectando el dispositivo MOTRIX
                    </div>
                  </section>
                ) : (
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
                )}
                <div className="metrics-row">
                  <Metric label="RMS" value={emgData.length > 0 ? lastRms.toFixed(2) : '--'} unit="mV" />
                  <Metric label="Ángulo" value={emgData.length > 0 ? lastAngulo.toFixed(1) : '--'} unit="°" />
                  <Metric label="Repeticiones" value={0} />
                  <Metric label="Fuerza" value={0.0} unit="N" />
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
            ) : activeView === 'Configuración' ? (
              <ConfigurationPage />
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

function Status({ label, value, status }: { label: string; value: string; status?: boolean }) {
  return (
    <div className="status-item">
      <div className={`status-item__icon ${status ? 'on' : 'off'}`} aria-hidden="true">●</div>
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

// EMG Chart component using Chart.js
interface EMGChartProps {
  data: EMGDataPoint[]
}

function EMGChart({ data }: EMGChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    // Import Chart.js dynamically to avoid SSR issues
    import('chart.js/auto').then(({ Chart, registerables }) => {
      Chart.register(...registerables)

      const ctx = canvasRef.current!.getContext('2d')
      if (!ctx) return

      const chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map((_, i) => ''),
          datasets: [
            {
              label: 'EMG Signal',
              data: data.map(d => d.emg),
              borderColor: '#2a978f',
              backgroundColor: 'rgba(42, 151, 143, 0.1)',
              borderWidth: 1.5,
              pointRadius: 0,
              tension: 0.3,
              fill: true,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              display: false,
              grid: { display: false }
            },
            y: {
              display: true,
              position: 'right',
              ticks: {
                color: '#5b6f80',
                font: { size: 10 }
              },
              grid: {
                drawOnChartArea: false,
                color: 'rgba(0, 0, 0, 0.05)'
              }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              mode: 'index',
              intersect: false,
              backgroundColor: 'rgba(36, 43, 56, 0.9)',
              titleColor: '#e6eef2',
              bodyColor: '#8aa1b2',
              cornerRadius: 6,
              displayColors: false,
              callbacks: {
                label: (ctx) => `EMG: ${ctx.formattedValue.toFixed(2)} mV`,
                title: (ctx) => `Muestra ${data.length - ctx[0].dataIndex}`
              }
            }
          },
          animation: {
            duration: 0
          }
        }
      })

      chartRef.current = chart

      return () => {
        chart.destroy()
      }
    })
  }, [data])

  // Update chart when data changes
  useEffect(() => {
    if (chartRef.current) {
      chartRef.current.data.labels = data.map((_, i) => '')
      chartRef.current.data.datasets[0].data = data.map(d => d.emg)
      chartRef.current.update()
    }
  }, [data])

  return (
    <canvas
      ref={canvasRef}
      className="emg-chart-canvas"
      style={{ width: '100%', height: '200px' }}
      aria-label="Gráfico de señal EMG en tiempo real"
    />
  )
}