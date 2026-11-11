window.LiveDiag = (function () {
  var S = OBD.S, timer = null, subs = [];
  var PRI = ['0C', '04', '05', '0F', '11', '47', '0B', '10', '0E', '1F', '03', '06', '07', '08', '09', '44', '14', '15', '24', '25', '42', '0D', '33', '49', '2C', '2D', '2F'];
  var V = { N: 'Normal', S: 'Şübhəli', P: 'Problem ehtimalı', U: 'Məlumat kifayət deyil' };
  (function () {
    var P = window.PIDS;
    function add(id, az, en, unit, fix, f) { if (!P[id]) P[id] = { az: az, en: en, unit: unit, fix: fix, dec: function (b) { return { v: f(b) }; } }; }
    add('47', 'Mütləq drossel mövqeyi B', 'Absolute Throttle Position B', '%', 1, function (b) { return b[0] * 100 / 255; });
    add('2C', 'EGR əmri', 'Commanded EGR', '%', 1, function (b) { return b[0] * 100 / 255; });
    add('2D', 'EGR xətası', 'EGR Error', '%', 1, function (b) { return b[0] * 100 / 128 - 100; });
    add('52', 'Etanol yanacaq faizi', 'Ethanol Fuel %', '%', 1, function (b) { return b[0] * 100 / 255; });
  })();
  function blank() {
    return { on: false, dur: 60, t0: 0, t1: 0, ids: [], acc: {}, b: { all: {}, off: {}, run: {}, hot: {}, idle: {} }, ctxT: {}, ev: [], reads: 0, rate: 0, ctx: { eng: 'unk', mot: 'unk' }, rep: null, stale: {}, unsup: [] };
  }
  var st = blank();
  function emit() { subs.forEach(function (f) { try { f(); } catch (e) {} }); }
  function ev(t) { st.ev.push({ s: st.t0 ? Math.round((Date.now() - st.t0) / 1000) : 0, t: t }); if (st.ev.length > 100) st.ev.shift(); }
  function bucket(name, id, v) {
    var b = st.b[name], x = b[id] || (b[id] = { n: 0, sum: 0, min: null, max: null });
    x.n++; x.sum += v;
    if (x.min === null || v < x.min) x.min = v;
    if (x.max === null || v > x.max) x.max = v;
  }
  function A(id) { var a = st.acc[id]; return a && a.n ? { n: a.n, avg: a.sum / a.n, min: a.min, max: a.max, v: a.v } : null; }
  function B(name, id) { var x = st.b[name][id]; return x && x.n ? { n: x.n, avg: x.sum / x.n, min: x.min, max: x.max } : null; }
  function val(id) { var a = st.acc[id]; return a && a.n && Date.now() - a.t < 5000 ? a.v : null; }
  function ago(id, n) { var a = st.acc[id]; return a && a.ser.length > n ? a.ser[a.ser.length - 1 - n] : null; }

  function classify() {
    var rpm = val('0C'), spd = val('0D'), clt = val('05'), load = val('04');
    var c = { eng: 'unk', mot: 'unk', load: false };
    if (rpm === null) return c;
    if (rpm < 100) { c.eng = 'off'; c.mot = 'stop'; return c; }
    c.eng = clt === null ? 'unk' : (clt < 60 ? 'cold' : (clt < 80 ? 'warm' : 'hot'));
    if (spd === null) return c;
    if (spd === 0) { c.mot = rpm < 1400 ? 'idle' : 'rev'; return c; }
    var p = ago('0D', 3), d = p === null ? 0 : (spd - p) / 3;
    c.mot = d > 1.5 ? 'accel' : (d < -1.5 ? 'decel' : 'cruise');
    c.load = load !== null && load > 70;
    return c;
  }
  function onValue() {
    if (!st.on) return;
    var now = Date.now();
    st.ids.forEach(function (id) {
      var r = OBD.values[id];
      if (!r || r.v === null || r.nodata || !r.t) return;
      var a = st.acc[id] || (st.acc[id] = { n: 0, sum: 0, min: null, max: null, v: null, t: 0, ser: [], ls: 0 });
      if (a.t === r.t) return;
      a.t = r.t; a.v = r.v; a.n++; a.sum += r.v;
      if (a.min === null || r.v < a.min) a.min = r.v;
      if (a.max === null || r.v > a.max) a.max = r.v;
      if (now - a.ls >= 1000) { a.ser.push(r.v); a.ls = now; if (a.ser.length > 1800) a.ser.shift(); }
      st.reads++;
      bucket('all', id, r.v);
      var rpm = val('0C'), spd = val('0D'), clt = val('05');
      if (rpm !== null && rpm < 100) bucket('off', id, r.v);
      else if (rpm !== null && rpm > 400) {
        bucket('run', id, r.v);
        if (clt !== null && clt >= 80) { bucket('hot', id, r.v); if (spd === 0 && rpm < 1400) bucket('idle', id, r.v); }
      }
    });
  }
  function tick() {
    if (!st.on) return;
    var now = Date.now(), el = (now - st.t0) / 1000;
    st.ctx = classify();
    var k = st.ctx.eng + '/' + st.ctx.mot;
    st.ctxT[k] = (st.ctxT[k] || 0) + 1;
    st.rate = st.reads / Math.max(el, 1);
    st.ids.forEach(function (id) {
      var a = st.acc[id];
      if (a && a.n && now - a.t > 8000) { if (!st.stale[id]) { st.stale[id] = 1; ev('PID ' + id + ' 8 saniyədir yenilənmir (köhnəlib)'); } }
      else st.stale[id] = 0;
    });
    if (st.dur && el >= st.dur) stop(true);
    else emit();
  }
  function start(dur) {
    if (S.state !== 'ecu') throw new Error('Real ECU-ya qoşulmamısınız.');
    var sup = OBD.supported;
    var ids = PRI.filter(function (p) { return sup.indexOf(p) >= 0 && window.PIDS[p]; }).slice(0, 12);
    var unsup = PRI.filter(function (p) { return sup.indexOf(p) < 0 && window.PIDS[p]; });
    st = blank(); st.dur = dur; st.ids = ids.concat(['RV']); st.unsup = unsup; st.t0 = Date.now(); st.on = true;
    OBD.startPoll(st.ids);
    clearInterval(timer); timer = setInterval(tick, 1000);
    ev('Diaqnostika başladı: ' + st.ids.length + ' göstərici sorğulanır');
    emit();
  }
  function stop(auto) {
    if (!st.on) return;
    st.on = false; st.t1 = Date.now();
    clearInterval(timer);
    try { OBD.stopPoll(); } catch (e) {}
    ev(auto ? 'Müddət bitdi' : 'İstifadəçi dayandırdı');
    st.rep = report();
    emit();
  }
  OBD.on(function (type) {
    if (type === 'value') { onValue(); return; }
    if (!st.on) return;
    if (S.state === 'reconnecting' || S.state === 'elm') ev('Əlaqə problemi: ' + S.state);
    else if (S.state === 'error' || S.state === 'idle') { ev('Əlaqə kəsildi'); stop(true); }
    else if (S.state === 'ecu') ev('Əlaqə bərpa olundu');
    emit();
  });

  /* ---------- Təhlil ---------- */
  function nm(id) { var p = window.PIDS[id]; return p ? p.az : id; }
  function mk(id, name, verdict, rng, o, bk) {
    var a = bk || A(id) || {}, p = window.PIDS[id] || {}, c = A(id) || {};
    o = o || {};
    return { id: id, name: name || nm(id), unit: p.unit || '', fix: p.fix === undefined ? 1 : p.fix, cur: c.v, avg: a.avg, min: a.min, max: a.max, n: a.n || 0,
      verdict: verdict, rng: rng, causes: o.causes || [], check: o.check || [], sys: o.sys || [], note: o.note || '', crit: !!o.crit };
  }
  function assess() {
    var out = [], used = {};
    function add(it) { out.push(it); used[it.id] = 1; }
    function unk(id, why) { add(mk(id, null, V.U, why)); }
    var vid = A('42') ? '42' : (A('RV') ? 'RV' : null);
    if (vid) {
      var vn = vid === '42' ? 'Gərginlik (ECU, Control Module Voltage)' : 'Gərginlik (adapterin OBD portunda ölçdüyü, ECU dəyəri deyil)';
      var off = B('off', vid), run = B('run', vid);
      if (off && off.n >= 3) {
        var x = off.avg;
        add(mk(vid, vn + ', mühərrik söndürülü', x >= 12.4 ? V.N : (x >= 12.0 ? V.S : V.P), 'Söndürülü mühərrikdə adətən ≥12.4 V (ümumi dəyər, istehsalçı normu deyil)',
          x >= 12.4 ? {} : { causes: ['Akkumulyatorun qismən boşalması və ya köhnəlməsi', 'Soyuq hava gərginliyi aşağı göstərə bilər', 'Cihazların uzun müddət qoşulu qalması'], check: ['Akkumulyatoru multimetrlə yoxlayın', 'Mühərrik işləyərkən doldurmanı yoxlayın', 'Klemmaların oksidləşməsini yoxlayın'], sys: ['Akkumulyator', 'Şarj sistemi'], note: 'Kontekstdən asılı olaraq normal və ya aşağı gərginlik ehtimalı. Yük altında davranış ölçülməyib.' }, off));
      }
      if (run && run.n >= 8) {
        var y = run.avg;
        var vv = (y >= 13.2 && y <= 14.9) ? V.N : ((y >= 12.8 && y < 13.2) || (y > 14.9 && y <= 15.3) ? V.S : V.P);
        add(mk(vid, vn + ', mühərrik işləyir', vv, 'İşləyən mühərrikdə adətən 13.2–14.9 V. Ağıllı şarj sistemlərində dəyişə bilər, yalnız davamlı sapma nəzərə alınır (ümumi dəyər)',
          vv === V.N ? {} : { causes: y < 13.2 ? ['Generator və ya gərginlik tənzimləyicisi', 'Generator qayışı', 'Naqil və klemma kontaktları', 'Zəif akkumulyator'] : ['Gərginlik tənzimləyicisi (yüksək gərginlik)'], check: ['Akkumulyator klemmasında gərginliyi multimetrlə ölçün', 'Generator qayışını və kontaktları yoxlayın'], sys: ['Şarj sistemi', 'Akkumulyator'], note: 'Ölçmə adapterdən gəlirsə dəqiqlik məhduddur.' }, run));
      }
      if (!(off && off.n >= 3) && !(run && run.n >= 8)) add(mk(vid, vn, V.U, 'Mühərrikin vəziyyəti (söndürülü/işləyir) üçün kifayət qədər nümunə toplanmadı'));
    }
    var a0 = A('0C');
    if (a0) {
      var idle = B('idle', '0C');
      if (a0.max > 8000) add(mk('0C', 'Mühərrik dövrü (RPM)', V.P, 'Real mühərrik üçün >8000 rpm mümkün deyil', { causes: ['Dekodlama və ya adapter məlumat xətası'], check: ['Jurnalda xam cavabı yoxlayın'] }));
      else if (idle && idle.n >= 15) {
        var rg = idle.max - idle.min, ok = idle.avg >= 550 && idle.avg <= 1100;
        var rv = (ok && rg <= 150) ? V.N : ((idle.avg < 450 || idle.avg > 1400 || rg > 300) ? V.P : V.S);
        add(mk('0C', 'Mühərrik dövrü (RPM), isti boş gediş', rv, 'Boş gedişdə adətən 600–1000 rpm, tərpənmə ≤150 rpm (ümumi aralıq; Kia Forte 1.8 üçün təsdiqlənmiş norma tapılmayıb)',
          rv === V.N ? {} : { causes: ['Havanın sızması (vakuum)', 'Drossel klapanının çirklənməsi', 'Şam və alışdırma sistemi', 'Yanacaq təchizatı', 'Sensor problemləri'], check: ['Vakuum şlanqlarını yoxlayın', 'Drosseli təmizləyin', 'Şam və sarğıları yoxlayın', 'Yanacaq korreksiyalarına baxın'], sys: ['Mühərrik idarəetməsi', 'Yanacaq-hava'], note: 'RPM vahidi dövr/dəqiqədir (700 ≠ 7000).' }, idle));
      } else add(mk('0C', 'Mühərrik dövrü (RPM)', V.U, 'İsti boş gediş (≥80 °C, sürət 0) üçün kifayət qədər nümunə yoxdur'));
    }
    var c = A('05');
    if (c) {
      var rt = A('1F'), rtv = rt ? rt.v : (Date.now() - st.t0) / 1000;
      if (c.v > 112) add(mk('05', 'Soyuducu temperaturu', V.P, 'İşləyən mühərrikdə adətən 80–105 °C (ümumi)', { crit: true, causes: ['Soyutma mayesi azlığı', 'Ventilyator, termostat və ya nasos nasazlığı'], check: ['Mühərriki söndürün və soyumasını gözləyin', 'Maye səviyyəsini soyuq mühərrikdə yoxlayın'], sys: ['Soyutma'], note: 'Qızmış mühərrikdə sistemi açmayın.' }));
      else if (c.v > 105) add(mk('05', 'Soyuducu temperaturu', V.P, 'İşləyən mühərrikdə adətən 80–105 °C (ümumi)', { causes: ['Soyutma mayesi azlığı', 'Ventilyator və ya termostat'], check: ['Ventilyatorun işə düşdüyünü və maye səviyyəsini yoxlayın'], sys: ['Soyutma'] }));
      else if (rtv > 600 && c.v < 70 && val('0C') > 400) add(mk('05', 'Soyuducu temperaturu', V.S, '10 dəqiqədən sonra adətən ≥80 °C', { causes: ['Termostatın açıq qalması', 'Temperatur sensoru'], check: ['Temperaturun artım sürətini izləyin', 'Sensoru başqa alətlə müqayisə edin'], sys: ['Soyutma', 'Yanacaq korreksiyası'] }));
      else if (c.v >= 80) add(mk('05', 'Soyuducu temperaturu', V.N, 'İşləyən mühərrikdə adətən 80–105 °C (ümumi)'));
      else add(mk('05', 'Soyuducu temperaturu', V.U, 'Mühərrik hələ qızır və ya işləmir, qiymətləndirmə üçün erkəndir'));
    }
    [['06', 'STFT (qısamüddətli korreksiya)'], ['07', 'LTFT (uzunmüddətli korreksiya)']].forEach(function (p) {
      var h = B('hot', p[0]);
      if (!A(p[0])) return;
      if (!h || h.n < 10) { add(mk(p[0], p[1], V.U, 'İsti mühərrik və qapalı döngə üçün kifayət qədər nümunə yoxdur')); return; }
      var m = Math.abs(h.avg), lim = p[0] === '07' ? [10, 15] : [8, 15];
      var tv = m <= lim[0] ? V.N : (m <= lim[1] ? V.S : V.P);
      add(mk(p[0], p[1] + ', isti mühərrik', tv, 'Ortalama adətən ±' + lim[0] + ' % daxilində (ümumi)',
        tv === V.N ? {} : (h.avg > 0
          ? { causes: ['Vakuum/hava sızması', 'MAF/MAP sensoru', 'Yanacaq təzyiqinin aşağı olması', 'Egzoz sızması', 'Oksigen sensoru'], check: ['Vakuum sızmasını yoxlayın', 'Boş gediş və yüksək RPM-də korreksiyaları müqayisə edin', 'Yanacaq təzyiqini ölçün'], sys: ['Yanacaq-hava', 'Mühərrik idarəetməsi'], note: 'Müsbət korreksiya qarışığın kasıb olması ehtimalını göstərə bilər. Qəti diaqnoz deyil.' }
          : { causes: ['Injektor sızması', 'Yüksək yanacaq təzyiqi', 'Hava filtri tıxanması', 'Oksigen sensoru'], check: ['Hava filtrini yoxlayın', 'Yanacaq təzyiqini ölçün'], sys: ['Yanacaq-hava'], note: 'Mənfi korreksiya qarışığın zəngin olması ehtimalını göstərə bilər. Qəti diaqnoz deyil.' }), h));
    });
    var mp = A('0B');
    if (mp) {
      var ib = B('idle', '0B'), bar = A('33');
      if (ib && ib.n >= 10) add(mk('0B', 'Giriş kollektoru təzyiqi (MAP), isti boş gediş', (ib.avg >= 20 && ib.avg <= 55) ? V.N : V.S, 'Boş gedişdə adətən 20–55 kPa (atmosferli mühərrik, ümumi)', (ib.avg >= 20 && ib.avg <= 55) ? {} : { causes: ['Vakuum sızması', 'MAP sensoru'], check: ['Vakuum şlanqlarını yoxlayın'], sys: ['Giriş sistemi'] }, ib));
      else { var ob = B('off', '0B'); if (ob && ob.n >= 3 && bar) add(mk('0B', 'Giriş kollektoru təzyiqi (MAP), mühərrik söndürülü', Math.abs(ob.avg - bar.v) <= 6 ? V.N : V.S, 'Söndürülü mühərrikdə barometrik təzyiqə yaxın (±6 kPa)', {}, ob)); else unk('0B', 'İsti boş gediş və ya söndürülü vəziyyət üçün nümunə yoxdur'); }
    }
    ['14', '15', '16', '17', '18', '19', '1A', '1B', '24', '25', '26', '27', '28', '29', '2A', '2B'].forEach(function (id) {
      if (!A(id)) return;
      var q = window.Adapter ? Adapter.pos(id) : null, k = window.Adapter ? Adapter.kind(id) : null, h = B('hot', id), nmx = nm(id);
      if (!q) { add(mk(id, nmx, V.U, 'Sensorun mövqeyi PID 13/1D ilə təsdiqlənməyib, qiymətləndirmə aparılmadı')); return; }
      if (!h || h.n < 20) { add(mk(id, nmx, V.U, 'İsti mühərrik üçün kifayət qədər nümunə yoxdur')); return; }
      var rg = h.max - h.min;
      if (k === 'narrow' && q.pos === 'B1S1') add(mk(id, nmx, rg >= 0.5 ? V.N : (rg >= 0.25 ? V.S : V.P), 'Ön sensor isti mühərrikdə tez dəyişməlidir (aralıq ≥0.5 V). Açıq döngə də ola bilər (ümumi)', rg >= 0.5 ? {} : { causes: ['Sensorun yavaşlaması', 'Açıq döngə rejimi', 'Qızdırıcı dövrəsi'], check: ['Sensoru qrafikdə izləyin', 'Yanacaq sisteminin vəziyyətinə (PID 03) baxın'], sys: ['Yanacaq korreksiyası'] }, h));
      else if (k === 'narrow' && q.pos === 'B1S2') add(mk(id, nmx, rg <= 0.4 ? V.N : V.S, 'Arxa sensor ön sensora nisbətən sabit olmalıdır (aralıq ≤0.4 V, ümumi)', rg <= 0.4 ? {} : { causes: ['Katalizatorun oksigen saxlama qabiliyyətinin azalması', 'Arxa sensor', 'Egzoz sızması'], check: ['Ön və arxa sensoru eyni qrafikdə müqayisə edin', 'Misfire və yanacaq korreksiyasını yoxlayın'], sys: ['Katalizator', 'Egzoz'], note: 'Tək başına katalizatorun xarab olduğunu sübut etmir.' }, h));
      else if (k === 'wide' && q.pos === 'B1S1') add(mk(id, nmx, (h.avg >= 0.97 && h.avg <= 1.03) ? V.N : ((h.avg >= 0.93 && h.avg <= 1.07) ? V.S : V.P), 'İsti qapalı döngədə ortalama λ təxminən 1.00 (±0.03, ümumi)', (h.avg >= 0.97 && h.avg <= 1.03) ? {} : { causes: ['Hava və ya yanacaq təchizatı sapması', 'Sensor'], check: ['Yanacaq korreksiyalarını yoxlayın'], sys: ['Yanacaq-hava'] }, h));
      else add(mk(id, nmx, V.U, 'Bu sensor üçün etibarlı ümumi norma müəyyən edilməyib'));
    });
    st.ids.forEach(function (id) {
      if (used[id] || !A(id)) return;
      add(mk(id, null, V.U, 'Bu göstərici üçün təsdiqlənmiş ümumi norma müəyyən edilməyib'));
    });
    return out;
  }
  function prio(it) { return it.crit ? 'Kritik' : (it.verdict === V.P ? 'Yüksək' : (it.verdict === V.S ? 'Orta' : null)); }
  function report() {
    var items = assess(), el = Math.round(((st.t1 || Date.now()) - st.t0) / 1000);
    var probs = [];
    items.forEach(function (it) { var p = prio(it); if (p) probs.push({ prio: p, title: it.name + ': ' + it.verdict, it: it }); });
    var codes = [];
    var d = window.Session && Session.ctx.dtc;
    if (d) ['stored', 'pending', 'permanent'].forEach(function (k) { if (d[k] && d[k].ok) d[k].codes.forEach(function (c) { if (codes.indexOf(c) < 0) codes.push(c); }); });
    if (codes.length) probs.push({ prio: 'Yüksək', title: 'ECU-da xəta kodu var: ' + codes.join(', '), it: null });
    var nodata = st.ids.filter(function (id) { return !A(id); });
    if (nodata.length) probs.push({ prio: 'Müşahidə edilməlidir', title: 'ECU-dan cavab gəlməyən göstəricilər: ' + nodata.join(', '), it: null });
    if (el < 60) probs.push({ prio: 'Aşağı', title: 'Test qısa olub (' + el + ' san): qiymətləndirmə məhduddur', it: null });
    var order = { 'Kritik': 0, 'Yüksək': 1, 'Orta': 2, 'Aşağı': 3, 'Müşahidə edilməlidir': 4 };
    probs.sort(function (a, b) { return order[a.prio] - order[b.prio]; });
    var cnt = { N: 0, S: 0, P: 0, U: 0 };
    items.forEach(function (it) { cnt[it.verdict === V.N ? 'N' : (it.verdict === V.S ? 'S' : (it.verdict === V.P ? 'P' : 'U'))]++; });
    var ctxs = Object.keys(st.ctxT).map(function (k) { return { k: k, s: st.ctxT[k] }; });
    var concl = !items.length ? 'Kifayət qədər məlumat toplanmadı.' :
      items.length + ' göstərici təhlil edildi: ' + cnt.N + ' normal, ' + cnt.S + ' şübhəli, ' + cnt.P + ' problem ehtimalı, ' + cnt.U + ' üçün məlumat kifayət deyil.' +
      (probs.filter(function (p) { return p.it; }).length ? ' Diqqət tələb edən: ' + probs.filter(function (p) { return p.it; }).slice(0, 3).map(function (p) { return p.it.name; }).join('; ') + '.' : ' Ölçülmüş məlumatda aydın sapma aşkarlanmadı.') +
      ' Bu nəticə yalnız ölçülmüş məlumata əsaslanır və qəti diaqnoz deyil.';
    return { items: items, probs: probs, codes: codes, cnt: cnt, el: el, ctxs: ctxs, ev: st.ev.slice(), reads: st.reads, rate: st.rate, nodata: nodata, unsup: st.unsup, concl: concl, t: new Date(st.t0).toISOString() };
  }
  function fmt(it) { return it.avg === undefined || it.avg === null ? '—' : it.avg.toFixed(it.fix) + ' ' + it.unit + ' (min ' + it.min.toFixed(it.fix) + ', maks ' + it.max.toFixed(it.fix) + ')'; }
  function text(rep, ctx) {
    var o = [], v = ctx && ctx.vin, S0 = S;
    o.push('AC OBD — Canlı diaqnostika hesabatı', '');
    o.push('1. Avtomobil: ' + (ctx && ctx.veh ? ctx.veh : '—') + (v ? ' | VIN (ECU-dan oxunub): ' + v : ' | VIN oxunmayıb'));
    o.push('2. Tarix: ' + rep.t.replace('T', ' ').slice(0, 19) + ' | Müddət: ' + rep.el + ' san');
    o.push('3. Adapter: ' + (S0.deviceName || '—') + ' | ' + (S0.elmVersion || '—') + ' | Protokol: ' + (S0.protocol || '—'));
    o.push('4. İş rejimi (saniyə): ' + (rep.ctxs.length ? rep.ctxs.map(function (c) { return c.k + '=' + c.s; }).join(', ') : '—'));
    o.push('5. Oxunan PID: ' + (rep.items.length) + ' | Oxuma: ' + rep.reads + ', tezlik ~' + rep.rate.toFixed(1) + '/san | Cavabsız: ' + (rep.nodata.join(', ') || 'yoxdur'));
    [['6. Normal göstəricilər', V.N], ['7. Şübhəli göstəricilər', V.S]].forEach(function (g) {
      o.push('', g[0] + ':');
      var l = rep.items.filter(function (i) { return i.verdict === g[1]; });
      if (!l.length) o.push('  —');
      l.forEach(function (i) { o.push('  - ' + i.name + ': ' + fmt(i)); });
    });
    o.push('', '8. Aşkar edilmiş problemlər (prioritet):');
    if (!rep.probs.length) o.push('  —');
    rep.probs.forEach(function (p) { o.push('  [' + p.prio + '] ' + p.title); if (p.it && p.it.rng) o.push('      Gözlənilən: ' + p.it.rng); if (p.it && p.it.note) o.push('      Qeyd: ' + p.it.note); });
    o.push('', '9. Mümkün səbəblər:');
    var cs = []; rep.probs.forEach(function (p) { if (p.it) p.it.causes.forEach(function (c) { if (cs.indexOf(c) < 0) cs.push(c); }); });
    (cs.length ? cs : ['—']).forEach(function (c) { o.push('  - ' + c); });
    o.push('', '10. Tövsiyə olunan yoxlamalar:');
    var ck = []; rep.probs.forEach(function (p) { if (p.it) p.it.check.forEach(function (c) { if (ck.indexOf(c) < 0) ck.push(c); }); });
    (ck.length ? ck : ['—']).forEach(function (c) { o.push('  - ' + c); });
    o.push('', '11. Xəta kodları: ' + (rep.codes.join(', ') || 'oxunmayıb və ya yoxdur'));
    o.push('', '12. Ümumi nəticə: ' + rep.concl);
    if (rep.ev.length) { o.push('', 'Hadisələr:'); rep.ev.forEach(function (e) { o.push('  ' + e.s + ' s: ' + e.t); }); }
    return o.join('\n');
  }
  return { tick: tick, start: start, stop: stop, state: function () { return st; }, on: function (f) { subs.push(f); }, text: text, fmt: fmt, assess: assess, V: V };
})();
