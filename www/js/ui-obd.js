(function () {
  'use strict';
  var view = document.getElementById('view');
  var S = OBD.S;
  var found = {}, scanning = false, charted = {};
  var COLORS = ['#3ddc97', '#4da3ff', '#ffb454', '#ff6b6b', '#c792ea', '#7fdbca', '#f78c6c', '#82aaff'];

  function L() { return Store.get('lang', 'az'); }
  function T(a, e) { return L() === 'en' ? e : a; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cur() { return (location.hash || '#dashboard').slice(1); }
  function row(k, v, cls) {
    return '<div class="row"><span class="k">' + esc(k) + '</span><span class="' + (cls || '') + '">' + esc(v) + '</span></div>';
  }
  function throttle(fn) {
    var t = null;
    return function () { if (t) return; t = setTimeout(function () { t = null; fn(); }, 300); };
  }
  function stateTxt(s) {
    var m = {
      idle: T('Adapter qoşulmayıb', 'Adapter not connected'),
      connecting: T('Qoşulur…', 'Connecting…'),
      probing: T('Adapter yoxlanır…', 'Probing adapter…'),
      elm: T('Adapter qoşulub, ECU cavab vermir', 'Adapter connected, ECU not responding'),
      ecu: T('ECU qoşulub', 'ECU connected'),
      reconnecting: T('Yenidən qoşulur…', 'Reconnecting…'),
      error: T('Xəta', 'Error')
    };
    return m[s] || s;
  }
  function pill() {
    var p = document.getElementById('conn');
    if (!p) return;
    p.textContent = stateTxt(S.state);
    p.className = 'pill ' + (S.state === 'ecu' ? 'ok' : 'off');
  }

  /* ---------- Qoşul ---------- */
  function renderConnect() {
    var h = '<h2>' + T('Adapter qoşulması (Connect Adapter)', 'Connect Adapter') + '</h2>';
    h += '<div class="card">' +
      row(T('Vəziyyət', 'Status'), stateTxt(S.state), S.state === 'ecu' ? 'ok' : 'no') +
      row('BLE', S.deviceName || '—') +
      row('ELM327', S.elmVersion || '—') +
      row(T('Protokol', 'Protocol'), S.protocol || '—') +
      row(T('Dəstəklənən PID', 'Supported PIDs'), S.supported.length ? String(S.supported.length) : '—');
    if (S.error) h += '<p class="bad">' + esc(S.error) + '</p>';
    if (S.warns.length) h += '<p class="sm">' + esc(T('Komanda xəbərdarlıqları: ', 'Command warnings: ') + S.warns.join('; ')) + '</p>';
    h += '</div>';

    var busy = S.state === 'connecting' || S.state === 'probing' || S.state === 'reconnecting';
    if (S.state === 'idle' || S.state === 'error') {
      h += '<div class="card"><p>' + esc(T('KW903-ü OBD portuna taxın, açarı ON vəziyyətinə çevirin, sonra axtarın. İcazə soruşsa, "İcazə ver" seçin (Yaxındakı cihazlar, lazım gələrsə Yer).', 'Plug the KW903 into the OBD port, turn ignition ON, then scan. Allow permissions if asked (Nearby devices, and Location if requested).')) + '</p>' +
        '<button class="btn" data-ob="scan"' + (scanning ? ' disabled' : '') + '>' + esc(scanning ? T('Axtarılır…', 'Scanning…') : T('Cihaz axtar', 'Scan for devices')) + '</button>';
      var ids = Object.keys(found).sort(function (a, b) {
        var A = found[a], B = found[b];
        if (!!A.name !== !!B.name) return A.name ? -1 : 1;
        return (B.rssi || -999) - (A.rssi || -999);
      });
      var unnamed = 0;
      ids.forEach(function (id) {
        var d = found[id];
        if (!d.name) { unnamed++; if (unnamed > 8) return; }
        h += '<div class="row dev"><span>' + esc(d.name || T('(adsız)', '(unnamed)')) + '<br><span class="sm">' + esc(id) + ' · ' + esc(d.rssi) + ' dBm</span></span>' +
          '<button class="btn alt" style="width:auto;margin:0" data-ob="conn" data-id="' + esc(id) + '">' + esc(T('Qoşul', 'Connect')) + '</button></div>';
      });
      h += '</div>';
    } else if (busy) {
      h += '<div class="card"><p>' + esc(stateTxt(S.state)) + '</p></div>';
    } else {
      h += '<div class="card">' +
        (S.state === 'elm' ? '<button class="btn alt" data-ob="retry">' + esc(T('ECU-nu yenidən yoxla', 'Retry ECU')) + '</button>' : '') +
        '<button class="btn del" data-ob="disc">' + esc(T('Ayrıl', 'Disconnect')) + '</button></div>';
    }

    h += '<div class="card"><label>' + esc(T('Adapter jurnalı (xəta olsa, bunu mənə göndərin)', 'Adapter log (send this if something fails)')) + '</label>' +
      '<pre class="log" id="logpre"></pre>' +
      '<button class="btn alt" data-ob="copy">' + esc(T('Jurnalı kopyala', 'Copy log')) + '</button>' +
      '<button class="btn alt" data-ob="clearlog">' + esc(T('Jurnalı təmizlə', 'Clear log')) + '</button></div>';
    h += Report.card();
    view.innerHTML = h;
    updateLog();
  }
  function updateLog() {
    var el = document.getElementById('logpre');
    if (!el) return;
    el.textContent = Log.all().slice(-80).join('\n');
    el.scrollTop = el.scrollHeight;
  }
  function copyLog() {
    var t = Log.text();
    function fb() {
      var a = document.createElement('textarea');
      a.value = t; document.body.appendChild(a); a.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(a);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).catch(fb);
    else fb();
  }
  function doScan() {
    scanning = true; found = {};
    renderConnect();
    OBD.scan(function (r) { found[r.id] = r; renderConnectT(); }, 8000)
      .catch(function (e) { Log.add('ERR', 'axtarış: ' + (e && e.message ? e.message : e)); S.error = T('Axtarış alınmadı: ', 'Scan failed: ') + (e && e.message ? e.message : e); })
      .then(function () { scanning = false; if (cur() === 'connect') renderConnect(); });
  }

  /* ---------- Canlı ---------- */
  function drawSeries(cv, series) {
    if (!cv) return;
    var dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    var c = cv.getContext('2d');
    c.scale(dpr, dpr); c.clearRect(0, 0, w, h); c.lineWidth = 2;
    series.forEach(function (s) {
      var a = s.h; if (a.length < 2) return;
      var mn = Math.min.apply(null, a), mx = Math.max.apply(null, a);
      if (mx === mn) mx = mn + 1;
      c.strokeStyle = s.color; c.beginPath();
      a.forEach(function (v, i) {
        var x = i / (a.length - 1) * w, y = h - 4 - (v - mn) / (mx - mn) * (h - 8);
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      });
      c.stroke();
    });
  }
  function pname(id) { var p = PIDS[id]; return L() === 'en' ? p.en : p.az; }

  function cardsHtml() {
    return OBD.selected.map(function (id) {
      var p = PIDS[id];
      return '<div class="card"><div class="row"><span>' + esc(pname(id)) + '</span>' +
        '<label class="sm"><input type="checkbox" data-ob="chart" data-id="' + id + '"' + (charted[id] ? ' checked' : '') + '>' + esc(T('qrafikdə', 'chart')) + '</label></div>' +
        '<div class="big"><span id="v-'
