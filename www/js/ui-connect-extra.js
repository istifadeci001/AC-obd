(function () {
  'use strict';
  var view = document.getElementById('view'), S = OBD.S, tried = '';
  var LIKELY = /KW|OBD|ELM|LINK|VGATE|ICAR|SCAN|VEEPEAK|VIECAR|KONNWEI|CARISTA/i;
  function cur() { return (location.hash || '#dashboard').slice(1); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nameOf(r) {
    var s = r.querySelector('span');
    return s && s.firstChild ? String(s.firstChild.nodeValue || '').trim() : '';
  }
  function patch() {
    if (cur() !== 'connect') return;
    var rows = Array.prototype.slice.call(view.querySelectorAll('.row.dev'));
    if (rows.length && !view.querySelector('[data-ce-done]')) {
      var parent = rows[0].parentNode, good = [], named = [], unnamed = [];
      rows.forEach(function (r) {
        var n = nameOf(r);
        if (!n || /^\((adsız|unnamed)\)$/.test(n)) unnamed.push(r);
        else if (LIKELY.test(n)) { r.querySelector('span').firstChild.nodeValue = '✅ ' + n; good.push(r); }
        else named.push(r);
      });
      good.concat(named).forEach(function (r) { parent.appendChild(r); });
      if (unnamed.length) {
        var d = document.createElement('details');
        d.innerHTML = '<summary class="sm">Adsız cihazlar (' + unnamed.length + ')</summary>';
        unnamed.forEach(function (r) { d.appendChild(r); });
        parent.appendChild(d);
      }
      var info = document.createElement('p');
      info.className = 'sm';
      info.setAttribute('data-ce-done', '1');
      info.textContent = rows.length + ' cihaz tapıldı: ' + good.length + ' ehtimal olunan adapter (✅), ' + named.length + ' digər adlı, ' + unnamed.length + ' adsız.';
      parent.appendChild(info);
    }
    var last = Store.get('lastdev', null);
    if ((S.state === 'idle' || S.state === 'error') && last && last.id && !view.querySelector('[data-ce-last]')) {
      var c = document.createElement('div');
      c.className = 'card';
      c.setAttribute('data-ce-last', '1');
      c.innerHTML = '<label>Son qoşulan adapter</label><button class="btn" data-ce="last">🔌 ' + esc(last.name || last.id) + '</button>';
      view.insertBefore(c, view.children[2] || null);
    }
  }
  function readName() {
    if (tried === S.deviceId || !window.BleClient) return;
    tried = S.deviceId;
    window.BleClient.read(S.deviceId, '00001800-0000-1000-8000-00805f9b34fb', '00002a00-0000-1000-8000-00805f9b34fb').then(function (dv) {
      var s = '';
      for (var i = 0; i < dv.byteLength; i++) s += String.fromCharCode(dv.getUint8(i));
      s = s.replace(/\0/g, '').trim();
      if (s) { S.deviceName = s; Store.set('lastdev', { id: S.deviceId, name: s }); }
    }).catch(function () {});
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-ce="last"]');
    if (!el) return;
    var l = Store.get('lastdev', null);
    if (l && l.id) OBD.connect(l.id, l.name || l.id);
  });
  OBD.on(function () {
    if ((S.state === 'ecu' || S.state === 'elm') && S.deviceId) {
      var l = Store.get('lastdev', null);
      if (!l || l.id !== S.deviceId || (S.deviceName !== S.deviceId && l.name !== S.deviceName)) Store.set('lastdev', { id: S.deviceId, name: S.deviceName });
      if (S.deviceName === S.deviceId) readName();
    } else if (S.state === 'idle') tried = '';
  });
  new MutationObserver(patch).observe(view, { childList: true });
  patch();
})();
