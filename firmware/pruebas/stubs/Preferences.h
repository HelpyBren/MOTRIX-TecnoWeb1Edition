#pragma once
#include "Arduino.h"
struct Preferences { bool begin(const char*, bool = false) { return true; } void end() {} String getString(const char*, const char* d) { return String(d); } size_t putString(const char*, const char*) { return 0; } };
