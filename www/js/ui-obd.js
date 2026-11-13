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
        '<div class="big"><span id="v-' + id + '">—</span> <span class="sm">' + esc(p.unit) + '</span></div>' +
        '<div class="sm" id="s-' + id + '"></div><div class="sm" id="m-' + id + '"></div>' +
        (p.ref ? '<div class="sm">' + esc(p.ref) + '</div>' : '') +
        (p.nochart ? '' : '<canvas id="c-' + id + '" class="spark"></canvas>') + '</div>';
    }).join('');
  }

  function renderLive() {
    var h = '<h2>' + T('Canlı göstəricilər (Live Data)', 'Live Data') + '</h2>';
    if (S.state !== 'ecu') {
      h += '<div class="card warn"><p>' + esc(T('Real ECU-ya qoşulmamısınız. Əvvəl "Qoşul" bölməsində adapteri qoşun. Heç bir saxta dəyər göstərilmir.', 'Not connected to a real ECU. Connect the adapter first. No fake values are shown.')) + '</p></div>';
      view.innerHTML = h; return;
    }
    h += '<div id="spdwarn"></div>';
    h += '<div class="card">' + row(T('Sürət', 'Rate'), '—').replace('<span class="">—', '<span id="rate">—') +
      (OBD.polling ? '<button class="btn del" data-ob="stop">' + esc(T('Dayandır', 'Stop')) + '</button>'
        : '<button class="btn" data-ob="start">' + esc(T('Başlat', 'Start')) + '</button>') + '</div>';
    var sup = OBD.supported.filter(function (p) { return PIDS[p]; });
    sup.push('RV');
    var known = sup.length - 1, unknown = OBD.supported.length - known;
    h += '<details class="card"><summary>' + esc(T('PID seçimi', 'PID selection')) + ' (' + sup.length + ')</summary>' +
      sup.map(function (id) {
        return '<label class="chk"><input type="checkbox" data-ob="sel" value="' + id + '"' + (OBD.selected.indexOf(id) >= 0 ? ' checked' : '') + '>' + esc(id + ' · ' + pname(id)) + '</label>';
      }).join('') +
      '<p class="sm">' + esc(T('Daha çox PID seçsəniz, hər birinin yenilənməsi yavaşlayır. ', 'More PIDs means slower updates for each. ')) +
      esc(unknown > 0 ? (unknown + T(' PID dəstəklənir, amma bu versiyada dekodlanmır.', ' PIDs supported but not decoded in this version.')) : '') + '</p></details>';
    if (OBD.polling) {
      h += '<div id="cards">' + cardsHtml() + '</div>' +
        '<div class="card"><b>' + esc(T('Müqayisə qrafiki', 'Comparison chart')) + '</b>' +
        '<p class="sm">' + esc(T('Hər xətt öz min–maks aralığına görə normallaşdırılıb. Kartlarda "qrafikdə" seçin.', 'Each line is normalised to its own min–max. Tick "chart" on cards.')) + '</p>' +
        '<canvas id="cmp" class="cmp"></canvas><div id="leg" class="sm"></div></div>';
    }
    view.innerHTML = h;
    if (OBD.polling) updateLive();
  }

  function updateLive() {
    var spd = OBD.values['0D'], sw = document.getElementById('spdwarn');
    if (sw) sw.innerHTML = (spd && spd.v > 0) ? '<div class="card warn"><p>' + esc(T('Avtomobil hərəkətdədir. Telefona baxmayın, testləri park halında aparın.', 'Vehicle is moving. Do not look at the phone; test while parked.')) + '</p></div>' : '';
    var rt = document.getElementById('rate');
    if (rt) rt.textContent = OBD.rate ? OBD.rate.toFixed(1) + ' ' + T('sorğu/san', 'req/s') : '—';
    var series = [], leg = '';
    OBD.selected.forEach(function (id) {
      var p = PIDS[id], r = OBD.values[id];
      var v = document.getElementById('v-' + id);
      if (!p || !v) return;
      var s = document.getElementById('s-' + id), m = document.getElementById('m-' + id);
      if (!r || (r.v === null && !r.nodata)) { v.textContent = '…'; return; }
      if (r.nodata && r.v === null) {
        v.textContent = '—'; s.textContent = T('ECU cavab vermir', 'ECU not responding'); s.className = 'sm no'; return;
      }
      v.textContent = r.txt ? r.txt : r.v.toFixed(p.fix === undefined ? 1 : p.fix);
      var out = p.warn && (r.v < p.warn[0] || r.v > p.warn[1]);
      s.textContent = out ? T('ümumi aralıqdan kənar', 'outside general range') : T('oxunur', 'reading');
      s.className = 'sm ' + (out ? 'no' : 'ok');
      var f = p.fix === undefined ? 1 : p.fix;
      m.textContent = 'min ' + r.min.toFixed(f) + ' · ' + T('maks', 'max') + ' ' + r.max.toFixed(f);
      if (!p.nochart) drawSeries(document.getElementById('c-' + id), [{ h: r.hist, color: '#3ddc97' }]);
      if (charted[id] && !p.nochart) {
        var col = COLORS[series.length % COLORS.length];
        series.push({ h: r.hist, color: col });
        leg += '<span style="color:' + col + '">■</span> ' + esc(pname(id)) + ' (' + r.min.toFixed(f) + '…' + r.max.toFixed(f) + ' ' + esc(p.unit) + ')<br>';
      }
    });
    var cmp = document.getElementById('cmp');
    if (cmp) { drawSeries(cmp, series); document.getElementById('leg').innerHTML = leg; }
  }

  function checkedIds() {
    var out = [];
    document.querySelectorAll('input[data-ob="sel"]:checked').forEach(function (e) { out.push(e.value); });
    return out;
  }

  /* ---------- Hadisələr ---------- */
  var renderConnectT = throttle(function () { if (cur() === 'connect') renderConnect(); });
  var renderLiveT = throttle(function () { if (cur() === 'live') renderLive(); });
  var updateLiveT = throttle(function () { if (cur() === 'live') updateLive(); });

  OBD.on(function (type) {
    pill();
    var c = cur();
    if (c === 'connect') renderConnectT();
    else if (c === 'live') { if (type === 'state') renderLiveT(); else updateLiveT(); }
  });
  Log.on(function () { if (cur() === 'connect') updateLog(); });

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-ob]');
    if (!el) return;
    var a = el.getAttribute('data-ob');
    if (a === 'scan') doScan();
    else if (a === 'conn') { var id = el.getAttribute('data-id'); OBD.connect(id, (found[id] && found[id].name) || id); }
    else if (a === 'disc') OBD.disconnect();
    else if (a === 'retry') OBD.retryEcu();
    else if (a === 'copy') copyLog();
    else if (a === 'clearlog') Log.clear();
    else if (a === 'start') {
      var ids = checkedIds();
      if (!ids.length) ids = OBD.selected.slice();
      OBD.startPoll(ids);
    } else if (a === 'stop') OBD.stopPoll();
    else if (a === 'chart') { charted[el.getAttribute('data-id')] = el.checked; updateLive(); }
    else if (a === 'sel' && OBD.polling) {
      setTimeout(function () { OBD.setSelected(checkedIds()); }, 0);
    }
  });

  function apply() {
    pill();
    var c = cur();
    if (c === 'connect') renderConnect();
    else if (c === 'live') renderLive();
  }
  window.addEventListener('hashchange', apply);
  apply();
})();
