#pragma once
#include "Arduino.h"
struct IPAddress { IPAddress() {} IPAddress(int, int, int, int) {} String toString() const { return String("0.0.0.0"); } };
