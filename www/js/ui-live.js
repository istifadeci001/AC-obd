(function () {
  'use strict';
  var view = document.getElementById('view'), S = OBD.S;
  var screens = {}, sel = 60, msg = '', err = '', showNow = false;
  var DUR = [[30, '30 san'], [60, '1 dəq'], [180, '3 dəq'], [300, '5 dəq'], [600, '10 dəq'], [0, 'Fasiləsiz']];
  var ENG = { off: 'mühərrik söndürülü (açar ON)', cold: 'soyuq mühərrik', warm: 'mühərrik isinir', hot: 'isti mühərrik', unk: 'bilinmir' };
  var MOT = { stop: 'dayanıb', idle: 'boş gediş', rev: 'boş dövriyyədə yüksək dövr', accel: 'sürətlənmə', cruise: 'sabit sürət', decel: 'yavaşlama', unk: 'bilinmir' };
  var PC = { 'Kritik': 'bad', 'Yüksək': 'bad', 'Orta': 'no', 'Aşağı': 'sm', 'Müşahidə edilməlidir': 'sm' };
  var VC = { 'Normal': 'ok', 'Şübhəli': 'no', 'Problem ehtimalı': 'bad', 'Məlumat kifayət deyil': 'sm' };
  var FS = { 1: 'Open loop (soyuq)', 2: 'Closed loop', 4: 'Open loop (yük/yavaşlama)', 8: 'Open loop (nasazlıq)', 16: 'Closed loop (O2 nasaz)' };
  var ITEMS = [['livediag', 'Canlı diaqnostika (Live Diagnostics)'], ['fuel', 'Yanacaq, bak, təkər (Fuel & Tires)']];

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cur() { return (location.hash || '#dashboard').slice(1); }
  function card(i, c) { return '<div class="card' + (c ? ' ' + c : '') + '">' + i + '</div>'; }
  function row(k, v, c) { return '<div class="row"><span class="k">' + esc(k) + '</span><span class="' + (c || '') + '">' + esc(v) + '</span></div>'; }
  function btn(l, a, x, c) { return '<button class="btn' + (c ? ' ' + c : '') + '" data-lv="' + a + '" ' + (x || '') + '>' + esc(l) + '</button>'; }
  function h2(t) { return '<h2>' + esc(t) + '</h2>'; }
  function ul(a) { return a && a.length ? '<ul>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="sm">—</p>'; }
  function hm(s) { s = Math.max(0, Math.round(s)); return ('0' + Math.floor(s / 60)).slice(-2) + ':' + ('0' + (s % 60)).slice(-2); }
  function stat() { return (err ? card('<p class="bad">' + esc(err) + '</p>') : '') + (msg ? card('<p class="ok">' + esc(msg) + '</p>') : ''); }
  function veh() {
    var g = Store.get('garage', []), id = Store.get('activeVehicle', null), v = null;
    g.forEach(function (x) { if (x.id === id) v = x; });
    return v ? [v.make, v.model, v.year, v.engine].filter(Boolean).join(' ') : '';
  }
  function num(id) { var e = document.getElementById(id); return e ? parseFloat(String(e.value).replace(',', '.')) : NaN; }
  function set(id, t) { var e = document.getElementById(id); if (e) e.textContent = t; }
  function rerender() {
    var c = cur();
    if (screens[c]) { view.innerHTML = screens[c](); if (c === 'livediag') drawSparks(); if (c === 'fuel') upd(); }
  }

  /* ---------- Canlı diaqnostika ---------- */
  function drawSparks() {
    var st = LiveDiag.state();
    view.querySelectorAll('canvas.spark').forEach(function (cv) {
      var a = st.acc[cv.getAttribute('data-id')];
      if (!a || a.ser.length < 2) return;
      var arr = a.ser.slice(-120), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      var c = cv.getContext('2d');
      c.scale(dpr, dpr); c.lineWidth = 2; c.strokeStyle = '#34d399'; c.beginPath();
      var mn = Math.min.apply(null, arr), mx = Math.max.apply(null, arr);
      if (mx === mn) mx = mn + 1;
      arr.forEach(function (v, i) {
        var x = i / (arr.length - 1) * w, y = h - 4 - (v - mn) / (mx - mn) * (h - 8);
        if (i) c.lineTo(x, y); else c.moveTo(x, y);
      });
      c.stroke();
    });
  }
  function itemHtml(it) {
    var f = function (x) { return x === undefined || x === null ? '—' : x.toFixed(it.fix) + ' ' + it.unit; };
    return '<details class="card"><summary><b>' + esc(it.name) + '</b> — <span class="' + VC[it.verdict] + '">' + esc(it.verdict) + '</span></summary>' +
      row('Cari', f(it.cur)) + row('Orta / min / maks', f(it.avg) + ' / ' + f(it.min) + ' / ' + f(it.max)) + row('Nümunə sayı', String(it.n)) +
      '<p class="sm">Gözlənilən: ' + esc(it.rng) + '</p>' + (it.note ? '<p>' + esc(it.note) + '</p>' : '') +
      (it.causes.length ? '<label>Mümkün səbəblər</label>' + ul(it.causes) : '') +
      (it.check.length ? '<label>Nəyi yoxlamaq lazımdır</label>' + ul(it.check) : '') +
      (it.sys.length ? '<label>Təsir edə biləcəyi sistemlər</label>' + ul(it.sys) : '') + '</details>';
  }
  function reportHtml(rep) {
    var h = card('<label>Ümumi nəticə</label><p style="color:var(--tx)">' + esc(rep.concl) + '</p>' +
      row('Müddət', hm(rep.el)) + row('Oxuma sayı', String(rep.reads)) + row('Oxuma tezliyi', rep.rate.toFixed(1) + ' sorğu/san'));
    h += card('<label>Aşkar edilmiş problemlər (prioritet)</label>' + (rep.probs.length ? rep.probs.map(function (p) {
      return '<div class="row"><span>' + esc(p.title) + '</span><span class="' + (PC[p.prio] || 'sm') + '">' + esc(p.prio) + '</span></div>';
    }).join('') : '<p class="sm">Aydın sapma aşkarlanmadı.</p>'));
    h += '<div class="sect">Göstəricilər üzrə təhlil</div>' + rep.items.map(itemHtml).join('');
    if (rep.unsup.length) h += card('<label>ECU-nun dəstəkləmədiyi PID-lər</label><p class="sm">' + esc(rep.unsup.join(', ')) + '</p>');
    if (rep.ev.length) h += card('<label>Hadisələr</label>' + rep.ev.map(function (e) { return '<div class="row"><span>' + esc(e.t) + '</span><span class="sm">' + e.s + ' s</span></div>'; }).join(''));
    h += card(btn('Mətn hesabatı paylaş', 'share') + btn('Mətn hesabatı kopyala', 'copy', '', 'alt') +
      '<p class="sm">PDF hələ yoxdur (Azərbaycan hərfləri üçün şrift lazımdır).</p>');
    return h;
  }
  screens.livediag = function () {
    var st = LiveDiag.state(), h = h2('Canlı diaqnostika (Live Diagnostics)');
    if (S.state !== 'ecu' && !st.on) h += card('<p>Real ECU-ya qoşulmamısınız. Əvvəl «Qoşul» bölməsində adapteri qoşun. Heç bir saxta dəyər göstərilmir.</p>', 'warn');
    h += stat();
    if (!st.on) {
      h += card('<p>Əsas istifadə: dayanmış avtomobildə. Sürərkən telefona baxmayın. ECU-nu yükləməmək üçün ən çox 12 göstərici sorğulanır.</p><label>Müddət</label>' +
        DUR.map(function (d) {
          return '<button class="btn' + (sel === d[0] ? '' : ' alt') + '" data-lv="dur" data-d="' + d[0] + '" style="display:inline-block;width:auto;margin:0 8px 8px 0;padding:10px 16px">' + esc(d[1]) + '</button>';
        }).join('') + btn('▶ Başlat', 'start', S.state === 'ecu' ? '' : 'disabled'));
    } else {
      var el = (Date.now() - st.t0) / 1000, rem = st.dur ? Math.max(0, st.dur - el) : null;
      var spd = st.acc['0D'] ? st.acc['0D'].v : 0, okn = st.ids.filter(function (id) { return st.acc[id] && st.acc[id].n; }).length;
      h += card('<div class="big">' + hm(rem === null ? el : rem) + '</div><div class="sm">' + (rem === null ? 'Keçən vaxt (fasiləsiz rejim)' : 'Qalan vaxt · keçən ' + hm(el)) + '</div>' +
        (st.dur ? '<div style="height:8px;border-radius:6px;background:#0c1424;margin:12px 0"><div style="height:8px;border-radius:6px;background:linear-gradient(90deg,#34d399,#22d3ee);width:' + Math.min(100, el / st.dur * 100).toFixed(0) + '%"></div></div>' : '') +
        btn('■ STOP', 'stop', '', 'del') + btn(showNow ? 'Təhlili gizlət' : 'İndi təhlil et', 'now', '', 'alt'));
      h += card(row('Oxuma tezliyi', st.rate.toFixed(1) + ' sorğu/san') + row('Cavab verən göstərici', okn + ' / ' + st.ids.length, okn < st.ids.length ? 'no' : 'ok') +
        row('İş rejimi', ENG[st.ctx.eng] + ', ' + MOT[st.ctx.mot]) + row('Hadisə sayı', String(st.ev.length)));
      if (S.state !== 'ecu') h += card('<p class="bad">Əlaqə problemi: ' + esc(S.state) + '. Avtomatik yenidən qoşulmağa çalışılır.</p>', 'warn');
      if (spd > 0) h += card('<p>Avtomobil hərəkətdədir. Telefona baxmayın.</p>', 'warn');
      if (showNow) h += '<div class="sect">Hazırkı təhlil</div>' + LiveDiag.assess().map(itemHtml).join('');
      h += st.ids.map(function (id) {
        var a = st.acc[id], p = window.PIDS[id];
        if (!p) return '';
        var fx = p.fix === undefined ? 1 : p.fix;
        var cv = a ? (id === '03' ? (FS[a.v] || 'kod ' + a.v) : a.v.toFixed(fx)) : '—';
        return card('<div class="row"><span>' + esc(p.az) + '</span><span class="sm">' + esc(id) + '</span></div><div class="big">' + esc(cv) + ' <span class="sm">' + esc(p.unit || '') + '</span></div>' +
          (a ? '<div class="sm">min ' + a.min.toFixed(fx) + ' · orta ' + (a.sum / a.n).toFixed(fx) + ' · maks ' + a.max.toFixed(fx) + '</div>' +
            (p.nochart || id === '03' ? '' : '<canvas class="spark" data-id="' + esc(id) + '"></canvas>') : '<div class="sm no">Hələ cavab yoxdur</div>'));
      }).join('');
    }
    if (st.rep && !st.on) h += reportHtml(st.rep);
    return h;
  };

  /* ---------- Yanacaq, bak, təkər ---------- */
  function upd() {
    if (cur() !== 'fuel') return;
    var e = Fuel.estimate(), t = Fuel.trip(), tk = Fuel.tank(), c = Fuel.cfg();
    set('f-lph', e ? e.lph.toFixed(2) + ' L/saat' : '—');
    set('f-lp', e && e.lp100 !== null ? e.lp100.toFixed(1) + ' L/100 km' : '—');
    set('f-m', e ? e.method + ' (etibarlılıq: ' + e.conf + ')' : (Fuel.running() ? 'Kifayət qədər PID yoxdur (MAF və ya MAP+IAT+RPM lazımdır)' : 'hesablama başlamayıb'));
    set('f-trip', t.L.toFixed(2) + ' L · ' + t.km.toFixed(1) + ' km');
    var avg = t.km > 1 ? t.L / t.km * 100 : null;
    set('f-avg', avg !== null ? avg.toFixed(1) + ' L/100 km' : '—');
    set('f-tank', tk ? tk.pct.toFixed(0) + ' %' + (tk.L !== null ? ' ≈ ' + tk.L.toFixed(1) + ' L' : ' (bakın həcmini daxil edin)') : 'PID 2F oxunmayıb və ya dəstəklənmir');
    set('f-range', tk && tk.L !== null && avg ? '≈ ' + Math.round(tk.L / avg * 100) + ' km (təxmini)' : '—');
    var ft = OBD.values['51'], et = OBD.values['52'];
    set('f-type', ft && ft.txt ? ft.txt : 'oxunmayıb və ya dəstəklənmir');
    set('f-eth', et && et.v !== null && !et.nodata ? et.v.toFixed(0) + ' %' : 'oxunmayıb və ya dəstəklənmir');
    set('f-k', c.k.toFixed(3));
  }
  screens.fuel = function () {
    var c = Fuel.cfg(), run = Fuel.running(), fills = Store.get('fuelfills', []), q = Fuel.quality(), tires = Store.get('tires', []);
    var h = h2('Yanacaq, bak və təkər (Fuel & Tires)') + stat();
    if (S.state !== 'ecu') h += card('<p>Real ECU-ya qoşulmamısınız. Heç bir saxta dəyər göstərilmir.</p>', 'warn');
    h += card('<label>Yanacaq sərfi (hesablama)</label>' +
      '<div class="row"><span class="k">Anlıq sərf</span><span id="f-lph">—</span></div>' +
      '<div class="row"><span class="k">Hərəkətdə (L/100 km)</span><span id="f-lp">—</span></div>' +
      '<div class="row"><span class="k">Üsul</span><span id="f-m" class="sm">—</span></div>' +
      '<div class="row"><span class="k">Cari səfər</span><span id="f-trip">—</span></div>' +
      '<div class="row"><span class="k">Səfər ortalaması</span><span id="f-avg">—</span></div>' +
      (run ? btn('■ Dayandır', 'fstop', '', 'del') : btn('▶ Hesablamağa başla', 'fstart', S.state === 'ecu' ? '' : 'disabled')) +
      '<p class="sm">Dəqiq (exact) sərf OBD ilə ölçülmür, ECU-nun hava və korreksiya məlumatından hesablanır. Dolum qeydləri ilə kalibrləndikdən sonra dəqiqlik artır. Avtomobilin MAF PID-i yoxdursa MAP modeli istifadə olunur, bu daha az dəqiqdir.</p>');
    h += card('<label>Bakdakı yanacaq</label>' +
      '<div class="row"><span class="k">Səviyyə</span><span id="f-tank">—</span></div>' +
      '<div class="row"><span class="k">Qalan məsafə</span><span id="f-range">—</span></div>' +
      '<label>Bakın həcmi (litr, texniki sənəddən)</label><input id="fcap" inputmode="decimal" value="' + esc(c.cap || '') + '" placeholder="məs. 50">' +
      btn('Saxla', 'fsave', '', 'alt') +
      '<p class="sm">Litr = səviyyə (%) × bakın həcmi. Səviyyə sensoru qeyri-xəttidir və yanacağın yelləməsi nəticəni ±5–10 % dəyişə bilər.</p>');
    h += card('<label>Hesablama parametrləri</label>' +
      '<label>Mühərrikin həcmi (L)</label><input id="fvd" inputmode="decimal" value="' + esc(c.vd) + '">' +
      '<label>Həcmi səmərəlilik (VE, MAP modeli üçün)</label><input id="fve" inputmode="decimal" value="' + esc(c.ve) + '">' +
      '<label>Yanacaq sıxlığı (g/L)</label><input id="fdens" inputmode="decimal" value="' + esc(c.dens) + '">' +
      '<label>Stexiometrik hava/yanacaq nisbəti</label><input id="fafr" inputmode="decimal" value="' + esc(c.afr) + '">' +
      '<div class="row"><span class="k">Kalibrasiya əmsalı</span><span id="f-k">—</span></div>' + btn('Parametrləri saxla', 'fsave2', '', 'alt'));
    h += card('<label>Dolum qeydi (kalibrasiya)</label><input id="flit" inputmode="decimal" placeholder="Əlavə edilən litr">' +
      '<label class="chk"><input type="checkbox" id="ffull" checked>Bak tam dolub (kalibrasiya üçün)</label>' + btn('Dolumu qeyd et', 'ffill', '') +
      '<p class="sm">Əvvəlki tam dolumdan sonra hesablama işləyibsə, əmsal real litrə görə düzəldilir. Hər dolumdan sonra səfər sıfırlanır.</p>' +
      (fills.length ? fills.slice(0, 5).map(function (f) { return '<div class="row"><span>' + esc(f.t.slice(0, 10)) + ' · ' + f.added + ' L</span><span class="sm">hesab. ' + f.estL.toFixed(1) + ' L · ' + f.km.toFixed(0) + ' km</span></div>'; }).join('') : ''));
    h += card('<label>Yanacaq keyfiyyəti</label><p class="no">OBD ilə yanacağın keyfiyyəti (oktan, su, çirklilik) ölçülə bilməz. Aşağıdakılar yalnız dolayı əlamətlərdir.</p>' +
      '<div class="row"><span class="k">Yanacaq növü (PID 51)</span><span id="f-type" class="sm">—</span></div>' +
      '<div class="row"><span class="k">Etanol faizi (PID 52)</span><span id="f-eth" class="sm">—</span></div>' +
      (q ? row('Uzunmüddətli korreksiya (son 2 bak)', q.a.toFixed(1) + ' % / ' + q.b.toFixed(1) + ' %') +
        '<p class="' + (Math.abs(q.d) >= 4 ? 'no' : 'ok') + '">' + esc(Math.abs(q.d) >= 4 ? 'Dolumdan sonra korreksiya ' + q.d.toFixed(1) + ' % dəyişib. Yanacaq, hava və ya sensor səbəb ola bilər, yanacaq keyfiyyəti sübut olunmur.' : 'Dolumlar arasında əhəmiyyətli dəyişiklik yoxdur.') + '</p>' : '<p class="sm">Müqayisə üçün ən azı 2 dolum qeydi və isti mühərrikdə sürüş lazımdır.</p>'));
    var rec = tires.length ? tires[0].rec : '';
    h += card('<label>Təkər təzyiqi (əl ilə qeyd)</label><p class="no">Standart OBD-II-də təkər təzyiqi PID-i yoxdur. TPMS məlumatı yalnız istehsalçıya məxsus diaqnostika (Enhanced) və ya xarici BLE TPMS sensorları ilə oxunur. Proqram təkər təzyiqini ölçmür, aşağıdakıları siz daxil edirsiniz.</p>' +
      '<label>Tövsiyə olunan təzyiq (bar, qapıdakı etiketdən)</label><input id="trec" inputmode="decimal" value="' + esc(rec) + '" placeholder="məs. 2.3">' +
      '<label>Ön sol / Ön sağ (bar)</label><div style="display:flex;gap:8px"><input id="tfl" inputmode="decimal"><input id="tfr" inputmode="decimal"></div>' +
      '<label>Arxa sol / Arxa sağ (bar)</label><div style="display:flex;gap:8px"><input id="trl" inputmode="decimal"><input id="trr" inputmode="decimal"></div>' +
      btn('Qeyd et', 'tsave', '') +
      (tires.length ? tires.slice(0, 4).map(function (t) {
        var names = ['ÖS', 'ÖSağ', 'AS', 'ASağ'], vals = [t.fl, t.fr, t.rl, t.rr];
        return '<div class="row"><span>' + esc(t.t.slice(0, 10)) + '</span><span class="sm">' + vals.map(function (v, i) {
          var d = v - t.rec, cl = Math.abs(d) <= 0.2 ? 'ok' : (d <= -0.5 ? 'bad' : 'no');
          return '<span class="' + cl + '">' + names[i] + ' ' + v.toFixed(1) + '</span>';
        }).join(' · ') + '</span></div>';
      }).join('') : ''));
    return h;
  };

  /* ---------- Hadisələr ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-lv]');
    if (!el) return;
    var a = el.getAttribute('data-lv');
    msg = ''; err = '';
    if (a === 'dur') { sel = parseInt(el.getAttribute('data-d'), 10); rerender(); }
    else if (a === 'start') { try { showNow = false; LiveDiag.start(sel); } catch (x) { err = x.message; } rerender(); }
    else if (a === 'stop') { LiveDiag.stop(false); showNow = false; rerender(); }
    else if (a === 'now') { showNow = !showNow; rerender(); }
    else if (a === 'share' || a === 'copy') {
      var rep = LiveDiag.state().rep;
      if (!rep) return;
      var txt = LiveDiag.text(rep, { veh: veh(), vin: Session.ctx.vin });
      if (a === 'copy') { msg = Session.copy(txt) ? 'Hesabat kopyalandı.' : ''; if (!msg) err = 'Kopyalama alınmadı.'; rerender(); }
      else Session.share(txt, 'AC OBD diaqnostika hesabatı').then(function (r) { if (r === 'copy') msg = 'Hesabat kopyalandı.'; else if (r === 'fail') err = 'Paylaşmaq alınmadı.'; rerender(); });
    }
    else if (a === 'fstart') { try { Fuel.start(); } catch (x) { err = x.message; } rerender(); }
    else if (a === 'fstop') { Fuel.stop(); rerender(); }
    else if (a === 'fsave') {
      var cap = num('fcap'), c1 = Fuel.cfg();
      if (!(cap > 0 && cap < 300)) err = 'Bakın həcmi düzgün deyil.'; else { c1.cap = cap; Store.set('fuelcfg', c1); msg = 'Saxlanıldı.'; }
      rerender();
    }
    else if (a === 'fsave2') {
      var c2 = Fuel.cfg(), vd = num('fvd'), ve = num('fve'), de = num('fdens'), af = num('fafr');
      if (!(vd > 0.3 && vd < 10) || !(ve > 0.3 && ve < 1.2) || !(de > 500 && de < 900) || !(af > 5 && af < 20)) err = 'Parametrlərdən biri düzgün deyil.';
      else { c2.vd = vd; c2.ve = ve; c2.dens = de; c2.afr = af; Store.set('fuelcfg', c2); msg = 'Saxlanıldı.'; }
      rerender();
    }
    else if (a === 'ffill') {
      var l2 = num('flit'), full = document.getElementById('ffull').checked;
      if (!(l2 > 0 && l2 < 300)) err = 'Litr düzgün deyil.';
      else { var r = Fuel.fill(l2, full); msg = 'Qeyd olundu.' + (r.newK ? ' Yeni kalibrasiya əmsalı: ' + r.newK.toFixed(3) : (full ? ' Kalibrasiya üçün hesablanmış sərf kifayət deyil (≥0.5 L).' : '')); }
      rerender();
    }
    else if (a === 'tsave') {
      var rc = num('trec'), v = [num('tfl'), num('tfr'), num('trl'), num('trr')];
      if (!(rc > 0.5 && rc < 6) || v.some(function (x) { return !(x > 0.1 && x < 8); })) err = 'Təzyiq dəyərləri düzgün deyil (bar).';
      else { var l = Store.get('tires', []); l.unshift({ t: new Date().toISOString(), rec: rc, fl: v[0], fr: v[1], rl: v[2], rr: v[3] }); Store.set('tires', l.slice(0, 20)); msg = 'Qeyd olundu.'; }
      rerender();
    }
  });
  LiveDiag.on(function () { if (cur() === 'livediag') rerender(); });
  Fuel.on(upd);
  setInterval(function () { if (cur() === 'fuel') upd(); }, 1000);

  function addDrawer() {
    var dl = document.getElementById('drawerlist');
    if (!dl) return;
    ITEMS.forEach(function (it) {
      if (!dl.querySelector('a[href="#' + it[0] + '"]')) {
        var a = document.createElement('a');
        a.href = '#' + it[0]; a.textContent = it[1];
        dl.appendChild(a);
      }
    });
  }
  function apply() {
    var c = cur();
    if (screens[c]) { msg = ''; err = ''; rerender(); window.scrollTo(0, 0); }
    addDrawer();
  }
  var dl0 = document.getElementById('drawerlist');
  if (dl0) new MutationObserver(addDrawer).observe(dl0, { childList: true });
  window.addEventListener('hashchange', apply);
  addDrawer();
  apply();
})();
