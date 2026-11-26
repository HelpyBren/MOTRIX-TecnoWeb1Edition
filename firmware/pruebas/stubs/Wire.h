#pragma once
struct TwoWire { bool begin(int, int) { return true; } }; extern TwoWire Wire;
