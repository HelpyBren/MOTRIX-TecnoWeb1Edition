#pragma once
#include "WiFiClientSecure.h"
#include <functional>
struct PubSubClient {
  PubSubClient(WiFiClientSecure&) {}
  void setServer(const char*, int) {} void setCallback(void (*)(char*, uint8_t*, unsigned int)) {}
  bool setBufferSize(uint16_t) { return true; } void setKeepAlive(uint16_t) {}
  bool connect(const char*, const char*, const char*, const char*, uint8_t, bool, const char*) { return false; }
  bool connected() { return false; } bool loop() { return true; } int state() { return 0; } void disconnect() {}
  bool publish(const char*, const char*) { return true; } bool publish(const char*, const char*, bool) { return true; }
  bool subscribe(const char*) { return true; } bool subscribe(const char*, uint8_t) { return true; }
};
