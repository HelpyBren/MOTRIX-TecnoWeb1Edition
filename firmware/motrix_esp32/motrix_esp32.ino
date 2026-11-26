/* ======================================================================
   MOTRIX — Firmware ESP32 v2.0.0
   ----------------------------------------------------------------------
   Basado en motrix_FINAL.ino. Se conserva íntegro el control de los tres
   motores, las cuatro trayectorias, la LCD en el núcleo 0, la lectura EMG
   por Serial2 y los tópicos MQTT motrix/<TOPIC_BASE>/... que usa la web.

   Novedades:
     * Sin credenciales WiFi en el código: se configuran desde un punto de
       acceso propio con portal web (red.h) y se guardan en NVS.
     * Estado del equipo retenido en motrix/dispositivos/<ID>/estado con
       "última voluntad" (LWT) para que la plataforma sepa si está en línea.
     * Cambio de red remoto con comandos firmados (HMAC-SHA256) y
       contraseña cifrada; si la red nueva falla, vuelve a la anterior.
     * TLS verificado con la autoridad raíz del broker (configurable).
     * Conexión MQTT no bloqueante; reconexión automática.
     * "start" acepta la duración: "flexion|20" (minutos). "flexion" sigue
       funcionando con la duración por defecto (5 min), como antes.
     * La calibración se ejecuta fuera del callback MQTT (antes podía
       reentrar en mqttClient.loop()).

   Bibliotecas (Gestor de bibliotecas de Arduino IDE):
     * PubSubClient (Nick O'Leary)       * LiquidCrystal I2C (Frank de Brabander)
   Placa: ESP32 Dev Module (núcleo "esp32" de Espressif 2.x o 3.x).
   Antes de compilar: copia config.example.h como config.h y complétalo.
   ====================================================================== */

#if __has_include("config.h")
  #include "config.h"
#else
  #error "Falta config.h: copia config.example.h como config.h y completa tus datos."
#endif

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <time.h>
#include "red.h"
#include "seguridad.h"

#define FIRMWARE_VERSION "2.0.0"

//==============================
// MOTORES (sin cambios)
//==============================
// eje y
#define x_paso   2
#define x_dire   15
// eje x der
#define x2_paso  18
#define x2_dire  5
// eje x izq
#define x3_paso  25
#define x3_dire  26
// ENABLE común para los tres A4988
#define ENABLE_MOTORES 4

//==============================
// PANTALLA LCD I2C 16x2
//==============================
#define LCD_SDA 21
#define LCD_SCL 22
#define LCD_DIRECCION 0x27  // Cambia a 0x3F si tu módulo no responde en 0x27
LiquidCrystal_I2C lcd(LCD_DIRECCION, 16, 2);

//==============================
// SEÑAL EMG (SpikerBox + Arduino → Serial2, RX2 = GPIO16)
//==============================
const int TAM_BUFFER_RMS = 10;
float bufferEmg[TAM_BUFFER_RMS];

//==============================
// PARÁMETROS DE MOVIMIENTO
//==============================
int retardo = 1000;          // microsegundos entre pasos: controla la velocidad
int pasosX = 1450;
int pasosY = 800;
int vueltasPorFigura = 1;

//==============================
// DURACIÓN DE LA SESIÓN
//==============================
const unsigned long DURACION_POR_DEFECTO_MS = 5UL * 60UL * 1000UL; // 5 minutos (como el original)
volatile unsigned long duracionSesionMs = DURACION_POR_DEFECTO_MS;   // puede llegar en "start": "flexion|20"

unsigned long tiempoInicioSesion = 0;
unsigned long tiempoPausadoAcumulado = 0;
unsigned long tiempoInicioPausa = 0;
bool lcdEnPausaMostrada = false;

//==============================
// ESTADO DE LA LCD (escrito en el núcleo 1, dibujado por la tarea del núcleo 0)
//==============================
enum EstadoLCD { LCD_CONECTANDO, LCD_CONECTADA, LCD_INICIANDO, LCD_SESION, LCD_PAUSADA, LCD_FINALIZADA, LCD_PORTAL, LCD_CAMBIANDO_RED };
volatile EstadoLCD estadoLCD = LCD_CONECTANDO;
volatile int indiceTerapiaLCD = -1;
TaskHandle_t tareaLCDHandle = NULL;

//==============================
// ESTADO DE SESIÓN (controlado por MQTT)
//==============================
volatile bool solicitarInicio = false;
volatile bool abortarMovimiento = false;
volatile bool pausado = false;
volatile bool solicitarCalibracion = false;
String terapiaSolicitada = "flexion";
bool sesionActiva = false;
int repeticionesCompletadas = 0;

WiFiClientSecure wifiClientSecure;
PubSubClient mqttClient(wifiClientSecure);

//==============================
// COMANDOS DE DISPOSITIVO (firmados)
//==============================
uint8_t claveDispositivo[32];
bool claveValida = false;
char comandoPendiente[700];
volatile bool hayComandoPendiente = false;
char resultadoWifiPendiente[220] = "";
char noncesUsados[16][33];
int indiceNonce = 0;

/* Prototipos (el IDE de Arduino los genera solo, pero declararlos evita
   errores con otros entornos como PlatformIO). */
void tareaLCD(void *parametroNoUsado);
void alRecibirMensaje(char* topic, byte* payload, unsigned int length);
void actualizarEstadoLCDRed();
void conectarMqtt();
void publicarEstadoDispositivo();
void leerYPublicarEmg();
void ejecutarFigura(String tipoTerapia);
void procesarComandoDispositivo();
void calibrar();
void atenderRed();

/* ======================================================================
   TÓPICOS MQTT
   ====================================================================== */
String topicReps, topicEstado, topicCmdStart, topicCmdStop, topicCmdVelocidad, topicCmdCalibrar, topicRssi;
String topicEmg, topicRms, topicFuerza;
String topicDispEstado, topicDispCmd, topicDispWifi;

void construirTopicos() {
  String base = "motrix/" + String(TOPIC_BASE);
  topicReps         = base + "/repeticiones";
  topicEstado       = base + "/estado";
  topicRssi         = base + "/rssi";
  topicEmg          = base + "/emg";
  topicRms          = base + "/rms";
  topicFuerza       = base + "/fuerza";
  topicCmdStart     = base + "/start";
  topicCmdStop      = base + "/stop";
  topicCmdVelocidad = base + "/velocidad";
  topicCmdCalibrar  = base + "/calibrar";
  String disp = "motrix/dispositivos/" + String(DEVICE_ID);
  topicDispEstado = disp + "/estado";
  topicDispCmd    = disp + "/cmd";
  topicDispWifi   = disp + "/wifi";
}

/* ======================================================================
   SETUP
   ====================================================================== */
void setup() {
  Serial.begin(115200);
  Serial2.begin(115200, SERIAL_8N1, 16, 17);
  Serial2.setTimeout(20); // parseFloat no debe frenar los motores esperando datos
  pinMode(x_paso, OUTPUT);
  pinMode(x_dire, OUTPUT);
  pinMode(x2_paso, OUTPUT);
  pinMode(x2_dire, OUTPUT);
  pinMode(x3_paso, OUTPUT);
  pinMode(x3_dire, OUTPUT);
  pinMode(ENABLE_MOTORES, OUTPUT);
  digitalWrite(ENABLE_MOTORES, HIGH); // deshabilitado al inicio

  Wire.begin(LCD_SDA, LCD_SCL);
  lcd.init();
  lcd.backlight();
  xTaskCreatePinnedToCore(tareaLCD, "TareaLCD", 4096, NULL, 1, &tareaLCDHandle, 0);

  for (int i = 0; i < TAM_BUFFER_RMS; i++) bufferEmg[i] = 0;
  construirTopicos();

  size_t largoClave = 0;
  claveValida = strlen(DEVICE_KEY) == 64 && Seguridad::hexABytes(DEVICE_KEY, claveDispositivo, 32, &largoClave) && largoClave == 32;
  if (!claveValida) Serial.println("[MOTRIX] DEVICE_KEY vacía o inválida: el cambio de WiFi remoto queda deshabilitado (el portal local sí funciona).");

#if MQTT_VERIFICAR_TLS
  wifiClientSecure.setCACert(CA_RAIZ);
#else
  wifiClientSecure.setInsecure();
  Serial.println("[MOTRIX] Atención: TLS sin verificar (MQTT_VERIFICAR_TLS = 0). Úsalo solo en pruebas.");
#endif
  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(alRecibirMensaje);
  mqttClient.setBufferSize(1024);   // los comandos firmados superan los 256 bytes por defecto
  mqttClient.setKeepAlive(30);

  Red::iniciar(DEVICE_ID, WIFI_SSID_INICIAL, WIFI_PASS_INICIAL);

  Serial.println("====================");
  Serial.printf("MOTRIX firmware %s · equipo %s · tópico motrix/%s\n", FIRMWARE_VERSION, DEVICE_ID, TOPIC_BASE);
  Serial.println("Modo manual (Serial): 1 Rectángulo · 2 Zigzag · 3 Ocho · 4 Espiral");
  Serial.println("Mantén BOOT 3 s para abrir el portal de configuración WiFi.");
  Serial.println("====================");
}

/* ======================================================================
   LOOP PRINCIPAL
   ====================================================================== */
unsigned long ultimoHeartbeat = 0;
const unsigned long INTERVALO_HEARTBEAT_MS = 4000;
unsigned long ultimoEstadoDispositivo = 0;
const unsigned long INTERVALO_ESTADO_MS = 30000;
unsigned long ultimoIntentoMqtt = 0;
unsigned long wifiConectadoDesde = 0;
bool ntpIniciado = false;

bool tiempoSincronizado() { return time(nullptr) > 1700000000; }

void atenderRed() {
  Red::loop(sesionActiva);
  actualizarEstadoLCDRed();
  if (!Red::conectada()) { wifiConectadoDesde = 0; return; }
  if (!wifiConectadoDesde) wifiConectadoDesde = millis();
  if (!ntpIniciado) {
    configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
    ntpIniciado = true;
  }
  if (!mqttClient.connected()) conectarMqtt();
  else mqttClient.loop();
}

void loop() {
  atenderRed();

  unsigned long ahora = millis();
  if (mqttClient.connected()) {
    if (ahora - ultimoHeartbeat >= INTERVALO_HEARTBEAT_MS) {
      ultimoHeartbeat = ahora;
      mqttClient.publish(topicRssi.c_str(), String(WiFi.RSSI()).c_str());
    }
    if (ahora - ultimoEstadoDispositivo >= INTERVALO_ESTADO_MS) publicarEstadoDispositivo();
  }

  leerYPublicarEmg();

  if (Serial.available()) {
    char opcion = Serial.read();
    switch (opcion) {
      case '1': ejecutarFigura("flexion");    break;
      case '2': ejecutarFigura("extension");  break;
      case '3': ejecutarFigura("pronacion");  break;
      case '4': ejecutarFigura("supinacion"); break;
      default: break;
    }
  }

  if (hayComandoPendiente) procesarComandoDispositivo();

  if (solicitarCalibracion && !sesionActiva) {
    solicitarCalibracion = false;
    calibrar();
  }

  if (solicitarInicio && !sesionActiva) {
    solicitarInicio = false;
    ejecutarFigura(terapiaSolicitada);
  }
}

/* ======================================================================
   LECTURA DE LA SEÑAL EMG (Arduino → Serial2)
   ====================================================================== */
void leerYPublicarEmg() {
  if (Serial2.available() > 0) {
    float emgProcesado = Serial2.parseFloat();
    if (emgProcesado < 0.0) emgProcesado = 0.0;
    if (!mqttClient.connected()) return;

    char buffer[12];
    dtostrf(emgProcesado, 4, 1, buffer);
    mqttClient.publish(topicEmg.c_str(), buffer);
    // El Arduino ya filtra y suaviza: el valor equivale a la envolvente (RMS).
    mqttClient.publish(topicRms.c_str(), buffer);

    // Fuerza estimada proporcional (rango orientativo 0-10 N). Ajusta el divisor según tus pruebas.
    float fuerza = (emgProcesado / 300.0) * 10.0;
    if (fuerza > 10.0) fuerza = 10.0;
    dtostrf(fuerza, 4, 1, buffer);
    mqttClient.publish(topicFuerza.c_str(), buffer);
  }
}

/* ======================================================================
   LCD — utilidades
   ====================================================================== */
String padALinea(String texto) {
  if (texto.length() > 16) return texto.substring(0, 16);
  while (texto.length() < 16) texto += ' ';
  return texto;
}

String nombreTerapiaPorIndice(int idx) {
  switch (idx) {
    case 0: return "Flexion";
    case 1: return "Extension";
    case 2: return "Pronacion";
    case 3: return "Supinacion";
    default: return "Terapia";
  }
}

int indiceDeTerapia(String tipo) {
  if (tipo == "flexion")    return 0;
  if (tipo == "extension")  return 1;
  if (tipo == "pronacion")  return 2;
  if (tipo == "supinacion") return 3;
  return -1;
}

String formatearTiempo(unsigned long segundosTotales) {
  unsigned int minutos = segundosTotales / 60;
  unsigned int segundos = segundosTotales % 60;
  char buffer[8];
  snprintf(buffer, sizeof(buffer), "%02u:%02u", minutos, segundos);
  return String(buffer);
}

void verificarTiempoSesion() {
  if (!sesionActiva || pausado) return;
  unsigned long transcurrido = millis() - tiempoInicioSesion - tiempoPausadoAcumulado;
  if (transcurrido >= duracionSesionMs) abortarMovimiento = true;
}

// Ajusta el estado de la LCD según la red, sin interferir con la sesión.
void actualizarEstadoLCDRed() {
  if (sesionActiva) return;
  if (Red::portalActivo()) {
    if (estadoLCD != LCD_PORTAL && estadoLCD != LCD_FINALIZADA) estadoLCD = LCD_PORTAL;
  } else if (estadoLCD == LCD_PORTAL) {
    estadoLCD = mqttClient.connected() ? LCD_CONECTADA : LCD_CONECTANDO;
  }
}

/* ======================================================================
   TAREA DE LCD — núcleo 0 (única parte que escribe en la pantalla)
   ====================================================================== */
void tareaLCD(void *parametroNoUsado) {
  EstadoLCD estadoAnterior = (EstadoLCD)-1;
  int terapiaAnterior = -2;
  long segundoAnterior = -1;
  int fasePortal = -1;

  for (;;) {
    EstadoLCD estado = estadoLCD;
    int terapiaIdx = indiceTerapiaLCD;
    bool cambioDeEstado = (estado != estadoAnterior);

    switch (estado) {
      case LCD_CONECTANDO:
        if (cambioDeEstado) {
          lcd.clear();
          lcd.setCursor(0, 0); lcd.print("MOTRIX");
          lcd.setCursor(0, 1); lcd.print("Conectando...");
        }
        break;

      case LCD_CONECTADA:
        if (cambioDeEstado) {
          lcd.clear();
          lcd.setCursor(0, 0); lcd.print("Maquina");
          lcd.setCursor(0, 1); lcd.print("conectada");
        }
        break;

      case LCD_PORTAL: {
        // Alterna cada ~3 s: nombre de la red / dirección web; la clave siempre visible.
        int fase = (millis() / 3000) % 3;
        Red::EstadoPortal ep = Red::estadoDelPortal();
        if (cambioDeEstado || fase != fasePortal) {
          fasePortal = fase;
          lcd.clear();
          if (ep == Red::PORTAL_CONECTADO) {
            lcd.setCursor(0, 0); lcd.print("WiFi conectado");
            lcd.setCursor(0, 1); lcd.print(padALinea(Red::ssidActual()));
          } else if (ep == Red::PORTAL_ERROR && fase == 2) {
            lcd.setCursor(0, 0); lcd.print("Error de WiFi");
            lcd.setCursor(0, 1); lcd.print("Revise la clave");
          } else {
            lcd.setCursor(0, 0);
            lcd.print(padALinea(fase == 1 ? String("Web 192.168.4.1") : String(Red::nombrePuntoAcceso())));
            lcd.setCursor(0, 1);
            lcd.print(padALinea(String("Clave ") + Red::clavePuntoAcceso()));
          }
        }
        break;
      }

      case LCD_CAMBIANDO_RED:
        if (cambioDeEstado) {
          lcd.clear();
          lcd.setCursor(0, 0); lcd.print("Cambiando red");
          lcd.setCursor(0, 1); lcd.print("WiFi...");
        }
        break;

      case LCD_INICIANDO:
        if (cambioDeEstado || terapiaIdx != terapiaAnterior) {
          lcd.clear();
          lcd.setCursor(0, 0); lcd.print("Iniciando:");
          lcd.setCursor(0, 1); lcd.print(nombreTerapiaPorIndice(terapiaIdx));
        }
        break;

      case LCD_PAUSADA:
        if (cambioDeEstado) {
          lcd.clear();
          lcd.setCursor(0, 0); lcd.print("Sesion en");
          lcd.setCursor(0, 1); lcd.print("pausa");
        }
        break;

      case LCD_FINALIZADA:
        if (cambioDeEstado) {
          lcd.clear();
          lcd.setCursor(0, 0); lcd.print("Sesion");
          lcd.setCursor(0, 1); lcd.print("terminada");
        }
        break;

      case LCD_SESION: {
        if (cambioDeEstado || terapiaIdx != terapiaAnterior) {
          lcd.clear();
          lcd.setCursor(0, 0);
          lcd.print(padALinea(nombreTerapiaPorIndice(terapiaIdx)));
          segundoAnterior = -1;
        }
        unsigned long transcurrido = millis() - tiempoInicioSesion - tiempoPausadoAcumulado;
        long restanteMs = (long)duracionSesionMs - (long)transcurrido;
        if (restanteMs < 0) restanteMs = 0;
        long restanteSeg = restanteMs / 1000;
        if (restanteSeg != segundoAnterior) {
          lcd.setCursor(0, 1);
          lcd.print(padALinea("Tiempo: " + formatearTiempo(restanteSeg)));
          segundoAnterior = restanteSeg;
        }
        break;
      }
    }

    estadoAnterior = estado;
    terapiaAnterior = terapiaIdx;
    vTaskDelay(pdMS_TO_TICKS(300));
  }
}

/* ======================================================================
   MQTT — conexión no bloqueante con "última voluntad"
   ====================================================================== */
String jsonEscapar(const char* s) {
  String out;
  for (const char* p = s; *p; p++) {
    if (*p == '"' || *p == '\\') { out += '\\'; out += *p; }
    else if ((uint8_t)*p < 0x20) out += ' ';
    else out += *p;
  }
  return out;
}

void publicarEstadoDispositivo() {
  ultimoEstadoDispositivo = millis();
  String json = String("{\"online\":true,\"fw\":\"") + FIRMWARE_VERSION +
                "\",\"ip\":\"" + WiFi.localIP().toString() +
                "\",\"ssid\":\"" + jsonEscapar(WiFi.SSID().c_str()) +
                "\",\"rssi\":" + String(WiFi.RSSI()) +
                ",\"mac\":\"" + WiFi.macAddress() +
                "\",\"topic\":\"" + TOPIC_BASE + "\"}";
  mqttClient.publish(topicDispEstado.c_str(), json.c_str(), true);
}

void conectarMqtt() {
  unsigned long ahora = millis();
  if (ahora - ultimoIntentoMqtt < 5000) return;
  // Con verificación TLS se espera la hora NTP (máx. 20 s) para validar el certificado.
  if (MQTT_VERIFICAR_TLS && !tiempoSincronizado() && ahora - wifiConectadoDesde < 20000) return;
  ultimoIntentoMqtt = ahora;

  String clientId = String("motrix-") + DEVICE_ID;
  Serial.print("[MQTT] Conectando al broker... ");
  bool ok = mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD,
                               topicDispEstado.c_str(), 1, true, "{\"online\":false}");
  if (!ok) {
    Serial.printf("falló (rc=%d). Nuevo intento en 5 s.\n", mqttClient.state());
    if (!sesionActiva && !Red::portalActivo()) estadoLCD = LCD_CONECTANDO;
    return;
  }
  Serial.println("conectado.");
  mqttClient.subscribe(topicCmdStart.c_str());
  mqttClient.subscribe(topicCmdStop.c_str());
  mqttClient.subscribe(topicCmdVelocidad.c_str());
  mqttClient.subscribe(topicCmdCalibrar.c_str());
  mqttClient.subscribe(topicDispCmd.c_str(), 1);
  mqttClient.publish(topicEstado.c_str(), "ESP32 (motores) conectada y lista");
  publicarEstadoDispositivo();
  if (resultadoWifiPendiente[0]) {
    mqttClient.publish(topicDispWifi.c_str(), resultadoWifiPendiente);
    resultadoWifiPendiente[0] = '\0';
  }
  if (!sesionActiva && !Red::portalActivo()) estadoLCD = LCD_CONECTADA;
}

/* ======================================================================
   CALLBACK — comandos desde la plataforma
   ====================================================================== */
void alRecibirMensaje(char* topic, byte* payload, unsigned int length) {
  String topicStr = String(topic);

  if (topicStr == topicDispCmd) {
    // Se copia y se procesa en loop() (fuera del callback).
    if (length < sizeof(comandoPendiente) && !hayComandoPendiente) {
      memcpy(comandoPendiente, payload, length);
      comandoPendiente[length] = '\0';
      hayComandoPendiente = true;
    }
    return;
  }

  String mensaje;
  for (unsigned int i = 0; i < length; i++) mensaje += (char)payload[i];
  Serial.println("Mensaje [" + topicStr + "]: " + mensaje);

  if (topicStr == topicCmdStart) {
    mensaje.toLowerCase();
    int sep = mensaje.indexOf('|');
    unsigned long minutos = 0;
    if (sep > 0) {
      minutos = mensaje.substring(sep + 1).toInt();
      mensaje = mensaje.substring(0, sep);
    }
    duracionSesionMs = (minutos >= 1 && minutos <= 120) ? minutos * 60000UL : DURACION_POR_DEFECTO_MS;
    terapiaSolicitada = mensaje;
    abortarMovimiento = false;
    pausado = false;
    solicitarInicio = true; // el movimiento real se dispara en loop()
  }
  else if (topicStr == topicCmdStop) {
    abortarMovimiento = true;
    pausado = false;
  }
  else if (topicStr == topicCmdVelocidad) {
    if (mensaje == "0") {
      pausado = true;
    } else {
      pausado = false;
      int nuevoRetardo = mensaje.toInt();
      if (nuevoRetardo > 0) retardo = nuevoRetardo;
    }
  }
  else if (topicStr == topicCmdCalibrar) {
    solicitarCalibracion = true;
  }
}

/* ======================================================================
   COMANDOS FIRMADOS DEL DISPOSITIVO (wifi | portal | reiniciar)
   ====================================================================== */
void publicarResultadoWifi(bool ok, const char* ssid, const char* msg) {
  snprintf(resultadoWifiPendiente, sizeof(resultadoWifiPendiente), "{\"ok\":%s,\"ssid\":\"%s\",\"msg\":\"%s\"}",
           ok ? "true" : "false", jsonEscapar(ssid).c_str(), jsonEscapar(msg).c_str());
  if (mqttClient.connected()) {
    mqttClient.publish(topicDispWifi.c_str(), resultadoWifiPendiente);
    resultadoWifiPendiente[0] = '\0';
  }
}

bool nonceUsado(const char* n) {
  for (int i = 0; i < 16; i++) if (strcmp(noncesUsados[i], n) == 0) return true;
  return false;
}

void procesarComandoDispositivo() {
  char a[16] = "", c[41] = "", s[132] = "", p[132] = "", n[40] = "", h[70] = "";
  long long t = 0;
  const char* j = comandoPendiente;
  bool formatoOk = Seguridad::jsonTexto(j, "a", a, sizeof(a)) && Seguridad::jsonTexto(j, "c", c, sizeof(c)) &&
                   Seguridad::jsonTexto(j, "n", n, sizeof(n)) && Seguridad::jsonTexto(j, "h", h, sizeof(h)) &&
                   Seguridad::jsonEntero(j, "t", &t);
  Seguridad::jsonTexto(j, "s", s, sizeof(s));
  Seguridad::jsonTexto(j, "p", p, sizeof(p));
  Seguridad::borrar(comandoPendiente, sizeof(comandoPendiente));
  hayComandoPendiente = false;

  if (!formatoOk || strcmp(c, DEVICE_ID) != 0) { Serial.println("[CMD] Comando con formato inválido o de otro equipo."); return; }
  if (!claveValida) { Serial.println("[CMD] Rechazado: DEVICE_KEY no configurada."); return; }
  if (strlen(n) != 32) { Serial.println("[CMD] Rechazado: nonce inválido."); return; }
  if (!tiempoSincronizado()) {
    Serial.println("[CMD] Rechazado: la hora NTP aún no está sincronizada.");
    if (strcmp(a, "wifi") == 0) publicarResultadoWifi(false, s, "El equipo aun no sincroniza la hora (NTP). Intenta en un minuto.");
    return;
  }
  long long ahora = (long long)time(nullptr);
  if (ahora - t > 300 || t - ahora > 300) { Serial.println("[CMD] Rechazado: marca de tiempo fuera de ventana."); return; }
  if (nonceUsado(n)) { Serial.println("[CMD] Rechazado: comando repetido."); return; }
  if (!Seguridad::firmaValida(claveDispositivo, a, c, s, p, n, t, h)) { Serial.println("[CMD] Rechazado: firma inválida."); return; }
  strncpy(noncesUsados[indiceNonce], n, 32);
  noncesUsados[indiceNonce][32] = '\0';
  indiceNonce = (indiceNonce + 1) % 16;

  if (strcmp(a, "wifi") == 0) {
    if (sesionActiva) { publicarResultadoWifi(false, s, "Hay una sesion de terapia en curso; intenta al terminar."); return; }
    char pass[80];
    if (!Seguridad::descifrar(claveDispositivo, n, p, pass, sizeof(pass))) { publicarResultadoWifi(false, s, "No se pudo descifrar la contraseña."); return; }
    EstadoLCD previo = estadoLCD;
    estadoLCD = LCD_CAMBIANDO_RED;
    mqttClient.disconnect();
    char msg[160];
    bool ok = Red::cambiarRed(s, pass, msg, sizeof(msg));
    Seguridad::borrar(pass, sizeof(pass));
    estadoLCD = previo == LCD_PORTAL ? LCD_CONECTANDO : previo;
    publicarResultadoWifi(ok, s, msg); // se envía al reconectar con el broker
    ultimoIntentoMqtt = 0;
  } else if (strcmp(a, "portal") == 0) {
    Red::abrirPortal();
  } else if (strcmp(a, "reiniciar") == 0) {
    if (sesionActiva) { Serial.println("[CMD] Reinicio rechazado: sesión en curso."); return; }
    mqttClient.publish(topicEstado.c_str(), "Reiniciando equipo");
    delay(500);
    ESP.restart();
  }
}

/* ======================================================================
   MOVIMIENTO DE MOTORES (con soporte de pausa/abortar vía MQTT)
   ====================================================================== */
void moverMotor(int pasoPin, int dirPin, bool sentido, int pasos) {
  digitalWrite(ENABLE_MOTORES, LOW);
  delay(2);
  digitalWrite(dirPin, sentido);

  for (int i = 0; i < pasos; i++) {
    if (abortarMovimiento) break;

    while (pausado && !abortarMovimiento) {
      if (!lcdEnPausaMostrada) {
        estadoLCD = LCD_PAUSADA;
        lcdEnPausaMostrada = true;
        tiempoInicioPausa = millis();
      }
      atenderRed();
      delay(50);
    }
    if (lcdEnPausaMostrada) {
      tiempoPausadoAcumulado += millis() - tiempoInicioPausa;
      lcdEnPausaMostrada = false;
      estadoLCD = LCD_SESION;
    }
    if (abortarMovimiento) break;

    digitalWrite(pasoPin, HIGH);
    delayMicroseconds(retardo);
    digitalWrite(pasoPin, LOW);
    delayMicroseconds(retardo);

    if (i % 40 == 0) {
      atenderRed();
      leerYPublicarEmg();
      verificarTiempoSesion();
    }
  }
}

void moverY(bool sentido, int pasos) {
  moverMotor(x2_paso, x2_dire, sentido, pasos);
  if (abortarMovimiento) return;
  moverMotor(x3_paso, x3_dire, sentido, pasos);
}

void calibrar() {
  // Pequeño movimiento de ida y vuelta para confirmar que los motores responden.
  digitalWrite(ENABLE_MOTORES, LOW);
  delay(2);
  moverMotor(x_paso, x_dire, 1, 100);
  moverMotor(x_paso, x_dire, 0, 100);
  digitalWrite(ENABLE_MOTORES, HIGH);
  if (mqttClient.connected()) mqttClient.publish(topicEstado.c_str(), "Calibracion completa");
}

void publicarRepeticiones() {
  if (mqttClient.connected()) mqttClient.publish(topicReps.c_str(), String(repeticionesCompletadas).c_str());
}

void publicarEstadoSesion(const char* texto) {
  if (mqttClient.connected()) mqttClient.publish(topicEstado.c_str(), texto);
}

/* ======================================================================
   FIGURAS DE REHABILITACIÓN (sin cambios en las trayectorias)
   ====================================================================== */
void rectangulo() {
  Serial.println("Rectangulo (Flexion)");
  publicarEstadoSesion("Ejecutando: Rectangulo (Flexion)");
  for (int i = 0; i < vueltasPorFigura && !abortarMovimiento; i++) {
    moverMotor(x_paso, x_dire, 1, pasosX);
    if (abortarMovimiento) break;
    moverY(1, pasosY);
    if (abortarMovimiento) break;
    moverMotor(x_paso, x_dire, 0, pasosX);
    if (abortarMovimiento) break;
    moverY(0, pasosY);
    if (!abortarMovimiento) {
      repeticionesCompletadas++;
      publicarRepeticiones();
    }
  }
  digitalWrite(ENABLE_MOTORES, HIGH);
}

void zigzag() {
  Serial.println("Zigzag (Extension)");
  publicarEstadoSesion("Ejecutando: Zigzag (Extension)");
  int secciones = 6;
  for (int i = 0; i < secciones && !abortarMovimiento; i++) {
    moverMotor(x_paso, x_dire, i % 2, pasosX / secciones);
    if (abortarMovimiento) break;
    moverY(1, pasosY / secciones);
  }
  if (!abortarMovimiento) {
    moverY(0, pasosY);
    repeticionesCompletadas++;
    publicarRepeticiones();
  }
  digitalWrite(ENABLE_MOTORES, HIGH);
}

void ocho() {
  Serial.println("Ocho (Pronacion)");
  publicarEstadoSesion("Ejecutando: Ocho (Pronacion)");
  for (int j = 0; j < 2 && !abortarMovimiento; j++) {
    moverMotor(x_paso, x_dire, 1, pasosX / 2);
    if (abortarMovimiento) break;
    moverY(1, pasosY);
    if (abortarMovimiento) break;
    moverMotor(x_paso, x_dire, 0, pasosX / 2);
    if (abortarMovimiento) break;
    moverY(0, pasosY);
  }
  if (!abortarMovimiento) {
    repeticionesCompletadas++;
    publicarRepeticiones();
  }
  digitalWrite(ENABLE_MOTORES, HIGH);
}

void espiral() {
  Serial.println("Espiral (Supinacion)");
  publicarEstadoSesion("Ejecutando: Espiral (Supinacion)");
  int px = pasosX;
  int py = pasosY;
  while (px > 200 && py > 120 && !abortarMovimiento) {
    moverMotor(x_paso, x_dire, 1, px);
    if (abortarMovimiento) break;
    moverY(1, py);
    if (abortarMovimiento) break;
    px -= 200;
    py -= 120;
    moverMotor(x_paso, x_dire, 0, px);
    if (abortarMovimiento) break;
    moverY(0, py);
    px -= 200;
    py -= 120;
  }
  if (!abortarMovimiento) {
    repeticionesCompletadas++;
    publicarRepeticiones();
  }
  digitalWrite(ENABLE_MOTORES, HIGH);
}

/* ======================================================================
   SELECTOR DE FIGURA SEGÚN TIPO DE TERAPIA
   ====================================================================== */
void ejecutarFigura(String tipoTerapia) {
  sesionActiva = true;
  abortarMovimiento = false;
  repeticionesCompletadas = 0;
  tiempoPausadoAcumulado = 0;
  lcdEnPausaMostrada = false;

  publicarRepeticiones();

  tipoTerapia.toLowerCase();
  terapiaSolicitada = tipoTerapia;
  indiceTerapiaLCD = indiceDeTerapia(tipoTerapia);

  publicarEstadoSesion("Sesion iniciada");

  estadoLCD = LCD_INICIANDO;
  delay(1500);
  tiempoInicioSesion = millis();
  estadoLCD = LCD_SESION;

  while (!abortarMovimiento) {
    if (tipoTerapia == "flexion") rectangulo();
    else if (tipoTerapia == "extension") zigzag();
    else if (tipoTerapia == "pronacion") ocho();
    else if (tipoTerapia == "supinacion") espiral();
    else {
      publicarEstadoSesion("Tipo de terapia no reconocido");
      break;
    }
    atenderRed();
    leerYPublicarEmg();
  }

  publicarEstadoSesion("Sesion finalizada");

  estadoLCD = LCD_FINALIZADA;
  delay(2500);
  estadoLCD = mqttClient.connected() ? LCD_CONECTADA : LCD_CONECTANDO;

  sesionActiva = false;
  abortarMovimiento = false;
  duracionSesionMs = DURACION_POR_DEFECTO_MS;
}
