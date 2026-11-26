import { Link } from 'react-router-dom'
import '../styles/sitio.css'

export function NotFoundPage() {
  return (
    <main className="acceso" style={{ minHeight: '100vh', gridTemplateColumns: '1fr' }}>
      <div className="acceso__panel" style={{ maxWidth: '420px', margin: 'auto', padding: 'clamp(24px, 5vw, 64px)' }}>
        <Link className="marca" to="/" aria-label="MOTRIX, volver a la portada">
          <img src="/assets/img/logo-mark.png" alt="" width="38" height="36" />
          <span>MOTRIX</span>
        </Link>
        <div style={{ textAlign: 'center', marginTop: '48px' }}>
          <h1 style={{ fontSize: '6rem', fontWeight: 700, lineHeight: 1, margin: 0, color: 'var(--slate)' }}>404</h1>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginTop: '16px', color: 'var(--ink)' }}>Página no encontrada</h2>
          <p style={{ marginTop: '12px', color: 'var(--muted)', maxWidth: '30ch', marginLeft: 'auto', marginRight: 'auto' }}>
            La página que buscas no existe o ha sido movida.
          </p>
          <Link className="btn btn--primario" to="/" style={{ marginTop: '26px', display: 'inline-flex' }}>
            Volver a la portada
          </Link>
        </div>
      </div>
    </main>
  )
}