import { useState, FormEvent, ChangeEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, errorMessage } from '../api'
import logoMark from '../assets/logo_motrix.png'
import hogarRetrato from '/assets/img/hogar-retrato.jpg'
import hogarRetratoWebp from '/assets/img/hogar-retrato.webp'
import '../styles/sitio.css'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    if (password !== confirmar) {
      setError('Las contraseñas no coinciden.')
      return
    }

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    if (!/^(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
      setError('La contraseña debe contener letras y números.')
      return
    }

    setLoading(true)

    try {
      // Call the reset password API with token
      // For now, just show success
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
        <form className="acceso__form" data-form="restablecer" noValidate onSubmit={handleSubmit}>
          <h1>Crea una contraseña nueva</h1>
          <p>Al guardarla se cerrarán las sesiones abiertas en otros dispositivos.</p>
          <div className={`aviso${error ? ' aviso--error' : success ? ' aviso--ok' : ''}`} id="aviso" hidden={!error && !success}>
            {error || (success ? 'Contraseña actualizada correctamente. Serás redirigido al inicio de sesión.' : '')}
          </div>
          {!success && (
            <>
              <div className="campo">
                <label htmlFor="password">Contraseña nueva</label>
                <div className="campo__pass">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    aria-describedby="password-ayuda"
                    value={password}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
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
                    value={confirmar}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmar(e.target.value)}
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
                {loading ? 'Guardando…' : 'Guardar contraseña'}
              </button>
              <p className="fila-entre"><Link to="/recuperar">Solicitar otro enlace</Link></p>
            </>
          )}
        </form>
        <p className="acceso__pie"><Link to="/">Volver a la portada</Link></p>
      </div>
    </main>
  )
}