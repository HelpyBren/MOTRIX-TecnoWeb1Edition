// MOTRIX — Prueba en PC del módulo seguridad.cpp (el mismo código que corre en la ESP32).
// Lee comandos JSON (uno por línea) generados por el servidor y verifica que
// la firma, el descifrado y la lectura del JSON coinciden.
//   g++ -std=c++17 -I../motrix_esp32 prueba_seguridad.cpp ../motrix_esp32/seguridad.cpp -lcrypto -o prueba
//   ./prueba <DEVICE_KEY hex> < comandos.jsonl
#include <cstdio>
#include <cstring>
#include <iostream>
#include <string>
#include "seguridad.h"

int main(int argc, char** argv) {
  if (argc < 2) { fprintf(stderr, "uso: prueba <clave hex>\n"); return 2; }
  uint8_t clave[32]; size_t n = 0;
  if (!Seguridad::hexABytes(argv[1], clave, 32, &n) || n != 32) { fprintf(stderr, "clave inválida\n"); return 2; }
  std::string linea;
  while (std::getline(std::cin, linea)) {
    char a[16] = "", c[41] = "", s[132] = "", p[132] = "", no[40] = "", h[70] = ""; long long t = 0;
    const char* j = linea.c_str();
    bool formato = Seguridad::jsonTexto(j, "a", a, sizeof a) && Seguridad::jsonTexto(j, "c", c, sizeof c) &&
                   Seguridad::jsonTexto(j, "n", no, sizeof no) && Seguridad::jsonTexto(j, "h", h, sizeof h) &&
                   Seguridad::jsonEntero(j, "t", &t);
    Seguridad::jsonTexto(j, "s", s, sizeof s);
    Seguridad::jsonTexto(j, "p", p, sizeof p);
    if (!formato) { printf("formato\n"); continue; }
    if (!Seguridad::firmaValida(clave, a, c, s, p, no, t, h)) { printf("firma\n"); continue; }
    char pass[80] = "";
    if (p[0] && !Seguridad::descifrar(clave, no, p, pass, sizeof pass)) { printf("descifrado\n"); continue; }
    printf("ok\t%s\t%s\t%s\n", a, s, pass);
  }
  return 0;
}
