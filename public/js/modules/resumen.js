/* ======================================================================
   MOTRIX — módulo Resumen (panel principal)
   Indicadores y gráficas calculados por el servidor a partir de la base
   de datos real (/api/estadisticas/resumen). No se muestran valores
   inventados: si no hay datos, se dice.
   ====================================================================== */
window.MotrixViews = window.MotrixViews || {};
window.MotrixViews.resumen = function (container, h) {
  let dias = 30;
  let grafica = null;

  async function cargar() {
    let datos, disp;
    try {
      [datos, disp] = await Promise.all([
        MotrixApi.get(`/estadisticas/resumen?dias=${dias}`),
        MotrixApi.get("/dispositivos"),
      ]);
    } catch (e) {
      container.innerHTML = `<div class="module-view"><div class="module-card empty-state">No se pudo cargar el resumen: ${h.esc(e.message)}</div></div>`;
      return;
    }
    pintar(datos, disp);
  }

  function pintar(d, disp) {
    const t = d.totales;
    const sinAsignar = h.esAdmin ? "" : `<p class="muted nota">Ves los pacientes asignados a tu cuenta y las sesiones que registraste.</p>`;
    container.innerHTML = `
      <div class="module-view resumen">
        <div class="module-header">
          <div>
            <h1>Hola, ${h.esc(h.usuario.nombre.split(" ")[0])}</h1>
            <p>Actividad registrada en la base de datos de MOTRIX.</p>
            ${sinAsignar}
          </div>
          <div class="acciones-cabecera">
            <button class="module-btn" data-ir="historial">Exportar a Excel</button>
            <button class="module-btn primary" data-ir="dashboard">Abrir monitor en vivo</button>
          </div>
        </div>

        <section class="kpis" aria-label="Totales">
          <div class="kpi"><span class="kpi__valor">${t.pacientes}</span><span class="kpi__etiqueta">Pacientes${h.esAdmin ? "" : " asignados"}</span></div>
          <div class="kpi"><span class="kpi__valor">${t.sesiones}</span><span class="kpi__etiqueta">Sesiones registradas</span></div>
          <div class="kpi"><span class="kpi__valor">${t.minutosTerapia.toLocaleString("es-BO")}</span><span class="kpi__etiqueta">Minutos de terapia</span></div>
          <div class="kpi"><span class="kpi__valor">${t.repeticiones.toLocaleString("es-BO")}</span><span class="kpi__etiqueta">Repeticiones</span></div>
          <div class="kpi"><span class="kpi__valor">${t.dispositivosEnLinea}<small> / ${t.dispositivos}</small></span><span class="kpi__etiqueta">Equipos en línea</span></div>
        </section>

        <div class="resumen__grid">
          <section class="module-card resumen__actividad">
            <div class="tarjeta-cabecera">
              <div>
                <h2>Sesiones por día</h2>
                <p class="muted">${t.sesionesEnRango} ${t.sesionesEnRango === 1 ? "sesión" : "sesiones"} de ${t.pacientesActivosEnRango} ${t.pacientesActivosEnRango === 1 ? "paciente" : "pacientes"} · ${formatoDia(d.rango.desde)} – ${formatoDia(d.rango.hasta)}</p>
              </div>
              <div class="segmentado" role="group" aria-label="Periodo">
                ${[7, 30, 90].map((n) => `<button type="button" data-dias="${n}" aria-pressed="${n === dias}">${n} días</button>`).join("")}
              </div>
            </div>
            <div class="grafica-alto"><canvas id="graficaDias" aria-label="Gráfica de barras: sesiones por día" role="img"></canvas></div>
            ${t.sesionesEnRango === 0 ? `<p class="empty-inline">No hay sesiones en este periodo.</p>` : ""}
          </section>

          <section class="module-card">
            <h2>Sesiones por terapia</h2>
            ${d.porTerapia.length ? `<ul class="barras">${barrasTerapia(d.porTerapia)}</ul>` : `<p class="empty-inline">Sin sesiones en el periodo.</p>`}
          </section>

          <section class="module-card">
            <div class="tarjeta-cabecera">
              <h2>Equipos</h2>
              <button class="link-btn" data-ir="dispositivos">Gestionar</button>
            </div>
            ${equipos(disp)}
          </section>

          <section class="module-card resumen__ultimas">
            <div class="tarjeta-cabecera">
              <h2>Últimas sesiones</h2>
              <button class="link-btn" data-ir="historial">Ver historial</button>
            </div>
            ${ultimas(d.ultimas)}
          </section>
        </div>
      </div>`;

    container.querySelectorAll("[data-ir]").forEach((b) => b.addEventListener("click", () => h.irA(b.dataset.ir)));
    container.querySelectorAll("[data-dias]").forEach((b) => b.addEventListener("click", () => { dias = Number(b.dataset.dias); cargar(); }));
    dibujarGrafica(d.porDia);
  }

  function formatoDia(ymd) {
    const [y, m, dd] = ymd.split("-").map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString("es-BO", { day: "numeric", month: "short" });
  }

  function barrasTerapia(lista) {
    const max = Math.max(...lista.map((x) => x.sesiones));
    return lista.map((x) => `
      <li>
        <span class="barras__nombre">${h.esc(x.terapia)}</span>
        <span class="barras__pista"><span class="barras__relleno" style="width:${Math.max(4, (x.sesiones / max) * 100)}%"></span></span>
        <span class="barras__valor">${x.sesiones}</span>
      </li>`).join("");
  }

  function equipos(disp) {
    if (!disp.dispositivos.length) {
      return `<p class="empty-inline">Todavía no hay equipos registrados.${h.esAdmin ? " Regístralos en Dispositivos para ver su estado aquí." : ""}</p>`;
    }
    const broker = disp.broker.conectado ? "" : `<p class="aviso-linea">El servidor no está conectado al broker MQTT: el estado puede no estar actualizado.</p>`;
    return broker + `<ul class="lista-equipos">${disp.dispositivos.map((x) => `
      <li>
        <span class="estado-punto ${x.enLinea ? "on" : "off"}" aria-hidden="true"></span>
        <span><strong>${h.esc(x.nombre)}</strong><small>${h.esc(x.codigo)} · ${x.enLinea ? "En línea" : `Sin señal (última: ${h.hace(x.ultimaConexion)})`}</small></span>
      </li>`).join("")}</ul>`;
  }

  function ultimas(lista) {
    if (!lista.length) return `<p class="empty-inline">Cuando se guarde la primera sesión aparecerá aquí.</p>`;
    return `<div class="table-wrap"><table class="motrix-table compacta"><thead><tr><th scope="col">Fecha</th><th scope="col">Paciente</th><th scope="col">Terapia</th><th scope="col" class="num">Duración</th><th scope="col" class="num">Reps.</th></tr></thead><tbody>
      ${lista.map((s) => `<tr><td>${h.formatearFecha(s.fecha)}</td><td>${h.esc(s.pacienteNombre)}</td><td>${h.esc(s.terapia || "—")}</td><td class="num">${h.formatearSeg(s.duracionSeg)}</td><td class="num">${s.repeticiones}</td></tr>`).join("")}
    </tbody></table></div>`;
  }

  function dibujarGrafica(porDia) {
    const canvas = document.getElementById("graficaDias");
    if (!canvas || typeof Chart === "undefined") return;
    if (grafica) grafica.destroy();
    grafica = new Chart(canvas, {
      type: "bar",
      data: {
        labels: porDia.map((x) => formatoDia(x.dia)),
        datasets: [{
          label: "Sesiones",
          data: porDia.map((x) => x.sesiones),
          backgroundColor: "#2a978f",
          hoverBackgroundColor: "#1d6f69",
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: "bottom",
          maxBarThickness: 22,
          categoryPercentage: 0.8,
          barPercentage: 0.9,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#13283b", padding: 10, cornerRadius: 6, displayColors: false,
            callbacks: {
              title: (items) => items[0].label,
              label: (item) => {
                const f = porDia[item.dataIndex];
                return [`${f.sesiones} sesión(es)`, `${f.minutos} min de terapia`, `${f.repeticiones} repeticiones`];
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#5b6f80", maxRotation: 0, autoSkipPadding: 12, font: { family: "Figtree", size: 11 } } },
          y: { beginAtZero: true, grid: { color: "rgba(19,40,59,0.07)" }, border: { display: false }, ticks: { precision: 0, color: "#5b6f80", font: { family: "Figtree", size: 11 } } },
        },
      },
    });
  }

  cargar();
};
