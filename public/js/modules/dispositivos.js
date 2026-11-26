/* ======================================================================
   MOTRIX — módulo Dispositivos
   * Lista de ESP32 registradas con su estado real (latido MQTT).
   * Asistente de conexión WiFi:
       A) Local: el equipo abre su propio punto de acceso "MOTRIX-…"
          con una clave que aparece en su pantalla LCD. Es la única vía
          posible para un equipo sin red: una página en internet no puede
          descubrir ni configurar un dispositivo de la red local.
       B) Remoto (solo administradores, equipo en línea): se envía la
          nueva red por MQTT en un comando firmado y cifrado; si la ESP32
          no logra conectarse, vuelve sola a la red anterior.
   * La contraseña WiFi nunca se guarda en la base de datos.
   ====================================================================== */
window.MotrixViews = window.MotrixViews || {};
window.MotrixViews.dispositivos = function (container, h) {
  let datos = { dispositivos: [], detectados: [], broker: {}, firmaDisponible: false };
  let sondeo = null;

  async function cargar() {
    try {
      datos = await MotrixApi.get("/dispositivos");
      pintarLista();
    } catch (e) { h.toast(e.message, "danger"); }
  }

  function render() {
    container.innerHTML = `
      <div class="module-view">
        <div class="module-header">
          <div><h1>Dispositivos</h1><p>Equipos MOTRIX registrados, su conexión y la configuración de red.</p></div>
          ${h.esAdmin ? '<button class="module-btn primary" id="btnNuevoDisp">Registrar equipo</button>' : ""}
        </div>
        <div id="avisoBroker"></div>
        <div id="listaDispositivos" class="dispositivos-lista"><div class="module-card empty-state">Cargando…</div></div>
        <div id="detectados"></div>
        <section class="module-card guia-conexion">
          <h2>¿Cómo se conecta un equipo a internet?</h2>
          <div class="guia-conexion__cols">
            <div><h3>Equipo nuevo o en otra red</h3><p>El equipo crea su propia red WiFi de configuración. Te conectas a ella con el celular, eliges la red del lugar y escribes la contraseña. No hace falta reprogramarlo.</p></div>
            <div><h3>Equipo ya conectado</h3><p>Un administrador puede enviarle una red nueva desde aquí. Si no logra conectarse, vuelve solo a la red anterior para no quedar fuera de línea.</p></div>
            <div><h3>Por qué no se detecta solo</h3><p>Por seguridad, los navegadores no permiten que una página de internet busque ni configure aparatos de tu red local. Por eso el primer paso siempre se hace conectándose al equipo.</p></div>
          </div>
        </section>
      </div>
      <div class="module-modal hidden" id="modalDisp" role="dialog" aria-modal="true" aria-labelledby="tituloModalDisp"><div class="module-modal__box" id="cajaModalDisp"></div></div>`;
    document.getElementById("btnNuevoDisp")?.addEventListener("click", () => abrirFormulario());
    document.getElementById("modalDisp").addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarModal(); });
    cargar();
  }

  function pintarLista() {
    const aviso = document.getElementById("avisoBroker");
    if (!aviso) return;
    aviso.innerHTML = datos.broker.conectado ? "" : `<p class="aviso-linea">${datos.broker.habilitado ? "El servidor está intentando conectarse al broker MQTT." : "El servidor no tiene configurado el broker MQTT (MQTT_URL en .env): no se puede conocer el estado de los equipos."}</p>`;
    const lista = document.getElementById("listaDispositivos");
    if (!datos.dispositivos.length) {
      lista.innerHTML = `<div class="module-card empty-state">${h.esAdmin
        ? `Aún no hay equipos registrados. Usa «Registrar equipo» con el mismo código que tiene el firmware (DEVICE_ID).`
        : "Aún no hay equipos registrados. Pide a un administrador que registre el equipo."}</div>`;
    } else {
      lista.innerHTML = datos.dispositivos.map(tarjeta).join("");
      lista.querySelectorAll("[data-accion]").forEach((b) => b.addEventListener("click", () => accion(b.dataset.accion, Number(b.dataset.id))));
    }
    const det = document.getElementById("detectados");
    det.innerHTML = h.esAdmin && datos.detectados?.length ? `
      <section class="module-card">
        <h2>Equipos detectados sin registrar</h2>
        <p class="muted">Estas ESP32 están publicando su estado en el broker, pero no existen en la base de datos.</p>
        <ul class="lista-equipos">${datos.detectados.map((d) => `<li><span class="estado-punto on" aria-hidden="true"></span><span><strong>${h.esc(d.codigo)}</strong><small>Tópico ${h.esc(d.topicBase || "—")} · firmware ${h.esc(d.fw || "—")}</small></span><button class="table-btn primario" data-registrar="${h.esc(d.codigo)}" data-topic="${h.esc(d.topicBase || "")}">Registrar</button></li>`).join("")}</ul>
      </section>` : "";
    det.querySelectorAll("[data-registrar]").forEach((b) => b.addEventListener("click", () => abrirFormulario({ codigo: b.dataset.registrar, topicBase: b.dataset.topic, nombre: `MOTRIX ${b.dataset.registrar}` }, true)));
  }

  function tarjeta(d) {
    const wifi = d.wifiEstado ? `<p class="wifi-estado wifi-estado--${d.wifiEstado}"><strong>Último cambio de red:</strong> ${h.esc(d.wifiMensaje || d.wifiEstado)} <small>(${h.hace(d.wifiActualizadoEn)})</small></p>` : "";
    return `
      <article class="module-card dispositivo">
        <header class="dispositivo__cabecera">
          <div>
            <h2>${h.esc(d.nombre)}</h2>
            <p class="muted">${h.esc(d.codigo)}${d.ubicacion ? ` · ${h.esc(d.ubicacion)}` : ""}</p>
          </div>
          <span class="status-pill ${d.enLinea ? "online" : "idle"}"><span class="estado-punto ${d.enLinea ? "on" : "off"}" aria-hidden="true"></span>${d.enLinea ? "En línea" : "Sin señal"}</span>
        </header>
        <dl class="dispositivo__datos">
          <div><dt>Última conexión</dt><dd>${d.ultimaConexion ? h.hace(d.ultimaConexion) : "Nunca"}</dd></div>
          <div><dt>Red WiFi</dt><dd>${h.esc(d.ssid || "—")}</dd></div>
          <div><dt>Señal</dt><dd>${d.ultimoRssi != null ? `${d.ultimoRssi} dBm` : "—"}</dd></div>
          <div><dt>Tópico</dt><dd>motrix/${h.esc(d.topicBase)}</dd></div>
          <div><dt>Firmware</dt><dd>${h.esc(d.firmware || "—")}</dd></div>
          ${h.esAdmin ? `<div><dt>IP local</dt><dd>${h.esc(d.ip || "—")}</dd></div>` : ""}
        </dl>
        ${wifi}
        <div class="dispositivo__acciones">
          <button class="module-btn primary" data-accion="wifi" data-id="${d.id}">Configurar WiFi</button>
          ${h.esAdmin ? `
            <button class="module-btn" data-accion="editar" data-id="${d.id}">Editar</button>
            <button class="module-btn" data-accion="clave" data-id="${d.id}">Datos para el firmware</button>
            <button class="module-btn danger-btn" data-accion="eliminar" data-id="${d.id}">Eliminar</button>` : ""}
        </div>
      </article>`;
  }

  async function accion(tipo, id) {
    const d = datos.dispositivos.find((x) => x.id === id);
    if (!d) return;
    if (tipo === "wifi") return abrirAsistente(d);
    if (tipo === "editar") return abrirFormulario(d);
    if (tipo === "clave") return abrirClave(d);
    if (tipo === "eliminar") {
      const ok = await h.confirmar(`Se eliminará ${d.nombre} del registro. Sus sesiones históricas se conservan.`, { titulo: "Eliminar equipo", aceptar: "Eliminar", peligro: true });
      if (!ok) return;
      try { await MotrixApi.del(`/dispositivos/${id}`); h.toast("Equipo eliminado.", "success"); cargar(); h.recargarDispositivos(); }
      catch (e) { h.toast(e.message, "danger"); }
    }
  }

  /* ---------------------------- Modal genérico ---------------------------- */
  function abrirModal(html) {
    document.getElementById("cajaModalDisp").innerHTML = html;
    document.getElementById("modalDisp").classList.remove("hidden");
    document.querySelectorAll("#cajaModalDisp [data-cerrar]").forEach((b) => b.addEventListener("click", cerrarModal));
    const foco = document.querySelector("#cajaModalDisp input, #cajaModalDisp button.primary");
    foco?.focus();
  }
  function cerrarModal() {
    clearInterval(sondeo);
    document.getElementById("modalDisp")?.classList.add("hidden");
  }
  const cabecera = (titulo) => `<div class="module-modal__head"><h2 id="tituloModalDisp">${titulo}</h2><button class="modal-close" data-cerrar aria-label="Cerrar">×</button></div>`;

  /* ------------------------- Alta y edición ------------------------- */
  function abrirFormulario(d = null, esNuevoDetectado = false) {
    const editar = d && d.id && !esNuevoDetectado;
    abrirModal(`${cabecera(editar ? "Editar equipo" : "Registrar equipo")}
      <form class="module-form" id="formDisp" novalidate>
        <label>Nombre visible<input name="nombre" required maxlength="80" value="${h.esc(d?.nombre || "")}" placeholder="Equipo consultorio 1"></label>
        <label>Código (DEVICE_ID del firmware)<input name="codigo" required maxlength="40" pattern="[A-Za-z0-9_-]{3,40}" value="${h.esc(d?.codigo || "")}" placeholder="MOTRIX-01"></label>
        <label>Tópico base MQTT<input name="topicBase" required maxlength="40" value="${h.esc(d?.topicBase || datos.topicBasePredeterminado || "paciente1")}"><span class="campo-ayuda">Debe coincidir con TOPIC_BASE del firmware. El firmware original usa «paciente1».</span></label>
        <label>Ubicación<input name="ubicacion" maxlength="120" value="${h.esc(d?.ubicacion || "")}" placeholder="Consultorio, ciudad…"></label>
        <label class="full">Descripción<textarea name="descripcion" rows="2" maxlength="300">${h.esc(d?.descripcion || "")}</textarea></label>
        <p class="form-error full" id="errorDisp" role="alert" hidden></p>
        <div class="form-actions"><button type="button" class="module-btn" data-cerrar>Cancelar</button><button class="module-btn primary" type="submit">${editar ? "Guardar cambios" : "Registrar equipo"}</button></div>
      </form>`);
    document.getElementById("formDisp").onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target).entries());
      try {
        if (editar) await MotrixApi.put(`/dispositivos/${d.id}`, body);
        else await MotrixApi.post("/dispositivos", body);
        cerrarModal();
        h.toast(editar ? "Equipo actualizado." : "Equipo registrado.", "success");
        cargar();
        h.recargarDispositivos();
      } catch (err) {
        const p = document.getElementById("errorDisp");
        p.textContent = err.message; p.hidden = false;
      }
    };
  }

  /* --------------------- Datos para el firmware (clave) --------------------- */
  function abrirClave(d) {
    abrirModal(`${cabecera("Datos para el firmware")}
      <p>Estos valores se copian una sola vez en <code>firmware/motrix_esp32/config.h</code>. La clave permite que el equipo verifique los cambios de red remotos. Trátala como una contraseña.</p>
      ${datos.firmaDisponible ? `
      <form id="formClave" class="module-form">
        <label class="full">Confirma tu contraseña para verla<input type="password" name="password" autocomplete="current-password" required></label>
        <p class="form-error full" id="errorClave" role="alert" hidden></p>
        <div class="form-actions"><button type="button" class="module-btn" data-cerrar>Cancelar</button><button class="module-btn primary" type="submit">Mostrar datos</button></div>
      </form>
      <div id="resultadoClave"></div>` : `<p class="aviso-linea">El servidor no tiene DEVICE_MASTER_KEY en .env. Genera una con <code>npm run clave:maestra</code> y reinicia el servidor.</p>`}`);
    const form = document.getElementById("formClave");
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await MotrixApi.post(`/dispositivos/${d.id}/clave`, { password: form.password.value });
        form.remove();
        document.getElementById("resultadoClave").innerHTML = `
          <pre class="codigo" id="snippetClave">${h.esc(r.snippet)}</pre>
          <div class="form-actions"><button class="module-btn" id="copiarClave">Copiar</button><button class="module-btn primary" data-cerrar>Listo</button></div>`;
        document.querySelectorAll("#cajaModalDisp [data-cerrar]").forEach((b) => b.addEventListener("click", cerrarModal));
        document.getElementById("copiarClave").onclick = async () => {
          try { await navigator.clipboard.writeText(r.snippet); h.toast("Copiado al portapapeles.", "success"); }
          catch { h.toast("No se pudo copiar automáticamente; selecciona el texto.", "warn"); }
        };
      } catch (err) {
        const p = document.getElementById("errorClave");
        p.textContent = err.message; p.hidden = false;
      }
    };
  }

  /* ---------------------------- Asistente WiFi ---------------------------- */
  function abrirAsistente(d) {
    const remotoPosible = h.esAdmin && d.enLinea && datos.firmaDisponible && datos.broker.conectado;
    const motivoRemoto = !h.esAdmin ? "Solo un administrador puede cambiar la red a distancia."
      : !datos.broker.conectado ? "El servidor no está conectado al broker MQTT."
      : !datos.firmaDisponible ? "Falta DEVICE_MASTER_KEY en la configuración del servidor."
      : !d.enLinea ? "El equipo no está en línea. Usa la configuración local." : "";
    abrirModal(`${cabecera(`Conectar ${h.esc(d.nombre)} a WiFi`)}
      <div class="pestanas" role="tablist" aria-label="Método de conexión">
        <button role="tab" id="tabLocal" aria-selected="true" aria-controls="panelLocal">En el lugar (punto de acceso)</button>
        <button role="tab" id="tabRemoto" aria-selected="false" aria-controls="panelRemoto" tabindex="-1">A distancia</button>
      </div>

      <div role="tabpanel" id="panelLocal" aria-labelledby="tabLocal">
        <ol class="pasos">
          <li><strong>Pon el equipo en modo configuración.</strong> Se activa solo si no tiene una red guardada o no logra conectarse en 30 s. También puedes mantener presionado el botón <em>BOOT</em> de la ESP32 durante 3 segundos${h.esAdmin && d.enLinea ? ', o usar «Abrir punto de acceso» abajo' : ""}.</li>
          <li><strong>Mira la pantalla del equipo.</strong> Mostrará el nombre de su red, <code>${h.esc((/^motrix/i.test(d.codigo) ? d.codigo : `MOTRIX-${d.codigo}`).slice(0, 32))}</code>, y una clave de 8 dígitos que cambia cada vez.</li>
          <li><strong>Conecta tu celular o computadora a esa red</strong> con la clave de la pantalla. La página de configuración suele abrirse sola; si no, abre <a href="http://192.168.4.1" target="_blank" rel="noopener">http://192.168.4.1</a>.</li>
          <li><strong>Elige la red WiFi del lugar y escribe su contraseña.</strong> El equipo la prueba y te dice si se conectó. La contraseña queda guardada solo en el equipo.</li>
          <li><strong>Vuelve a tu red habitual y regresa aquí.</strong> Esta ventana avisará cuando el equipo aparezca en línea.</li>
        </ol>
        <div class="espera-conexion" id="esperaConexion" role="status">
          <span class="estado-punto ${d.enLinea ? "on" : "off"}" aria-hidden="true"></span>
          <span id="textoEspera">${d.enLinea ? `En línea ahora mismo${d.ssid ? ` en la red «${h.esc(d.ssid)}»` : ""}.` : "Esperando a que el equipo se conecte al servidor…"}</span>
        </div>
        ${h.esAdmin && d.enLinea ? `<div class="form-actions"><button class="module-btn" id="btnPortal">Abrir punto de acceso</button><button class="module-btn" id="btnReiniciar">Reiniciar equipo</button></div>` : ""}
      </div>

      <div role="tabpanel" id="panelRemoto" aria-labelledby="tabRemoto" hidden>
        ${remotoPosible ? `
          <form class="module-form" id="formWifi" novalidate autocomplete="off">
            <label class="full">Nombre de la red (SSID)<input name="ssid" required maxlength="32" autocomplete="off" spellcheck="false"></label>
            <label class="full">Contraseña de la red
              <span class="campo-con-boton"><input name="password" type="password" maxlength="63" autocomplete="new-password"><button type="button" class="table-btn" id="verPassWifi" aria-pressed="false">Mostrar</button></span>
              <span class="campo-ayuda">Se envía cifrada y firmada solo para este equipo. No se guarda en la plataforma ni en los registros. Déjala vacía si la red es abierta.</span>
            </label>
            <p class="form-error full" id="errorWifi" role="alert" hidden></p>
            <div class="form-actions"><button type="button" class="module-btn" data-cerrar>Cancelar</button><button class="module-btn primary" type="submit">Enviar al equipo</button></div>
          </form>
          <div id="progresoWifi" class="espera-conexion" role="status" hidden></div>`
        : `<p class="aviso-linea">${h.esc(motivoRemoto)}</p>`}
      </div>`);

    // Pestañas accesibles
    const tabs = [document.getElementById("tabLocal"), document.getElementById("tabRemoto")];
    const paneles = [document.getElementById("panelLocal"), document.getElementById("panelRemoto")];
    const activar = (i) => tabs.forEach((t, j) => {
      t.setAttribute("aria-selected", String(i === j)); t.tabIndex = i === j ? 0 : -1; paneles[j].hidden = i !== j;
      if (i === j) t.focus();
    });
    tabs.forEach((t, i) => {
      t.onclick = () => activar(i);
      t.onkeydown = (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); activar(1 - i); } };
    });

    document.getElementById("btnPortal")?.addEventListener("click", async () => {
      try { const r = await MotrixApi.post(`/dispositivos/${d.id}/portal`, {}); h.toast(r.mensaje, "success"); }
      catch (e) { h.toast(e.message, "danger"); }
    });
    document.getElementById("btnReiniciar")?.addEventListener("click", async () => {
      if (!(await h.confirmar("El equipo se reiniciará. Si hay una sesión en curso, se interrumpirá.", { titulo: "Reiniciar equipo", aceptar: "Reiniciar", peligro: true }))) return;
      try { const r = await MotrixApi.post(`/dispositivos/${d.id}/reiniciar`, {}); h.toast(r.mensaje, "success"); }
      catch (e) { h.toast(e.message, "danger"); }
    });
    const ver = document.getElementById("verPassWifi");
    if (ver) ver.onclick = () => {
      const i = document.querySelector('#formWifi [name="password"]');
      const mostrar = i.type === "password";
      i.type = mostrar ? "text" : "password"; ver.textContent = mostrar ? "Ocultar" : "Mostrar"; ver.setAttribute("aria-pressed", String(mostrar));
    };
    const formWifi = document.getElementById("formWifi");
    if (formWifi) formWifi.onsubmit = (e) => enviarWifi(e, d);

    // Sondeo del estado mientras el asistente esté abierto.
    let estabaEnLinea = d.enLinea;
    clearInterval(sondeo);
    sondeo = setInterval(async () => {
      try {
        const r = await MotrixApi.get("/dispositivos");
        datos = r;
        const actual = r.dispositivos.find((x) => x.id === d.id);
        const texto = document.getElementById("textoEspera");
        if (!actual || !texto) return;
        const punto = document.querySelector("#esperaConexion .estado-punto");
        punto.className = `estado-punto ${actual.enLinea ? "on" : "off"}`;
        texto.textContent = actual.enLinea
          ? `En línea${actual.ssid ? ` en la red «${actual.ssid}»` : ""}.`
          : "Esperando a que el equipo se conecte al servidor…";
        if (actual.enLinea && !estabaEnLinea) h.toast(`${actual.nombre} está en línea.`, "success");
        estabaEnLinea = actual.enLinea;
        pintarLista();
      } catch { /* se reintenta en el próximo ciclo */ }
    }, 4000);
  }

  async function enviarWifi(e, d) {
    e.preventDefault();
    const form = e.target;
    const ssid = form.ssid.value;
    const password = form.password.value;
    const err = document.getElementById("errorWifi");
    err.hidden = true;
    if (!ssid.trim()) { err.textContent = "Escribe el nombre de la red."; err.hidden = false; return; }
    if (password && (password.length < 8 || password.length > 63)) { err.textContent = "La contraseña WiFi debe tener entre 8 y 63 caracteres."; err.hidden = false; return; }
    const enviadoEn = Date.now();
    try {
      await MotrixApi.post(`/dispositivos/${d.id}/wifi`, { ssid, password });
    } catch (ex) { err.textContent = ex.message; err.hidden = false; return; }
    form.reset();
    form.hidden = true;
    const prog = document.getElementById("progresoWifi");
    prog.hidden = false;
    prog.innerHTML = `<span class="estado-punto pendiente" aria-hidden="true"></span><span>Enviado. El equipo está probando la red «${h.esc(ssid)}»; puede tardar hasta un minuto…</span>`;
    clearInterval(sondeo);
    sondeo = setInterval(async () => {
      try {
        const r = await MotrixApi.get("/dispositivos");
        datos = r;
        const act = r.dispositivos.find((x) => x.id === d.id);
        const respondio = act?.wifiActualizadoEn && new Date(act.wifiActualizadoEn).getTime() > enviadoEn && act.wifiEstado !== "pendiente";
        if (respondio) {
          clearInterval(sondeo);
          const ok = act.wifiEstado === "ok";
          prog.innerHTML = `<span class="estado-punto ${ok ? "on" : "error"}" aria-hidden="true"></span><span>${ok ? "Conectado a la nueva red." : "No se pudo conectar a la nueva red; el equipo volvió a la anterior."} ${h.esc(act.wifiMensaje || "")}</span>`;
          h.toast(ok ? "Red WiFi actualizada." : "El cambio de red falló.", ok ? "success" : "danger");
          pintarLista();
        } else if (Date.now() - enviadoEn > 120000) {
          clearInterval(sondeo);
          prog.innerHTML = `<span class="estado-punto error" aria-hidden="true"></span><span>No hubo respuesta del equipo en 2 minutos. Revisa su pantalla; si quedó sin red, usa la configuración en el lugar.</span>`;
        }
      } catch { /* reintento */ }
    }, 3000);
  }

  render();
};
