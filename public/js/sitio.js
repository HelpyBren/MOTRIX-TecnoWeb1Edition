/* ======================================================================
   MOTRIX — sitio.js (portada)
   Menú móvil, pestañas de la cadena tecnológica y enlace de acceso
   según haya o no una sesión iniciada.
   ====================================================================== */
(function () {
  "use strict";

  /* ---------------------- Cadena tecnológica ---------------------- */
  // Contenido verificado en el código fuente del proyecto (firmware y servidor).
  const ETAPAS = [
    {
      titulo: "Sensores EMG",
      texto: "Electrodos de superficie colocados en brazo y antebrazo captan la actividad eléctrica de los músculos mientras el paciente sigue el movimiento del equipo.",
      puntos: ["Electromiografía de superficie, no invasiva", "Se registra la señal de ambos brazos durante la sesión"],
    },
    {
      titulo: "Acondicionamiento de la señal",
      texto: "Un módulo SpikerBox y un Arduino filtran y suavizan la señal muscular. El resultado, la envolvente de activación, se envía a la ESP32 por puerto serie.",
      puntos: ["Comunicación UART a 115 200 baudios (Serial2)", "La ESP32 recibe valores ya procesados, listos para publicar"],
    },
    {
      titulo: "ESP32",
      texto: "El microcontrolador mueve los tres motores paso a paso según la terapia elegida, muestra el estado en una pantalla LCD y publica la telemetría de la sesión.",
      puntos: ["Controladores A4988 para los motores", "Pantalla LCD 16×2 en un núcleo dedicado para no interferir con los motores", "Publica EMG, RMS, fuerza estimada, repeticiones y estado"],
    },
    {
      titulo: "Comunicación inalámbrica",
      texto: "La ESP32 se conecta por WiFi a un broker MQTT en la nube mediante una conexión cifrada. La red WiFi se configura desde un punto de acceso propio del equipo, sin reprogramarlo.",
      puntos: ["MQTT sobre TLS (HiveMQ Cloud)", "Tópicos <code>motrix/&lt;paciente&gt;/emg</code>, <code>rms</code>, <code>repeticiones</code>…", "Comandos firmados para cambiar la red de forma remota"],
    },
    {
      titulo: "Servidor y base de datos",
      texto: "Un servidor Node.js recibe la telemetría, controla quién puede ver y operar cada dato y guarda pacientes y sesiones en una base de datos SQLite.",
      puntos: ["Express y Prisma ORM", "Contraseñas cifradas con scrypt y sesiones protegidas", "Registro de auditoría de accesos y exportaciones"],
    },
    {
      titulo: "Plataforma web",
      texto: "El fisioterapeuta inicia la sesión, sigue la señal en directo, consulta el historial de cada paciente y exporta los registros a Excel.",
      puntos: ["Gráficas en tiempo real con Chart.js", "Filtros por fecha, paciente, terapia y dispositivo", "Funciona en computadora, tableta y celular"],
    },
  ];

  const panel = document.getElementById("panel-cadena");
  const tabs = Array.from(document.querySelectorAll('.cadena__paso [role="tab"]'));

  function mostrar(i, enfocar) {
    const e = ETAPAS[i];
    tabs.forEach((t, j) => {
      const activa = i === j;
      t.setAttribute("aria-selected", String(activa));
      t.tabIndex = activa ? 0 : -1;
    });
    panel.setAttribute("aria-labelledby", tabs[i].id);
    panel.innerHTML = `<h3>${e.titulo}</h3><p>${e.texto}</p><ul>${e.puntos.map((p) => `<li>${p}</li>`).join("")}</ul>`;
    if (enfocar) tabs[i].focus();
  }

  if (panel && tabs.length) {
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => mostrar(i));
      t.addEventListener("keydown", (ev) => {
        const idx = tabs.indexOf(ev.currentTarget);
        if (["ArrowDown", "ArrowRight"].includes(ev.key)) { ev.preventDefault(); mostrar((idx + 1) % tabs.length, true); }
        if (["ArrowUp", "ArrowLeft"].includes(ev.key)) { ev.preventDefault(); mostrar((idx - 1 + tabs.length) % tabs.length, true); }
        if (ev.key === "Home") { ev.preventDefault(); mostrar(0, true); }
        if (ev.key === "End") { ev.preventDefault(); mostrar(tabs.length - 1, true); }
      });
    });
    mostrar(0);
  }

  /* --------------------------- Menú móvil --------------------------- */
  const boton = document.getElementById("menuMovil");
  const nav = document.getElementById("nav");
  if (boton && nav) {
    boton.addEventListener("click", () => {
      const abierto = nav.classList.toggle("abierto");
      boton.setAttribute("aria-expanded", String(abierto));
    });
    nav.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => {
      nav.classList.remove("abierto");
      boton.setAttribute("aria-expanded", "false");
    }));
  }

  /* ----------------------- Borde de la cabecera ----------------------- */
  const cabecera = document.getElementById("cabecera");
  const marcar = () => cabecera && cabecera.classList.toggle("con-borde", window.scrollY > 8);
  window.addEventListener("scroll", marcar, { passive: true });
  marcar();

  const anio = document.getElementById("anio");
  if (anio) anio.textContent = String(new Date().getFullYear());

  /* ------------- Si ya hay sesión, los accesos van al panel ------------- */
  fetch("/api/auth/me", { credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || !d.usuario) return;
      document.querySelectorAll("[data-enlace-acceso]").forEach((a) => {
        a.href = "dashboard.html";
        if (a.classList.contains("btn")) a.textContent = "Ir al panel";
      });
    })
    .catch(() => {});
})();
