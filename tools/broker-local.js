#!/usr/bin/env node
/* ======================================================================
   MOTRIX — Broker MQTT local para desarrollo y pruebas (sin HiveMQ).
   Uso:  node tools/broker-local.js [puerto]
   Luego en .env:  MQTT_URL=mqtt://localhost:1883
   Solo para pruebas en tu computadora: no usa TLS ni contraseña.
   ====================================================================== */
"use strict";
const net = require("net");
const aedes = require("aedes")();
const puerto = Number(process.argv[2] || process.env.BROKER_PORT || 1883);
net.createServer(aedes.handle).listen(puerto, () => console.log(`[broker-local] MQTT escuchando en mqtt://localhost:${puerto}`));
aedes.on("client", (c) => console.log(`[broker-local] cliente conectado: ${c.id}`));
aedes.on("clientDisconnect", (c) => console.log(`[broker-local] cliente desconectado: ${c.id}`));
