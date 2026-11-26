/* MOTRIX — seguridad.cpp (ver seguridad.h) */
#include "seguridad.h"
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

#if defined(ARDUINO) || defined(ESP_PLATFORM)
  #include "mbedtls/md.h"
#else
  #include <openssl/hmac.h>
  #include <openssl/evp.h>
#endif

namespace Seguridad {

void hmacSha256(const uint8_t* clave, size_t claveLen, const uint8_t* msg, size_t msgLen, uint8_t salida[32]) {
#if defined(ARDUINO) || defined(ESP_PLATFORM)
  mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), clave, claveLen, msg, msgLen, salida);
#else
  unsigned int len = 32;
  HMAC(EVP_sha256(), clave, (int)claveLen, msg, msgLen, salida, &len);
#endif
}

static int valorHex(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

bool hexABytes(const char* hex, uint8_t* salida, size_t maxLen, size_t* len) {
  size_t n = strlen(hex);
  if (n % 2 != 0 || n / 2 > maxLen) return false;
  for (size_t i = 0; i < n / 2; i++) {
    int hi = valorHex(hex[2 * i]), lo = valorHex(hex[2 * i + 1]);
    if (hi < 0 || lo < 0) return false;
    salida[i] = (uint8_t)((hi << 4) | lo);
  }
  if (len) *len = n / 2;
  return true;
}

bool iguales(const uint8_t* a, const uint8_t* b, size_t n) {
  uint8_t dif = 0;
  for (size_t i = 0; i < n; i++) dif |= a[i] ^ b[i];
  return dif == 0;
}

void borrar(void* p, size_t n) {
  volatile uint8_t* v = (volatile uint8_t*)p;
  while (n--) *v++ = 0;
}

bool firmaValida(const uint8_t clave[32], const char* a, const char* c, const char* s,
                 const char* p, const char* n, long long t, const char* hHex) {
  // Longitudes máximas: a 16, c 40, s 32*4 (UTF-8), p 63*2, n 64, t 20 + separadores.
  char msg[512];
  int len = snprintf(msg, sizeof(msg), "%s|%s|%s|%s|%s|%lld", a, c, s, p, n, t);
  if (len <= 0 || len >= (int)sizeof(msg)) return false;
  uint8_t esperado[32], recibido[32];
  size_t rlen = 0;
  if (!hexABytes(hHex, recibido, sizeof(recibido), &rlen) || rlen != 32) return false;
  hmacSha256(clave, 32, (const uint8_t*)msg, (size_t)len, esperado);
  return iguales(esperado, recibido, 32);
}

bool descifrar(const uint8_t clave[32], const char* nonceHex, const char* pHex, char* salida, size_t maxLen) {
  size_t n = 0;
  if (strlen(pHex) / 2 + 1 > maxLen) return false;
  if (!hexABytes(pHex, (uint8_t*)salida, maxLen - 1, &n)) return false;
  uint8_t bloque[32];
  char entrada[96];
  for (size_t i = 0; i < n; i += 32) {
    int l = snprintf(entrada, sizeof(entrada), "enc|%s|%u", nonceHex, (unsigned)(i / 32));
    if (l <= 0 || l >= (int)sizeof(entrada)) return false;
    hmacSha256(clave, 32, (const uint8_t*)entrada, (size_t)l, bloque);
    for (size_t j = 0; j < 32 && i + j < n; j++) salida[i + j] ^= (char)bloque[j];
  }
  salida[n] = '\0';
  borrar(bloque, sizeof(bloque));
  return true;
}

/* ---------------- Lector JSON mínimo (objetos planos) ---------------- */
static const char* saltarEspacios(const char* p) {
  while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
  return p;
}

// Busca "clave": y devuelve el puntero al inicio del valor, o nullptr.
static const char* buscarValor(const char* json, const char* clave) {
  size_t k = strlen(clave);
  const char* p = json;
  while ((p = strchr(p, '"')) != nullptr) {
    // Solo se consideran claves (seguidas de ':'), saltando valores de texto.
    const char* ini = p + 1;
    const char* fin = ini;
    while (*fin && *fin != '"') { if (*fin == '\\' && fin[1]) fin++; fin++; }
    if (!*fin) return nullptr;
    const char* trasComillas = saltarEspacios(fin + 1);
    if (*trasComillas == ':') {
      if ((size_t)(fin - ini) == k && strncmp(ini, clave, k) == 0) return saltarEspacios(trasComillas + 1);
      p = trasComillas + 1;
      // Si el valor es texto, se salta completo para no confundirlo con una clave.
      const char* v = saltarEspacios(p);
      if (*v == '"') {
        v++;
        while (*v && *v != '"') { if (*v == '\\' && v[1]) v++; v++; }
        if (!*v) return nullptr;
        p = v + 1;
      }
    } else {
      p = fin + 1;
    }
  }
  return nullptr;
}

static size_t escribirUtf8(uint32_t cp, char* out) {
  if (cp < 0x80) { out[0] = (char)cp; return 1; }
  if (cp < 0x800) { out[0] = (char)(0xC0 | (cp >> 6)); out[1] = (char)(0x80 | (cp & 0x3F)); return 2; }
  if (cp < 0x10000) { out[0] = (char)(0xE0 | (cp >> 12)); out[1] = (char)(0x80 | ((cp >> 6) & 0x3F)); out[2] = (char)(0x80 | (cp & 0x3F)); return 3; }
  out[0] = (char)(0xF0 | (cp >> 18)); out[1] = (char)(0x80 | ((cp >> 12) & 0x3F));
  out[2] = (char)(0x80 | ((cp >> 6) & 0x3F)); out[3] = (char)(0x80 | (cp & 0x3F)); return 4;
}

static bool leerHex4(const char* p, uint32_t* v) {
  *v = 0;
  for (int i = 0; i < 4; i++) { int h = valorHex(p[i]); if (h < 0) return false; *v = (*v << 4) | (uint32_t)h; }
  return true;
}

bool jsonTexto(const char* json, const char* clave, char* salida, size_t maxLen) {
  const char* p = buscarValor(json, clave);
  if (!p || *p != '"' || maxLen == 0) return false;
  p++;
  size_t o = 0;
  while (*p && *p != '"') {
    char tmp[4];
    size_t n = 1;
    if (*p == '\\') {
      p++;
      switch (*p) {
        case '"': tmp[0] = '"'; break;
        case '\\': tmp[0] = '\\'; break;
        case '/': tmp[0] = '/'; break;
        case 'b': tmp[0] = '\b'; break;
        case 'f': tmp[0] = '\f'; break;
        case 'n': tmp[0] = '\n'; break;
        case 'r': tmp[0] = '\r'; break;
        case 't': tmp[0] = '\t'; break;
        case 'u': {
          uint32_t cp;
          if (!leerHex4(p + 1, &cp)) return false;
          p += 4;
          if (cp >= 0xD800 && cp <= 0xDBFF && p[1] == '\\' && p[2] == 'u') {
            uint32_t bajo;
            if (!leerHex4(p + 3, &bajo) || bajo < 0xDC00 || bajo > 0xDFFF) return false;
            cp = 0x10000 + ((cp - 0xD800) << 10) + (bajo - 0xDC00);
            p += 6;
          }
          n = escribirUtf8(cp, tmp);
          break;
        }
        default: return false;
      }
    } else {
      tmp[0] = *p;
    }
    if (o + n >= maxLen) return false;
    memcpy(salida + o, tmp, n);
    o += n;
    p++;
  }
  if (*p != '"') return false;
  salida[o] = '\0';
  return true;
}

bool jsonEntero(const char* json, const char* clave, long long* valor) {
  const char* p = buscarValor(json, clave);
  if (!p || !(*p == '-' || (*p >= '0' && *p <= '9'))) return false;
  char* fin = nullptr;
  long long v = strtoll(p, &fin, 10);
  if (fin == p) return false;
  *valor = v;
  return true;
}

}  // namespace Seguridad
