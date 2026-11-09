(function () {
  'use strict';
  var view = document.getElementById('view'), ctx = Session.ctx;
  var EMAIL = 'Azerbaijan.software@gmail.com';
  var screens = {}, openKey = null, msg = '', gq = '', gcat = 'all';
  var st = { seen: false, key: '', welcomed: false, dtcT: '', t0: 0, vinBusy: false, vinDone: false };
  var ITEMS = [
    { id: 'archive', az: 'Avtomobil arxivi (Vehicle Archive)', en: 'Vehicle Archive' },
    { id: 'glossary', az: 'Terminlər lüğəti (Glossary)', en: 'Glossary' },
    { id: 'about', az: 'Haqqımızda və Əlaqə (About & Contact)', en: 'About & Contact' }
  ];
  var CATS = [
    ['all', 'Hamısı', 'Все', 'All'],
    ['eng', 'Mühərrik', 'Двигатель', 'Engine'],
    ['fuel', 'Yanacaq və hava', 'Топливо и воздух', 'Fuel & air'],
    ['cool', 'Soyutma', 'Охлаждение', 'Cooling'],
    ['elec', 'Elektrik və sensorlar', 'Электрика и датчики', 'Electrical & sensors'],
    ['chas', 'Şassi, əyləc, sükan', 'Ходовая, тормоза, рулевое', 'Chassis, brakes, steering'],
    ['trans', 'Transmissiya', 'Трансмиссия', 'Transmission'],
    ['diag', 'Diaqnostika terminləri', 'Диагностические термины', 'Diagnostic terms']
  ];

  function L() { return Store.get('lang', 'az'); }
  function T(a, e) { return L() === 'en' ? e : a; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cur() { return (location.hash || '#dashboard').slice(1); }
  function card(inner) { return '<div class="card">' + inner + '</div>'; }
  function row(k, v) { return '<div class="row"><span class="k">' + esc(k) + '</span><span>' + esc(v) + '</span></div>'; }
  function bh(label, act, key, cls) {
    return '<button class="btn' + (cls ? ' ' + cls : '') + '" data-mo="' + act + '" data-k="' + esc(key || '') + '">' + esc(label) + '</button>';
  }
  function p2(n) { return ('0' + n).slice(-2); }
  function fmt(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  /* ---------- Arxiv yaddaşı ---------- */
  function getArch() { return Store.get('archive', {}); }
  function setArch(a) { return Store.set('archive', a); }
  function activeV() {
    var g = Store.get('garage', []), id = Store.get('activeVehicle', null), v = null;
    g.forEach(function (x) { if (x.id === id) v = x; });
    return v;
  }
  function vname(v) { return v ? [v.make, v.model, v.year].filter(Boolean).join(' ') : ''; }
  function vinNow() {
    var v = String(ctx.vin || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return v.length === 17 ? v : '';
  }
  function keyFor() {
    var v = vinNow();
    if (v) return 'vin:' + v;
    var a = activeV();
    return a ? 'g:' + a.id : '';
  }
  function union(e) {
    var u = [];
    ['stored', 'pending', 'permanent'].forEach(function (k) {
      (e[k] || []).forEach(function (c) { if (u.indexOf(c) < 0) u.push(c); });
    });
    return u;
  }
  function codesLine(a) {
    return a === null ? T('oxunmayıb', 'not read') : (a.length ? a.join(', ') : T('yoxdur', 'none'));
  }
  function sameE(a, b) {
    function s(x) { return JSON.stringify([x.stored, x.pending, x.permanent].map(function (y) { return y ? y.slice().sort() : null; })); }
    return s(a) === s(b);
  }

  function identify(key) {
    var A = getArch(), rec = A[key], now = new Date().toISOString(), known = false, prev = now;
    if (!rec) {
      rec = A[key] = { key: key, vin: key.indexOf('vin:') === 0 ? key.slice(4) : '', cal: ctx.cal || '', name: vname(activeV()), first: now, last: now, connects: 0, visits: [] };
    } else { known = true; prev = rec.last; }
    rec.connects = (rec.connects || 0) + 1;
    rec.last = now;
    if (!rec.name) rec.name = vname(activeV());
    if (!rec.cal && ctx.cal) rec.cal = ctx.cal;
    setArch(A);
    if (known && !st.welcomed) { st.welcomed = true; showWelcome(rec, prev); }
  }

  function recordDtc(key) {
    var d = ctx.dtc, A = getArch(), rec = A[key];
    if (!d || !rec) return;
    function pick(r) { return r && r.ok ? r.codes.slice() : null; }
    var e = { t: d.t, stored: pick(d.stored), pending: pick(d.pending), permanent: pick(d.permanent) };
    var last = rec.visits[0];
    if (last && sameE(last, e) && Date.parse(e.t) - Date.parse(last.t) < 600000) last.t = e.t;
    else rec.visits.unshift(e);
    rec.visits = rec.visits.slice(0, 60);
    rec.last = new Date().toISOString();
    setArch(A);
  }

  function startVin() {
    if (st.vinBusy) return;
    st.vinBusy = true;
    OBD.readVehicleInfo().then(function (r) {
      var v = String(r.vin || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (v.length >= 17) ctx.vin = v.slice(-17);
      if (r.cal) ctx.cal = r.cal;
    }).catch(function (e) { Log.add('ERR', 'arxiv VIN: ' + e.message); })
      .then(function () { st.vinDone = true; st.vinBusy = false; });
  }

  function tick() {
    var s = OBD.state;
    if (s === 'idle' || s === 'error') {
      if (st.seen) {
        st.seen = false; st.key = ''; st.welcomed = false; st.vinDone = false; st.vinBusy = false; st.dtcT = '';
        ctx.vin = ''; ctx.cal = '';
      }
      return;
    }
    if (s !== 'ecu') return;
    if (!st.seen) {
      st.seen = true; st.t0 = Date.now(); st.dtcT = ctx.dtc ? ctx.dtc.t : '';
      st.vinDone = false;
      if (vinNow()) st.vinDone = true; else startVin();
    }
    if (!st.vinDone) return;
    if (!st.key) {
      var k = keyFor();
      if (k) { st.key = k; identify(k); }
    }
    if (st.key && ctx.dtc && ctx.dtc.t !== st.dtcT && Date.parse(ctx.dtc.t) >= st.t0) {
      st.dtcT = ctx.dtc.t;
      recordDtc(st.key);
    }
  }

  /* ---------- Xoş gəldin pəncərəsi ---------- */
  function showWelcome(rec, prev) {
    var last = rec.visits[0], el = document.getElementById('welcome');
    if (!el) { el = document.createElement('div'); el.id = 'welcome'; document.body.appendChild(el); }
    var codes = last ? union(last) : [];
    el.innerHTML = '<div class="wbox"><b>' + esc(T('Tanış avtomobil', 'Known vehicle')) + '</b>' +
      '<p>' + esc(rec.name || T('Adsız avtomobil', 'Unnamed vehicle')) + (rec.vin ? '<br>VIN: ' + esc(rec.vin) : '') + '</p>' +
      row(T('Son qoşulma', 'Last connection'), fmt(prev)) +
      row(T('Arxivdəki oxunuş sayı', 'Readings in archive'), String(rec.visits.length)) +
      (last ? '<p>' + esc(T('Son oxunuşda (', 'Last reading (') + fmt(last.t) + T(') kodlar: ', ') codes: ') + (codes.length ? codes.join(', ') : T('yoxdur', 'none'))) + '</p>'
        : '<p class="sm">' + esc(T('Xəta kodu oxunuşu hələ yoxdur.', 'No fault code reading yet.')) + '</p>') +
      bh(T('Arxivi aç', 'Open archive'), 'wopen', rec.key) + bh(T('Bağla', 'Close'), 'wclose', '', 'alt') + '</div>';
    el.style.display = 'flex';
  }
  function closeWelcome() { var el = document.getElementById('welcome'); if (el) el.style.display = 'none'; }

  /* ---------- Arxiv ekranı ---------- */
  function statusTxt() {
    if (OBD.state !== 'ecu') return T('Adapter qoşulmayıb. Qoşulanda avtomobil avtomatik tanınacaq.', 'Adapter not connected. The vehicle will be recognised on connection.');
    if (!st.vinDone) return T('VIN oxunur…', 'Reading VIN…');
    if (st.key) return T('Cari avtomobil arxivə yazılır.', 'The current vehicle is being archived.');
    return T('VIN oxunmadı və Qarajda aktiv avtomobil yoxdur, ona görə arxivə yazılmır. Qaraj bölməsində avtomobil əlavə edin.', 'VIN could not be read and there is no active Garage vehicle, so nothing is archived. Add a vehicle in Garage.');
  }

  function visitCard(e, older) {
    var u = union(e), h = '<div class="card"><b>' + esc(fmt(e.t)) + '</b>' +
      row(T('Saxlanmış (03)', 'Stored (03)'), codesLine(e.stored)) +
      row(T('Gözləyən (07)', 'Pending (07)'), codesLine(e.pending)) +
      row(T('Daimi (0A)', 'Permanent (0A)'), codesLine(e.permanent));
    if (u.length) {
      h += '<ul>' + u.map(function (c) {
        var d = window.DTC_DB[c];
        return '<li><b>' + esc(c) + '</b>' + (d ? ' — ' + esc(L() === 'en' ? d.en : d.az) : '') + '</li>';
      }).join('') + '</ul>';
    }
    if (older) {
      var ou = union(older);
      var nw = u.filter(function (c) { return ou.indexOf(c) < 0; });
      var gone = ou.filter(function (c) { return u.indexOf(c) < 0; });
      if (!nw.length && !gone.length) h += '<p class="sm">' + esc(T('Əvvəlki oxunuşla eynidir.', 'Same as the previous reading.')) + '</p>';
      if (nw.length) h += '<p class="no">' + esc(T('Yeni kodlar: ', 'New codes: ') + nw.join(', ')) + '</p>';
      if (gone.length) h += '<p class="ok">' + esc(T('Yox olan kodlar: ', 'Codes gone: ') + gone.join(', ')) + '</p>';
    } else h += '<p class="sm">' + esc(T('İlk oxunuş.', 'First reading.')) + '</p>';
    return h + '</div>';
  }

  function archText(r) {
    var o = ['AC OBD — ' + T('Avtomobil arxivi', 'Vehicle archive'), (r.name || '-'), 'VIN: ' + (r.vin || '-'),
      T('İlk qoşulma: ', 'First seen: ') + fmt(r.first), T('Son qoşulma: ', 'Last seen: ') + fmt(r.last)];
    r.visits.forEach(function (e) {
      o.push('', fmt(e.t));
      o.push('  03: ' + codesLine(e.stored));
      o.push('  07: ' + codesLine(e.pending));
      o.push('  0A: ' + codesLine(e.permanent));
    });
    return o.join('\n');
  }

  function detail(key) {
    var r = getArch()[key];
    if (!r) { openKey = null; return ''; }
    var h = bh(T('← Geri', '← Back'), 'back', '', 'alt');
    h += card('<b>' + esc(r.name || T('Adsız avtomobil', 'Unnamed vehicle')) + '</b>' +
      row('VIN', r.vin || '—') + row(T('Kalibrasiya ID', 'Calibration ID'), r.cal || '—') +
      row(T('İlk qoşulma', 'First seen'), fmt(r.first)) + row(T('Son qoşulma', 'Last seen'), fmt(r.last)) +
      row(T('Qoşulma sayı', 'Connections'), String(r.connects || 0)) + row(T('Kod oxunuşu', 'Code readings'), String(r.visits.length)));
    if (!r.visits.length) h += card('<p>' + esc(T('Bu avtomobil üçün hələ kod oxunuşu yoxdur. Kodlar bölməsində "Bütün kodları oxu" basın.', 'No code readings yet. Press "Read all codes" in Fault Codes.')) + '</p>');
    r.visits.forEach(function (e, i) { h += visitCard(e, r.visits[i + 1]); });
    h += bh(T('Mətni paylaş / kopyala', 'Share / copy text'), 'share', key, 'alt');
    h += bh(T('Bu avtomobilin arxivini sil', 'Delete this vehicle archive'), 'del', key, 'del');
    return h;
  }

  screens.archive = function () {
    var h = '<h2>' + esc(T('Avtomobil arxivi (Vehicle Archive)', 'Vehicle Archive')) + '</h2>';
    if (msg) h += card('<p class="ok">' + esc(msg) + '</p>');
    if (openKey) { var d = detail(openKey); if (openKey) return h + d; }
    h += card('<p>' + esc(T('Avtomobil VIN nömrəsi ilə tanınır. VIN oxunmasa, Qarajdakı aktiv avtomobil istifadə olunur. Arxiv yalnız bu telefonda saxlanılır.', 'The vehicle is identified by VIN. If VIN cannot be read, the active Garage vehicle is used. The archive is stored only on this phone.')) + '</p><p class="no">' + esc(statusTxt()) + '</p>');
    var A = getArch();
    var keys = Object.keys(A).sort(function (a, b) { return Date.parse(A[b].last) - Date.parse(A[a].last); });
    if (!keys.length) return h + card('<p>' + esc(T('Arxivdə hələ avtomobil yoxdur.', 'No vehicles in the archive yet.')) + '</p>');
    keys.forEach(function (k) {
      var r = A[k], last = r.visits[0];
      h += card('<b>' + esc(r.name || r.vin || T('Adsız avtomobil', 'Unnamed vehicle')) + '</b>' +
        (r.vin ? '<p class="sm">VIN: ' + esc(r.vin) + '</p>' : '') +
        row(T('Son qoşulma', 'Last seen'), fmt(r.last)) + row(T('Kod oxunuşu', 'Code readings'), String(r.visits.length)) +
        (last ? row(T('Son kodlar', 'Latest codes'), union(last).join(', ') || T('yoxdur', 'none')) : '') +
        bh(T('Aç', 'Open'), 'open', k, 'alt'));
    });
    return h;
  };

  /* ---------- Lüğət ---------- */
  function glossHtml() {
    var q = gq.trim().toLowerCase();
    var list = window.GLOSS.filter(function (g) {
      if (gcat !== 'all' && g[0] !== gcat) return false;
      if (!q) return true;
      return (g[1] + ' ' + g[2] + ' ' + g[3]).toLowerCase().indexOf(q) >= 0;
    });
    if (!list.length) return '<p class="sm">' + esc(T('Nəticə tapılmadı.', 'No results.')) + '</p>';
    return '<p class="sm">' + list.length + ' ' + esc(T('termin', 'terms')) + '</p>' + list.map(function (g) {
      return '<div class="gl"><div><span class="l">AZ</span><span class="a">' + esc(g[2]) + '</span></div>' +
        '<div><span class="l">RU</span>' + esc(g[3]) + '</div>' +
        '<div><span class="l">EN</span>' + esc(g[1]) + '</div></div>';
    }).join('');
  }
  function paintGloss() { var el = document.getElementById('gres'); if (el) el.innerHTML = glossHtml(); }

  screens.glossary = function () {
    var opts = CATS.map(function (c) {
      return '<option value="' + c[0] + '"' + (gcat === c[0] ? ' selected' : '') + '>' + esc(c[1] + ' / ' + c[2] + ' / ' + c[3]) + '</option>';
    }).join('');
    return '<h2>' + esc(T('Terminlər lüğəti (Glossary)', 'Glossary')) + '</h2>' +
      card('<p>' + esc(T('Avtomobil hissələri, sensorlar və diaqnostika terminləri: Azərbaycan, rus və ingilis dilində. Fərqli ustalar fərqli ad işlədə bilər.', 'Vehicle parts, sensors and diagnostic terms in Azerbaijani, Russian and English. Different mechanics may use different names.')) + '</p>' +
        '<input id="gq" type="text" autocomplete="off" value="' + esc(gq) + '" placeholder="' + esc(T('Axtarış (AZ / RU / EN)', 'Search (AZ / RU / EN)')) + '">' +
        '<select id="gcat">' + opts + '</select>') +
      '<div class="card" id="gres">' + glossHtml() + '</div>';
  };

  /* ---------- Haqqımızda ---------- */
  screens.about = function () {
    return '<h2>' + esc(T('Haqqımızda və Əlaqə (About & Contact)', 'About & Contact')) + '</h2>' +
      (msg ? card('<p class="ok">' + esc(msg) + '</p>') : '') +
      card('<b>AC OBD</b><p>' + esc(T('AC OBD — Azərbaycan dilində, süni intellekt dəstəkli peşəkar avtomobil diaqnostika proqramıdır. Azərbaycanda ilk dəfə A. Cəfərli tərəfindən hazırlanmışdır.',
        'AC OBD is a professional vehicle diagnostics app with AI support and Azerbaijani-language interface. It was created for the first time in Azerbaijan by A. Cəfərli.')) + '</p>') +
      card('<b>' + esc(T('Bizimlə əlaqə', 'Contact us')) + '</b><p>' + esc(T('Sual, təklif və ya xəta barədə yazın:', 'Write to us with questions, suggestions or bug reports:')) + '</p>' +
        '<p><a class="mail" href="mailto:' + EMAIL + '">' + EMAIL + '</a></p>' +
        bh(T('E-poçt ünvanını kopyala', 'Copy email address'), 'copymail', '', 'alt')) +
      card(row(T('Versiya', 'Version'), '1.0.0') + row(T('Yaradılıb', 'Established'), '2026'));
  };

  /* ---------- Menyu, hadisələr ---------- */
  function addDrawer() {
    var dl = document.getElementById('drawerlist');
    if (!dl) return;
    ITEMS.forEach(function (it) {
      if (!dl.querySelector('a[href="#' + it.id + '"]')) {
        var a = document.createElement('a');
        a.href = '#' + it.id;
        a.textContent = L() === 'en' ? it.en : it.az;
        dl.appendChild(a);
      }
    });
    var c = cur();
    dl.querySelectorAll('a').forEach(function (a) {
      if (a.getAttribute('href') === '#' + c) a.classList.add('on'); else a.classList.remove('on');
    });
  }
  function fixNav() {
    document.querySelectorAll('#nav a').forEach(function (a) { a.classList.remove('on'); });
    addDrawer();
  }
  function rerender() {
    var c = cur();
    if (screens[c]) { view.innerHTML = screens[c](); fixNav(); }
  }
  function apply() {
    var c = cur();
    if (screens[c]) { msg = ''; view.innerHTML = screens[c](); fixNav(); window.scrollTo(0, 0); }
    addDrawer();
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-mo]');
    if (!el) return;
    var a = el.getAttribute('data-mo'), k = el.getAttribute('data-k');
    if (a === 'open') { openKey = k; rerender(); window.scrollTo(0, 0); }
    else if (a === 'back') { openKey = null; rerender(); }
    else if (a === 'del') {
      if (confirm(T('Bu avtomobilin bütün arxivi silinsin?', 'Delete the whole archive of this vehicle?'))) {
        var A = getArch(); delete A[k]; setArch(A); openKey = null; rerender();
      }
    }
    else if (a === 'share') {
      var r = getArch()[k];
      if (r) Session.share(archText(r), 'AC OBD').then(function (x) {
        msg = x === 'copy' ? T('Mətn kopyalandı.', 'Text copied.') : '';
        rerender();
      });
    }
    else if (a === 'wclose') closeWelcome();
    else if (a === 'wopen') {
      closeWelcome(); openKey = k;
      if (cur() === 'archive') rerender(); else location.hash = '#archive';
    }
    else if (a === 'copymail') {
      msg = Session.copy(EMAIL) ? T('E-poçt ünvanı kopyalandı.', 'Email address copied.') : '';
      rerender();
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'gq') { gq = e.target.value; paintGloss(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'gcat') { gcat = e.target.value; paintGloss(); }
  });

  var dl0 = document.getElementById('drawerlist');
  if (dl0) new MutationObserver(addDrawer).observe(dl0, { childList: true });
  window.addEventListener('hashchange', apply);
  setInterval(tick, 1500);
  addDrawer();
  apply();
})();
