import { useState, FormEvent, ChangeEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, errorMessage } from '../api'
import logoMark from '../assets/logo_motrix.png'
import heroDesktop from '/assets/img/hero-1280.jpg'
import heroDesktopWebp from '/assets/img/hero-1280.webp'
import '../styles/sitio.css'

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const next = searchParams.get('next') || '/dashboard'

  const [identificador, setIdentificador] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await api.pacientes.list()
      // The API doesn't have a login endpoint in the current api.ts
      // We'll simulate the login for now and navigate
      // In a real app, you'd call the actual login API
      navigate(next)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const togglePassword = () => setShowPassword(!showPassword)

  return (
    <main className="acceso">
      <div className="acceso__visual" aria-hidden="true">
        <picture>
          <source type="image/webp" srcSet={heroDesktopWebp} />
          <img src={heroDesktop} alt="" style={{ objectPosition: '38% 50%' }} />
        </picture>
        <div className="acceso__cita">
          <p>Cada sesión registrada, cada avance visible.</p>
          <span>Plataforma clínica MOTRIX</span>
        </div>
      </div>
      <div className="acceso__panel">
        <Link className="marca" to="/" aria-label="MOTRIX, volver a la portada">
          <img src={logoMark} alt="" width="38" height="36" />
          <span>MOTRIX</span>
        </Link>
        <form className="acceso__form" data-form="login" noValidate onSubmit={handleSubmit}>
          <h1>Ingresar a la plataforma</h1>
          <p>Usa la cuenta que te asignó el administrador de MOTRIX.</p>
          <div className={`aviso${error ? ' aviso--error' : ''}`} id="aviso" hidden={!error}>
            {error}
          </div>
          <div className="campo">
            <label htmlFor="identificador">Usuario o correo electrónico</label>
            <input
              id="identificador"
              name="identificador"
              type="text"
              autoComplete="username"
              required
              value={identificador}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setIdentificador(e.target.value)}
            />
          </div>
          <div className="campo">
            <label htmlFor="password">Contraseña</label>
            <div className="campo__pass">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="campo__ver"
                data-ver="password"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={togglePassword}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>
          <div className="fila-entre">
            <Link to="/recuperar">¿Olvidaste tu contraseña?</Link>
            <Link to="/registrarse" id="enlaceRegistro">Crear cuenta</Link>
          </div>
          <button className="btn btn--primario" type="submit" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
        <p className="acceso__pie"><Link to="/">Volver a la portada</Link></p>
      </div>
    </main>
  )
}