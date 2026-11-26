#pragma once
#include "Arduino.h"
#include "IPAddress.h"
typedef enum { WL_IDLE_STATUS, WL_NO_SSID_AVAIL, WL_SCAN_COMPLETED, WL_CONNECTED, WL_CONNECT_FAILED, WL_CONNECTION_LOST, WL_DISCONNECTED } wl_status_t;
typedef enum { WIFI_AUTH_OPEN, WIFI_AUTH_WPA2_PSK } wifi_auth_mode_t;
typedef enum { WIFI_OFF, WIFI_STA, WIFI_AP, WIFI_AP_STA } wifi_mode_t;
struct WiFiClass {
  void persistent(bool) {} bool mode(wifi_mode_t) { return true; } bool setAutoReconnect(bool) { return true; } bool setHostname(const char*) { return true; }
  wl_status_t begin(const char*, const char* = nullptr) { return WL_IDLE_STATUS; } wl_status_t status() { return WL_IDLE_STATUS; }
  bool disconnect(bool = false, bool = false) { return true; } String SSID() { return String(); } String SSID(int) { return String(); }
  int RSSI() { return 0; } int RSSI(int) { return 0; } wifi_auth_mode_t encryptionType(int) { return WIFI_AUTH_OPEN; }
  int scanNetworks(bool = false, bool = false) { return 0; } void scanDelete() {}
  bool softAPConfig(IPAddress, IPAddress, IPAddress) { return true; } bool softAP(const char*, const char* = nullptr) { return true; }
  bool softAPdisconnect(bool = false) { return true; } int softAPgetStationNum() { return 0; }
  IPAddress localIP() { return IPAddress(); } String macAddress() { return String(); }
};
extern WiFiClass WiFi;
