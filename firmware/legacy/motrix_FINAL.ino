// VERSIÓN ORIGINAL (solo referencia). Usa firmware/motrix_esp32/. Las credenciales reales fueron retiradas.
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

/* ======================================================================
   CONFIGURACIÓN — EDITA ESTOS VALORES (deben coincidir con js/mqtt.js)
   ====================================================================== */
const char* WIFI_SSID      = "TU_RED_WIFI";      // (dato real retirado por seguridad)
const char* WIFI_PASSWORD  = "TU_CONTRASEÑA";   // (dato real retirado por seguridad)

const char* MQTT_HOST      = "xxxxxxxx.s1.eu.hivemq.cloud"; // (dato real retirado)
const int   MQTT_PORT      = 8883; // Puerto MQTT/TLS para dispositivos (el navegador usa 8884/WSS)
const char* MQTT_USER      = "TU_USUARIO";
const char* MQTT_PASSWORD  = "TU_CONTRASEÑA";
const char* MQTT_CLIENT_ID = "ESP32-MOTRIX-MOTORES";

const char* PACIENTE_ID    = "paciente1"; // Debe coincidir con "pacienteTopic" del dashboard


//==============================
// MOTORES
//==============================
// eje y
#define x_paso   2
#define x_dire   15

//eje x der
#define x2_paso  18
#define x2_dire  5

//eje x izq
#define x3_paso  25
#define x3_dire  26

// ENABLE común para los tres A4988
#define ENABLE_MOTORES 4

//==============================
// PANTALLA LCD I2C 16x2
//==============================
#define LCD_SDA 21
#define LCD_SCL 22   // Distinto del GPIO22 por defecto, que ya usa x3_dire
#define LCD_DIRECCION 0x27  // Cambia a 0x3F si tu módulo no responde en 0x27
LiquidCrystal_I2C lcd(LCD_DIRECCION, 16, 2);

//==============================
// SEÑAL EMG (SpikerBox + optoacoplador)
//==============================
#define PIN_EMG 39           // Pin ADC de solo lectura, libre del resto del cableado
const float ADC_MAX = 4095.0; // Resolución del ADC del ESP32 (12 bits)
const float VREF_MV = 3300.0; // Referencia ~3.3V del ESP32, en milivoltios

// Si tu señal EMG llega con ruido de base (offset DC) que no es cero,
// ajusta este valor leyendo analogRead(PIN_EMG) en reposo y poniéndolo aquí.
int offsetEmg = 0;

const int TAM_BUFFER_RMS = 10; // muestras usadas para calcular el RMS
float bufferEmg[TAM_BUFFER_RMS];
int indiceBufferEmg = 0;

unsigned long ultimoEnvioEmg = 0;
const unsigned long INTERVALO_EMG_MS = 100; // ~10 muestras/segundo, igual que espera el dashboard

//==============================
// PARÁMETROS DE MOVIMIENTO
//==============================
int retardo = 1000;          // microsegundos entre pasos: controla la velocidad
int pasosX = 1450;
int pasosY = 800;
int vueltasPorFigura = 1;    // cuántas veces se repite el trazo dentro de rectangulo()

//==============================
// DURACIÓN DE LA SESIÓN (para el conteo regresivo en la LCD)
//==============================
// Ajusta este valor a la duración real que quiera el fisioterapeuta.
// Al llegar a 0 la sesión se corta automáticamente (igual que si llegara "stop").
const unsigned long DURACION_SESION_MS = 5UL * 60UL * 1000UL; // 5 minutos

unsigned long tiempoInicioSesion = 0;     // millis() al arrancar la sesión
unsigned long tiempoPausadoAcumulado = 0; // ms acumulados en pausa (no cuentan para el conteo)
unsigned long tiempoInicioPausa = 0;      // millis() en el que empezó la pausa actual
bool lcdEnPausaMostrada = false;          // evita recalcular tiempoInicioPausa en cada vuelta

//==============================
// ESTADO DE LA LCD (leído por la tarea del Núcleo 0, escrito por el
// código de motores del Núcleo 1). Son variables simples de 32 bits,
// por eso basta con "volatile" y no hace falta un mutex para este caso.
//==============================
enum EstadoLCD { LCD_CONECTANDO, LCD_CONECTADA, LCD_INICIANDO, LCD_SESION, LCD_PAUSADA, LCD_FINALIZADA };
volatile EstadoLCD estadoLCD = LCD_CONECTANDO;
volatile int indiceTerapiaLCD = -1; // 0=flexion, 1=extension, 2=pronacion, 3=supinacion
TaskHandle_t tareaLCDHandle = NULL;

//==============================
// ESTADO DE SESIÓN (controlado por MQTT)
//==============================
volatile bool solicitarInicio = false; // se pone en true al recibir "start"
volatile bool abortarMovimiento = false; // se pone en true al recibir "stop"
volatile bool pausado = false;           // se pone en true al recibir velocidad "0"
String terapiaSolicitada = "flexion";
bool sesionActiva = false;
int repeticionesCompletadas = 0;

WiFiClientSecure wifiClientSecure;
PubSubClient mqttClient(wifiClientSecure);

/* ======================================================================
   TÓPICOS MQTT
   ====================================================================== */
String topicReps, topicEstado, topicCmdStart, topicCmdStop, topicCmdVelocidad, topicCmdCalibrar, topicRssi;
String topicEmg, topicRms, topicFuerza;

void construirTopicos() {
  String base = "motrix/" + String(PACIENTE_ID);
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
}

/* ======================================================================
   SETUP
   ====================================================================== */
void setup() {
  Serial.begin(115200);
  Serial2.begin(115200, SERIAL_8N1, 16, 17); // Inicializa RX2 en pin 16
  pinMode(x_paso, OUTPUT);
  pinMode(x_dire, OUTPUT);
  pinMode(x2_paso, OUTPUT);
  pinMode(x2_dire, OUTPUT);
  pinMode(x3_paso, OUTPUT);
  pinMode(x3_dire, OUTPUT);
  pinMode(ENABLE_MOTORES, OUTPUT);
  digitalWrite(ENABLE_MOTORES, HIGH); // deshabilitado al inicio

  // --- LCD: se inicializa el bus I2C, pero el DIBUJADO corre en una
  // tarea aparte fija en el Núcleo 0 (ver tareaLCD), para que nunca
  // interfiera con el timing de los motores en el Núcleo 1 ---
  Wire.begin(LCD_SDA, LCD_SCL);
  lcd.init();
  lcd.backlight();

  xTaskCreatePinnedToCore(
    tareaLCD,        // función de la tarea
    "TareaLCD",      // nombre (solo para depuración)
    4096,            // tamaño de stack
    NULL,            // parámetro (no se usa)
    1,               // prioridad baja
    &tareaLCDHandle, // handle de la tarea
    0                // Núcleo 0 (loop() y los motores corren en el Núcleo 1)
  );

  construirTopicos();
  conectarWifi();

  for (int i = 0; i < TAM_BUFFER_RMS; i++) bufferEmg[i] = 0;

  // NOTA: setInsecure() omite la verificación del certificado TLS.
  // Aceptable para pruebas; en producción usa el certificado raíz real.
  wifiClientSecure.setInsecure();

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);
  mqttClient.setCallback(alRecibirMensaje);

  Serial.println("====================");
  Serial.println("Modo manual (Serial) disponible:");
  Serial.println("1 -> Rectangulo (Flexion)");
  Serial.println("2 -> Zigzag (Extension)");
  Serial.println("3 -> Ocho (Pronacion)");
  Serial.println("4 -> Espiral (Supinacion)");
  Serial.println("====================");
}

/* ======================================================================
   LOOP PRINCIPAL
   ====================================================================== */
unsigned long ultimoHeartbeat = 0;
const unsigned long INTERVALO_HEARTBEAT_MS = 4000;

void loop() {
  if (WiFi.status() != WL_CONNECTED) conectarWifi();
  if (!mqttClient.connected()) conectarMqtt();
  mqttClient.loop();

  // --- Heartbeat: mantiene al dashboard viendo la ESP32 como "conectada" aunque esté inactiva ---
  unsigned long ahora = millis();
  if (ahora - ultimoHeartbeat >= INTERVALO_HEARTBEAT_MS) {
    ultimoHeartbeat = ahora;
    mqttClient.publish(topicRssi.c_str(), String(WiFi.RSSI()).c_str());
  }

  // --- Señal EMG: se lee y publica constantemente, incluso sin sesión activa ---
  leerYPublicarEmg();

  // --- Prueba manual por Serial (además de MQTT) ---
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

  // --- Solicitud de inicio recibida por MQTT ---
  if (solicitarInicio && !sesionActiva) {
    solicitarInicio = false;
    ejecutarFigura(terapiaSolicitada);
  }
}

/* ======================================================================
   LECTURA DE LA SEÑAL EMG (SpikerBox -> optoacoplador -> GPIO34)
   Se auto-limita a ~10 lecturas/segundo (INTERVALO_EMG_MS) para no
   saturar el broker ni frenar el movimiento de los motores.
   ====================================================================== */
void leerYPublicarEmg() {
  // Solo procesamos si hay datos listos en el puerto Serial2 (desde el Arduino)
  if (Serial2.available() > 0) {
    // Leemos el valor enviado por el Arduino como un número decimal (float)
    float emgProcesado = Serial2.parseFloat();

    // Filtramos lecturas raras o vacías
    if (emgProcesado < 0.0) emgProcesado = 0.0;

    // Publicar la señal EMG procesada directamente a HiveMQ
    char buffer[10];
    dtostrf(emgProcesado, 4, 1, buffer);
    mqttClient.publish(topicEmg.c_str(), buffer);

    // Como el Arduino ya filtró y suavizó la señal, el valor recibido
    // ya equivale directamente al "RMS" o envolvente de fuerza.
    mqttClient.publish(topicRms.c_str(), buffer);

    // Fuerza estimada proporcional (rango orientativo 0-10 N)
    // Ajusta el divisor (ej. 300.0) según las contracciones de tus pruebas
    float fuerza = (emgProcesado / 300.0) * 10.0; 
    if (fuerza > 10.0) fuerza = 10.0;
    
    dtostrf(fuerza, 4, 1, buffer);
    mqttClient.publish(topicFuerza.c_str(), buffer);
  }
}

/* ======================================================================
   LCD — FUNCIONES AUXILIARES (puras, sin tocar la LCD ni los motores)
   ====================================================================== */

// Rellena/recorta el texto a 16 caracteres para que no queden residuos
// de la pantalla anterior al sobreescribir una línea.
String padALinea(String texto) {
  if (texto.length() > 16) return texto.substring(0, 16);
  while (texto.length() < 16) texto += ' ';
  return texto;
}

// Convierte el índice de terapia a un nombre legible.
String nombreTerapiaPorIndice(int idx) {
  switch (idx) {
    case 0: return "Flexion";
    case 1: return "Extension";
    case 2: return "Pronacion";
    case 3: return "Supinacion";
    default: return "Terapia";
  }
}

// "flexion" -> 0, "extension" -> 1, etc. -1 si no se reconoce.
int indiceDeTerapia(String tipo) {
  if (tipo == "flexion")    return 0;
  if (tipo == "extension")  return 1;
  if (tipo == "pronacion")  return 2;
  if (tipo == "supinacion") return 3;
  return -1;
}

// Convierte segundos -> "MM:SS"
String formatearTiempo(unsigned long segundosTotales) {
  unsigned int minutos = segundosTotales / 60;
  unsigned int segundos = segundosTotales % 60;
  char buffer[6];
  sprintf(buffer, "%02u:%02u", minutos, segundos);
  return String(buffer);
}

// Chequeo puramente aritmético (nada de I2C) para cortar la sesión sola
// cuando se acaba el tiempo asignado. Se llama desde el código de
// motores, así que debe ser instantáneo.
void verificarTiempoSesion() {
  if (!sesionActiva || pausado) return;
  unsigned long transcurrido = millis() - tiempoInicioSesion - tiempoPausadoAcumulado;
  if (transcurrido >= DURACION_SESION_MS) {
    abortarMovimiento = true;
  }
}

/* ======================================================================
   TAREA DE LCD — corre fija en el Núcleo 0, totalmente aparte del
   Núcleo 1 donde viven loop() y el movimiento de motores. Es la ÚNICA
   parte del programa que llama a lcd.print()/lcd.clear(). Se despierta
   cada ~300 ms, mira en qué estado está la sesión (estadoLCD) y dibuja
   solo si algo cambió, para no mandar I2C de más.
   ====================================================================== */
void tareaLCD(void *parametroNoUsado) {
  EstadoLCD estadoAnterior = (EstadoLCD)-1; // fuerza el primer dibujo
  int terapiaAnterior = -2;
  long segundoAnterior = -1;

  for (;;) {
    EstadoLCD estado = estadoLCD;     // copia local: no volvemos a leer la variable volatile varias veces
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
          segundoAnterior = -1; // fuerza refrescar la línea del tiempo también
        }

        unsigned long transcurrido = millis() - tiempoInicioSesion - tiempoPausadoAcumulado;
        long restanteMs = (long)DURACION_SESION_MS - (long)transcurrido;
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
    vTaskDelay(pdMS_TO_TICKS(300)); // ritmo de refresco de la pantalla, no de los motores
  }
}

/* ======================================================================
   CONEXIÓN WIFI
   ====================================================================== */
void conectarWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.print("Conectando a WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 15000) {
    delay(400);
    Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? "\nWiFi conectado." : "\nNo se pudo conectar, se reintentará.");
}

/* ======================================================================
   CONEXIÓN MQTT
   ====================================================================== */
void conectarMqtt() {
  while (!mqttClient.connected()) {
    Serial.print("Conectando a HiveMQ Cloud...");
    if (mqttClient.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASSWORD)) {
      Serial.println(" conectado.");
      mqttClient.subscribe(topicCmdStart.c_str());
      mqttClient.subscribe(topicCmdStop.c_str());
      mqttClient.subscribe(topicCmdVelocidad.c_str());
      mqttClient.subscribe(topicCmdCalibrar.c_str());
      mqttClient.publish(topicEstado.c_str(), "ESP32 (motores) conectada y lista");
      estadoLCD = LCD_CONECTADA; // solo cambia una variable; la tarea del Núcleo 0 la dibuja
    } else {
      Serial.print(" fallo, rc="); Serial.print(mqttClient.state());
      Serial.println(" reintentando en 3s");
      delay(3000);
    }
  }
}

/* ======================================================================
   CALLBACK — Comandos recibidos desde el dashboard
   ====================================================================== */
void alRecibirMensaje(char* topic, byte* payload, unsigned int length) {
  String mensaje;
  for (unsigned int i = 0; i < length; i++) mensaje += (char)payload[i];
  String topicStr = String(topic);
  Serial.println("Mensaje [" + topicStr + "]: " + mensaje);

  if (topicStr == topicCmdStart) {
    mensaje.toLowerCase();
    terapiaSolicitada = mensaje;
    abortarMovimiento = false;
    pausado = false;
    solicitarInicio = true; // el movimiento real se dispara en loop(), no aquí
  }
  else if (topicStr == topicCmdStop) {
    abortarMovimiento = true;
    pausado = false; // libera cualquier espera de pausa para poder abortar
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
    // Pequeño movimiento de ida y vuelta para confirmar que los motores responden
    if (!sesionActiva) {
      digitalWrite(ENABLE_MOTORES, LOW);
      delay(2);
      moverMotor(x_paso, x_dire, 1, 100);
      moverMotor(x_paso, x_dire, 0, 100);
      digitalWrite(ENABLE_MOTORES, HIGH);
      mqttClient.publish(topicEstado.c_str(), "Calibracion completa");
    }
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

    // Pausa: espera sin dejar de escuchar MQTT, hasta reanudar o abortar
    while (pausado && !abortarMovimiento) {
      if (!lcdEnPausaMostrada) {
        estadoLCD = LCD_PAUSADA; // solo una asignación: la dibuja la tarea del Núcleo 0
        lcdEnPausaMostrada = true;
        tiempoInicioPausa = millis();
      }
      mqttClient.loop();
      delay(50);
    }
    if (lcdEnPausaMostrada) {
      // El tiempo pausado no cuenta para el conteo regresivo de la sesión
      tiempoPausadoAcumulado += millis() - tiempoInicioPausa;
      lcdEnPausaMostrada = false;
      estadoLCD = LCD_SESION; // vuelve a mostrar el contador
    }
    if (abortarMovimiento) break;

    digitalWrite(pasoPin, HIGH);
    delayMicroseconds(retardo);
    digitalWrite(pasoPin, LOW);
    delayMicroseconds(retardo);

    // Cada cierto número de pasos, atendemos MQTT y EMG, y chequeamos el
    // tiempo de sesión (pura aritmética, cero I2C, cero interferencia
    // con los motores). El DIBUJADO de la LCD lo hace su propia tarea.
    if (i % 40 == 0) {
      mqttClient.loop();
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

/* ======================================================================
   FIGURAS DE REHABILITACIÓN
   ====================================================================== */
void rectangulo() {
  Serial.println("Rectangulo (Flexion)");
  mqttClient.publish(topicEstado.c_str(), "Ejecutando: Rectangulo (Flexion)");

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
      mqttClient.publish(topicReps.c_str(), String(repeticionesCompletadas).c_str());
    }
  }
  digitalWrite(ENABLE_MOTORES, HIGH);
}

void zigzag() {
  Serial.println("Zigzag (Extension)");
  mqttClient.publish(topicEstado.c_str(), "Ejecutando: Zigzag (Extension)");

  int secciones = 6;
  for (int i = 0; i < secciones && !abortarMovimiento; i++) {
    moverMotor(x_paso, x_dire, i % 2, pasosX / secciones);
    if (abortarMovimiento) break;
    moverY(1, pasosY / secciones);
  }

  if (!abortarMovimiento) {
    moverY(0, pasosY);
    repeticionesCompletadas++;
    mqttClient.publish(topicReps.c_str(), String(repeticionesCompletadas).c_str());
  }
  digitalWrite(ENABLE_MOTORES, HIGH);
}

void ocho() {
  Serial.println("Ocho (Pronacion)");
  mqttClient.publish(topicEstado.c_str(), "Ejecutando: Ocho (Pronacion)");

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
    mqttClient.publish(topicReps.c_str(), String(repeticionesCompletadas).c_str());
  }
  digitalWrite(ENABLE_MOTORES, HIGH);
}

void espiral() {
  Serial.println("Espiral (Supinacion)");
  mqttClient.publish(topicEstado.c_str(), "Ejecutando: Espiral (Supinacion)");

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
    mqttClient.publish(topicReps.c_str(), String(repeticionesCompletadas).c_str());
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

  mqttClient.publish(topicReps.c_str(), "0");

  tipoTerapia.toLowerCase();
  terapiaSolicitada = tipoTerapia;
  indiceTerapiaLCD = indiceDeTerapia(tipoTerapia); // solo un entero; lo dibuja la tarea del Núcleo 0

  mqttClient.publish(topicEstado.c_str(), "Sesion iniciada");

  // --- LCD: "Iniciando terapia: <tipo>" (los motores siguen deshabilitados aquí) ---
  estadoLCD = LCD_INICIANDO;
  delay(1500);

  tiempoInicioSesion = millis();

  // --- LCD: a partir de aquí, muestra el contador regresivo ---
  estadoLCD = LCD_SESION;

  while (!abortarMovimiento) {

    if (tipoTerapia == "flexion") {
      rectangulo();
    }
    else if (tipoTerapia == "extension") {
      zigzag();
    }
    else if (tipoTerapia == "pronacion") {
      ocho();
    }
    else if (tipoTerapia == "supinacion") {
      espiral();
    }
    else {
      mqttClient.publish(topicEstado.c_str(), "Tipo de terapia no reconocido");
      break;
    }

    mqttClient.loop();
    leerYPublicarEmg();
  }

  mqttClient.publish(topicEstado.c_str(), "Sesion finalizada");

  // --- LCD: "Sesion terminada", luego vuelve a "Maquina conectada" ---
  estadoLCD = LCD_FINALIZADA;
  delay(2500);
  estadoLCD = LCD_CONECTADA;

  sesionActiva = false;
  abortarMovimiento = false;
}
