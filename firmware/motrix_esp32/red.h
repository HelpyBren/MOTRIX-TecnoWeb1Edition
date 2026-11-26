/* ======================================================================
   MOTRIX — red.h
   Conexión WiFi sin credenciales en el código:
     * Las credenciales se guardan en la memoria NVS de la ESP32
       (Preferences, espacio "motrix-red").
     * Si no hay red guardada, si no logra conectarse en 30 s al encender,
       o si se mantiene presionado BOOT 3 s, abre un punto de acceso
       "MOTRIX-<ID>" protegido con una clave aleatoria de 8 dígitos que
       se muestra en la LCD, y un portal web en http://192.168.4.1
     * Cambio remoto: prueba una red nueva y, si falla, vuelve a la anterior.
   ====================================================================== */
#pragma once
#include <Arduino.h>

namespace Red {

enum EstadoPortal { PORTAL_INACTIVO, PORTAL_ESPERANDO, PORTAL_PROBANDO, PORTAL_CONECTADO, PORTAL_ERROR };

void iniciar(const char* deviceId, const char* ssidInicial, const char* passInicial);
void loop(bool sesionActiva);          // llamar en cada vuelta de loop()
bool conectada();
bool portalActivo();
void abrirPortal();
void cerrarPortal();
String ssidActual();
bool hayRedGuardada();

// Datos para la pantalla LCD (copias estáticas, seguras para leer desde otro núcleo).
const char* nombrePuntoAcceso();
const char* clavePuntoAcceso();
EstadoPortal estadoDelPortal();

// Cambio de red remoto (bloqueante, hasta ~45 s). Devuelve true si quedó en la red nueva.
// En `mensaje` deja un texto para la plataforma. Nunca registra la contraseña.
bool cambiarRed(const char* ssid, const char* pass, char* mensaje, size_t maxMensaje);

}  // namespace Red
