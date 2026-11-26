/* MOTRIX — red.cpp (ver red.h) */
#include "red.h"
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include "esp_system.h"
#include <strings.h>
#include "seguridad.h"
#include "portal_html.h"

namespace Red {

static const uint8_t PIN_BOOT = 0;                     // botón BOOT de la placa
static const unsigned long ESPERA_INICIAL_MS = 30000;  // intento al encender antes de abrir el portal
static const unsigned long SIN_RED_MS = 60000;         // corte de red en funcionamiento
static const unsigned long REINTENTO_GUARDADA_MS = 120000;
static const unsigned long PORTAL_INACTIVO_MS = 600000; // cierre automático si ya hay red

static Preferences prefs;
static WebServer servidor(80);
static DNSServer dns;
static const IPAddress IP_AP(192, 168, 4, 1);

static char idDispositivo[41] = "";
static char apNombre[33] = "";
static char apClave[9] = "";
static char ssidGuardado[33] = "";
static char passGuardado[65] = "";
static char ssidPrueba[33] = "";
static char passPrueba[65] = "";
static char mensajePortal[96] = "";

static bool portal = false;
static bool rutasRegistradas = false;
static EstadoPortal estadoPortal = PORTAL_INACTIVO;
static unsigned long inicioIntento = 0;
static unsigned long inicioPrueba = 0;
static unsigned long portalDesde = 0;
static unsigned long ultimaActividadPortal = 0;
static unsigned long cierreProgramado = 0;
static unsigned long desconectadoDesde = 0;
static unsigned long ultimoReintento = 0;
static unsigned long bootPresionadoDesde = 0;
static bool arranqueResuelto = false;

/* ------------------------------ NVS ------------------------------ */
static void cargarGuardada() {
  prefs.begin("motrix-red", true);
  String s = prefs.getString("ssid", "");
  String p = prefs.getString("pass", "");
  prefs.end();
  strncpy(ssidGuardado, s.c_str(), sizeof(ssidGuardado) - 1);
  strncpy(passGuardado, p.c_str(), sizeof(passGuardado) - 1);
}

static void guardar(const char* ssid, const char* pass) {
  prefs.begin("motrix-red", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
  strncpy(ssidGuardado, ssid, sizeof(ssidGuardado) - 1);
  ssidGuardado[sizeof(ssidGuardado) - 1] = '\0';
  strncpy(passGuardado, pass, sizeof(passGuardado) - 1);
  passGuardado[sizeof(passGuardado) - 1] = '\0';
}

bool hayRedGuardada() { return ssidGuardado[0] != '\0'; }
bool conectada() { return WiFi.status() == WL_CONNECTED; }
bool portalActivo() { return portal; }
String ssidActual() { return conectada() ? WiFi.SSID() : String(""); }
const char* nombrePuntoAcceso() { return apNombre; }
const char* clavePuntoAcceso() { return apClave; }
EstadoPortal estadoDelPortal() { return estadoPortal; }

/* --------------------------- utilidades --------------------------- */
static String jsonEscapar(const String& s) {
  String out;
  out.reserve(s.length() + 8);
  for (size_t i = 0; i < s.length(); i++) {
    char c = s[i];
    if (c == '"' || c == '\\') { out += '\\'; out += c; }
    else if ((uint8_t)c < 0x20) { char b[7]; snprintf(b, sizeof(b), "\\u%04x", (uint8_t)c); out += b; }
    else out += c;
  }
  return out;
}

static bool esperarConexion(unsigned long maxMs) {
  unsigned long inicio = millis();
  while (millis() - inicio < maxMs) {
    wl_status_t st = WiFi.status();
    if (st == WL_CONNECTED) return true;
    if ((st == WL_CONNECT_FAILED || st == WL_NO_SSID_AVAIL) && millis() - inicio > 4000) return false;
    delay(250);
  }
  return WiFi.status() == WL_CONNECTED;
}

static const char* motivoFallo(wl_status_t st) {
  if (st == WL_NO_SSID_AVAIL) return "no se encontró la red";
  if (st == WL_CONNECT_FAILED) return "la contraseña parece incorrecta";
  return "tiempo de espera agotado";
}

/* ----------------------------- Portal ----------------------------- */
static bool redirigirSiOtroHost() {
  // Portal cautivo: cualquier dominio solicitado se redirige al portal.
  String host = servidor.hostHeader();
  if (host.length() && host != IP_AP.toString() && host != String(apNombre) + ".local") {
    servidor.sendHeader("Location", String("http://") + IP_AP.toString() + "/", true);
    servidor.send(302, "text/plain", "");
    return true;
  }
  return false;
}

static void responderJson(int codigo, const String& cuerpo) {
  servidor.sendHeader("Cache-Control", "no-store");
  servidor.send(codigo, "application/json; charset=utf-8", cuerpo);
}

static void rutaInicio() {
  ultimaActividadPortal = millis();
  if (redirigirSiOtroHost()) return;
  servidor.sendHeader("Cache-Control", "no-store");
  servidor.sendHeader("X-Frame-Options", "DENY");
  servidor.send_P(200, "text/html; charset=utf-8", PORTAL_HTML);
}

static void rutaEscanear() {
  ultimaActividadPortal = millis();
  int n = WiFi.scanNetworks(false, false);
  String json = "{\"id\":\"" + jsonEscapar(idDispositivo) + "\",\"redes\":[";
  int escritas = 0;
  for (int i = 0; i < n && escritas < 25; i++) {
    String ssid = WiFi.SSID(i);
    if (!ssid.length()) continue;
    bool repetida = false;
    for (int j = 0; j < i; j++) if (WiFi.SSID(j) == ssid) { repetida = true; break; }
    if (repetida) continue;
    if (escritas++) json += ",";
    json += "{\"ssid\":\"" + jsonEscapar(ssid) + "\",\"rssi\":" + String(WiFi.RSSI(i)) +
            ",\"segura\":" + String(WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "false" : "true") + "}";
  }
  json += "]}";
  WiFi.scanDelete();
  responderJson(200, json);
}

static void rutaConectar() {
  ultimaActividadPortal = millis();
  String ssid = servidor.arg("ssid");
  String pass = servidor.arg("pass");
  if (ssid.length() < 1 || ssid.length() > 32) return responderJson(400, "{\"ok\":false,\"msg\":\"El nombre de la red debe tener entre 1 y 32 caracteres.\"}");
  if (pass.length() != 0 && (pass.length() < 8 || pass.length() > 63)) return responderJson(400, "{\"ok\":false,\"msg\":\"La contraseña debe tener entre 8 y 63 caracteres.\"}");
  strncpy(ssidPrueba, ssid.c_str(), sizeof(ssidPrueba) - 1);
  ssidPrueba[sizeof(ssidPrueba) - 1] = '\0';
  strncpy(passPrueba, pass.c_str(), sizeof(passPrueba) - 1);
  passPrueba[sizeof(passPrueba) - 1] = '\0';
  Seguridad::borrar((void*)pass.c_str(), pass.length());
  responderJson(200, "{\"ok\":true}");
  // Se prueba la red sin cerrar el punto de acceso para poder informar el resultado.
  WiFi.disconnect(false, false);
  delay(100);
  WiFi.begin(ssidPrueba, passPrueba);
  inicioPrueba = millis();
  estadoPortal = PORTAL_PROBANDO;
  snprintf(mensajePortal, sizeof(mensajePortal), "Probando la conexión…");
  Serial.printf("[Red] Portal: probando la red \"%s\"\n", ssidPrueba);
}

static void rutaEstado() {
  ultimaActividadPortal = millis();
  const char* est = "esperando";
  if (estadoPortal == PORTAL_PROBANDO) est = "probando";
  else if (estadoPortal == PORTAL_CONECTADO) est = "conectado";
  else if (estadoPortal == PORTAL_ERROR) est = "error";
  String json = String("{\"estado\":\"") + est + "\",\"msg\":\"" + jsonEscapar(mensajePortal) +
                "\",\"ssid\":\"" + jsonEscapar(estadoPortal == PORTAL_CONECTADO ? String(ssidGuardado) : String(ssidPrueba)) +
                "\",\"ip\":\"" + (conectada() ? WiFi.localIP().toString() : String("")) +
                "\",\"guardada\":\"" + jsonEscapar(ssidGuardado) + "\"}";
  responderJson(200, json);
}

static void registrarRutas() {
  if (rutasRegistradas) return;
  servidor.on("/", HTTP_GET, rutaInicio);
  servidor.on("/scan", HTTP_GET, rutaEscanear);
  servidor.on("/conectar", HTTP_POST, rutaConectar);
  servidor.on("/estado", HTTP_GET, rutaEstado);
  // Direcciones que usan Android, iOS y Windows para detectar portales cautivos.
  const char* deteccion[] = { "/generate_204", "/gen_204", "/hotspot-detect.html", "/library/test/success.html",
                              "/connecttest.txt", "/ncsi.txt", "/redirect", "/fwlink", "/canonical.html" };
  for (const char* r : deteccion) servidor.on(r, HTTP_ANY, []() {
    servidor.sendHeader("Location", String("http://") + IP_AP.toString() + "/", true);
    servidor.send(302, "text/plain", "");
  });
  servidor.onNotFound([]() {
    servidor.sendHeader("Location", String("http://") + IP_AP.toString() + "/", true);
    servidor.send(302, "text/plain", "");
  });
  rutasRegistradas = true;
}

void abrirPortal() {
  if (portal) return;
  if (strncasecmp(idDispositivo, "MOTRIX", 6) == 0) snprintf(apNombre, sizeof(apNombre), "%s", idDispositivo);
  else snprintf(apNombre, sizeof(apNombre), "MOTRIX-%s", idDispositivo);
  // Clave nueva en cada apertura: solo la ve quien tiene el equipo delante (LCD).
  snprintf(apClave, sizeof(apClave), "%08lu", (unsigned long)(esp_random() % 100000000UL));

  WiFi.mode(WIFI_AP_STA);
  WiFi.softAPConfig(IP_AP, IP_AP, IPAddress(255, 255, 255, 0));
  WiFi.softAP(apNombre, apClave);
  dns.setErrorReplyCode(DNSReplyCode::NoError);
  dns.start(53, "*", IP_AP);
  registrarRutas();
  servidor.begin();
  portal = true;
  portalDesde = ultimaActividadPortal = millis();
  estadoPortal = PORTAL_ESPERANDO;
  mensajePortal[0] = '\0';
  cierreProgramado = 0;
  Serial.printf("[Red] Punto de acceso abierto: \"%s\"  clave: %s  →  http://192.168.4.1\n", apNombre, apClave);
}

void cerrarPortal() {
  if (!portal) return;
  servidor.stop();
  dns.stop();
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_STA);
  portal = false;
  estadoPortal = PORTAL_INACTIVO;
  Seguridad::borrar(passPrueba, sizeof(passPrueba));
  Seguridad::borrar(apClave, sizeof(apClave));
  Serial.println("[Red] Punto de acceso cerrado.");
}

/* ------------------------- Ciclo principal ------------------------- */
void iniciar(const char* deviceId, const char* ssidInicial, const char* passInicial) {
  strncpy(idDispositivo, deviceId, sizeof(idDispositivo) - 1);
  pinMode(PIN_BOOT, INPUT_PULLUP);
  WiFi.persistent(false);          // las credenciales las gestiona este módulo (NVS propio)
  static String host = String("motrix-") + deviceId;
  host.toLowerCase();
  WiFi.setHostname(host.c_str());  // debe ir antes de WiFi.mode()
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  cargarGuardada();
  // Migración desde el firmware original: si config.h trae una red y la NVS está vacía.
  if (!hayRedGuardada() && ssidInicial && ssidInicial[0]) {
    guardar(ssidInicial, passInicial ? passInicial : "");
    Serial.println("[Red] Red inicial de config.h guardada en la memoria del equipo.");
  }

  if (hayRedGuardada()) {
    Serial.printf("[Red] Conectando a la red guardada \"%s\"…\n", ssidGuardado);
    WiFi.begin(ssidGuardado, passGuardado);
    inicioIntento = millis();
  } else {
    Serial.println("[Red] No hay red guardada.");
    arranqueResuelto = true;
    abrirPortal();
  }
}

static void revisarBotonBoot() {
  if (digitalRead(PIN_BOOT) == LOW) {
    if (!bootPresionadoDesde) bootPresionadoDesde = millis();
    else if (millis() - bootPresionadoDesde > 3000 && !portal) {
      Serial.println("[Red] BOOT mantenido 3 s: abriendo portal de configuración.");
      abrirPortal();
    }
  } else {
    bootPresionadoDesde = 0;
  }
}

static void avanzarPrueba() {
  if (estadoPortal != PORTAL_PROBANDO) return;
  wl_status_t st = WiFi.status();
  unsigned long t = millis() - inicioPrueba;
  if (st == WL_CONNECTED) {
    guardar(ssidPrueba, passPrueba);
    Seguridad::borrar(passPrueba, sizeof(passPrueba));
    estadoPortal = PORTAL_CONECTADO;
    snprintf(mensajePortal, sizeof(mensajePortal), "Conectado. IP %s", WiFi.localIP().toString().c_str());
    cierreProgramado = millis() + 20000;   // tiempo para que el celular vea el resultado
    Serial.printf("[Red] Portal: conectado a \"%s\"; red guardada.\n", ssidGuardado);
  } else if (((st == WL_CONNECT_FAILED || st == WL_NO_SSID_AVAIL) && t > 4000) || t > 20000) {
    estadoPortal = PORTAL_ERROR;
    snprintf(mensajePortal, sizeof(mensajePortal), "No se pudo conectar: %s.", motivoFallo(st));
    WiFi.disconnect(false, false);
    Serial.printf("[Red] Portal: fallo al conectar a \"%s\" (%s).\n", ssidPrueba, motivoFallo(st));
  }
}

void loop(bool sesionActiva) {
  revisarBotonBoot();
  unsigned long ahora = millis();

  if (portal) {
    dns.processNextRequest();
    servidor.handleClient();
    avanzarPrueba();
    if (cierreProgramado && ahora > cierreProgramado) cerrarPortal();
    // Si ya hay red y nadie usa el portal durante 10 min, se cierra.
    else if (conectada() && estadoPortal != PORTAL_PROBANDO && WiFi.softAPgetStationNum() == 0 &&
             ahora - ultimaActividadPortal > PORTAL_INACTIVO_MS) cerrarPortal();
    // Tras un corte de luz el router puede tardar más que la ESP32: se reintenta
    // la red guardada cada 2 min mientras nadie esté conectado al portal.
    else if (!conectada() && hayRedGuardada() && estadoPortal == PORTAL_ESPERANDO &&
             WiFi.softAPgetStationNum() == 0 && ahora - ultimoReintento > REINTENTO_GUARDADA_MS) {
      ultimoReintento = ahora;
      WiFi.begin(ssidGuardado, passGuardado);
      if (esperarConexion(10000)) { Serial.println("[Red] Red guardada disponible de nuevo."); cerrarPortal(); }
    }
    return;
  }

  if (conectada()) {
    desconectadoDesde = 0;
    arranqueResuelto = true;
    return;
  }
  if (!arranqueResuelto) {
    if (ahora - inicioIntento > ESPERA_INICIAL_MS) {
      arranqueResuelto = true;
      Serial.println("[Red] No se pudo conectar a la red guardada en 30 s.");
      if (!sesionActiva) abrirPortal();
    }
    return;
  }
  if (!desconectadoDesde) desconectadoDesde = ahora;
  if (ahora - desconectadoDesde > SIN_RED_MS && !sesionActiva) {
    Serial.println("[Red] Sin red durante 60 s: abriendo portal de configuración.");
    abrirPortal();
  }
}

bool cambiarRed(const char* ssid, const char* pass, char* mensaje, size_t maxMensaje) {
  char ssidAnterior[33], passAnterior[65];
  strncpy(ssidAnterior, ssidGuardado, sizeof(ssidAnterior));
  strncpy(passAnterior, passGuardado, sizeof(passAnterior));

  Serial.printf("[Red] Cambio remoto: probando \"%s\"…\n", ssid);
  WiFi.disconnect(false, false);
  delay(200);
  WiFi.begin(ssid, pass);
  bool ok = esperarConexion(20000);
  wl_status_t st = WiFi.status();
  if (ok) {
    guardar(ssid, pass);
    snprintf(mensaje, maxMensaje, "Conectado a %s", ssid);
  } else {
    snprintf(mensaje, maxMensaje, "No se pudo conectar a %s (%s); se restauró %s", ssid, motivoFallo(st),
             ssidAnterior[0] ? ssidAnterior : "la configuración anterior");
    WiFi.disconnect(false, false);
    delay(200);
    if (ssidAnterior[0]) {
      WiFi.begin(ssidAnterior, passAnterior);
      if (!esperarConexion(20000)) Serial.println("[Red] Atención: tampoco se pudo volver a la red anterior; se abrirá el portal si no se recupera.");
    }
  }
  Seguridad::borrar(passAnterior, sizeof(passAnterior));
  desconectadoDesde = 0;
  arranqueResuelto = true;
  Serial.printf("[Red] %s\n", mensaje);
  return ok;
}

}  // namespace Red
