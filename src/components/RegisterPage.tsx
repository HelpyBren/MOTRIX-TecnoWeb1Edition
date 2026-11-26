import { useState, FormEvent, ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, errorMessage } from '../api'
import logoMark from '../assets/logo_motrix.png'
import deportistaRetrato from '/assets/img/deportista-retrato.jpg'
import deportistaRetratoWebp from '/assets/img/deportista-retrato.webp'
import '../styles/sitio.css'

export function RegisterPage() {
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    nombre: '',
    usuario: '',
    correo: '',
    password: '',
    confirmar: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }

    if (formData.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    if (!/^(?=.*[A-Za-z])(?=.*\d)/.test(formData.password)) {
      setError('La contraseña debe contener letras y números.')
      return
    }

    setLoading(true)

    try {
      await api.auth.register({
        nombre: formData.nombre,
        usuario: formData.usuario,
        correo: formData.correo,
        password: formData.password,
      })
      navigate('/login?registered=true')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="acceso">
      <div className="acceso__visual" aria-hidden="true">
        <picture>
          <source type="image/webp" srcSet={deportistaRetratoWebp} />
          <img src={deportistaRetrato} alt="" style={{ objectPosition: '50% 30%' }} />
        </picture>
        <div className="acceso__cita">
          <p>Un equipo clínico conectado.</p>
          <span>Plataforma clínica MOTRIX</span>
        </div>
      </div>
      <div className="acceso__panel">
        <Link className="marca" to="/" aria-label="MOTRIX, volver a la portada">
          <img src={logoMark} alt="" width="38" height="36" />
          <span>MOTRIX</span>
        </Link>
        <form className="acceso__form" data-form="registro" noValidate onSubmit={handleSubmit}>
          <h1>Crear cuenta</h1>
          <p>Tu cuenta quedará pendiente hasta que un administrador la active.</p>
          <div className={`aviso${error ? ' aviso--error' : ''}`} id="aviso" hidden={!error}>
            {error}
          </div>
          <div className="campo">
            <label htmlFor="nombre">Nombre completo</label>
            <input
              id="nombre"
              name="nombre"
              type="text"
              autoComplete="name"
              required
              value={formData.nombre}
              onChange={handleChange}
            />
          </div>
          <div className="campo">
            <label htmlFor="usuario">Nombre de usuario</label>
            <input
              id="usuario"
              name="usuario"
              type="text"
              autoComplete="username"
              required
              aria-describedby="usuario-ayuda"
              value={formData.usuario}
              onChange={handleChange}
            />
            <span className="campo__ayuda" id="usuario-ayuda">3 a 40 caracteres: letras, números, punto o guion.</span>
          </div>
          <div className="campo">
            <label htmlFor="correo">Correo electrónico</label>
            <input
              id="correo"
              name="correo"
              type="email"
              autoComplete="email"
              required
              value={formData.correo}
              onChange={handleChange}
            />
          </div>
          <div className="campo">
            <label htmlFor="password">Contraseña</label>
            <div className="campo__pass">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                aria-describedby="password-ayuda"
                value={formData.password}
                onChange={handleChange}
              />
              <button
                type="button"
                className="campo__ver"
                data-ver="password"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            <span className="campo__ayuda" id="password-ayuda">Mínimo 8 caracteres, con letras y números.</span>
          </div>
          <div className="campo">
            <label htmlFor="confirmar">Repite la contraseña</label>
            <div className="campo__pass">
              <input
                id="confirmar"
                name="confirmar"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                required
                value={formData.confirmar}
                onChange={handleChange}
              />
              <button
                type="button"
                className="campo__ver"
                data-ver="confirmar"
                aria-pressed={showConfirm}
                aria-label={showConfirm ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          </div>
          <button className="btn btn--primario" type="submit" disabled={loading}>
            {loading ? 'Creando…' : 'Crear cuenta'}
          </button>
          <p className="fila-entre"><Link to="/login">Ya tengo cuenta</Link></p>
        </form>
        <p className="acceso__pie"><Link to="/">Volver a la portada</Link></p>
      </div>
    </main>
  )
}