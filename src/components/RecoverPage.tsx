import { useState, FormEvent, ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, errorMessage } from '../api'
import logoMark from '/assets/img/logo-mark.png'
import hogarRetrato from '/assets/img/hogar-retrato.jpg'
import hogarRetratoWebp from '/assets/img/hogar-retrato.webp'
import '../styles/sitio.css'

export function RecoverPage() {
  const navigate = useNavigate()

  const [correo, setCorreo] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setCorreo(e.target.value)
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await api.auth.recover(correo)
      setSuccess(true)
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
          <source type="image/webp" srcSet={hogarRetratoWebp} />
          <img src={hogarRetrato} alt="" style={{ objectPosition: '50% 30%' }} />
        </picture>
        <div className="acceso__cita">
          <p>Tu acceso, protegido en cada paso.</p>
          <span>Plataforma clínica MOTRIX</span>
        </div>
      </div>
      <div className="acceso__panel">
        <Link className="marca" to="/" aria-label="MOTRIX, volver a la portada">
          <img src={logoMark} alt="" width="38" height="36" />
          <span>MOTRIX</span>
        </Link>
        <form className="acceso__form" data-form="recuperar" noValidate onSubmit={handleSubmit}>
          <h1>Recuperar contraseña</h1>
          <p>Escribe el correo de tu cuenta. Te enviaremos un enlace de un solo uso para crear una contraseña nueva.</p>
          <div className={`aviso${error ? ' aviso--error' : success ? ' aviso--ok' : ''}`} id="aviso" hidden={!error && !success}>
            {error || (success ? 'Se ha enviado un enlace de recuperación a tu correo electrónico.' : '')}
          </div>
          {!success && (
            <>
              <div className="campo">
                <label htmlFor="correo">Correo electrónico</label>
                <input
                  id="correo"
                  name="correo"
                  type="email"
                  autoComplete="email"
                  required
                  value={correo}
                  onChange={handleChange}
                />
              </div>
              <button className="btn btn--primario" type="submit" disabled={loading}>
                {loading ? 'Enviando…' : 'Enviar enlace'}
              </button>
              <p className="fila-entre"><Link to="/login">Volver a ingresar</Link></p>
            </>
          )}
        </form>
        <p className="acceso__pie"><Link to="/">Volver a la portada</Link></p>
      </div>
    </main>
  )
}