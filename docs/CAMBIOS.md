# MOTRIX 2.0 — Cambios realizados y estado de verificación

## 1. Diagnóstico del proyecto recibido

| Área | Encontrado |
|---|---|
| Frontend | HTML, CSS y JS sin framework (`index.html`, `registro.html`, `dashboard.html` con 5 módulos). Chart.js 4.5 y MQTT.js 5.14 por CDN. Se abría con Live Server, en otro origen que la API. |
| Backend | `server.js`: Express 4 + Prisma 6 + SQLite. Endpoints `/api/pacientes` (CRUD), `/api/sesiones` (GET/POST), `/api/dispositivos` (GET/POST). |
| Base de datos | `Paciente` (27 filas), `Sesion` (25), `Dispositivo` (0, sin uso). Fechas en milisegundos (epoch). |
| ESP32 ↔ web | Sin conexión directa: las dos partes usan HiveMQ Cloud. La ESP32 usa MQTT/TLS en el puerto 8883; el navegador, WSS en el 8884. Tópicos `motrix/paciente1/*`. |
| Firmware | 3 motores A4988, 4 trayectorias, LCD en el núcleo 0, EMG desde un Arduino por `Serial2`. |

**Problemas detectados**

1. No había autenticación y la API aceptaba peticiones de cualquier origen (CORS `*`). Cualquiera podía leer o borrar pacientes.
2. Había credenciales escritas en el código:
   - usuario y contraseña de HiveMQ en `js/mqtt.js` (públicas) y en el firmware;
   - red y contraseña WiFi en el firmware.
3. El firmware usaba `setInsecure()` (TLS sin verificar) y había que recompilarlo para cambiar de red.
4. "RMS promedio" y "fuerza máxima" guardaban el **último** valor mostrado en pantalla.
5. Ángulo, temperatura y batería aparecían en el panel, pero el firmware no los publica.
6. La portada mostraba cifras sin respaldo ("<80 ms", "24/7").
7. Había HTML roto (`glow-o00{rb`, un `</svg>` suelto) y restos de PocketBase (`js/pb.js`).
8. El ZIP incluía `node_modules` de macOS (279 MB).
9. El callback MQTT de calibración movía los motores dentro del propio callback y podía reentrar en `mqttClient.loop()`.

## 2. Qué cambió

### Arquitectura (sin cambiar de framework)
- **Estructura:** `public/` (frontend), `server/` (API modular), `firmware/`, `scripts/`, `tools/`, `tests/`.
- Express sirve la web y la API desde **el mismo origen**. Así funcionan las cookies `HttpOnly` + `SameSite`, y `.env`, `prisma/` y `server/` nunca se exponen. Esto está comprobado en las pruebas.
- **Prisma 6.19 sin motor Rust** (`engineType = "client"` + adaptador `better-sqlite3`):
  - lee y escribe fechas en el mismo formato que la base original;
  - evita descargar binarios en la instalación.
- Chart.js y las tipografías (Saira, Figtree) se sirven **localmente**. La plataforma funciona sin CDN y con una política CSP estricta (`script-src 'self'`).
- Se eliminaron `js/pb.js`, la dependencia `cors` y `mqtt.min.js` del navegador.

### Base de datos (migración `20261123180000_auth_roles_dispositivos`)
- **Tablas nuevas:** `Usuario`, `SesionAcceso`, `TokenRecuperacion`, `Auditoria`.
- **Columnas nuevas (todas opcionales):**
  - `Paciente.responsableId`;
  - `Sesion.registradaPorId` y `Sesion.dispositivoId`;
  - `Dispositivo.codigo`, `topicBase`, estado de red, firmware, etc.
- Antes de migrar, `npm run db:migrate` hace una copia de seguridad (`VACUUM INTO`). Aplica la migración en una transacción, comprueba la integridad referencial y la registra en `_prisma_migrations` con el mismo *checksum* que usa Prisma.
- `prisma/dev.db` se entrega **ya migrado**, con los 27 pacientes y las 25 sesiones intactos y **sin usuarios**. La copia sin migrar está en `prisma/backups/`.

### Autenticación y permisos
- Inicio de sesión con usuario o correo:
  - contraseñas con **scrypt** (sal aleatoria);
  - política mínima: 8 caracteres, con letras y números;
  - bloqueo temporal tras 5 intentos;
  - límite de peticiones por IP;
  - el mismo mensaje de error exista o no el usuario.
- **Sesiones:**
  - token aleatorio en una cookie `HttpOnly`, `SameSite=Lax` y `Secure` en producción;
  - en la base solo se guarda el SHA-256 del token;
  - caducidad configurable;
  - se cierran al cambiar o restablecer la contraseña.
- **CSRF:** toda escritura exige la cabecera `X-Requested-With: MotrixWeb`.
- **Recuperación de contraseña:**
  - token de un solo uso, válido 30 min;
  - el token va en el fragmento `#` del enlace, así no queda en los registros del servidor;
  - respuesta idéntica exista o no la cuenta.
  - Sin SMTP, el administrador puede generar el enlace.
- **Roles:**
  - **Administrador:** usuarios, equipos, todos los pacientes y sesiones, exportación completa, borrado.
  - **Usuario:** solo sus pacientes y las sesiones que registró o que pertenecen a esos pacientes.
  - Los permisos se validan **en el servidor**.
- Registro público opcional (`ALLOW_SELF_SIGNUP`). Las cuentas creadas así quedan inactivas hasta que un administrador las active.
- **Auditoría:** se registran accesos, exportaciones, cambios de pacientes, usuarios y equipos, y los comandos. Nunca se guardan contraseñas.

### Exportación a Excel (`GET /api/exportar/sesiones.xlsx`)
- Genera un `.xlsx` real con exceljs, a partir de la **base de datos real**. Aplica los mismos filtros que el historial y el alcance del usuario:
  - fechas;
  - paciente;
  - terapia;
  - brazo y sexo;
  - equipo;
  - usuario (solo administradores);
  - texto libre.
- **Hojas:**
  - **Sesiones:** fechas como fecha de Excel en la hora local de `APP_TIMEZONE`, números como números, encabezado fijo, filtro automático, columnas ajustadas. Cada encabezado lleva una nota con el campo de la base.
  - **Pacientes.**
  - **Información:** quién exportó, cuándo y con qué filtros.
- Botones **Exportar filtrado** y **Exportar todo** en *Historial y exportación*.

### Tiempo real y ESP32
- El servidor se conecta al broker con credenciales de `.env` y reenvía la telemetría al navegador por **Server-Sent Events**. Los comandos de terapia pasan por la API, validados y auditados. **Las credenciales del broker ya no llegan al navegador.**
- Se conservan los tópicos `motrix/<tópico>/...`: el firmware original sigue funcionando con la nueva web.
- **Dispositivos:**
  - registro de equipos;
  - estado en línea (latido + LWT);
  - detección de equipos sin registrar;
  - datos para el firmware;
  - asistente WiFi local y remoto.

  Ver [ESP32_WIFI.md](ESP32_WIFI.md).
- **Firmware v2** (`firmware/motrix_esp32/`):
  - portal cautivo;
  - credenciales en NVS;
  - comandos firmados;
  - TLS verificado;
  - MQTT no bloqueante;
  - duración de sesión enviada desde la plataforma;
  - calibración fuera del callback;
  - `Serial2.setTimeout(20)` para que la lectura EMG no frene los motores.

  Las trayectorias y el control de motores no cambian.

### Panel (dashboard)
- **Resumen nuevo:**
  - totales reales;
  - sesiones por día (7, 30 o 90 días, con tooltip);
  - sesiones por terapia;
  - estado de los equipos;
  - últimas sesiones;
  - accesos directos a exportación y monitor.
- **Monitor en vivo:**
  - selector de equipo;
  - **promedio real de RMS y máximo real de fuerza** durante la sesión;
  - la pausa no cuenta como tiempo de sesión;
  - pausar y reanudar;
  - si la ESP32 termina por tiempo, la sesión se guarda sola;
  - pide confirmación si el equipo no envía datos;
  - avisa antes de salir con una sesión en curso.
- Ángulo, temperatura y batería muestran «Sin datos» si el equipo no los envía.
- Pacientes, Historial, Dispositivos, **Usuarios** (nuevo) y Configuración, con diálogos accesibles en lugar de `alert` y `confirm`.
- Responsive comprobado a 390 px de ancho sin desplazamiento horizontal.

### Portada
- Nueva identidad basada en el equipo: aluminio anodizado, azul pizarra del logotipo y verde azulado de la marca. La única animación es una traza EMG que se dibuja al cargar.
- **Secciones:**
  - inicio con fotografía;
  - placa de características verificadas en el firmware;
  - **Nosotros** (texto marcado como provisional);
  - **Tecnología**: la cadena real de la señal, interactiva y accesible con teclado;
  - **Sistema**: las 4 trayectorias dibujadas a partir del firmware, más una captura real del monitor tomada con datos de prueba;
  - **Clínica o casa**;
  - pie de página.
- Fotografías recortadas y optimizadas (WebP + JPEG, de 320 KB a unos 50–130 KB). Se recortaron las imágenes con texto ilegible en la tableta.

## 3. Estado de verificación

| Funcionalidad | Estado | Cómo se verificó |
|---|---|---|
| Migración sin pérdida de datos | ✅ Verificado | 27 pacientes y 25 sesiones intactos; `integrity_check` y `foreign_key_check` correctos |
| Login, sesiones, bloqueo, CSRF, roles | ✅ Verificado | `npm test` (pruebas de integración) y navegador sin interfaz |
| Recuperación de contraseña (token) | ✅ Verificado | `npm test`; el envío real por correo necesita SMTP |
| Exportación a Excel con filtros y permisos | ✅ Verificado | Archivo abierto con exceljs y openpyxl: tipos, fechas, autofiltro, número de filas igual al de la API |
| Monitor en vivo, SSE, comandos | ✅ Verificado con broker local y ESP32 simulada | `tools/broker-local.js` + `tools/simulador-esp32.js` |
| Cambio de WiFi remoto (servidor) | ✅ Verificado con simulador | Firma, cifrado, rechazo de comandos alterados, LWT, la contraseña no queda en la base |
| Criptografía servidor ↔ firmware | ✅ Verificado | `seguridad.cpp` compilado en PC con g++/OpenSSL: verifica y descifra los comandos de Node (incluye UTF-8, comillas, emoji, 63 caracteres) |
| Firmware completo | ⚠️ Sintaxis revisada; **no compilado para ESP32** | Compilado con `-Wall -Wextra` contra *stubs* de las APIs de Arduino (`firmware/pruebas/stubs`). En este entorno no se pudo descargar el núcleo ESP32. **Compílalo en Arduino IDE** |
| Portal cautivo, NVS, LCD, motores, EMG real | 🔌 Requiere hardware | No se puede probar sin la placa |
| Conexión con HiveMQ Cloud real | ⚙️ Requiere configuración | En este entorno no hay acceso a HiveMQ. Completa `.env` y `config.h` |
| Correo SMTP | ⚙️ Requiere configuración | Variables `SMTP_*` |

## 4. Observaciones para el equipo

- **Rota las credenciales** de HiveMQ: estuvieron públicas en `js/mqtt.js`. La contraseña WiFi del firmware original también estaba en el ZIP.
- **Nombres de terapia:**
  - El formulario muestra *Flexión-Extensión*, *Abducción-Aducción*, *Rotación interna y externa* y *Circunducción plana*.
  - En la base se guardan `Flexión`, `Extensión`, `Pronación` y `Supinación`.
  - En el firmware corresponden a las trayectorias rectángulo, zigzag, ocho y espiral.

  Se mantuvo la correspondencia original. Conviene confirmar con el equipo clínico cuál es la denominación correcta.
- **Unidades:**
  - El valor EMG llega del Arduino ya procesado (envolvente) y se rotula «mV» como en el original. Confirmen la escala real.
  - La «fuerza» es una **estimación** proporcional al EMG (`emg/300*10`, máximo 10 N), no la medición de un sensor de fuerza.
- **Fotografías:** parecen renders generados por IA (entre otros detalles, la tableta muestra texto sin sentido). En la portada se presentan como «ilustrativas» y no se atribuyen a un lugar ni a pacientes reales. Si las usan en presentaciones, aclaren que no son fotos de despliegues reales.
- **Texto provisional:** las secciones *Nosotros* y *Contacto* llevan la marca «Texto provisional». Reemplázalo en `public/index.html`. Para ocultar las marcas sin borrarlas, añade `class="sin-marcas"` al `<body>`.
- **Escala:** SQLite es adecuado para un servidor con una clínica. Para varias sedes con alta concurrencia conviene migrar a PostgreSQL: Prisma lo permite cambiando `provider` y el adaptador.

## 5. Cumplimiento de requisitos técnicos (Monitor en vivo)

Se añadió al final del **Monitor en vivo** una sección con los 9 parámetros de los requisitos **REC-SOFT-04** (procesamiento EMG), **REC-ELE-03** (comunicación ESP32/IoT) y **REC-MEC-02** (sistema mecánico). Cada tarjeta muestra el nombre del parámetro, el valor límite y el indicador «Cumple».

Solo se modificaron `public/dashboard.html` (marcado de la sección) y `public/css/plataforma.css` (estilos). No cambia ninguna otra sección, el JavaScript del panel, el servidor ni el firmware.

**Estados.** Por ahora ningún parámetro tiene una medición registrada, así que todas las tarjetas están en **referencia**: insignia con borde punteado y la palabra «Referencia», y tarjeta con borde punteado y sin sombra. Así se distinguen de un resultado real.

| Estado | `data-estado` | Clase de la insignia | Texto pequeño | Aspecto |
|---|---|---|---|---|
| Referencia (sin medición) | `referencia` | `cumple cumple--referencia` | `Referencia` | Borde punteado, sin relleno |
| Verificado con medición | `verificado` | `cumple cumple--verificado` | `Verificado` | Relleno verde sólido |
| Medición fuera del límite | `no-cumple` | `cumple cumple--no-cumple` | `Medido` (y cambia «Cumple» por «No cumple») | Relleno rojo |

Ejemplo para marcar una medición real de la latencia total:

```html
<article class="metric-card requisito" data-estado="verificado" data-codigo="REC-SOFT-04">
  …
  <div class="requisito__pie">
    <span class="cumple cumple--verificado" title="Medido con marcas de tiempo">…Cumple<small>Verificado</small></span>
    <span class="requisito__medido">Medido: 182 ms · 23/11/2026</span>
  </div>
</article>
```
