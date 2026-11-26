/* ======================================================================
   MOTRIX — seguridad.h
   Verificación de comandos firmados (HMAC-SHA256), descifrado de la
   contraseña WiFi y un lector JSON mínimo para mensajes planos.
   Este módulo no depende de Arduino: se prueba también en una
   computadora (ver firmware/pruebas/).
   El formato es el mismo que genera server/services/deviceCrypto.js.
   ====================================================================== */
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace Seguridad {

// HMAC-SHA256 (mbedtls en la ESP32, OpenSSL en las pruebas de PC).
void hmacSha256(const uint8_t* clave, size_t claveLen, const uint8_t* msg, size_t msgLen, uint8_t salida[32]);

// Convierte texto hexadecimal a bytes. Devuelve false si no es válido o no cabe.
bool hexABytes(const char* hex, uint8_t* salida, size_t maxLen, size_t* len);

// Comparación en tiempo constante.
bool iguales(const uint8_t* a, const uint8_t* b, size_t n);

// h == HMAC(clave, a|c|s|p|n|t)
bool firmaValida(const uint8_t clave[32], const char* a, const char* c, const char* s,
                 const char* p, const char* n, long long t, const char* hHex);

// Descifra la contraseña WiFi (XOR con HMAC(clave, "enc|" + n + "|" + i)).
// Escribe un texto terminado en '\0'. Devuelve false si no cabe o el hex es inválido.
bool descifrar(const uint8_t clave[32], const char* nonceHex, const char* pHex, char* salida, size_t maxLen);

// Lee el valor de texto de "clave" en un objeto JSON plano (sin anidar).
// Decodifica secuencias de escape, incluidas \uXXXX (a UTF-8).
bool jsonTexto(const char* json, const char* clave, char* salida, size_t maxLen);

// Lee un número entero de "clave" en un objeto JSON plano.
bool jsonEntero(const char* json, const char* clave, long long* valor);

// Borra un búfer de forma que el compilador no lo optimice.
void borrar(void* p, size_t n);

}  // namespace Seguridad
