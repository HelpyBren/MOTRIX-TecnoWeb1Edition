/* ======================================================================
   MOTRIX — api.js
   Cliente HTTP común. Envía la cookie de sesión, añade la cabecera
   X-Requested-With (exigida por el servidor para escrituras) y unifica
   el manejo de errores. Si la sesión caduca, vuelve al login.
   ====================================================================== */
(function () {
  "use strict";

  const BASE = "/api";

  class ApiError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }

  async function request(path, { method = "GET", body, redirigir401 = true, headers = {} } = {}) {
    let res;
    try {
      res = await fetch(`${BASE}${path}`, {
        method,
        credentials: "same-origin",
        headers: {
          "X-Requested-With": "MotrixWeb",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(0, "No hay conexión con el servidor. Comprueba que esté en ejecución.");
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && redirigir401 && !location.pathname.endsWith("login.html")) {
      location.href = `login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
      throw new ApiError(401, data.error || "Sesión caducada.");
    }
    if (!res.ok) throw new ApiError(res.status, data.error || `Error ${res.status}`);
    return data;
  }

  /** Descarga un archivo (p. ej. Excel) respetando la sesión. */
  async function descargar(path, nombrePorDefecto) {
    const res = await fetch(`${BASE}${path}`, { credentials: "same-origin", headers: { "X-Requested-With": "MotrixWeb" } });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new ApiError(res.status, data.error || "No se pudo generar el archivo.");
    }
    const blob = await res.blob();
    const disp = res.headers.get("Content-Disposition") || "";
    const nombre = (disp.match(/filename="([^"]+)"/) || [])[1] || nombrePorDefecto;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return nombre;
  }

  window.MotrixApi = {
    ApiError,
    get: (p, o) => request(p, { ...o, method: "GET" }),
    post: (p, body, o) => request(p, { ...o, method: "POST", body: body ?? {} }),
    put: (p, body, o) => request(p, { ...o, method: "PUT", body: body ?? {} }),
    del: (p, o) => request(p, { ...o, method: "DELETE" }),
    descargar,
  };
})();
