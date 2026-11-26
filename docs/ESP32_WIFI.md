# Conexión WiFi de la ESP32 sin reprogramarla

## El problema

En el firmware original, la red y la contraseña estaban escritas en el código (`WIFI_SSID`, `WIFI_PASSWORD`). Cada cambio de lugar obligaba a recompilar y volver a cargar el firmware.

## Lo que un navegador puede y no puede hacer

| Idea | ¿Funciona? | Motivo |
|---|---|---|
| Que la web (en internet) **descubra** la ESP32 sin red | No | Una ESP32 sin configurar no está en ninguna red que la web pueda ver. Los navegadores no permiten a una página escanear la red local ni enumerar dispositivos. |
| Que la web llame por `fetch` a `http://192.168.x.x` de la ESP32 | No es fiable | Una página HTTPS no puede pedir recursos HTTP (contenido mixto). Además, Chrome bloquea cada vez más los accesos de sitios públicos a IPs privadas (Private Network Access) y harían falta cabeceras CORS. |
| Web Bluetooth para enviar la red | Parcial | Solo funciona en Chrome o Edge de escritorio y Android. **No funciona en iPhone ni iPad (Safari).** Exige añadir BLE al firmware y aumenta el consumo de memoria. Lo descartamos como método principal. |
| **Portal cautivo en la propia ESP32** | **Sí** | El teléfono se conecta a la red que crea el equipo y la página la sirve la ESP32 misma. No depende de internet, de CORS ni del navegador. Es el método que usa la mayoría de productos IoT. |
| Cambio remoto por MQTT cuando el equipo ya está en línea | Sí | Solo es posible si el equipo ya tiene internet. Lo implementamos con firma y cifrado, y con vuelta automática a la red anterior. |

## La solución implementada

### A. Configuración en el lugar (equipo nuevo, mudanza o red caída)

1. El equipo abre su punto de acceso en estos casos:
   - no tiene ninguna red guardada;
   - al encenderse, no logra conectarse en 30 s;
   - pierde la red durante 60 s sin sesión en curso;
   - se mantiene presionado **BOOT** durante 3 s;
   - un administrador lo pide desde la plataforma.
2. La red se llama `MOTRIX-<ID>` y está protegida con WPA2 y una **clave aleatoria de 8 dígitos**. La clave cambia cada vez que se abre y aparece solo en la **pantalla LCD** del equipo (y en el monitor serie). Para configurarlo hay que tener el equipo delante.
3. Al conectarse, el celular abre la página de configuración automáticamente (portal cautivo con DNS). Si no se abre, se puede ir a `http://192.168.4.1`.
4. La página lista las redes cercanas. El usuario elige una (o escribe una red oculta) y su contraseña. La ESP32 **prueba la conexión antes de guardarla** y muestra el resultado:
   - **Éxito:** «conectado», con la IP.
   - **Fallo:** «no se encontró la red» o «la contraseña parece incorrecta».
5. Si la conexión funciona, guarda la red en **NVS** (`Preferences`, espacio `motrix-red`). La red sobrevive a reinicios y cortes de luz. A los 20 s el portal se cierra solo.
6. En la plataforma, **Dispositivos → Configurar WiFi** guía estos pasos y avisa cuando el equipo aparece en línea.

Detalles del portal:

- Si el router tarda más que la ESP32 en arrancar tras un corte de luz, el equipo reintenta la red guardada cada 2 minutos mientras nadie esté conectado al portal.
- Al probar la red nueva, la ESP32 puede cambiar de canal y el celular perder la conexión con el portal. La página lo explica y la **LCD muestra el resultado** («WiFi conectado» / «Error de WiFi»).

### B. Cambio remoto (equipo en línea, solo administradores)

1. El administrador escribe la nueva red en **Dispositivos → Configurar WiFi → A distancia**.
2. El servidor publica en `motrix/dispositivos/<ID>/cmd` un comando que:
   - va **firmado** con HMAC-SHA256 y la clave propia del equipo;
   - lleva la contraseña **cifrada**;
   - incluye un nonce aleatorio y una marca de tiempo.
3. La ESP32 hace estas comprobaciones y solo aplica el comando si todas se cumplen:
   - la firma es correcta;
   - el comando tiene menos de 5 minutos (hora sincronizada por NTP);
   - el nonce no se usó antes;
   - no hay una sesión de terapia en curso.
4. Prueba la red nueva durante 20 s:
   - **Si funciona:** la guarda.
   - **Si no:** **vuelve a la red anterior**.

   En los dos casos informa el resultado en `motrix/dispositivos/<ID>/wifi`, y la plataforma lo muestra.

### Seguridad

- La contraseña WiFi **nunca** se guarda en la base de datos ni en los registros. La auditoría solo anota el SSID solicitado. Las pruebas automáticas lo verifican leyendo los bytes de la base.
- Por el broker la contraseña viaja cifrada, además del TLS. Aunque alguien tenga las credenciales del broker, no puede leerla ni falsificar comandos sin la clave del equipo.
- Claves:
  - **Clave de cada equipo:** `HMAC-SHA256(DEVICE_MASTER_KEY, "motrix-device:" + ID)`. El servidor la recalcula cuando la necesita.
  - **Para verla:** el administrador vuelve a escribir su contraseña.
  - **En el equipo:** se copia una sola vez en `config.h`.
- La página del portal inserta los nombres de red con `textContent`. Un SSID malicioso no puede inyectar código.
- TLS con el broker: ahora se **verifica el certificado** con ISRG Root X1 (`MQTT_VERIFICAR_TLS 1`). El original usaba `setInsecure()`.

## Estado en línea

- El firmware publica `motrix/dispositivos/<ID>/estado` (retenido). Incluye IP, SSID, RSSI, MAC, versión y tópico. Configura además una **última voluntad (LWT)** `{"online":false}`: si el equipo se apaga de golpe, el broker avisa a la plataforma.
- Se mantiene el latido original `motrix/<tópico>/rssi` cada 4 s. Un equipo con el **firmware original** también aparece en línea si se registra con su tópico (`paciente1`). Lo que no puede hacer es el cambio remoto de WiFi.

## Cargar el firmware

1. Arduino IDE 2.x → *Preferencias* → URL de placas adicionales: `https://espressif.github.io/arduino-esp32/package_esp32_index.json`. Luego, en *Gestor de placas*, instala **esp32** (Espressif).
2. *Gestor de bibliotecas*: **PubSubClient** (Nick O'Leary) y **LiquidCrystal I2C** (Frank de Brabander).
3. En la plataforma, **Dispositivos → Registrar equipo** (por ejemplo, código `MOTRIX-01`, tópico `paciente1`). Después usa **Datos para el firmware** y copia los tres `#define`.
4. Copia `firmware/motrix_esp32/config.example.h` como `config.h`:
   - pega los datos del paso anterior;
   - completa `MQTT_HOST`, `MQTT_USER` y `MQTT_PASSWORD`. Conviene usar una credencial de HiveMQ distinta de la del servidor.
5. Placa **ESP32 Dev Module**, elige el puerto y pulsa **Subir**. Abre el monitor serie a 115200 baudios para ver la clave del punto de acceso.
6. **Migración:** si quieres que el equipo se conecte a tu red actual sin pasar por el portal, rellena `WIFI_SSID_INICIAL` y `WIFI_PASS_INICIAL`. Solo se usan si la memoria NVS está vacía. Después puedes dejarlos vacíos.

## Cambios en el protocolo (compatibles con la versión anterior)

| Tópico | Antes | Ahora |
|---|---|---|
| `motrix/<t>/start` | `flexion` | `flexion` o `flexion\|20` (duración en minutos; por defecto 5, como antes) |
| `motrix/<t>/calibrar` | se ejecutaba dentro del callback MQTT | se ejecuta en `loop()` (evita reentrar en `mqttClient.loop()`) |
| `motrix/dispositivos/<ID>/estado` | — | nuevo, retenido + LWT |
| `motrix/dispositivos/<ID>/cmd` | — | nuevo: comandos firmados `wifi`, `portal`, `reiniciar` |
| `motrix/dispositivos/<ID>/wifi` | — | nuevo: resultado del cambio de red |

`PubSubClient` usa `setBufferSize(1024)`: los comandos firmados superan los 256 bytes que trae por defecto.
