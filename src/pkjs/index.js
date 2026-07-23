var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

Pebble.addEventListener('showConfiguration', function() {
  Pebble.openURL(clay.generateUrl());
});

// ----- Message keys (must match main.c) -----
var KEY_INDEX     = 0;
var KEY_SYSTOLIC  = 1;
var KEY_DIASTOLIC = 2;
var KEY_DATE      = 3;
var KEY_TOTAL     = 4;
var KEY_FULLDATE  = 5;
var KEY_RHR       = 6;

var DAY_NAMES = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];
var MONTH_NAMES = ['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];

// ----- Settings helpers -----

function settingsFromClay(dict) {
  return {
    haUrl:     (dict['10000'] || dict['HaUrl']     || '').toString().trim(),
    haToken:   (dict['10001'] || dict['HaToken']   || '').toString().trim(),
    sysEntity: (dict['10002'] || dict['SysEntity'] || '').toString().trim().toLowerCase(),
    diaEntity: (dict['10003'] || dict['DiaEntity'] || '').toString().trim().toLowerCase(),
    rhrEntity: (dict['10004'] || dict['RhrEntity'] || '').toString().trim().toLowerCase()
  };
}

function loadSettings() {
  return {
    haUrl:     (localStorage.getItem('HaUrl')     || '').trim(),
    haToken:   (localStorage.getItem('HaToken')   || '').trim(),
    sysEntity: (localStorage.getItem('SysEntity') || '').trim().toLowerCase(),
    diaEntity: (localStorage.getItem('DiaEntity') || '').trim().toLowerCase(),
    rhrEntity: (localStorage.getItem('RhrEntity') || '').trim().toLowerCase()
  };
}

function saveSettingsStruct(s) {
  localStorage.setItem('HaUrl',     s.haUrl     || '');
  localStorage.setItem('HaToken',   s.haToken   || '');
  localStorage.setItem('SysEntity', s.sysEntity || '');
  localStorage.setItem('DiaEntity', s.diaEntity || '');
  localStorage.setItem('RhrEntity', s.rhrEntity || '');
  console.log('BP: saved settings: ' + JSON.stringify(s));
}

function validateSettings(s, isTest) {
  var p = isTest ? 'BP TEST:' : 'BP:';
  if (!s.haUrl || !/^https?:\/\//.test(s.haUrl)) {
    console.log(p + ' invalid URL: ' + s.haUrl);
    return false;
  }
  if (!s.haToken || s.haToken.length < 20) {
    console.log(p + ' invalid token (too short or empty)');
    return false;
  }
  if (!s.sysEntity || s.sysEntity.indexOf('.') === -1) {
    console.log(p + ' invalid systolic entity: ' + s.sysEntity);
    return false;
  }
  if (!s.diaEntity || s.diaEntity.indexOf('.') === -1) {
    console.log(p + ' invalid diastolic entity: ' + s.diaEntity);
    return false;
  }
  // rhrEntity is optional — RHR just won't show if it's missing
  return true;
}

// ----- Fetch from Home Assistant via WebSocket -----

function fetchBPData(settings, mode) {
  var isTest = (mode === 'test');
  var p = isTest ? 'BP TEST:' : 'BP:';
  var s = settings || loadSettings();

  if (!validateSettings(s, isTest)) {
    console.log(p + ' settings not valid, aborting fetch');
    return;
  }

  var wsUrl = s.haUrl
    .replace(/\/+$/, '')
    .replace(/^https:/, 'wss:')
    .replace(/^http:/,  'ws:')
    + '/api/websocket';

  console.log(p + ' connecting: ' + wsUrl);

  var ws;
  try { ws = new WebSocket(wsUrl); }
  catch(e) { console.log(p + ' WebSocket not supported: ' + e); return; }

  ws.onopen = function() { console.log(p + ' WS open'); };

  ws.onmessage = function(event) {
    var msg;
    try { msg = JSON.parse(event.data); }
    catch(e) { console.log(p + ' WS parse error: ' + e); return; }

    if (msg.type === 'auth_required') {
      ws.send(JSON.stringify({ type: 'auth', access_token: s.haToken }));

    } else if (msg.type === 'auth_ok') {
      var statIds = [s.sysEntity, s.diaEntity];
      if (s.rhrEntity) statIds.push(s.rhrEntity);
      var start = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      ws.send(JSON.stringify({
        id: 1,
        type: 'recorder/statistics_during_period',
        start_time: start,
        statistic_ids: statIds,
        period: 'hour',
        types: ['mean']
      }));

    } else if (msg.type === 'auth_invalid') {
      console.log(p + ' WS auth invalid');
      ws.close();

    } else if (msg.type === 'result' && msg.id === 1) {
      ws.close();
      if (msg.success && msg.result) {
        processStatistics(msg.result, s, p);
      } else {
        console.log(p + ' WS failed: ' + JSON.stringify(msg.error));
      }
    }
  };

  ws.onerror = function() { console.log(p + ' WS error'); };
  ws.onclose = function() { console.log(p + ' WS closed'); };
}

function formatFullDate(d) {
  var DAY_NAMES = ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'];
  var MONTH_NAMES = ['januari','februari','maart','april','mei','juni','juli',
                     'augustus','september','oktober','november','december'];
  var line1 = DAY_NAMES[d.getDay()];
  var line2 = d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  var line3 = pad(d.getHours()) + ':' + pad(d.getMinutes()) + 'h';
  return line1 + '\n' + line2 + '\n' + line3;
}

function processStatistics(result, s, p) {
  var sysStats = result[s.sysEntity] || [];
  var diaStats = result[s.diaEntity] || [];
  var rhrStats = s.rhrEntity ? (result[s.rhrEntity] || []) : [];
  console.log(p + ' sys:' + sysStats.length + ' dia:' + diaStats.length + ' rhr:' + rhrStats.length);

  if (!sysStats.length || !diaStats.length) {
    console.log(p + ' no statistics data found');
    return;
  }

  // Build systolic lookup by start timestamp
  var sysMap = {};
  for (var i = 0; i < sysStats.length; i++) {
    var se = sysStats[i];
    if (se && se.start && se.mean !== null && se.mean !== undefined) {
      sysMap[se.start] = se.mean;
    }
  }

  // Build RHR lookup array for closest-match search
  var ONE_DAY_MS = 24 * 60 * 60 * 1000;
  var rhrByTime = [];
  for (var r = 0; r < rhrStats.length; r++) {
    var re = rhrStats[r];
    if (!re || re.mean === null || re.mean === undefined) continue;
    if (Math.abs(re.mean - Math.round(re.mean)) > 0.01) continue;
    rhrByTime.push({ t: new Date(re.start).getTime(), v: Math.round(re.mean) });
  }

  // Walk oldest-first, integer filter + first-occurrence dedup
  var readings = [];
  var lastSys = -1, lastDia = -1;

  for (var j = 0; j < diaStats.length && readings.length < 10; j++) {
    var de = diaStats[j];
    if (!de || !de.start || de.mean === null || de.mean === undefined) continue;
    var sysMean = sysMap[de.start];
    if (sysMean === undefined) continue;

    // Integer filter — real readings have mean exactly equal to a whole number
    // Transitional averages (e.g. 149.879) fail this check
    if (Math.abs(sysMean - Math.round(sysMean)) > 0.01) continue;
    if (Math.abs(de.mean - Math.round(de.mean)) > 0.01) continue;

    var sys = Math.round(sysMean);
    var dia = Math.round(de.mean);
    if (!sys || !dia) continue;

    // First-occurrence dedup — skip until either value actually changes
    if (sys === lastSys && dia === lastDia) continue;
    lastSys = sys;
    lastDia = dia;

    var timestamp = new Date(de.start).getTime();
    var d = new Date(de.start);
    var dateStr = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' +
                  pad(d.getHours()) + ':' + pad(d.getMinutes());
    var fullDateStr = formatFullDate(d);

    // Find closest RHR within 24 hours
    var rhr = 0;
    var bestRhrDiff = Infinity;
    for (var ri = 0; ri < rhrByTime.length; ri++) {
      var rdiff = Math.abs(rhrByTime[ri].t - timestamp);
      if (rdiff < bestRhrDiff && rdiff < ONE_DAY_MS) {
        bestRhrDiff = rdiff;
        rhr = rhrByTime[ri].v;
      }
    }

    readings.push({
      systolic: sys, diastolic: dia, date: dateStr,
      fulldate: fullDateStr, rhr: rhr, timestamp: timestamp
    });
  }

  readings.reverse();
  console.log(p + ' prepared ' + readings.length + ' unique readings');

  for (var m = 0; m < readings.length; m++) {
    console.log(p + ' reading ' + m + ': ' + readings[m].systolic + '/' +
                readings[m].diastolic + ' @ ' + readings[m].date);
  }

  if (!readings.length) {
    console.log(p + ' no matched readings found');
    return;
  }
  sendTotal(readings);
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

// ----- Send readings to watch -----

function sendTotal(readings) {
  var msg = {};
  msg[KEY_TOTAL] = readings.length;
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
  msg[KEY_FULLDATE]  = r.fulldate;
  msg[KEY_RHR]       = r.rhr;

  Pebble.sendAppMessage(msg,
    function () { sendReading(readings, index + 1); },
    function () { console.log('BP: failed to send reading ' + index); }
  );
}

// ----- Pebble events -----

Pebble.addEventListener('ready', function () {
  console.log('BP: PebbleKit JS ready');
  fetchBPData(null, 'normal');
});

Pebble.addEventListener('webviewclosed', function (e) {
  if (!e || !e.response || e.response === 'CANCELLED') {
    console.log('BP: config cancelled or empty');
    return;
  }

  var dict;
  try { dict = clay.getSettings(e.response); }
  catch (err) { console.log('BP: clay getSettings error: ' + err); return; }

  var s = settingsFromClay(dict);
  saveSettingsStruct(s);
  fetchBPData(s, 'normal');
});