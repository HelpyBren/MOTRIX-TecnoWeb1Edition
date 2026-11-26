import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Modal } from './Modal'

export function ConfigurationPage() {
  const { user, logout } = useAuth()
  const [darkMode, setDarkMode] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  // Check for saved preference
  useEffect(() => {
    const saved = localStorage.getItem('darkMode')
    if (saved !== null) {
      setDarkMode(saved === 'true')
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setDarkMode(true)
    }
  }, [])

  // Apply dark mode class
  useEffect(() => {
    const body = document.body
    if (darkMode) {
      body.classList.add('dark-mode')
    } else {
      body.classList.remove('dark-mode')
    }
    localStorage.setItem('darkMode', String(darkMode))
  }, [darkMode])

  const handleLogout = async () => {
    await logout()
    setShowLogoutConfirm(false)
  }

  return (
    <section className="module-card">
      <div className="module-header">
        <div>
          <span className="module-kicker">MOTRIX</span>
          <h1>Configuración</h1>
        </div>
      </div>

      <div className="module-card__content">
        <div className="config-section">
          <h3 className="config__title">Apariencia</h3>

          <div className="config-item">
            <label className="config-label">
              <span>Oscuro</span>
              <span className="config-description">Mostrar tema oscuro</span>
            </label>
            <button
              type="button"
              className={`theme-toggle ${darkMode ? 'active' : ''}`}
              onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? 'Desactivar tema oscuro' : 'Activar tema oscuro'}
            >
              <span className="theme-toggle__sun" aria-hidden="true">☀</span>
              <span className="theme-toggle__moon" aria-hidden="true">☾</span>
            </button>
          </div>
        </div>

        <div className="config-section">
          <h3 className="config__title">Cuenta</h3>

          <div className="config-item">
            <div className="config-label">
              <span>Usuario</span>
              <span className="config-description">{user?.usuario || 'Usuario'}</span>
            </div>
          </div>

          <div className="config-item">
            <div className="config-label">
              <span>Rol</span>
              <span className="config-description">
                {user?.rol === 'admin' ? 'Administrador' : 'Fisioterapeuta'}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="module-btn danger"
            onClick={() => setShowLogoutConfirm(true)}
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      {showLogoutConfirm && (
        <Modal title="Cerrar sesión" onClose={() => setShowLogoutConfirm(false)}>
          <p>¿Estás seguro de que deseas cerrar sesión?</p>
          <div className="form-actions">
            <button type="button" className="module-btn" onClick={() => setShowLogoutConfirm(false)}>
              Cancelar
            </button>
            <button type="button" className="module-btn danger" onClick={handleLogout}>
              Cerrar sesión
            </button>
          </div>
        </Modal>
      )}
    </section>
  )
}