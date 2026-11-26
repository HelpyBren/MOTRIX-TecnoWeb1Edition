import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import logoMark from '../assets/logo_motrix.png'
import heroDesktop from '/assets/img/hero-1280.jpg'
import heroDesktopWebp from '/assets/img/hero-1280.webp'
import heroMobile from '/assets/img/hero-720.jpg'
import heroMobileWebp from '/assets/img/hero-720.webp'
import ruralDesktop from '/assets/img/rural-1280.jpg'
import ruralDesktopWebp from '/assets/img/rural-1280.webp'
import ruralMobile from '/assets/img/rural-720.jpg'
import ruralMobileWebp from '/assets/img/rural-720.webp'
import plataformaMonitor from '/assets/img/plataforma-monitor.jpg'
import plataformaMonitorWebp from '/assets/img/plataforma-monitor.webp'
import hogarRetrato from '/assets/img/hogar-retrato.jpg'
import hogarRetratoWebp from '/assets/img/hogar-retrato.webp'
import deportistaRetrato from '/assets/img/deportista-retrato.jpg'
import deportistaRetratoWebp from '/assets/img/deportista-retrato.webp'
import '../styles/sitio.css'

export function LandingPage() {
  const [headerBorder, setHeaderBorder] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setHeaderBorder(window.scrollY > 10)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navLinks = [
    { href: '#nosotros', label: 'Nosotros' },
    { href: '#tecnologia', label: 'Tecnología' },
    { href: '#sistema', label: 'Sistema' },
    { href: '#contacto', label: 'Contacto' },
  ]

  return (
    <>
      <a className="skip" href="#contenido">Saltar al contenido</a>

      <header className={`cabecera${headerBorder ? ' con-borde' : ''}`} id="cabecera">
        <div className="wrap cabecera__fila">
          <a className="marca" href="/" aria-label="MOTRIX, inicio">
            <img src={logoMark} alt="" width="38" height="36" />
            <span>MOTRIX</span>
          </a>
          <nav className={`nav${mobileMenuOpen ? ' abierto' : ''}`} id="nav" aria-label="Secciones">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href}>{link.label}</a>
            ))}
          </nav>
          <Link className="btn btn--primario" to="/login" data-enlace-acceso>
            Ingresar a la plataforma
          </Link>
          <button
            className="menu-movil"
            id="menuMovil"
            aria-expanded={mobileMenuOpen}
            aria-controls="nav"
            aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {mobileMenuOpen ? (
                <>
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </>
              ) : (
                <>
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </header>

      <main id="contenido">
        <section className="hero" aria-labelledby="hero-titulo">
          <div className="wrap hero__grid">
            <div className="hero__texto">
              <h1 className="hero__titulo" id="hero-titulo">
                Rehabilitación que devuelve independencia
              </h1>
              <p className="hero__bajada">
                MOTRIX es un equipo robótico para la rehabilitación de brazos. Guía el movimiento con motores,
                mide la actividad muscular con sensores EMG y guarda cada sesión en una plataforma web
                para que el fisioterapeuta vea la evolución del paciente.
              </p>
              <div className="hero__acciones">
                <Link className="btn btn--primario" to="/login" data-enlace-acceso>
                  Ingresar a la plataforma
                </Link>
                <a className="btn btn--borde" href="#tecnologia">
                  Conocer la tecnología
                </a>
              </div>
            </div>
            <div className="hero__foto">
              <picture>
                <source type="image/webp" srcSet={`${heroMobileWebp} 720w, ${heroDesktopWebp} 1280w`} sizes="(max-width: 980px) 100vw, 55vw" />
                <img
                  src={heroDesktop}
                  srcSet={`${heroMobile} 720w, ${heroDesktop} 1280w`}
                  sizes="(max-width: 980px) 100vw, 55vw"
                  width="1280"
                  height="1072"
                  alt="Un hombre mayor apoya las manos sobre las plataformas del equipo MOTRIX, con electrodos en los brazos y una tableta que muestra el ejercicio en curso."
                />
              </picture>
            </div>
          </div>
          <div className="traza" aria-hidden="true">
            <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
              <path className="traza__eco" pathLength="1" d="M0 61.6 L12 61.2 L24 62.4 L36 61.0 L48 62.1 L60 61.7 L72 60.9 L84 62.0 L96 60.9 L108 61.8 L120 61.0 L132 61.0 L144 61.8 L156 62.8 L168 61.1 L180 61.3 L192 62.3 L204 63.1 L216 62.2 L228 61.8 L240 63.1 L252 60.9 L264 62.9 L276 61.3 L288 59.5 L300 55.3 L304 57.6 L308 71.2 L312 50.6 L316 65.4 L320 68.6 L324 55.4 L328 64.6 L332 38.3 L336 39.2 L340 48.0 L344 69.6 L348 59.4 L352 56.6 L356 64.0 L360 61.2 L364 59.4 L368 64.8 L372 63.4 L384 61.1 L396 62.2 L408 62.1 L420 62.9 L432 62.6 L444 61.5 L456 63.2 L468 61.1 L480 61.8 L492 63.0 L504 59.2 L516 61.8 L520 51.7 L524 66.7 L528 71.2 L532 65.1 L536 80.5 L540 51.4 L544 74.5 L548 68.6 L552 67.9 L556 58.6 L560 88.7 L564 96.4 L568 60.1 L572 73.5 L576 34.0 L580 73.5 L584 69.3 L588 82.7 L592 73.2 L596 55.9 L600 59.4 L604 65.0 L608 55.5 L612 61.6 L616 59.4 L628 60.5 L640 60.8 L652 62.7 L664 61.1 L676 61.4 L688 61.7 L700 62.9 L712 61.0 L724 61.9 L736 62.1 L748 63.0 L760 63.2 L772 64.8 L784 58.1 L788 60.1 L792 58.0 L796 75.5 L800 81.1 L804 45.2 L808 44.5 L812 46.3 L816 45.6 L820 61.1 L824 67.5 L828 48.1 L832 35.3 L836 58.1 L840 56.5 L844 64.3 L848 75.0 L852 66.3 L856 62.3 L860 63.6 L864 63.8 L868 58.6 L880 63.5 L892 62.7 L904 62.9 L916 62.7 L928 61.7 L940 61.8 L952 61.0 L964 62.4 L976 60.3 L988 58.8 L1000 57.4 L1004 55.1 L1008 57.9 L1012 47.6 L1016 42.3 L1020 45.5 L1024 39.9 L1028 53.3 L1032 28.1 L1036 91.3 L1040 71.6 L1044 31.1 L1048 39.7 L1052 48.2 L1056 50.0 L1060 30.3 L1064 89.4 L1068 97.2 L1072 59.8 L1076 61.1 L1080 42.4 L1084 46.3 L1088 56.9 L1092 55.9 L1096 68.7 L1100 56.6 L1104 56.1 L1108 66.3 L1112 62.2 L1124 60.6 L1136 62.1 L1148 60.8 L1160 62.1 L1172 63.1 L1184 62.9 L1196 62.5" />
              <path pathLength="1" d="M0 61.6 L12 61.2 L24 62.4 L36 61.0 L48 62.1 L60 61.7 L72 60.9 L84 62.0 L96 60.9 L108 61.8 L120 61.0 L132 61.0 L144 61.8 L156 62.8 L168 61.1 L180 61.3 L192 62.3 L204 63.1 L216 62.2 L228 61.8 L240 63.1 L252 60.9 L264 62.9 L276 61.3 L288 59.5 L300 55.3 L304 57.6 L308 71.2 L312 50.6 L316 65.4 L320 68.6 L324 55.4 L328 64.6 L332 38.3 L336 39.2 L340 48.0 L344 69.6 L348 59.4 L352 56.6 L356 64.0 L360 61.2 L364 59.4 L368 64.8 L372 63.4 L384 61.1 L396 62.2 L408 62.1 L420 62.9 L432 62.6 L444 61.5 L456 63.2 L468 61.1 L480 61.8 L492 63.0 L504 59.2 L516 61.8 L520 51.7 L524 66.7 L528 71.2 L532 65.1 L536 80.5 L540 51.4 L544 74.5 L548 68.6 L552 67.9 L556 58.6 L560 88.7 L564 96.4 L568 60.1 L572 73.5 L576 34.0 L580 73.5 L584 69.3 L588 82.7 L592 73.2 L596 55.9 L600 59.4 L604 65.0 L608 55.5 L612 61.6 L616 59.4 L628 60.5 L640 60.8 L652 62.7 L664 61.1 L676 61.4 L688 61.7 L700 62.9 L712 61.0 L724 61.9 L736 62.1 L748 63.0 L760 63.2 L772 64.8 L784 58.1 L788 60.1 L792 58.0 L796 75.5 L800 81.1 L804 45.2 L808 44.5 L812 46.3 L816 45.6 L820 61.1 L824 67.5 L828 48.1 L832 35.3 L836 58.1 L840 56.5 L844 64.3 L848 75.0 L852 66.3 L856 62.3 L860 63.6 L864 63.8 L868 58.6 L880 63.5 L892 62.7 L904 62.9 L916 62.7 L928 61.7 L940 61.8 L952 61.0 L964 62.4 L976 60.3 L988 58.8 L1000 57.4 L1004 55.1 L1008 57.9 L1012 47.6 L1016 42.3 L1020 45.5 L1024 39.9 L1028 53.3 L1032 28.1 L1036 91.3 L1040 71.6 L1044 31.1 L1048 39.7 L1052 48.2 L1056 50.0 L1060 30.3 L1064 89.4 L1068 97.2 L1072 59.8 L1076 61.1 L1080 42.4 L1084 46.3 L1088 56.9 L1092 55.9 L1096 68.7 L1100 56.6 L1104 56.1 L1108 66.3 L1112 62.2 L1124 60.6 L1136 62.1 L1148 60.8 L1160 62.1 L1172 63.1 L1184 62.9 L1196 62.5" />
            </svg>
          </div>
        </section>

        <div className="wrap placa">
          <ul className="placa__lista" aria-label="Características del equipo">
            <li><strong>3 motores paso a paso</strong><span>Guían el movimiento en dos ejes</span></li>
            <li><strong>4 trayectorias</strong><span>Una por cada tipo de terapia</span></li>
            <li><strong>Señal EMG</strong><span>Envolvente muscular en tiempo real</span></li>
            <li><strong>ESP32 + MQTT/TLS</strong><span>Conexión cifrada a la nube</span></li>
          </ul>
        </div>

        <section className="seccion" id="nosotros" aria-labelledby="nosotros-titulo">
          <div className="wrap nosotros__grid">
            <figure style={{ margin: 0 }}>
              <div className="nosotros__foto">
                <picture>
                  <source type="image/webp" srcSet={`${ruralMobileWebp} 720w, ${ruralDesktopWebp} 1280w`} sizes="(max-width: 980px) 100vw, 52vw" />
                  <img
                    src={ruralDesktop}
                    srcSet={`${ruralMobile} 720w, ${ruralDesktop} 1280w`}
                    sizes="(max-width: 980px) 100vw, 52vw"
                    width="1280"
                    height="1072"
                    loading="lazy"
                    decoding="async"
                    alt="Una fisioterapeuta sigue en su portátil la sesión de un paciente que usa MOTRIX en un consultorio rural."
                  />
                </picture>
              </div>
              <figcaption className="nosotros__pie">Imagen de referencia del uso de MOTRIX en un centro de salud.</figcaption>
            </figure>
            <div>
              <h2 className="seccion__titulo" id="nosotros-titulo">Ingeniería al servicio de la fisioterapia</h2>
              <dl className="definiciones">
                <div><dt>Quiénes somos</dt><dd>Somos el equipo que diseña, construye y programa MOTRIX: mecánica, electrónica, firmware y software reunidos en un solo proyecto.</dd></div>
                <div><dt>Qué buscamos</dt><dd>Que la rehabilitación de miembro superior pueda guiarse y medirse fuera de los grandes centros: en un consultorio, en un hospital rural o en casa.</dd></div>
                <div><dt>Visión</dt><dd>Una terapia física en la que cada decisión clínica se apoye en datos objetivos del movimiento y de la actividad muscular del paciente.</dd></div>
                <div><dt>Misión</dt><dd>Desarrollar equipos de rehabilitación accesibles, conectados y fáciles de usar, junto con las herramientas que el fisioterapeuta necesita para seguir la evolución de cada persona.</dd></div>
                <div><dt>Valor tecnológico</dt><dd>MOTRIX une movimiento asistido, registro electromiográfico y almacenamiento de sesiones en una sola solución, de modo que el progreso se puede comparar sesión a sesión.</dd></div>
              </dl>
            </div>
          </div>
        </section>

        <section className="seccion tecnologia" id="tecnologia" aria-labelledby="tecnologia-titulo">
          <div className="wrap">
            <h2 className="seccion__titulo" id="tecnologia-titulo">Del músculo a la pantalla</h2>
            <p className="seccion__intro">Así viaja la información durante una sesión. Selecciona cada etapa para ver qué hace y qué tecnología usa.</p>

            <div className="cadena">
              <ol className="cadena__pasos" role="tablist" aria-label="Etapas de la señal" aria-orientation="vertical">
                <li className="cadena__paso"><button role="tab" id="tab-1" aria-controls="panel-cadena" aria-selected="true" data-paso="0"><span className="cadena__num">1</span><span>Sensores EMG<small>Electrodos en brazo y antebrazo</small></span></button></li>
                <li className="cadena__paso"><button role="tab" id="tab-2" aria-controls="panel-cadena" aria-selected="false" tabIndex={-1} data-paso="1"><span className="cadena__num">2</span><span>Acondicionamiento<small>Filtrado y envolvente de la señal</small></span></button></li>
                <li className="cadena__paso"><button role="tab" id="tab-3" aria-controls="panel-cadena" aria-selected="false" tabIndex={-1} data-paso="2"><span className="cadena__num">3</span><span>ESP32<small>Motores, pantalla y telemetría</small></span></button></li>
                <li className="cadena__paso"><button role="tab" id="tab-4" aria-controls="panel-cadena" aria-selected="false" tabIndex={-1} data-paso="3"><span className="cadena__num">4</span><span>Comunicación inalámbrica<small>WiFi y MQTT cifrado</small></span></button></li>
                <li className="cadena__paso"><button role="tab" id="tab-5" aria-controls="panel-cadena" aria-selected="false" tabIndex={-1} data-paso="4"><span className="cadena__num">5</span><span>Servidor y base de datos<small>Registro seguro de cada sesión</small></span></button></li>
                <li className="cadena__paso"><button role="tab" id="tab-6" aria-controls="panel-cadena" aria-selected="false" tabIndex={-1} data-paso="5"><span className="cadena__num">6</span><span>Plataforma web<small>Monitoreo, historial y exportación</small></span></button></li>
              </ol>
              <div className="cadena__panel" id="panel-cadena" role="tabpanel" aria-labelledby="tab-1" aria-live="polite">
                <h3>Sensores EMG</h3>
                <p>Electrodos de superficie sobre bíceps y tríceps captan la actividad eléctrica del músculo. La señal se amplifica, filtra y rectifica para obtener la envolvente EMG proporcional a la activación muscular.</p>
                <ul>
                  <li>Rango: 0–5 V</li>
                  <li>Ganancia configurable por firmware</li>
                  <li>Referencia: electrodo en zona inactiva</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="seccion" id="sistema" aria-labelledby="sistema-titulo">
          <div className="wrap">
            <h2 className="seccion__titulo" id="sistema-titulo">Cuatro trayectorias, una por terapia</h2>
            <p className="seccion__intro">El fisioterapeuta elige la terapia al registrar al paciente. La ESP32 dibuja la trayectoria correspondiente con los motores y cuenta cada repetición completada.</p>

            <div className="trayectorias">
              <article className="trayectoria">
                <svg viewBox="0 0 180 120" aria-hidden="true"><path d="M30 95 H150 V25 H30 Z"/><circle cx="30" cy="95" r="6"/></svg>
                <h3>Flexión-Extensión</h3>
                <p>Trayectoria rectangular: avance, desplazamiento lateral y regreso.</p>
              </article>
              <article className="trayectoria">
                <svg viewBox="0 0 180 120" aria-hidden="true"><path d="M30 100 L150 88 L30 76 L150 64 L30 52 L150 40 L30 28"/><circle cx="30" cy="100" r="6"/></svg>
                <h3>Abducción-Aducción</h3>
                <p>Zigzag en seis tramos que recorre el plano de ida y vuelta.</p>
              </article>
              <article className="trayectoria">
                <svg viewBox="0 0 180 120" aria-hidden="true"><path d="M90 60 C 125 20, 165 30, 160 60 C 165 90, 125 100, 90 60 C 55 20, 15 30, 20 60 C 15 90, 55 100, 90 60 Z"/><circle cx="90" cy="60" r="6"/></svg>
                <h3>Rotación interna y externa</h3>
                <p>Recorrido en «ocho» con dos ciclos por repetición.</p>
              </article>
              <article className="trayectoria">
                <svg viewBox="0 0 180 120" aria-hidden="true"><path d="M20 105 H160 V15 H40 V90 H140 V30 H60 V75 H120 V45 H80 V60"/><circle cx="20" cy="105" r="6"/></svg>
                <h3>Circunducción plana</h3>
                <p>Espiral rectangular que se cierra hacia el centro.</p>
              </article>
            </div>

            <div className="funciones">
              <div className="funciones__captura">
                <picture>
                  <source type="image/webp" srcSet={plataformaMonitorWebp} />
                  <img
                    src={plataformaMonitor}
                    width="1440"
                    height="900"
                    loading="lazy"
                    decoding="async"
                    alt="Monitor en vivo de la plataforma MOTRIX: datos del paciente, estado del equipo y señal EMG en tiempo real."
                  />
                </picture>
                <p className="funciones__pie">Monitor en vivo de la plataforma, capturado con datos de prueba.</p>
              </div>
              <div>
                <h2 className="seccion__titulo">La plataforma del fisioterapeuta</h2>
                <ul className="funciones__lista">
                  <li><svg viewBox="0 0 24 24"><path d="M2 12h4l2 6 4-14 2 8h8"/></svg><div><strong>Monitor en tiempo real</strong><span>Señal EMG, RMS, fuerza estimada y repeticiones mientras el paciente trabaja.</span></div></li>
                  <li><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/></svg><div><strong>Control del equipo a distancia</strong><span>Iniciar, pausar, detener y calibrar la sesión desde el navegador.</span></div></li>
                  <li><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/></svg><div><strong>Historial y exportación a Excel</strong><span>Filtra por fechas, paciente, terapia o dispositivo y descarga un .xlsx con los datos reales.</span></div></li>
                  <li><svg viewBox="0 0 24 24"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/></svg><div><strong>Conexión WiFi sin reprogramar</strong><span>El equipo abre su propio punto de configuración y guarda la red de forma segura.</span></div></li>
                  <li><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><div><strong>Acceso por roles</strong><span>Administradores y fisioterapeutas ven solo lo que les corresponde.</span></div></li>
                </ul>
              </div>
            </div>

            <div className="contextos">
              <div className="contextos__texto">
                <h2 className="seccion__titulo">En la clínica o en casa</h2>
                <p>El mismo equipo y la misma plataforma acompañan a pacientes de distintas edades. Las sesiones quedan registradas donde sea que se realicen.</p>
              </div>
              <figure>
                <picture>
                  <source type="image/webp" srcSet={hogarRetratoWebp} />
                  <img
                    src={hogarRetrato}
                    width="680"
                    height="850"
                    loading="lazy"
                    decoding="async"
                    alt="Una mujer mayor sonríe mientras realiza su ejercicio con MOTRIX en la sala de su casa."
                  />
                </picture>
                <figcaption>Terapia en el hogar</figcaption>
              </figure>
              <figure>
                <picture>
                  <source type="image/webp" srcSet={deportistaRetratoWebp} />
                  <img
                    src={deportistaRetrato}
                    width="680"
                    height="850"
                    loading="lazy"
                    decoding="async"
                    alt="Un joven deportista usa MOTRIX para su recuperación."
                  />
                </picture>
                <figcaption>Recuperación deportiva</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section className="seccion llamado" aria-labelledby="llamado-titulo">
          <div className="wrap llamado__fila">
            <h2 id="llamado-titulo">¿Eres parte del equipo clínico? Ingresa para ver a tus pacientes.</h2>
            <Link className="btn btn--primario" to="/login" data-enlace-acceso>Ingresar a la plataforma</Link>
          </div>
        </section>
      </main>

      <footer className="pie" id="contacto">
        <div className="wrap">
          <div className="pie__grid">
            <div>
              <a className="marca" href="/"><img src={logoMark} alt="" width="34" height="32"/><span>MOTRIX</span></a>
              <p style={{ marginTop: '14px', maxWidth: '36ch' }}>Equipo robótico y plataforma web para la rehabilitación de miembro superior.</p>
            </div>
            <div>
              <h3>Explorar</h3>
              <ul>
                <li><a href="#nosotros">Nosotros</a></li>
                <li><a href="#tecnologia">Tecnología</a></li>
                <li><a href="#sistema">Sistema</a></li>
              </ul>
            </div>
            <div>
              <h3>Plataforma</h3>
              <ul>
                <li><Link to="/login" data-enlace-acceso>Ingresar</Link></li>
                <li><a href="/recuperar">Recuperar contraseña</a></li>
              </ul>
            </div>
            <div>
              <h3>Contacto</h3>
              <ul>
                <li><a href="mailto:contacto@ejemplo.com">contacto@ejemplo.com</a></li>
                <li>Ciudad, país</li>
              </ul>
            </div>
          </div>
          <div className="pie__legal">
            <span>© <span id="anio">2026</span> MOTRIX</span>
            <span>Las imágenes son ilustrativas del uso del equipo.</span>
          </div>
        </div>
      </footer>
    </>
  )
}