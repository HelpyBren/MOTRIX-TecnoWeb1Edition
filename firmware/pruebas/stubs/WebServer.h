#pragma once
#include "WiFi.h"
#include <functional>
enum HTTPMethod { HTTP_ANY, HTTP_GET, HTTP_POST };
struct WebServer {
  WebServer(int) {}
  void on(const char*, HTTPMethod, std::function<void()>) {} void onNotFound(std::function<void()>) {}
  void begin() {} void stop() {} void handleClient() {}
  String arg(const char*) { return String(); } String hostHeader() { return String(); }
  void sendHeader(const char*, const String&, bool = false) {} void send(int, const char*, const String&) {} void send(int, const char*, const char*) {}
  void send_P(int, const char*, const char*) {}
};
