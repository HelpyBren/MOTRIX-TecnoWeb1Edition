// Stub mínimo de Arduino para COMPROBAR SINTAXIS del firmware en una PC.
// No emula el hardware: solo declara las APIs que usa MOTRIX.
#pragma once
#include <cstdint>
#include <cstddef>
#include <cstring>
#include <cstdio>
#include <cstdlib>
#include <strings.h>
#include <string>
typedef uint8_t byte; typedef bool boolean;
#define PROGMEM
#define PGM_P const char*
#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define SERIAL_8N1 0
class String {
 public:
  std::string s;
  String() {} String(const char* c) : s(c ? c : "") {} String(const std::string& x) : s(x) {}
  String(int v) : s(std::to_string(v)) {} String(long v) : s(std::to_string(v)) {} String(unsigned long v) : s(std::to_string(v)) {}
  String(char c) : s(1, c) {}
  size_t length() const { return s.size(); } const char* c_str() const { return s.c_str(); }
  void reserve(size_t n) { s.reserve(n); } char operator[](size_t i) const { return s[i]; }
  String& operator+=(const String& o) { s += o.s; return *this; } String& operator+=(const char* o) { s += o; return *this; } String& operator+=(char c) { s += c; return *this; }
  bool operator==(const String& o) const { return s == o.s; } bool operator!=(const String& o) const { return s != o.s; }
  bool operator==(const char* o) const { return s == o; }
  int indexOf(char c) const { auto p = s.find(c); return p == std::string::npos ? -1 : (int)p; }
  String substring(size_t a) const { return String(s.substr(a)); } String substring(size_t a, size_t b) const { return String(s.substr(a, b - a)); }
  long toInt() const { return atol(s.c_str()); } void toLowerCase() { for (auto& c : s) c = (char)tolower(c); }
};
inline String operator+(const String& a, const String& b) { return String(a.s + b.s); }
inline String operator+(const String& a, const char* b) { return String(a.s + b); }
inline String operator+(const char* a, const String& b) { return String(std::string(a) + b.s); }
inline String operator+(const String& a, char b) { return String(a.s + b); }
struct HardwareSerial {
  void begin(unsigned long, int = 0, int = 0, int = 0) {} void setTimeout(unsigned long) {}
  int available() { return 0; } int read() { return 0; } float parseFloat() { return 0; }
  void print(const char*) {} void print(const String&) {} void print(int) {}
  void println(const char* = "") {} void println(const String&) {} int printf(const char*, ...) { return 0; }
};
extern HardwareSerial Serial, Serial2;
unsigned long millis(); void delay(unsigned long); void delayMicroseconds(unsigned int);
void pinMode(int, int); void digitalWrite(int, int); int digitalRead(int);
char* dtostrf(double, signed char, unsigned char, char*);
struct EspClass { void restart() {} }; extern EspClass ESP;
typedef void* TaskHandle_t; typedef void (*TaskFunction_t)(void*);
int xTaskCreatePinnedToCore(TaskFunction_t, const char*, int, void*, int, TaskHandle_t*, int);
void vTaskDelay(int); inline int pdMS_TO_TICKS(int x) { return x; }
void configTime(long, int, const char*, const char* = nullptr, const char* = nullptr);
