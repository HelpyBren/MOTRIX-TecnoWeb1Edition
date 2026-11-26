#pragma once
#include "WiFi.h"
enum class DNSReplyCode { NoError };
struct DNSServer { void setErrorReplyCode(DNSReplyCode) {} bool start(uint16_t, const char*, IPAddress) { return true; } void stop() {} void processNextRequest() {} };
