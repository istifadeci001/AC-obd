(function () {
  'use strict';
  var view = document.getElementById('view'), S = OBD.S;
  var ICON = { livediag: '🩺', fuel: '⛽', compat: '✅', connect: '🔌', live: '📈', monitor: '🤖', diag: '🧠', dtc: '⚠️', freeze: '🧊', readiness: '🚦', mode06: '🧪', advanced: '🛠️', vehicle: '🚗', logging: '📝', reports: '📄', custompid: '🎛️', aionline: '✨', backup: '💾', archive: '🗂️', glossary: '📚', garage: '🏠', settings: '⚙️', about: 'ℹ️' };
  var LBL = {
    livediag: 'Canlı diaqnostika (Live Diagnostics)', fuel: 'Yanacaq, bak, təkər (Fuel & Tires)',
    compat: 'Dəstək yoxlaması (Compatibility)', readiness: 'Hazırlıq testləri (Readiness)', mode06: 'Mode 06 (xam)',
    custompid: 'Fərdi PID (Custom PID)', aionline: 'AI izah, internet (AI Explain)', backup: 'Ehtiyat nüsxə (Backup)',
    archive: 'Avtomobil arxivi (Vehicle Archive)', glossary: 'Terminlər lüğəti (Glossary)', about: 'Haqqımızda və Əlaqə (About)'
  };
  var GROUPS = [
    ['Diaqnostika', ['livediag', 'live', 'dtc', 'freeze', 'readiness', 'mode06', 'diag', 'monitor', 'compat']],
    ['Avtomobil', ['fuel', 'vehicle', 'garage', 'archive', 'logging', 'reports']],
    ['Alətlər', ['custompid', 'aionline', 'backup', 'glossary', 'advanced', 'settings', 'about']]
  ];
  function L() { return Store.get('lang', 'az'); }
  function T(a, e) { return L() === 'en' ? e : a; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cur() { return (location.hash || '#dashboard').slice(1); }
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
  function row(k, v, cls) {
    return '<div class="row"><span class="k">' + esc(k) + '</span><span class="' + (cls || '') + '">' + esc(v) + '</span></div>';
  }
  function pill() {
    var p = document.getElementById('conn');
    if (!p) return;
    p.textContent = stateTxt(S.state);
    p.className = 'pill ' + (S.state === 'ecu' ? 'ok' : 'off');
  }
  function activeVehicle() {
    var g = Store.get('garage', []), id = Store.get('activeVehicle', null), v = null;
    g.forEach(function (x) { if (x.id === id) v = x; });
    return v;
  }
  function render() {
    var I = I18N[L()] || I18N.az, v = activeVehicle(), d = Session.ctx.dtc, ok = S.state === 'ecu';
    var codes = (d && d.stored && d.stored.ok) ? (d.stored.codes.length ? d.stored.codes.join(', ') : T('yoxdur', 'none')) : T('oxunmayıb', 'not read');
    var cs = Compat.summary(), has = Compat.has();
    var cTxt = has ? (cs.ok + ' ' + T('işləyir', 'working') + ' · ' + cs.no + ' ' + T('dəstəklənmir', 'unsupported') + ' · ' + cs.todo + ' ' + T('hələ yazılmayıb', 'not built yet'))
      : (ok ? T('yoxlanılır…', 'checking…') : T('qoşulduqda avtomatik', 'automatic on connect'));
    var hero = '<div class="hero"><div class="st"><span class="dot' + (ok ? ' ok' : '') + '"></span>' + esc(stateTxt(S.state)) + '</div>' +
      '<div class="sm" style="margin-top:6px">' + (ok ? esc((S.deviceName || '') + (S.protocol ? ' · ' + S.protocol : '') + ' · PID: ' + S.supported.length)
        : esc(T('Adapteri OBD portuna taxın, açarı ON vəziyyətinə çevirin.', 'Plug the adapter into the OBD port and turn the ignition ON.'))) + '</div>' +
      '<div class="car">🚗 ' + esc(v ? [v.make, v.model, v.year].filter(Boolean).join(' ') : T('Avtomobil seçilməyib (Qaraj)', 'No vehicle selected (Garage)')) + '</div>' +
      '<div class="qa"><a class="main" href="#connect">🔌 ' + esc(ok ? T('Adapter', 'Adapter') : T('Qoşul', 'Connect')) + '</a><a href="#livediag">🩺 ' + esc(T('Diaqnostika', 'Diagnostics')) + '</a>' +
      '<a href="#dtc">⚠️ ' + esc(T('Kodlar', 'Codes')) + '</a><a href="#fuel">⛽ ' + esc(T('Yanacaq', 'Fuel')) + '</a></div></div>';
    var info = '<div class="card" style="margin-top:14px">' +
      row(T('Dəstək yoxlaması', 'Compatibility'), cTxt, has && cs.no ? 'no' : (has ? 'ok' : 'sm')) +
      row(T('Saxlanmış xəta kodları', 'Stored fault codes'), codes) +
      row(T('Xəta kodu bazası', 'DTC database'), (window.DTC_COUNT || 0) + ' ' + I.dash_codes) + '</div>';
    var groups = GROUPS.map(function (g) {
      return '<div class="sect">' + esc(g[0]) + '</div><div class="grid">' + g[1].map(function (s) {
        return '<a class="tile" href="#' + s + '"><span class="ti">' + (ICON[s] || '•') + '</span><span>' + esc(I['nav_' + s] || LBL[s] || s) + '</span></a>';
      }).join('') + '</div>';
    }).join('');
    view.innerHTML = '<div data-dash="1">' + hero + info + groups + '</div>';
  }
  new MutationObserver(function () {
    pill();
    if (cur() === 'dashboard' && !view.querySelector('[data-dash]')) render();
  }).observe(view, { childList: true });
  OBD.on(function (type) { pill(); if (type === 'state' && cur() === 'dashboard') render(); });
  Compat.on(function () { if (cur() === 'dashboard') render(); });
  pill();
  if (cur() === 'dashboard') render();
})();
