var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

// And add this event listener alongside your existing webviewclosed:
Pebble.addEventListener('showConfiguration', function() {
  Pebble.openURL(clay.generateUrl());
});

// ----- Message keys for readings (must match main.c) -----
var KEY_INDEX     = 0;
var KEY_SYSTOLIC  = 1;
var KEY_DIASTOLIC = 2;
var KEY_DATE      = 3;
var KEY_TOTAL     = 4;

// ----- Settings helpers -----

function settingsFromClay(dict) {
  return {
    haUrl:     (dict['0'] || dict['HaUrl']     || '').toString().trim(),
    haToken:   (dict['1'] || dict['HaToken']   || '').toString().trim(),
    sysEntity: (dict['2'] || dict['SysEntity'] || '').toString().trim().toLowerCase(),
    diaEntity: (dict['3'] || dict['DiaEntity'] || '').toString().trim().toLowerCase()
  };
}

function loadSettings() {
  return {
    haUrl:     (localStorage.getItem('HaUrl')     || '').trim(),
    haToken:   (localStorage.getItem('HaToken')   || '').trim(),
    sysEntity: (localStorage.getItem('SysEntity') || '').trim().toLowerCase(),
    diaEntity: (localStorage.getItem('DiaEntity') || '').trim().toLowerCase()
  };
}

function saveSettingsStruct(s) {
  localStorage.setItem('HaUrl',     s.haUrl     || '');
  localStorage.setItem('HaToken',   s.haToken   || '');
  localStorage.setItem('SysEntity', s.sysEntity || '');
  localStorage.setItem('DiaEntity', s.diaEntity || '');
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
  return true;
}

// ----- Fetch from Home Assistant -----

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

    console.log(p + ' WS msg: ' + msg.type);

    if (msg.type === 'auth_required') {
      ws.send(JSON.stringify({ type: 'auth', access_token: s.haToken }));

    } else if (msg.type === 'auth_ok') {
      ws.send(JSON.stringify({
        id: 1,
        type: 'recorder/list_statistic_ids',
        statistic_type: 'mean'
      }));

    } else if (msg.type === 'auth_invalid') {
      console.log(p + ' WS auth invalid');
      ws.close();

    } else if (msg.type === 'result' && msg.id === 1) {
      if (msg.success && msg.result) {
        var ids = msg.result;
        for (var i = 0; i < ids.length; i++) {
          var sid = ids[i].statistic_id || '';
          if (sid.indexOf('blood') !== -1 || sid.indexOf('pressure') !== -1 ||
              sid.indexOf('systolic') !== -1 || sid.indexOf('diastolic') !== -1) {
            console.log(p + ' found stat: ' + JSON.stringify(ids[i]));
          }
        }
      }
      var start = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      ws.send(JSON.stringify({
        id: 2,
        type: 'recorder/statistics_during_period',
        start_time: start,
        statistic_ids: [s.sysEntity, s.diaEntity],
        period: '5minute',
        types: ['mean']
      }));

    } else if (msg.type === 'result' && msg.id === 2) {
      ws.close();
      if (msg.success && msg.result) {
        console.log(p + ' WS result: ' + JSON.stringify(msg.result).substring(0, 500));
        processStatistics(msg.result, s, p);
      } else {
        console.log(p + ' WS stats failed: ' + JSON.stringify(msg.error));
      }
    }
  };

  ws.onerror = function() { console.log(p + ' WS error'); };
  ws.onclose = function() { console.log(p + ' WS closed'); };
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

// ----- Process data from Home Assistant -----

function processStatistics(result, s, p) {
  var sysStats = result[s.sysEntity] || [];
  var diaStats = result[s.diaEntity] || [];
  console.log(p + ' sys:' + sysStats.length + ' dia:' + diaStats.length + ' entries');

  if (!sysStats.length || !diaStats.length) {
    console.log(p + ' no statistics data found');
    return;
  }

  // Map systolic entries by start time for matching with diastolic
  var sysMap = {};
  for (var i = 0; i < sysStats.length; i++) {
    var se = sysStats[i];
    if (se && se.start && se.mean !== null && se.mean !== undefined) {
      sysMap[se.start] = se.mean;
    }
  }

  // Walk newest-first, deduplicate consecutive identical readings
  var readings = [];
  var lastSys = -1, lastDia = -1;

  for (var j = diaStats.length - 1; j >= 0 && readings.length < 10; j--) {
    var de = diaStats[j];
    if (!de || !de.start || de.mean === null || de.mean === undefined) continue;
    var sysMean = sysMap[de.start];
    if (sysMean === undefined) continue;

    var sys = Math.round(sysMean);
    var dia = Math.round(de.mean);
    if (!sys || !dia) continue;

    // Skip if identical to previous kept reading
    if (sys === lastSys && dia === lastDia) continue;
    lastSys = sys;
    lastDia = dia;

    var d = new Date(de.start);
    var dateStr = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' +
                  pad(d.getHours()) + ':' + pad(d.getMinutes());
    readings.push({ systolic: sys, diastolic: dia, date: dateStr });
  }

  // Reverse to show oldest at top, newest at bottom
  readings.reverse();
  console.log(p + ' prepared ' + readings.length + ' unique readings');

  if (!readings.length) {
    console.log(p + ' no matched readings found');
    return;
  }
  sendTotal(readings);
}
// ----- Send readings to watch -----

function sendTotal(readings) {
  var msg = {};
  msg[KEY_TOTAL] = readings.length;
  Pebble.sendAppMessage(msg,
    function () {
      sendReading(readings, 0);
    },
    function () {
      console.log('BP: failed to send total');
    }
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
    function () {
      sendReading(readings, index + 1);
    },
    function () {
      console.log('BP: failed to send reading ' + index);
    }
  );
}

// ----- Pebble events -----

Pebble.addEventListener('ready', function () {
  console.log('BP: PebbleKit JS ready');
  fetchBPData(null, 'normal');  // try with any stored settings
});

// React when the config page closes (Clay handles opening/closing)
Pebble.addEventListener('webviewclosed', function (e) {
  if (!e || !e.response || e.response === 'CANCELLED') {
    console.log('BP: config cancelled or empty');
    return;
  }

  var dict;
  try {
    dict = clay.getSettings(e.response);
  } catch (err) {
    console.log('BP: clay getSettings error: ' + err);
    return;
  }

  console.log('BP: raw Clay settings: ' + JSON.stringify(dict));

  var s = settingsFromClay(dict);
  console.log('BP: normalized settings: ' + JSON.stringify(s));

  saveSettingsStruct(s);

  if (s.testConnection) {
    console.log('BP TEST: running full history fetch test');
    fetchBPData(s, 'test');
  } else {
    fetchBPData(s, 'normal');
  }
});
