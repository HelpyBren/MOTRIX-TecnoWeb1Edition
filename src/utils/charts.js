/* ======================================================================
   MOTRIX — charts.js
   Gráfica en tiempo real de la señal EMG (y RMS) utilizando Chart.js.
   Los datos llegan vía MQTT (mqtt.js) y se agregan aquí como una
   ventana deslizante de tiempo (30 / 60 / 120 segundos).
   ====================================================================== */

const MotrixCharts = (function () {
  "use strict";

  let chart = null;
  let ventanaSegundos = 30;
  // Asumimos ~10 muestras/segundo publicadas por la ESP32 como referencia visual
  const MUESTRAS_POR_SEGUNDO = 10;

  function maxPuntos() {
    return ventanaSegundos * MUESTRAS_POR_SEGUNDO;
  }

  /* ------------------------------------------------------------------
     Inicializa el gráfico EMG sobre el canvas #emgChart
     ------------------------------------------------------------------ */
  function init() {
    const canvas = document.getElementById("emgChart");
    if (!canvas || typeof Chart === "undefined") return;

    const ctx = canvas.getContext("2d");

    // Gradiente de relleno bajo la curva EMG
    const gradienteEmg = ctx.createLinearGradient(0, 0, 0, 260);
    gradienteEmg.addColorStop(0, "rgba(11, 95, 255, 0.28)");
    gradienteEmg.addColorStop(1, "rgba(11, 95, 255, 0)");

    const gradienteRms = ctx.createLinearGradient(0, 0, 0, 260);
    gradienteRms.addColorStop(0, "rgba(18, 199, 184, 0.22)");
    gradienteRms.addColorStop(1, "rgba(18, 199, 184, 0)");

    chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "EMG (mV)",
            data: [],
            borderColor: "#0B5FFF",
            backgroundColor: gradienteEmg,
            borderWidth: 2.2,
            pointRadius: 0,
            tension: 0.35,
            fill: true,
          },
          {
            label: "RMS (mV)",
            data: [],
            borderColor: "#12C7B8",
            backgroundColor: gradienteRms,
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.35,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 }, // sin animación para telemetría en vivo fluida
        interaction: { mode: "nearest", intersect: false },
        scales: {
          x: {
            display: true,
            grid: { display: false },
            ticks: {
              color: "#94A3B8",
              maxTicksLimit: 8,
              font: { family: "JetBrains Mono", size: 10 },
            },
          },
          y: {
            display: true,
            grid: { color: "rgba(11, 31, 58, 0.06)" },
            ticks: {
              color: "#94A3B8",
              font: { family: "JetBrains Mono", size: 10 },
            },
          },
        },
        plugins: {
          legend: { display: false }, // usamos la leyenda HTML propia
          tooltip: {
            backgroundColor: "#0B1F3A",
            titleFont: { family: "Inter", size: 11 },
            bodyFont: { family: "JetBrains Mono", size: 11 },
            padding: 10,
            cornerRadius: 8,
          },
        },
      },
    });
  }

  /* ------------------------------------------------------------------
     Agrega un nuevo punto de EMG (y opcionalmente RMS) a la gráfica
     ------------------------------------------------------------------ */
  function agregarPuntoEmg(valorEmg, valorRms) {
    if (!chart) return;

    const ahora = new Date();
    const etiqueta = ahora.toLocaleTimeString("es-BO", {
      minute: "2-digit",
      second: "2-digit",
    });

    chart.data.labels.push(etiqueta);
    chart.data.datasets[0].data.push(valorEmg);
    chart.data.datasets[1].data.push(valorRms !== undefined ? valorRms : null);

    const limite = maxPuntos();
    while (chart.data.labels.length > limite) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
      chart.data.datasets[1].data.shift();
    }

    chart.update("none"); // "none" evita animación en cada frame para máxima fluidez
  }

  /* ------------------------------------------------------------------
     Cambia el rango de tiempo visible (30 / 60 / 120 s)
     ------------------------------------------------------------------ */
  function setRango(segundos) {
    ventanaSegundos = Number(segundos) || 30;
    if (!chart) return;
    const limite = maxPuntos();
    while (chart.data.labels.length > limite) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
      chart.data.datasets[1].data.shift();
    }
    chart.update();
  }

  /* ------------------------------------------------------------------
     Limpia todos los puntos de la gráfica
     ------------------------------------------------------------------ */
  function limpiar() {
    if (!chart) return;
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.data.datasets[1].data = [];
    chart.update();
  }

  return { init, agregarPuntoEmg, setRango, limpiar };
})();