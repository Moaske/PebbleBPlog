// Keys must match main.c
var KEY_INDEX     = 0;
var KEY_SYSTOLIC  = 1;
var KEY_DIASTOLIC = 2;
var KEY_DATE      = 3;
var KEY_TOTAL     = 4;

// --- Settings helpers ---

function loadSettings() {
  return {
    haUrl:     localStorage.getItem('haUrl')     || '',
    haToken:   localStorage.getItem('haToken')   || '',
    sysEntity: localStorage.getItem('sysEntity') || '',
    diaEntity: localStorage.getItem('diaEntity') || ''
  };
}

function saveSettings(cfg) {
  localStorage.setItem('haUrl',     cfg.haUrl     || '');
  localStorage.setItem('haToken',   cfg.haToken   || '');
  localStorage.setItem('sysEntity', cfg.sysEntity || '');
  localStorage.setItem('diaEntity', cfg.diaEntity || '');
}

// --- Fetch from Home Assistant ---

function fetchBPData() {
  var s = loadSettings();
  if (!s.haUrl || !s.haToken || !s.sysEntity || !s.diaEntity) {
    console.log('BP: settings not yet configured');
    return;
  }

  // Ask HA for the last 60 days of state history for both sensors
  var start = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  var url = s.haUrl + '/api/history/period/' + start
    + '?filter_entity_id=' + encodeURIComponent(s.sysEntity)
    + ',' + encodeURIComponent(s.diaEntity);

  var req = new XMLHttpRequest();
  req.open('GET', url, true);
  req.setRequestHeader('Authorization', 'Bearer ' + s.haToken);
  req.setRequestHeader('Content-Type', 'application/json');

  req.onload = function () {
    if (req.status === 200) {
      try { processData(JSON.parse(req.responseText), s); }
      catch (e) { console.log('BP parse error: ' + e); }
    } else {
      console.log('BP HTTP error: ' + req.status);
    }
  };
  req.onerror = function () { console.log('BP network error'); };
  req.send();
}

// --- Process HA history response ---

function processData(data, s) {
  // data = [ [sysStates...], [diaStates...] ]
  // Each state: { entity_id, state, last_changed, ... }
  var sysArr = [], diaArr = [];

  for (var i = 0; i < data.length; i++) {
    if (!data[i] || data[i].length === 0) continue;
    var entityId = data[i][0].entity_id || '';
    if (entityId === s.sysEntity) { sysArr = data[i]; }
    else if (entityId === s.diaEntity) { diaArr = data[i]; }
  }

  // Fallback: if entity_id missing, trust order of filter_entity_id param
  if (sysArr.length === 0 && diaArr.length === 0 && data.length >= 2) {
    sysArr = data[0] || [];
    diaArr = data[1] || [];
  }

  // Take the 10 most recent matching pairs (by position from the end)
  var count = Math.min(sysArr.length, diaArr.length, 10);
  var readings = [];

  for (var j = 1; j <= count; j++) {
    var se = sysArr[sysArr.length - j];
    var de = diaArr[diaArr.length - j];
    var sys = parseInt(se.state, 10);
    var dia = parseInt(de.state, 10);
    if (isNaN(sys) || isNaN(dia)) continue;

    // Format date as "DD/MM HH:MM"
    var d = new Date(se.last_changed || se.last_updated || Date.now());
    var dateStr = pad(d.getDate()) + '/' + pad(d.getMonth() + 1)
      + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());

    readings.push({ systolic: sys, diastolic: dia, date: dateStr });
  }

  // Newest first (j=1 gave latest, so reverse restores newest-at-top)
  // readings[0] is already the newest — no reversal needed

  sendTotal(readings);
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }

// --- Send readings to watch one by one ---

function sendTotal(readings) {
  var msg = {}; msg[KEY_TOTAL] = readings.length;
  Pebble.sendAppMessage(msg,
    function () { sendReading(readings, 0); },
    function () { console.log('BP: failed to send total'); }
  );
}

function sendReading(readings, index) {
  if (index >= readings.length) return;
  var r = readings[index];
  var msg = {};
  msg[KEY_INDEX]     = index;
  msg[KEY_SYSTOLIC]  = r.systolic;
  msg[KEY_DIASTOLIC] = r.diastolic;
  msg[KEY_DATE]      = r.date;
  Pebble.sendAppMessage(msg,
    function () { sendReading(readings, index + 1); },
    function () { console.log('BP: failed to send reading ' + index); }
  );
}

// --- Config / settings page ---
// Built as an inline HTML page so nothing needs hosting

function buildConfigPage() {
  var s = loadSettings();
  var html = '<!DOCTYPE html><html><head>'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>'
    + 'body{font-family:sans-serif;max-width:420px;margin:0 auto;padding:20px;'
    + 'background:#1c1c1e;color:#f2f2f7}'
    + 'h2{font-size:18px;margin-bottom:16px;font-weight:500}'
    + 'label{display:block;font-size:12px;color:#8e8e93;margin-bottom:4px;margin-top:14px}'
    + 'input{width:100%;padding:10px 12px;background:#2c2c2e;border:1px solid #3a3a3c;'
    + 'border-radius:8px;color:#f2f2f7;font-size:15px;box-sizing:border-box}'
    + 'button{display:block;width:100%;margin-top:24px;padding:13px;background:#0a84ff;'
    + 'color:#fff;font-size:16px;font-weight:500;border:none;border-radius:10px;cursor:pointer}'
    + 'p{font-size:12px;color:#8e8e93;margin-top:10px}'
    + '</style></head><body>'
    + '<h2>Blood Pressure settings</h2>'
    + '<label>Home Assistant URL</label>'
    + '<input id="haUrl" type="url" placeholder="https://xxxxx.ui.nabu.casa"'
    + ' value="' + esc(s.haUrl) + '">'
    + '<label>Long-lived access token</label>'
    + '<input id="haToken" type="password" placeholder="Paste your HA token here"'
    + ' value="' + esc(s.haToken) + '">'
    + '<label>Systolic entity ID</label>'
    + '<input id="sysEntity" placeholder="sensor.pixel_blood_pressure_systolic"'
    + ' value="' + esc(s.sysEntity) + '">'
    + '<label>Diastolic entity ID</label>'
    + '<input id="diaEntity" placeholder="sensor.pixel_blood_pressure_diastolic"'
    + ' value="' + esc(s.diaEntity) + '">'
    + '<button onclick="save()">Save and close</button>'
    + '<p>Find entity IDs in HA under Settings → Devices & Services → your Pixel.</p>'
    + '<script>'
    + 'function esc(s){return(s||"").replace(/"/g,"&quot;")}'
    + 'function save(){'
    + 'var cfg={haUrl:document.getElementById("haUrl").value.trim(),'
    + 'haToken:document.getElementById("haToken").value.trim(),'
    + 'sysEntity:document.getElementById("sysEntity").value.trim(),'
    + 'diaEntity:document.getElementById("diaEntity").value.trim()};'
    + 'var encoded=encodeURIComponent(JSON.stringify(cfg));'
    + 'document.location="pebblekit://close?response="+encoded;}'
    + '</script></body></html>';
  return 'data:text/html,' + encodeURIComponent(html);
}

function esc(s) { return (s || '').replace(/"/g, '"'); }

// --- Pebble event listeners ---

Pebble.addEventListener('ready', function () {
  console.log('BP: PebbleKit JS ready');
  fetchBPData();
});

Pebble.addEventListener('showConfiguration', function () {
  Pebble.openURL(buildConfigPage());
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (!e.response || e.response === 'CANCELLED') return;
  try {
    var cfg = JSON.parse(decodeURIComponent(e.response));
    saveSettings(cfg);
    fetchBPData();
  } catch (err) {
    console.log('BP: config parse error — ' + err);
  }
});