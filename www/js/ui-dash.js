(function () {
  'use strict';
  var view = document.getElementById('view'), S = OBD.S;

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
    var I = I18N[L()] || I18N.az;
    var v = activeVehicle(), d = Session.ctx.dtc;
    var codes = (d && d.stored && d.stored.ok)
      ? (d.stored.codes.length ? d.stored.codes.join(', ') : T('yoxdur', 'none'))
      : T('oxunmayıb', 'not read');
    var dataTxt = S.state === 'ecu'
      ? (OBD.polling ? T('oxunur', 'reading') : T('ECU qoşulub, oxuma dayanıb', 'ECU connected, reading stopped'))
      : T('yoxdur', 'none');
    var secs = ['connect', 'live', 'monitor', 'diag', 'dtc', 'freeze', 'advanced', 'vehicle', 'logging', 'reports', 'garage', 'settings'];
    var tiles = secs.map(function (s) {
      return '<a class="tile" href="#' + s + '">' + esc(I['nav_' + s]) + '</a>';
    }).join('');
    view.innerHTML = '<div data-dash="1"><h2>' + esc(I.nav_dashboard) + '</h2><div class="card">' +
      row(T('Bağlantı', 'Connection'), stateTxt(S.state), S.state === 'ecu' ? 'ok' : 'no') +
      row(T('Real ECU məlumatı', 'Real ECU data'), dataTxt, OBD.polling ? 'ok' : 'no') +
      row(T('Dəstəklənən PID', 'Supported PIDs'), S.supported.length ? String(S.supported.length) : '—') +
      row(T('Saxlanmış xəta kodları', 'Stored fault codes'), codes) +
      row(T('Aktiv avtomobil', 'Active vehicle'), v ? [v.make, v.model, v.year].filter(Boolean).join(' ') : I.dash_none_vehicle) +
      row(T('DTC bazası (nümunə)', 'DTC database (sample)'), Object.keys(DTC_DB).length + ' ' + I.dash_codes) +
      '</div><div class="grid">' + tiles + '</div></div>';
  }

  new MutationObserver(function () {
    pill();
    if (cur() === 'dashboard' && !view.querySelector('[data-dash]')) render();
  }).observe(view, { childList: true });

  OBD.on(function (type) {
    pill();
    if (type === 'state' && cur() === 'dashboard') render();
  });

  pill();
  if (cur() === 'dashboard') render();
})();
