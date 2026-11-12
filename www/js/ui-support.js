(function () {
  'use strict';
  var view = document.getElementById('view'), S = OBD.S, msg = '', wl = null;
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cur() { return (location.hash || '#dashboard').slice(1); }
  function bundle() {
    var o = ['AC OBD diaqnostik paketi', 'Versiya: ' + (window.APP_VERSION || '?'), 'Tarix: ' + new Date().toISOString(), 'Cihaz: ' + navigator.userAgent, ''];
    o.push('Bağlantı: ' + S.state + ' | adapter: ' + (S.deviceName || '-') + ' | ELM: ' + (S.elmVersion || '-') + ' | protokol: ' + (S.protocol || '-') + ' | PID sayı: ' + S.supported.length);
    var ai = window.Adapter && Adapter.info(), sm = window.Adapter && Adapter.map();
    if (ai) o.push('ATI: ' + ai.ati + ' | STI: ' + ai.sti + ' | AT@1: ' + ai.at1);
    o.push('O2 sxemi: ' + (sm && sm.scheme ? sm.scheme + ', maska ' + sm.mask : '—'));
    o.push('Dəstəklənən PID: ' + (S.supported.join(' ') || '—'), '', 'Dəstək yoxlaması:');
    Compat.list().forEach(function (x) { o.push('  [' + x.st + '] ' + x.name + (x.d ? ' — ' + x.d : '')); });
    var d = Session.ctx.dtc;
    if (d) o.push('', 'Son kod oxunuşu: 03=' + (d.stored.ok ? d.stored.codes.join(',') || 'yoxdur' : 'cavab yoxdur') + ' | 07=' + (d.pending.ok ? d.pending.codes.join(',') || 'yoxdur' : 'cavab yoxdur') + ' | 0A=' + (d.permanent.ok ? d.permanent.codes.join(',') || 'yoxdur' : 'cavab yoxdur'));
    o.push('', 'Adapter jurnalı (son 150 sətir):');
    Log.all().slice(-150).forEach(function (l) { o.push(l); });
    return o.join('\n');
  }
  function render() {
    view.innerHTML = '<h2>Test paketi (Support Bundle)</h2>' +
      (msg ? '<div class="card"><p class="ok">' + esc(msg) + '</p></div>' : '') +
      '<div class="card"><p>Proqramın vəziyyəti, adapter məlumatı, dəstək yoxlaması və adapter jurnalı bir mətndə toplanır. VIN və şəxsi məlumat daxil edilmir. Başqa avtomobil və ya adapterdə sınaqdan sonra bunu göndərin.</p>' +
      '<button class="btn" data-sp="share">Paketi paylaş</button><button class="btn alt" data-sp="copy">Paketi kopyala</button></div>' +
      '<div class="card"><label>Ekranın açıq qalması</label><p class="sm">Canlı diaqnostika və ya yanacaq hesablaması işləyərkən ekran avtomatik sönməsin deyə ekranı oyaq saxlamağa çalışır. Bu Android WebView-da işləməyə bilər, cihazda yoxlanmayıb.</p></div>';
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-sp]');
    if (!el) return;
    var a = el.getAttribute('data-sp'), t = bundle();
    msg = '';
    if (a === 'copy') { msg = Session.copy(t) ? 'Paket kopyalandı.' : 'Kopyalama alınmadı.'; render(); }
    else Session.share(t, 'AC OBD test paketi').then(function (r) { msg = r === 'copy' ? 'Paket kopyalandı.' : (r === 'fail' ? 'Paylaşmaq alınmadı.' : ''); render(); });
  });
  function addDrawer() {
    var dl = document.getElementById('drawerlist');
    if (dl && !dl.querySelector('a[href="#support"]')) {
      var a = document.createElement('a');
      a.href = '#support'; a.textContent = 'Test paketi (Support Bundle)';
      dl.appendChild(a);
    }
  }
  function wake(on) {
    try {
      if (on && navigator.wakeLock && !wl) navigator.wakeLock.request('screen').then(function (l) { wl = l; l.addEventListener('release', function () { wl = null; }); }).catch(function () {});
      if (!on && wl) { wl.release(); wl = null; }
    } catch (e) {}
  }
  function check() { wake(LiveDiag.state().on || Fuel.running()); }
  LiveDiag.on(check);
  Fuel.on(check);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
  var dl0 = document.getElementById('drawerlist');
  if (dl0) new MutationObserver(addDrawer).observe(dl0, { childList: true });
  window.addEventListener('hashchange', function () { if (cur() === 'support') render(); addDrawer(); });
  addDrawer();
  if (cur() === 'support') render();
})();
