(function () {
  'use strict';
  var view = document.getElementById('view'), S = OBD.S, ctx = Session.ctx;
  var msg = '', err = '', busy = '', res = null, focusPref = false;
  var RG = { cold: 'Soyuq mühərrik', warm: 'Mühərrik isinir (60–80 °C)', idle: 'İsti boş gediş', r2500: 'Sabit 2500 rpm', moving: 'Hərəkətdə', off: 'Mühərrik söndürülü', other: 'Digər rejim', unknown: 'Bilinmir' };
  var GUIDE = {
    cold: 'Soyuq rejim yalnız qızdırıcı yoxlaması üçün isteğe bağlıdır. İsti test üçün mühərriki qızdırın.',
    warm: 'Soyuducu temperaturu 80 °C-ə çatana qədər gözləyin.',
    idle: 'Boş gediş rejimi toplanır: qaza toxunmayın, dayanın.',
    r2500: 'Sabit 2500 rpm toplanır: qaz pedalını sabit saxlayın.',
    moving: 'Avtomobil hərəkətdədir. Test yalnız dayanmış vəziyyətdə aparılır.',
    off: 'Mühərrik söndürülüb. Mühərriki işə salın.',
    other: 'RPM-i sabit saxlayın: boş gediş (500–1200) və ya 2500 ± 250 rpm.',
    unknown: 'RPM və ya soyuducu temperaturu hələ oxunmayıb.'
  };
  var LC = { 'Yüksək': 'bad', 'Orta': 'no', 'Aşağı': 'sm', 'Əlamət tapılmadı': 'ok', 'Müəyyən edilə bilmir': 'sm' };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cur() { return (location.hash || '#dashboard').slice(1); }
  function card(i, c) { return '<div class="card' + (c ? ' ' + c : '') + '">' + i + '</div>'; }
  function row(k, v, c) { return '<div class="row"><span class="k">' + esc(k) + '</span><span class="' + (c || '') + '">' + esc(v) + '</span></div>'; }
  function btn(l, a, x, c) { return '<button class="btn' + (c ? ' ' + c : '') + '" data-o2="' + a + '" ' + (x || '') + '>' + esc(l) + '</button>'; }
  function ul(a) { return a && a.length ? '<ul>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''; }
  function veh() {
    var g = Store.get('garage', []), id = Store.get('activeVehicle', null), v = null;
    g.forEach(function (x) { if (x.id === id) v = x; });
    return v ? [v.make, v.model, v.year, v.engine].filter(Boolean).join(' ') : '';
  }
  function ident() { return O2Diag.state().ident || O2Diag.identify(OBD.supported, window.Adapter && Adapter.map ? Adapter.map() : null); }

  function guideHtml() {
    return '<details class="card"><summary><b>İstifadə qaydası</b></summary>' +
      '<ol>' +
      '<li>Avtomobili açıq və ya havalandırılan yerdə, park (və ya neytral) və əl əyləci ilə saxlayın. Egzoz sistemi çox istidir.</li>' +
      '<li>Adapteri qoşun. Aşağıdakı «Sensorlar» bölməsində B1S1 və B1S2 «təsdiqlənib» görünməlidir. Təsdiqlənməyibsə katalizator nəticəsi çıxmayacaq.</li>' +
      '<li>«Xəta kodlarını oxu» basın (P0420 və s. nəticəyə təsir edir).</li>' +
      '<li>Mühərriki soyuducu temperaturu ≥80 °C olana qədər qızdırın.</li>' +
      '<li>«Testi başlat» basın. Əvvəl boş gedişdə ≥30 saniyə gözləyin, sonra qaz pedalı ilə 2500 rpm-i sabit saxlayın (≥30 saniyə, tövsiyə 45–60).</li>' +
      '<li>İstəsəniz «Fokus rejimi»ni açın: yalnız O2 və RPM sorğulanır, nümunə tezliyi artır (reaksiya sürəti üçün). Soyuducu temperaturu və sürət son oxunmuş dəyərdən götürülür, ona görə dayandığınızdan əmin olun.</li>' +
      '<li>Testi dayandırın. İstəyə görə «Mode 06 oxu» (yalnız test dayananda).</li>' +
      '<li>«Təhlil et» basın və hər nəticənin sübutuna, ölçülmüş göstəricilərinə və növbəti yoxlama addımına baxın.</li>' +
      '</ol>' +
      '<p class="sm">Nəticə qəti diaqnoz deyil. «Müəyyən edilə bilmir» normal haldır: səbəbi yazılır. Proqram katalizatorun dəyişdirilməsini tövsiyə etmir. Hədlər ümumi təxmini qaydalardır, real avtomobildə təsdiqlənməyib. Fiziki yoxlama tələb olunan yerlərdə bu açıq yazılır.</p></details>';
  }

  function sensorsHtml() {
    var id = ident(), h = '<label>Sensorlar (B1S1 / B1S2)</label>';
    if (!id.sensors.length) h += '<p class="no">Bu avtomobil standart O2 PID-lərini vermir.</p>';
    id.sensors.forEach(function (s) {
      h += '<div class="row"><span>PID ' + esc(s.pid) + ' · ' + esc(s.pos || 'mövqe bilinmir') + '<br><span class="sm">' + esc(s.kindAz) + (s.note ? ' · ' + esc(s.note) : '') + '</span></span><span class="' + (s.confirmed ? 'ok' : 'no') + '">' + (s.confirmed ? 'təsdiqlənib' : 'təsdiqlənməyib') + '</span></div>';
    });
    h += row('Ön sensor (B1S1)', id.front ? 'PID ' + id.front.pid : 'yoxdur', id.front ? 'ok' : 'no') + row('Arxa sensor (B1S2)', id.rear ? 'PID ' + id.rear.pid : 'yoxdur', id.rear ? 'ok' : 'no');
    if (id.issues.length) h += '<ul>' + id.issues.map(function (x) { return '<li class="no">' + esc(x) + '</li>'; }).join('') + '</ul>';
    h += '<p class="sm">Tip PID aralığından təyin olunur (14–1B darzolaqlı, 24–2B və 34–3B genişzolaqlı). Başqa PID heç vaxt çatışmayan sensorun yerinə istifadə edilmir.</p>';
    return h;
  }

  function liveHtml() {
    var st = O2Diag.state(), h = '';
    var rg = st.on ? st.cur : 'unknown';
    h += row('Hazırkı rejim', RG[rg] || rg, rg === 'idle' || rg === 'r2500' ? 'ok' : 'no');
    h += '<p class="sm">' + esc(GUIDE[rg] || '') + '</p>';
    [['idle', 'İsti boş gediş'], ['r2500', 'Sabit 2500 rpm'], ['cold', 'Soyuq (isteğe bağlı)']].forEach(function (g) {
      var s = st.reg[g[0]].sec, pct = Math.min(100, s / 30 * 100);
      h += '<div class="row"><span class="k">' + esc(g[1]) + '</span><span class="' + (s >= 30 ? 'ok' : 'sm') + '">' + s + ' s / 30 s</span></div>' +
        '<div style="height:6px;border-radius:5px;background:#0c1424;margin:2px 0 8px"><div style="height:6px;border-radius:5px;background:linear-gradient(90deg,#34d399,#22d3ee);width:' + pct.toFixed(0) + '%"></div></div>';
    });
    h += row('Oxuma tezliyi (cəmi)', OBD.rate ? OBD.rate.toFixed(1) + ' sorğu/san' : '—') + row('Rejim', st.focus ? 'Fokus (yalnız O2 və RPM)' : 'Tam kontekst');
    return h;
  }
  function chartsHtml() {
    var st = O2Diag.state(), id = ident(), now = Date.now(), h = '';
    function one(sn, title) {
      if (!sn) return '<label>' + esc(title) + '</label><p class="sm">Sensor PID-i yoxdur: qrafik göstərilmir.</p>';
      var narrow = sn.kind === 'narrow', d = st.all[sn.pid] || [];
      var svg = O2Diag.svgChart({ now: now, win: 60, series: [{ color: '#38bdf8', data: d }], min: narrow ? 0 : undefined, max: narrow ? 1.05 : undefined, refs: narrow ? [{ v: 0.45, l: '0.45 V' }] : [{ v: 1, l: 'λ=1' }] });
      return '<label>' + esc(title + ' (PID ' + sn.pid + (narrow ? ', V' : ', λ') + ')') + '</label>' + svg;
    }
    h += one(id.front, 'Ön sensor B1S1');
    h += one(id.rear, 'Arxa sensor B1S2');
    var tr = [];
    if (st.all['06']) tr.push({ color: '#34d399', data: st.all['06'] });
    if (st.all['07']) tr.push({ color: '#f87171', data: st.all['07'] });
    if (tr.length) h += '<label>STFT (yaşıl) və LTFT (qırmızı), %</label>' + O2Diag.svgChart({ now: now, win: 60, series: tr, refs: [{ v: 0, l: '0 %' }] });
    return h + '<p class="sm">Son 60 saniyə. Qrafik tezliyi sorğu tezliyi ilə məhduddur.</p>';
  }

  function m06Html() {
    var st = O2Diag.state(), h = '<label>Mode 06 katalizator monitoru (MID 21, 1-ci sıra)</label>';
    h += '<p class="sm">MID 21 standart cədvələ görə 1-ci sıra katalizator monitorudur, real avtomobildə təsdiqlənməyib. Dəyərlər xam göstərilir, miqyas tətbiq olunmur.</p>';
    h += btn('Mode 06 oxu (MID 21)', 'm06', (S.state === 'ecu' && !st.on && !busy) ? '' : 'disabled', 'alt');
    if (st.m06Err) h += '<p class="no">' + esc(st.m06Err) + '</p>';
    if (st.m06) h += st.m06.tests.map(function (t) { return '<div class="sm">TID ' + ('0' + t.tid.toString(16)).slice(-2).toUpperCase() + ' · dəyər ' + t.v + ' (' + t.mn + '…' + t.mx + ') <span class="' + (t.ok ? 'ok' : 'bad') + '">' + (t.ok ? '✔ hədlər daxilində' : '✖ hədləri aşıb') + '</span></div>'; }).join('');
    return h;
  }

  function codesHtml() {
    var d = ctx.dtc, h = '<label>Xəta kodları</label>';
    if (!d) h += '<p class="no">Oxunmayıb. Kodlar olmadan nəticə daha az dəqiq olur.</p>';
    else {
      [['Saxlanmış (03)', d.stored], ['Gözləyən (07)', d.pending], ['Daimi (0A)', d.permanent]].forEach(function (x) {
        h += row(x[0], x[1] && x[1].ok ? (x[1].codes.length ? x[1].codes.join(', ') : 'yoxdur') : 'oxunmadı', x[1] && x[1].ok && x[1].codes.length ? 'no' : 'sm');
      });
    }
    return h + btn('Xəta kodlarını oxu', 'codes', (S.state === 'ecu' && !O2Diag.state().on && !busy) ? '' : 'disabled', 'alt');
  }

  function resultsHtml(a) {
    var h = '<div class="sect">Nəticələr</div>';
    a.results.forEach(function (r) {
      h += '<div class="card"><div class="row"><span><b>' + esc(r.title) + '</b></span><span class="' + LC[r.level] + '">' + esc(r.level) + '</span></div>' +
        (r.reasons.length ? '<label>Niyə müəyyən edilə bilmir</label>' + ul(r.reasons) : '') +
        (r.measured.length ? '<label>Ölçülmüş göstəricilər</label>' + ul(r.measured) : '') +
        (r.evidence.length ? '<label>Sübut</label>' + ul(r.evidence) : '') +
        '<label>Növbəti yoxlama</label>' + ul(r.next) +
        '<p class="no">' + esc(r.physical) + '</p></div>';
    });
    h += card('<label>Məlumat çatışmazlığı</label>' + (a.missing.length ? ul(a.missing) : '<p class="ok">Əsas məlumat toplanıb.</p>') + (a.notes.length ? '<label>Qeydlər</label>' + ul(a.notes) : ''));
    h += card('<p class="no">' + esc(a.advice) + '</p><p class="sm">' + esc(a.disclaimer) + '</p>' + btn('Hesabatı paylaş', 'share', '') + btn('Hesabatı kopyala', 'copy', '', 'alt'), 'warn');
    return h;
  }

  function render() {
    if (cur() !== 'o2diag') return;
    var st = O2Diag.state(), h = '<h2>O2 / katalizator diaqnostikası</h2>';
    h += guideHtml();
    if (S.state !== 'ecu' && !st.on) h += card('<p>Real ECU-ya qoşulmamısınız. Əvvəl «Qoşul» bölməsində adapteri qoşun. Heç bir saxta dəyər göstərilmir.</p>', 'warn');
    if (busy) h += card('<p class="no">' + esc(busy) + '</p>');
    if (err) h += card('<p class="bad">' + esc(err) + '</p>');
    if (msg) h += card('<p class="ok">' + esc(msg) + '</p>');
    h += card(sensorsHtml());
    h += card(codesHtml());
    h += card('<label>Test</label><p class="no">Egzoz çox istidir: park halında, havalandırılan yerdə aparın. Sürərkən telefona baxmayın.</p>' +
      '<label class="chk"><input type="checkbox" id="o2focus" data-o2="focus"' + ((st.on ? st.focus : focusPref) ? ' checked' : '') + '>Fokus rejimi (yalnız O2 və RPM: sürətli nümunə)</label>' +
      (st.on ? btn('■ Testi dayandır', 'stop', '', 'del') : btn('▶ Testi başlat', 'start', (S.state === 'ecu' && !busy) ? '' : 'disabled')) +
      '<div id="o2live">' + liveHtml() + '</div>');
    h += card('<div id="o2charts">' + chartsHtml() + '</div>');
    h += card(m06Html());
    var any = Object.keys(st.reg).some(function (k) { return st.reg[k].sec > 0; });
    h += card(btn('Təhlil et', 'analyze', (any && !busy) ? '' : 'disabled') + (any ? '' : '<p class="sm">Təhlil üçün əvvəl testi işlədin.</p>'));
    if (res) h += resultsHtml(res);
    view.innerHTML = h;
  }
  function refresh() {
    if (cur() !== 'o2diag') return;
    var a = document.getElementById('o2live'), b = document.getElementById('o2charts');
    if (a) a.innerHTML = liveHtml();
    if (b) b.innerHTML = chartsHtml();
  }

  async function readCodes() {
    OBD.stopPoll();
    function fail(e) { return { ok: false, codes: [], status: e.message }; }
    var d = { t: new Date().toISOString() };
    d.stored = await OBD.readDtcs('03').catch(fail);
    d.pending = await OBD.readDtcs('07').catch(fail);
    d.permanent = await OBD.readDtcs('0A').catch(fail);
    ctx.dtc = d;
  }
  async function run(label, fn) {
    if (busy) return;
    err = ''; msg = ''; busy = label; render();
    try { await fn(); } catch (e) { Log.add('ERR', label + ': ' + e.message); err = e.message; }
    busy = ''; render();
  }
  function reportTxt() { return O2Diag.reportText(res, { veh: veh() }); }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-o2]');
    if (!el || el.tagName === 'INPUT') return;
    var a = el.getAttribute('data-o2');
    msg = ''; err = '';
    if (a === 'start') { try { res = null; O2Diag.start(focusPref); } catch (x) { err = x.message; } render(); }
    else if (a === 'stop') { O2Diag.stop(); render(); }
    else if (a === 'codes') run('Kodlar oxunur…', readCodes);
    else if (a === 'm06') run('Mode 06 oxunur…', function () { return O2Diag.readMode06(); });
    else if (a === 'analyze') { try { res = O2Diag.analyze(O2Diag.collect()); } catch (x) { err = 'Təhlil alınmadı: ' + x.message; } render(); }
    else if (a === 'share' && res) Session.share(reportTxt(), 'AC OBD O2 diaqnostikası').then(function (r) { if (r === 'copy') msg = 'Hesabat kopyalandı.'; else if (r === 'fail') err = 'Paylaşmaq alınmadı.'; render(); });
    else if (a === 'copy' && res) { if (Session.copy(reportTxt())) msg = 'Hesabat kopyalandı.'; else err = 'Kopyalama alınmadı.'; render(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id !== 'o2focus') return;
    focusPref = e.target.checked;
    if (O2Diag.state().on) { O2Diag.setFocus(focusPref); }
  });
  O2Diag.on(refresh);
  OBD.on(function (t) { if (t === 'state' && cur() === 'o2diag' && !O2Diag.state().on) render(); });

  function addDrawer() {
    var dl = document.getElementById('drawerlist');
    if (dl && !dl.querySelector('a[href="#o2diag"]')) {
      var a = document.createElement('a');
      a.href = '#o2diag'; a.textContent = 'O2 / katalizator diaqnostikası';
      dl.appendChild(a);
    }
  }
  function apply() { if (cur() === 'o2diag') { msg = ''; err = ''; render(); window.scrollTo(0, 0); } addDrawer(); }
  var dl0 = document.getElementById('drawerlist');
  if (dl0) new MutationObserver(addDrawer).observe(dl0, { childList: true });
  window.addEventListener('hashchange', apply);
  addDrawer();
  apply();
})();
