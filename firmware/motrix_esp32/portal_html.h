/* ======================================================================
   MOTRIX — Página del portal de configuración WiFi (servida por la ESP32
   en http://192.168.4.1). Autocontenida: funciona sin internet.
   Los nombres de red se insertan con textContent (nunca como HTML) para
   que un SSID malicioso no pueda inyectar código.
   ====================================================================== */
#pragma once
#include <Arduino.h>

static const char PORTAL_HTML[] PROGMEM = R"rawliteral(<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MOTRIX · Conectar a WiFi</title>
<style>
:root{--ink:#13283b;--slate:#2e4a66;--teal:#2a978f;--alu:#eef2f3;--line:#d3dce0;--muted:#5b6f80;--bad:#c2413a;--ok:#17a27e}
*{box-sizing:border-box}body{margin:0;background:var(--alu);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:460px;margin:0 auto;padding:24px 16px 40px}
.marca{font-weight:800;letter-spacing:.06em;color:var(--slate);font-size:1.2rem}
h1{font-size:1.6rem;line-height:1.15;margin:18px 0 6px}p{margin:0 0 14px;color:var(--muted)}
.tarjeta{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;margin-top:16px}
label{display:block;font-weight:600;margin:14px 0 6px}
input,select{width:100%;min-height:48px;padding:0 12px;border:1.5px solid #c5d0d6;border-radius:8px;font:inherit;background:#fff;color:var(--ink)}
input:focus,select:focus{outline:none;border-color:var(--teal);box-shadow:0 0 0 3px rgba(42,151,143,.2)}
button{min-height:48px;border-radius:8px;border:0;font:600 1rem system-ui,sans-serif;cursor:pointer;padding:0 16px}
.primario{width:100%;margin-top:18px;background:var(--ink);color:#fff}.primario:disabled{opacity:.55}
.secundario{background:none;color:var(--teal);padding:0;min-height:auto;text-decoration:underline}
.fila{display:flex;justify-content:space-between;align-items:center;gap:8px}
.pass{position:relative}.pass input{padding-right:84px}.pass button{position:absolute;right:4px;top:4px;min-height:40px;background:none;color:var(--teal)}
.estado{margin-top:16px;padding:12px 14px;border-radius:8px;display:none}
.estado.info{display:block;background:#e9f1f4}.estado.ok{display:block;background:#e2f4ee;color:#0f5c48}.estado.error{display:block;background:#fbeceb;color:#8e2b25}
small{color:var(--muted)}
</style></head><body><main>
<div class="marca">MOTRIX</div>
<h1>Conectar el equipo a WiFi</h1>
<p>Equipo <strong id="idEquipo">…</strong>. Elige la red del lugar y escribe su contraseña. Se guardará solo en este equipo.</p>
<form class="tarjeta" id="form" autocomplete="off">
  <div class="fila"><label for="red" style="margin:0">Red WiFi</label><button type="button" class="secundario" id="buscar">Buscar redes</button></div>
  <select id="red" style="margin-top:8px"><option value="">Buscando redes…</option></select>
  <div id="manualBox" hidden><label for="manual">Nombre de la red (SSID)</label><input id="manual" maxlength="32" spellcheck="false"></div>
  <label for="pass">Contraseña</label>
  <div class="pass"><input id="pass" type="password" maxlength="63" autocomplete="new-password"><button type="button" id="ver" aria-pressed="false">Mostrar</button></div>
  <small>Déjala vacía solo si la red es abierta.</small>
  <button class="primario" id="conectar" type="submit">Conectar</button>
  <div class="estado" id="estado" role="status" aria-live="polite"></div>
</form>
<p style="margin-top:18px"><small>Cuando el equipo se conecte, vuelve a tu red habitual: aparecerá en línea en la plataforma MOTRIX.</small></p>
</main>
<script>
(function(){
var sel=document.getElementById('red'),est=document.getElementById('estado'),btn=document.getElementById('conectar');
var manualBox=document.getElementById('manualBox'),manual=document.getElementById('manual'),pass=document.getElementById('pass');
function mostrar(t,c){est.textContent=t;est.className='estado '+c;}
function opcion(v,t){var o=document.createElement('option');o.value=v;o.textContent=t;return o;}
function buscar(){
  sel.replaceChildren(opcion('','Buscando redes…'));
  fetch('/scan').then(function(r){return r.json();}).then(function(d){
    document.getElementById('idEquipo').textContent=d.id||'';
    sel.replaceChildren();
    d.redes.sort(function(a,b){return b.rssi-a.rssi;}).forEach(function(r){
      var barras=r.rssi>=-60?'excelente':r.rssi>=-70?'buena':r.rssi>=-80?'regular':'débil';
      sel.appendChild(opcion(r.ssid,r.ssid+' · señal '+barras+(r.segura?'':' · abierta')));
    });
    sel.appendChild(opcion('__manual','Otra red (oculta)…'));
    if(!d.redes.length) sel.value='__manual';
    manualBox.hidden=sel.value!=='__manual';
  }).catch(function(){sel.replaceChildren(opcion('__manual','Escribir el nombre de la red'));manualBox.hidden=false;});
}
sel.onchange=function(){manualBox.hidden=sel.value!=='__manual';if(!manualBox.hidden)manual.focus();};
document.getElementById('buscar').onclick=buscar;
document.getElementById('ver').onclick=function(){var v=pass.type==='password';pass.type=v?'text':'password';this.textContent=v?'Ocultar':'Mostrar';this.setAttribute('aria-pressed',v);};
var sondeo,fallos=0;
function revisar(){
  fetch('/estado').then(function(r){return r.json();}).then(function(d){
    fallos=0;
    if(d.estado==='probando'){mostrar('Probando la conexión con «'+d.ssid+'»…','info');return;}
    clearInterval(sondeo);btn.disabled=false;
    if(d.estado==='conectado'){mostrar('Listo: el equipo se conectó a «'+d.ssid+'». Ya puedes volver a tu red habitual. Este punto de acceso se cerrará en unos segundos.','ok');}
    else if(d.estado==='error'){mostrar(d.msg+' Revisa los datos e inténtalo de nuevo.','error');}
  }).catch(function(){
    if(++fallos>=4){clearInterval(sondeo);btn.disabled=false;mostrar('Tu celular perdió la conexión con el equipo (es normal al cambiar de canal). Mira la pantalla del equipo: indicará si se conectó.','info');}
  });
}
document.getElementById('form').onsubmit=function(e){
  e.preventDefault();
  var ssid=sel.value==='__manual'?manual.value:sel.value;
  if(!ssid){mostrar('Elige o escribe el nombre de la red.','error');return;}
  if(pass.value&&(pass.value.length<8||pass.value.length>63)){mostrar('La contraseña debe tener entre 8 y 63 caracteres.','error');return;}
  btn.disabled=true;mostrar('Enviando…','info');
  var datos=new URLSearchParams();datos.set('ssid',ssid);datos.set('pass',pass.value);
  fetch('/conectar',{method:'POST',body:datos}).then(function(r){return r.json();}).then(function(d){
    if(!d.ok){btn.disabled=false;mostrar(d.msg,'error');return;}
    pass.value='';fallos=0;sondeo=setInterval(revisar,1500);
  }).catch(function(){btn.disabled=false;mostrar('Se perdió la comunicación con el equipo. Vuelve a conectarte a su red e inténtalo otra vez.','error');});
};
buscar();
})();
</script></body></html>)rawliteral";
