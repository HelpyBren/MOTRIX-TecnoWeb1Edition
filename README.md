# MOTRIX — Plataforma de rehabilitación con ESP32 (v2.0)

Equipo robótico de rehabilitación de miembro superior con sensores EMG y una plataforma web para fisioterapeutas: portada pública, acceso con roles, monitor en tiempo real, pacientes, sesiones, historial con exportación a Excel y configuración WiFi de las ESP32.

```
motrix/
├── public/                 Frontend (HTML, CSS, JS sin framework). Lo sirve Express.
│   ├── index.html          Portada
│   ├── login.html · recuperar.html · restablecer.html · registrarse.html
│   ├── dashboard.html      Panel interno (Resumen, Monitor en vivo, Pacientes, Sesiones,
│   │                       Dispositivos, Historial y exportación, Usuarios, Configuración)
│   ├── registro.html       Alta rápida de paciente (página original, ahora protegida)
│   ├── js/ · js/modules/   Lógica del panel (un archivo por módulo)
│   ├── css/                Estilos (sitio.css = portada/acceso, plataforma.css = panel)
│   ├── vendor/             Chart.js 4.5.0 (local, sin CDN)
│   └── assets/             Logotipo, fotografías optimizadas (WebP + JPEG) y tipografías
├── server/                 API Express (modular): rutas, middleware, servicios
├── prisma/                 Esquema, migraciones y base SQLite (dev.db)
├── firmware/motrix_esp32/  Firmware v2 de la ESP32 (portal WiFi, NVS, comandos firmados)
├── scripts/                Migración segura de la base y alta del administrador
├── tools/                  Broker MQTT local y simulador de ESP32 (solo pruebas)
├── tests/                  Pruebas automáticas (npm test)
└── docs/                   Cambios realizados, arquitectura WiFi y verificación
```

## 1. Requisitos

- **Node.js 20.11 o superior** (probado con Node 22).
- Conexión a internet la primera vez (`npm install`).
- Para el firmware: Arduino IDE 2.x con el núcleo **esp32** de Espressif.

## 2. Instalación

Abre una terminal en la carpeta del proyecto (la que contiene `package.json`):

```bash
npm install                 # instala dependencias y genera el cliente Prisma
cp .env.example .env        # en Windows: copy .env.example .env
npm run clave:maestra       # copia el resultado en DEVICE_MASTER_KEY dentro de .env
```

Completa en `.env` las credenciales del broker (`MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`). Para HiveMQ Cloud la URL es `mqtts://<tu-cluster>.s1.eu.hivemq.cloud:8883`.

> **Importante:** el proyecto original tenía la contraseña de HiveMQ escrita en `js/mqtt.js`, visible para cualquier visitante de la página. Crea una credencial nueva en HiveMQ Cloud y elimina la anterior.

### Base de datos

`prisma/dev.db` **ya incluye tus 27 pacientes y 25 sesiones** con la migración aplicada. No hace falta hacer nada más.

Si usas otra copia de la base (por ejemplo, la que tienes en tu computadora), aplícale la migración:

```bash
npm run db:migrate          # crea una copia en prisma/backups/ y luego migra
```

La copia original sin migrar está en `prisma/backups/dev.original-2026-11-13.db`.

### Primer administrador

```bash
npm run admin:crear         # pide nombre, usuario, correo y contraseña
```

## 3. Ejecutar

```bash
npm start
```

Abre **http://localhost:3000**. Ya **no** se usa Live Server: el servidor entrega la web y la API desde el mismo origen (es lo que permite las cookies de sesión seguras).

Los pacientes y sesiones históricos no tienen responsable: solo los ve un administrador, que puede asignarlos desde **Pacientes → Editar → Responsable**.

### Probar sin hardware (opcional)

```bash
node tools/broker-local.js                              # terminal 1 → broker MQTT local
# en .env: MQTT_URL=mqtt://localhost:1883 y reinicia npm start
node tools/simulador-esp32.js --codigo MOTRIX-01 \
     --topic paciente1 --clave <DEVICE_KEY del equipo>  # terminal 2 → ESP32 simulada
```

El simulador genera datos sintéticos. Las sesiones que guardes mientras está activo quedan en la base, así que úsalo con una copia o con pacientes de prueba.

## 4. Firmware de la ESP32

1. Abre `firmware/motrix_esp32/motrix_esp32.ino` en Arduino IDE.
2. Instala las bibliotecas **PubSubClient** (Nick O'Leary) y **LiquidCrystal I2C** (Frank de Brabander).
3. Copia `config.example.h` como `config.h` y complétalo. Los valores de `DEVICE_ID`, `TOPIC_BASE` y `DEVICE_KEY` aparecen en la plataforma, en **Dispositivos → Datos para el firmware**.
4. Elige la placa **ESP32 Dev Module** y el puerto, y pulsa **Subir**.
5. La primera vez, el equipo abre su red **MOTRIX-…** con una clave de 8 dígitos que muestra en la LCD. Conéctate desde el celular y elige la red WiFi del lugar.

Los detalles y las razones de esta arquitectura están en [docs/ESP32_WIFI.md](docs/ESP32_WIFI.md).

## 5. Pruebas

```bash
npm test
```

Ejecuta 9 pruebas de integración sobre una **copia** de la base original:

- autenticación, roles y protección CSRF;
- exportación a Excel;
- recuperación de contraseña;
- MQTT/SSE con un broker local;
- cambio de WiFi firmado;
- interoperabilidad criptográfica con el código C++ del firmware (requiere `g++` y OpenSSL).

## 6. Producción (resumen)

- `NODE_ENV=production`, `APP_URL=https://…` y HTTPS obligatorio (las cookies se marcan `Secure`).
- Detrás de un proxy (Nginx, Render, Railway…): `TRUST_PROXY=true`.
- SQLite funciona bien para una clínica con un servidor. Haz copias de `prisma/dev.db` periódicamente.
- Configura SMTP para la recuperación de contraseña por correo.

Más información en [docs/CAMBIOS.md](docs/CAMBIOS.md).
