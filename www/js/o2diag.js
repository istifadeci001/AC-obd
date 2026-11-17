window.O2Diag = (function () {
  'use strict';
  var DISCLAIMER = 'Bütün hədlər ümumi təxmini qaydalardır: real avtomobildə təsdiqlənməyib və istehsalçı normu deyil. Nəticə qəti diaqnoz deyil, katalizatorun dəyişdirilməsi tövsiyəsi deyil.';
  var LV = { H: 'Yüksək', M: 'Orta', L: 'Aşağı', N: 'Əlamət tapılmadı', U: 'Müəyyən edilə bilmir' };
  var FRONT_CODES = ['P0130', 'P0131', 'P0132', 'P0133', 'P0134', 'P0135', 'P0030', 'P0031', 'P0032', 'P0053'];
  var REAR_CODES = ['P0136', 'P0137', 'P0138', 'P0139', 'P0140', 'P0141', 'P0036', 'P0037', 'P0038', 'P0054'];
  var MIS_RE = /^P03(0\d|1[0-2])$/;
  var KIND_AZ = { narrow: 'darzolaqlı (gərginlik, V)', wide: 'genişzolaqlı (lambda)', 'wide-current': 'genişzolaqlı (lambda, cərəyanlı PID)' };
  var RANGES = [{ base: 0x14, kind: 'narrow' }, { base: 0x24, kind: 'wide' }, { base: 0x34, kind: 'wide-current' }];
  var CTX_IDS = ['0C', '05', '0D', '06', '07', '04', '03', '0B', '10', '1F'];

  function hex2(n) { return ('0' + n.toString(16)).slice(-2).toUpperCase(); }
  function f1(x) { return x.toFixed(1); }
  function f2(x) { return x.toFixed(2); }

  /* O2 PID-lərinin təriflərini tamamlayır (mövcudları dəyişmir) */
  (function () {
    var P = window.PIDS || (window.PIDS = {});
    for (var i = 0; i < 8; i++) {
      var a = hex2(0x14 + i), b = hex2(0x24 + i), c = hex2(0x34 + i);
      if (!P[a]) P[a] = { az: 'O2 sensoru (gərginlik)', en: 'O2 Sensor (voltage)', unit: 'V', fix: 3, dec: function (x) { return { v: x[0] / 200 }; } };
      if (!P[b]) P[b] = { az: 'O2 sensoru (lambda, geniş diapazon)', en: 'O2 Sensor (lambda)', unit: 'λ', fix: 3, dec: function (x) { return { v: (x[0] * 256 + x[1]) / 32768 }; } };
      // PID 34–3B: 4 bayt. A,B = lambda (λ = (256A+B)/32768); C,D = cərəyan (mA = (256C+D)/256 − 128). Natamam cavabdan nəticə çıxarılmır.
      if (!P[c]) P[c] = { az: 'O2 sensoru (lambda, cərəyanlı)', en: 'O2 Sensor (lambda, current PID)', unit: 'λ', fix: 3, dec: function (x) { if (!x || x.length < 4) return { v: null, invalid: 'natamam cavab: ' + (x ? x.length : 0) + ' bayt, 4 bayt lazımdır' }; return { v: (x[0] * 256 + x[1]) / 32768, aux: { cur: (x[2] * 256 + x[3]) / 256 - 128, curUnit: 'mA' } }; } };
    }
  })();

  /* ---------- Sensorların identifikasiyası ---------- */
  function posOf(scheme, idx) {
    return scheme === '13' ? 'B' + (Math.floor(idx / 4) + 1) + 'S' + (idx % 4 + 1) : 'B' + (Math.floor(idx / 2) + 1) + 'S' + (idx % 2 + 1);
  }
  function identify(supported, map) {
    supported = supported || [];
    var out = { scheme: map && map.scheme ? map.scheme : '', mask: map && map.mask ? map.mask : 0, sensors: [], issues: [], front: null, rear: null };
    RANGES.forEach(function (r) {
      for (var i = 0; i < 8; i++) {
        var id = hex2(r.base + i);
        if (supported.indexOf(id) < 0) continue;
        var s = { pid: id, kind: r.kind, kindAz: KIND_AZ[r.kind], idx: i, pos: null, present: null, confirmed: false, note: '' };
        if (out.scheme) {
          s.pos = posOf(out.scheme, i);
          s.present = !!((out.mask >> i) & 1);
          s.confirmed = s.present;
          if (!s.present) s.note = 'PID dəstəklənir, amma PID ' + out.scheme + ' maskası bu mövqenin olmadığını göstərir: mövqe təsdiqlənmir';
        } else s.note = 'Mövqe sxemi (PID 13/1D) oxunmayıb: mövqe təsdiqlənmir';
        out.sensors.push(s);
      }
    });
    if (!out.sensors.length) out.issues.push('Bu avtomobil standart O2 PID-lərini (14–1B, 24–2B, 34–3B) vermir.');
    else if (!out.scheme) out.issues.push('ECU sensor mövqe sxemini (PID 13/1D) vermədi: B1S1/B1S2 təsdiqlənmir, katalizator nəticəsi çıxarılmayacaq.');
    function pick(pos) {
      var c = out.sensors.filter(function (s) { return s.confirmed && s.pos === pos; });
      if (!c.length) return null;
      var order = { wide: 0, 'wide-current': 1, narrow: 2 };
      c.sort(function (a, b) { return order[a.kind] - order[b.kind]; });
      if (c.length > 1) out.issues.push(pos + ' üçün bir neçə PID var (' + c.map(function (s) { return s.pid; }).join(', ') + '): ' + c[0].pid + ' istifadə olunur.');
      return c[0];
    }
    out.front = pick('B1S1');
    out.rear = pick('B1S2');
    return out;
  }

  /* ---------- Statistika ---------- */
  function stats(a) {
    if (!a || !a.length) return null;
    var n = a.length, s = 0, mn = a[0], mx = a[0], i;
    for (i = 0; i < n; i++) { s += a[i]; if (a[i] < mn) mn = a[i]; if (a[i] > mx) mx = a[i]; }
    var m = s / n, q = 0;
    for (i = 0; i < n; i++) q += (a[i] - m) * (a[i] - m);
    return { n: n, min: mn, max: mx, mean: m, std: Math.sqrt(q / n), range: mx - mn };
  }
  function medDt(t) {
    if (!t || t.length < 3) return null;
    var d = [];
    for (var i = 1; i < t.length; i++) d.push((t[i] - t[i - 1]) / 1000);
    d.sort(function (a, b) { return a - b; });
    return d[Math.floor(d.length / 2)];
  }
  function crossings(v, thr, hys) {
    var s = 0, c = 0;
    v.forEach(function (x) {
      if (x > thr + hys) { if (s === -1) c++; s = 1; }
      else if (x < thr - hys) { if (s === 1) c++; s = -1; }
    });
    return c;
  }

  /* ---------- Rejim təyini ---------- */
  function classify(c) {
    var rpm = c.rpm, ect = c.ect, spd = c.spd;
    if (rpm === null || rpm === undefined) return 'unknown';
    if (rpm < 400) return 'off';
    if (ect === null || ect === undefined) return 'unknown';
    if (ect < 60) return 'cold';
    if (ect < 80) return 'warm';
    if (spd !== null && spd !== undefined && spd > 0) return 'moving';
    if (rpm >= 500 && rpm <= 1200 && c.rpmRange <= 250) return 'idle';
    if (rpm >= 2250 && rpm <= 2750 && c.rpmRange <= 150) return 'r2500';
    return 'other';
  }

  /* ---------- Analiz ---------- */
  function ser(inp, rg, pid) { var r = inp.reg && inp.reg[rg]; return r && r.ser && r.ser[pid] && r.ser[pid].v.length ? r.ser[pid] : null; }
  function hot(inp, pid) {
    var a = ser(inp, 'idle', pid), b = ser(inp, 'r2500', pid);
    if (!a && !b) return null;
    return { t: (a ? a.t : []).concat(b ? b.t : []), v: (a ? a.v : []).concat(b ? b.v : []) };
  }
  function secs(inp, rg) { return inp.reg && inp.reg[rg] ? inp.reg[rg].sec || 0 : 0; }
  function lvl(p) { return p >= 5 ? LV.H : (p >= 3 ? LV.M : (p >= 1 ? LV.L : LV.N)); }
  function res(key, title) {
    return { key: key, title: title, level: LV.U, pts: 0, evidence: [], measured: [], next: [], physical: '', reasons: [], note: DISCLAIMER };
  }
  function sname(sn) { return sn.pos + ', PID ' + sn.pid + ', ' + sn.kindAz; }
  function codeEv(codes, list) {
    var p = codes ? list.filter(function (c) { return codes.indexOf(c) >= 0; }) : [];
    return { pts: Math.min(4, p.length * 2), list: p };
  }

  function health(inp, sn, role) {
    var h = { sn: sn, avail: false, reasons: [], evid: [], meas: [], pts: 0, stuck: null, flat: false, dt: null, adequate: null, slow: null, cold: false, st: null };
    var nm = role === 'front' ? 'Ön (B1S1)' : 'Arxa (B1S2)';
    if (!sn) { h.reasons.push(nm + ' sensor PID-i dəstəklənmir və ya mövqeyi təsdiqlənməyib. Başqa PID bunun əvəzinə istifadə edilmir.'); return h; }
    var hv = hot(inp, sn.pid);
    if (!hv || hv.v.length < 20) { h.reasons.push('İsti rejimdə (boş gediş və ya 2500 rpm) PID ' + sn.pid + ' üçün nümunə azdır (<20).'); return h; }
    h.avail = true;
    var st = stats(hv.v), narrow = sn.kind === 'narrow', u = narrow ? ' V' : ' λ';
    h.st = st;
    h.meas.push(nm + ' (' + sname(sn) + '): min ' + f2(st.min) + ', maks ' + f2(st.max) + ', orta ' + f2(st.mean) + ', aralıq ' + f2(st.range) + u + ', nümunə ' + st.n);
    if (narrow) {
      if (st.max < 0.2) { h.stuck = 'low'; h.pts += 3; h.evid.push('Siqnal isti mühərrikdə həmişə aşağıdır (maks ' + f2(st.max) + ' V): ilişib qala bilər və ya sensor həmişə kasıb qarışıq görür.'); }
      else if (st.min > 0.7) { h.stuck = 'high'; h.pts += 3; h.evid.push('Siqnal isti mühərrikdə həmişə yüksəkdir (min ' + f2(st.min) + ' V): ilişib qala bilər və ya sensor həmişə zəngin qarışıq görür.'); }
      else if (st.range < 0.08 && st.mean > 0.35 && st.mean < 0.6) { h.stuck = 'mid'; h.pts += 3; h.evid.push('Siqnal orta səviyyədə ilişib (' + f2(st.mean) + ' V, aralıq ' + f2(st.range) + ' V): açıq dövrə, naqil qırığı və ya qızdırıcı problemi əlaməti ola bilər.'); }
      else if (role === 'front' && st.range < 0.3) { h.flat = true; h.pts += 2; h.evid.push('Ön sensorun dəyişmə aralığı kiçikdir (' + f2(st.range) + ' V). İsti qapalı döngədə adətən daha çox dəyişir.'); }
    } else if (st.range < 0.004) { h.stuck = 'flat'; h.pts += 2; h.evid.push('Lambda praktiki dəyişmir (aralıq ' + st.range.toFixed(4) + ').'); }
    var dt = medDt(hv.t);
    h.dt = dt;
    if (dt !== null) h.adequate = dt <= 0.4;
    var total = secs(inp, 'idle') + secs(inp, 'r2500');
    if (narrow && role === 'front' && !h.stuck && !h.flat && h.adequate && total >= 20 && st.min < 0.3 && st.max > 0.6) {
      var cr = crossings(hv.v, 0.45, 0.05) / Math.max(total, 1);
      h.crossRate = cr;
      h.slow = cr < 0.2;
      h.meas.push('Ön sensor 0.45 V keçid tezliyi: ' + cr.toFixed(2) + ' dəfə/san');
      if (h.slow) { h.pts += 2; h.evid.push('Ön sensor çox seyrək keçir (' + cr.toFixed(2) + '/san <0.2): yavaş reaksiya ehtimalı.'); }
    }
    var cv = ser(inp, 'cold', sn.pid);
    if (cv && cv.v.length >= 15 && secs(inp, 'cold') >= 45) {
      var cs = stats(cv.v);
      if (cs.range < (narrow ? 0.05 : 0.004)) { h.cold = true; h.pts += 1; h.evid.push('Soyuq rejimdə 45 saniyədən çox siqnal dəyişmir: qızdırıcı və ya dövrə problemi ehtimalı (təxmini).'); }
    }
    return h;
  }

  function trimTotal(inp, rg) {
    var a = ser(inp, rg, '06'), b = ser(inp, rg, '07');
    var s = a && a.v.length >= 10 ? stats(a.v) : null, l = b && b.v.length >= 10 ? stats(b.v) : null;
    if (!s && !l) return null;
    return { stft: s, ltft: l, total: (s ? s.mean : 0) + (l ? l.mean : 0) };
  }

  function analyze(inp) {
    var codes = inp.codes || null, sens = inp.sensors || identify([], null);
    var fr = sens.front, rr = sens.rear;
    var fh = health(inp, fr, 'front'), rh = health(inp, rr, 'rear');
    var out = { results: [], missing: [], notes: [], disclaimer: DISCLAIMER, advice: 'Proqram P0420 koduna görə katalizatorun dəyişdirilməsini tövsiyə etmir. Əvvəl misfire, qarışıq, egzoz sızması və sensorlar istisna edilməli, katalizatorun fiziki vəziyyəti yoxlanmalıdır.' };
    var idleSec = secs(inp, 'idle'), hiSec = secs(inp, 'r2500');
    if (inp.modeReset) out.notes.push('Test zamanı rejim (Fokus ↔ Ümumi) dəyişdirilib: əvvəlki rejimin nümunələri ayrıca arxivləşdirilib və bu nəticəyə qarışdırılmayıb. Nəticə yalnız dəyişiklikdən sonrakı rejimin nümunələrinə əsaslanır.');

    /* misfire */
    var mis = res('mis', 'Misfire (yanma buraxma) ehtimalı');
    var mcodes = codes ? codes.filter(function (c) { return MIS_RE.test(c); }) : [];
    var rid = ser(inp, 'idle', '0C'), r25 = ser(inp, 'r2500', '0C');
    if (mcodes.length) { mis.pts += 4; mis.evidence.push('ECU-da misfire kodu(ları): ' + mcodes.join(', ') + '.'); }
    if (rid && rid.v.length >= 15) {
      var rs = stats(rid.v);
      mis.measured.push('Boş gediş RPM: orta ' + Math.round(rs.mean) + ', std ' + f1(rs.std) + ', aralıq ' + Math.round(rs.range) + ' rpm');
      if (rs.std > 80 || rs.range > 250) { mis.pts += 2; mis.evidence.push('Boş gedişdə RPM qeyri-sabitdir (std ' + f1(rs.std) + ', aralıq ' + Math.round(rs.range) + ' rpm).'); }
    }
    if (r25 && r25.v.length >= 15) {
      var r5 = stats(r25.v);
      mis.measured.push('2500 rpm rejimi: orta ' + Math.round(r5.mean) + ', std ' + f1(r5.std) + ' rpm');
      if (r5.std > 100) { mis.pts += 1; mis.evidence.push('Sabit 2500 rpm-də RPM tərpənir (std ' + f1(r5.std) + '): qaz pedalı və ya yanma problemi.'); }
    }
    var misData = mcodes.length || (rid && rid.v.length >= 15);
    if (!misData) { mis.level = LV.U; mis.reasons.push('Misfire kodu yoxdur və boş gediş RPM üçün kifayət qədər nümunə yoxdur.'); }
    else mis.level = mis.pts >= 4 ? LV.H : (mis.pts >= 2 ? LV.M : (mis.pts >= 1 ? LV.L : LV.N));
    mis.next = ['Şamları və alışdırma sarğılarını yoxlayın', 'Hansı silindrdə olduğunu P0301–P0312 kodlarından müəyyənləşdirin', 'Vakuum sızmasını və yanacaq təchizatını yoxlayın'];
    mis.physical = 'Fiziki yoxlama tələb olunur: şam, sarğı, kompressiya. Misfire sayğacı (Mode 06) bu modulda oxunmur.';

    /* qarışıq */
    var mix = res('mix', 'Yanacaq qarışığı problemi');
    var ti = trimTotal(inp, 'idle'), th = trimTotal(inp, 'r2500');
    function tdesc(n, t) {
      var o = [];
      if (t.stft) o.push('STFT orta ' + f1(t.stft.mean) + ' %');
      if (t.ltft) o.push('LTFT orta ' + f1(t.ltft.mean) + ' %');
      mix.measured.push(n + ': ' + o.join(', '));
      [t.stft, t.ltft].forEach(function (s, i) {
        if (!s) return;
        var m = Math.abs(s.mean), name = i === 0 ? 'STFT' : 'LTFT';
        if (m > 10) { mix.pts += m > 15 ? 3 : 2; mix.evidence.push(n + ': ' + name + ' ' + f1(s.mean) + ' % (' + (s.mean > 0 ? 'qarışıq kasıb tərəfə düzəldilir' : 'qarışıq zəngin tərəfə düzəldilir') + ').'); }
      });
    }
    if (ti) tdesc('Boş gediş', ti);
    if (th) tdesc('2500 rpm', th);
    if (ti && th) {
      var dlt = ti.total - th.total;
      mix.measured.push('Korreksiya cəmi: boş gediş ' + f1(ti.total) + ' %, 2500 rpm ' + f1(th.total) + ' %');
      if (dlt >= 8) { mix.pts += 1; mix.evidence.push('Boş gedişdə korreksiya 2500 rpm-dən ' + f1(dlt) + ' % yüksəkdir: vakuum/qeyri-ölçülmüş hava sızması əlaməti (egzoz sızması ilə də oxşar ola bilər).'); }
      else if (dlt <= -8) { mix.pts += 1; mix.evidence.push('2500 rpm-də korreksiya boş gedişdən ' + f1(-dlt) + ' % yüksəkdir: MAF/yanacaq təchizatı əlaməti ola bilər.'); }
    }
    var mapI = ser(inp, 'idle', '0B');
    if (mapI && mapI.v.length >= 10) {
      var ms = stats(mapI.v);
      mix.measured.push('MAP, boş gediş: orta ' + f1(ms.mean) + ' kPa');
      if (ms.mean > 60 && ti && ti.total > 5) { mix.pts += 1; mix.evidence.push('Boş gedişdə MAP yüksəkdir (' + f1(ms.mean) + ' kPa) və korreksiya müsbətdir: vakuum sızması əlaməti (atmosferli mühərrik üçün ümumi qayda).'); }
    }
    var mafI = ser(inp, 'idle', '10'), mafH = ser(inp, 'r2500', '10');
    if (mafI && mafI.v.length >= 10) mix.measured.push('MAF, boş gediş: orta ' + f2(stats(mafI.v).mean) + ' g/san' + (mafH && mafH.v.length >= 10 ? ', 2500 rpm: ' + f2(stats(mafH.v).mean) + ' g/san' : ''));
    var fsv = hot(inp, '03');
    if (fsv && fsv.v.length >= 10) {
      var openN = fsv.v.filter(function (v) { return v === 1 || v === 4 || v === 8; }).length, bad = fsv.v.filter(function (v) { return v === 8 || v === 16; }).length;
      mix.measured.push('Yanacaq sistemi (PID 03): qapalı döngə ' + fsv.v.filter(function (v) { return v === 2; }).length + '/' + fsv.v.length + ' nümunə');
      if (bad >= 3) { mix.pts += 1; mix.evidence.push('ECU PID 03-də nasazlıqla bağlı rejim bildirir (' + bad + ' nümunə).'); }
      if (openN > fsv.v.length * 0.5 && !bad) mix.evidence.push('İsti mühərrikdə nümunələrin yarısından çoxu açıq döngədir: qarışıq nəticələri məhduddur.');
    }
    if (!ti && !th) { mix.level = LV.U; mix.reasons.push('İsti boş gediş və ya 2500 rpm rejimində STFT/LTFT üçün kifayət qədər nümunə yoxdur.'); }
    else mix.level = lvl(mix.pts);
    mix.next = ['Vakuum şlanqlarını və giriş kollektorunu yoxlayın (tüstü testi ən etibarlı üsuldur)', 'Yanacaq təzyiqini manometrlə ölçün', 'MAF sensorunu və hava filtrini yoxlayın'];
    mix.physical = 'Fiziki yoxlama tələb olunur: tüstü testi, yanacaq təzyiqi ölçüsü.';

    /* ön sensor */
    var fce = codeEv(codes, FRONT_CODES);
    var front = res('front', 'Ön Lambda sensoru nasazlığı ehtimalı');
    var fs3 = hot(inp, '03'), fsBad = fs3 ? fs3.v.filter(function (v) { return v === 8 || v === 16; }).length : 0;
    var pf = fh.pts + fce.pts;
    front.evidence = fh.evid.slice(); front.measured = fh.meas.slice();
    if (fce.list.length) front.evidence.push('ECU-da ön sensora aid kod(lar): ' + fce.list.join(', ') + '.');
    if (fsBad >= 3 && fr) { pf += 2; front.evidence.push('ECU PID 03-də oksigen sensoru əks əlaqəsində nasazlıq bildirir (' + fsBad + ' nümunə).'); }
    var sthot = hot(inp, '06');
    if (fh.flat && sthot && sthot.v.length >= 10 && stats(sthot.v).range >= 10) { pf += 1; front.evidence.push('ECU yanacaq korreksiyasını (STFT) geniş dəyişir, amma ön sensor az dəyişir.'); }
    front.pts = pf;
    if (!fh.avail && !fce.pts) { front.level = LV.U; front.reasons = fh.reasons.slice(); }
    else { front.level = lvl(pf); if (!fh.avail) front.evidence.push('Canlı siqnal qiymətləndirilməyib: ' + fh.reasons.join(' ')); }
    if (fh.adequate === false) front.evidence.push('Nümunə tezliyi kifayət deyil (median Δt ' + f2(fh.dt) + ' s, ≤0.4 s lazımdır): reaksiya sürəti qiymətləndirilmir. "Fokus rejimi" ilə təkrar edin.');
    front.next = ['Sensorun naqil birləşməsini və konnektorunu yoxlayın', 'Qızdırıcı dövrəsinin müqavimətini multimetrlə ölçün (istehsalçı normuna görə)', 'Qoruyucunu və rele/qidalanmanı yoxlayın', 'Sensoru isti mühərrikdə qrafikdə izləyin'];
    front.physical = 'Fiziki yoxlama tələb olunur: qızdırıcı müqaviməti, naqil, konnektor, qoruyucu. OBD ilə qızdırıcı cərəyanı oxunmur.';

    /* arxa sensor */
    var rce = codeEv(codes, REAR_CODES);
    var rear = res('rear', 'Arxa Lambda sensoru nasazlığı ehtimalı');
    var pr = rh.pts + rce.pts;
    rear.evidence = rh.evid.slice(); rear.measured = rh.meas.slice();
    if (rce.list.length) rear.evidence.push('ECU-da arxa sensora aid kod(lar): ' + rce.list.join(', ') + '.');
    rear.pts = pr;
    if (!rh.avail && !rce.pts) { rear.level = LV.U; rear.reasons = rh.reasons.slice(); }
    else { rear.level = lvl(pr); if (!rh.avail) rear.evidence.push('Canlı siqnal qiymətləndirilməyib: ' + rh.reasons.join(' ')); }
    rear.next = ['Sensorun naqilini və konnektorunu yoxlayın', 'Qızdırıcı dövrəsinin müqavimətini ölçün', 'Arxa sensoru ön sensorla eyni qrafikdə izləyin'];
    rear.physical = 'Fiziki yoxlama tələb olunur: qızdırıcı müqaviməti, naqil, egzoz sızması. Arxa sensorun böyük dalğalanması sensor nasazlığı sayılmır, katalizator nəticəsində nəzərə alınır.';

    /* egzoz sızması */
    var leak = res('leak', 'Egzoz sızması ehtimalı');
    var lp = 0;
    if (ti && th && ti.total - th.total >= 8) { lp += 1; leak.evidence.push('Boş gedişdə müsbət korreksiya 2500 rpm-dən yüksəkdir (qeyri-ölçülmüş hava əlaməti).'); }
    if (rh.avail && rr && rr.kind === 'narrow' && !rh.stuck && rh.st.mean < 0.25) { lp += 1; leak.evidence.push('Arxa sensor həmişə aşağıdır (orta ' + f2(rh.st.mean) + ' V): arxa tərəfdə hava qarışması və ya sensor.'); }
    if (fh.avail && fr && fr.kind === 'narrow' && !fh.stuck && fh.st.mean < 0.35 && sthot && sthot.v.length >= 10 && stats(sthot.v).mean > 5) { lp += 1; leak.evidence.push('Ön sensor kasıb göstərir (orta ' + f2(fh.st.mean) + ' V), ECU yanacaq əlavə edir: kollektor/giriş sızması ehtimalı.'); }
    if (codes && (codes.indexOf('P0171') >= 0 || codes.indexOf('P0174') >= 0)) { lp += 1; leak.evidence.push('Kasıb qarışıq kodu (P0171/P0174) var.'); }
    leak.pts = lp;
    if (!ti && !th && !fh.avail && !rh.avail) { leak.level = LV.U; leak.reasons.push('Sensor və korreksiya məlumatı yoxdur.'); }
    else { leak.level = lp >= 3 ? LV.M : (lp >= 1 ? LV.L : LV.N); if (leak.level === LV.N) leak.evidence.push('Dolayı əlamət tapılmadı. Bu, sızmanın olmadığını sübut etmir.'); }
    leak.measured = (ti && th) ? ['Korreksiya cəmi: boş gediş ' + f1(ti.total) + ' %, 2500 rpm ' + f1(th.total) + ' %'] : [];
    leak.next = ['Soyuq mühərrikdə egzoz kollektorunu və flanşları qulaqla/əllə (eldivenlə) yoxlayın', 'Kollektor və katalizator contalarında qara çöküntü izlərinə baxın', 'Tüstü (smoke) testi aparın'];
    leak.physical = 'Egzoz sızması OBD məlumatından birbaşa görünmür: yalnız dolayı əlamətlərdir, fiziki yoxlama mütləqdir. Bu nəticə "Orta"dan yüksək verilmir.';

    /* katalizator */
    var cat = res('cat', 'Katalizatorun effektivliyi zəifləyib');
    var why = [];
    if (!sens.scheme) why.push('Sensor mövqe sxemi (PID 13/1D) oxunmayıb: B1S1/B1S2 təsdiqlənmir.');
    if (!fr) why.push('Ön sensor (B1S1) PID-i yoxdur və ya mövqeyi təsdiqlənməyib.');
    if (!rr) why.push('Arxa sensor (B1S2) PID-i yoxdur və ya mövqeyi təsdiqlənməyib.');
    if (rr && rr.kind !== 'narrow') why.push('Arxa sensor darzolaqlı deyil: bu qayda yalnız darzolaqlı arxa sensor üçündür.');
    var f25 = fr ? ser(inp, 'r2500', fr.pid) : null, r25s = rr ? ser(inp, 'r2500', rr.pid) : null;
    if (fr && rr) {
      if (hiSec < 30) why.push('Sabit 2500 rpm rejimi kifayət deyil (' + hiSec + ' s, ≥30 s lazımdır).');
      if (!f25 || f25.v.length < 20 || !r25s || r25s.v.length < 20) why.push('2500 rpm rejimində ön və arxa sensor üçün ≥20 nümunə yoxdur.');
      var fs25 = ser(inp, 'r2500', '03');
      if (fs25 && fs25.v.length >= 10) { var cl = fs25.v.filter(function (v) { return v === 2; }).length / fs25.v.length; if (cl < 0.7) why.push('2500 rpm rejimində qapalı döngə nümunələrin yalnız ' + Math.round(cl * 100) + ' %-dir.'); }
      if (fh.pts >= 3) why.push('Ön sensor nasaz görünür: əvvəl onu yoxlayın.');
      if (rh.stuck) why.push('Arxa sensor ilişmiş/açıq dövrə görünür: əvvəl onu yoxlayın.');
      if (mis.pts >= 3) why.push('Misfire əlamətləri var: əvvəl onu aradan qaldırın.');
      if (mix.pts >= 3) why.push('Yanacaq qarışığı problemi əlamətləri var: əvvəl onu aradan qaldırın.');
    }
    var m6 = inp.m06 && inp.m06.tests && inp.m06.tests.length ? inp.m06 : null;
    if (!why.length) {
      var fv = f25.v, rv = r25s.v, fst = stats(fv), rst = stats(rv);
      cat.measured.push('2500 rpm, ön (' + sname(fr) + '): aralıq ' + f2(fst.range) + (fr.kind === 'narrow' ? ' V' : ' λ') + ', orta ' + f2(fst.mean));
      cat.measured.push('2500 rpm, arxa (' + sname(rr) + '): aralıq ' + f2(rst.range) + ' V, orta ' + f2(rst.mean));
      if (fr.kind === 'narrow' && fst.range < 0.4) why.push('Ön sensorun amplitudu kifayət deyil (' + f2(fst.range) + ' V): müqayisə mümkün deyil.');
      else {
        var cp = 0;
        if (fr.kind === 'narrow') {
          var R = rst.range / fst.range;
          cat.measured.push('Arxa/ön aralıq nisbəti: ' + f2(R));
          if (R >= 0.7) { cp += 3; cat.evidence.push('Arxa sensor ön sensoru təqlid edir (nisbət ' + f2(R) + ' ≥0.7): oksigen saxlama qabiliyyətinin azalması əlaməti.'); }
          else if (R >= 0.5) { cp += 2; cat.evidence.push('Arxa sensor ön sensora yaxın dəyişir (nisbət ' + f2(R) + '): katalizator zəifləməsi əlaməti ola bilər.'); }
          else if (R >= 0.35) { cp += 1; cat.evidence.push('Arxa sensorda orta dalğalanma (nisbət ' + f2(R) + ').'); }
          else cat.evidence.push('Arxa sensor ön sensordan xeyli sabitdir (nisbət ' + f2(R) + '): katalizatorun oksigen saxlaması yaxşı görünür.');
          if (fh.adequate && r25s.t) {
            var fx = crossings(fv, 0.45, 0.05), rx = crossings(rv, 0.45, 0.05);
            if (fx >= 4) { cat.measured.push('0.45 V keçidləri: ön ' + fx + ', arxa ' + rx); if (rx / fx >= 0.7) { cp += 1; cat.evidence.push('Arxa sensor ön sensorun keçidlərinin ' + Math.round(rx / fx * 100) + ' %-ni təkrar edir.'); } }
          } else cat.evidence.push('Keçid sayı müqayisəsi aparılmadı: nümunə tezliyi kifayət deyil.');
        } else {
          cat.measured.push('Arxa sensor aralığı (ön sensor genişzolaqlıdır, nisbət hesablanmır): ' + f2(rst.range) + ' V');
          if (rst.range >= 0.6) { cp += 2; cat.evidence.push('Arxa sensor həddindən çox dəyişir (' + f2(rst.range) + ' V): oksigen saxlama qabiliyyətinin azalması əlaməti ola bilər.'); }
          else if (rst.range >= 0.45) { cp += 1; cat.evidence.push('Arxa sensorda artıq dalğalanma (' + f2(rst.range) + ' V).'); }
          else cat.evidence.push('Arxa sensor sabitdir (' + f2(rst.range) + ' V).');
        }
        if (codes && (codes.indexOf('P0420') >= 0)) { cp += 1; cat.evidence.push('ECU-da P0420 var (tək başına katalizatoru sübut etmir).'); }
        else if (codes) cat.evidence.push('P0420 ECU-da yoxdur.');
        if (m6) {
          var failT = m6.tests.filter(function (t) { return t.status === 'FAIL' || (t.status === undefined && !t.ok); }), okT = m6.tests.filter(function (t) { return t.status === 'PASS' || (t.status === undefined && t.ok); }), unkT = m6.tests.filter(function (t) { return t.status === 'UNKNOWN'; });
          cat.measured.push('Mode 06 MID 21 (B1 katalizator monitoru): ' + m6.tests.length + ' test, təsdiqlənmiş uğursuz ' + failT.length + ', xəritələnməmiş (UNKNOWN) ' + unkT.length + ': xalda nəzərə alınmır');
          if (failT.length) { cp += 3; cat.evidence.push('ECU-nun öz katalizator monitoru həddi aşıb (' + failT.length + ' test, MID 21).'); }
          else if (okT.length) cat.evidence.push('ECU-nun öz katalizator monitoru testi hədlər daxilindədir (xam miqyas, təfsir məhduddur).');
        }
        cat.pts = cp; cat.level = lvl(cp);
      }
    }
    if (why.length) { cat.level = LV.U; cat.pts = 0; cat.reasons = why; cat.evidence = []; }
    cat.next = why.length ? ['Əvvəlcə yuxarıdakı səbəbləri aradan qaldırın və testi təkrar edin'] : ['Egzoz sızmasını istisna edin (tüstü testi)', 'Misfire və qarışıq problemlərini istisna edin', 'Katalizatorun giriş/çıxış temperaturunu müqayisə edin (infraqırmızı termometr)', 'Katalizator tıxanmasını əks təzyiq testi ilə yoxlayın'];
    cat.physical = 'Fiziki yoxlama tələb olunur: egzoz sızması, katalizatorun giriş/çıxış temperaturu, əks təzyiq. Katalizatorun dəyişdirilməsi yalnız bunlardan sonra və usta qərarı ilə nəzərdən keçirilməlidir.';

    out.results = [cat, front, rear, leak, mix, mis];

    /* məlumat çatışmazlığı */
    var M = out.missing;
    sens.issues.forEach(function (x) { M.push(x); });
    if (!fr && sens.scheme) M.push('Ön sensor (B1S1) PID-i təsdiqlənməyib: ön sensor və katalizator qiymətləndirilmir.');
    if (!rr && sens.scheme) M.push('Arxa sensor (B1S2) PID-i təsdiqlənməyib: arxa sensor və katalizator qiymətləndirilmir.');
    if (idleSec < 30) M.push('İsti boş gediş rejimi (≥30 s) toplanmayıb (' + idleSec + ' s).');
    if (hiSec < 30) M.push('Sabit 2500 rpm rejimi (≥30 s) toplanmayıb (' + hiSec + ' s).');
    if (secs(inp, 'cold') < 30) M.push('Soyuq mühərrik rejimi toplanmayıb (isteğe bağlı: qızdırıcının soyuq rejimdə yoxlanması üçün).');
    var sup = inp.supported || [];
    [['06', 'STFT'], ['07', 'LTFT'], ['0C', 'RPM'], ['05', 'Soyuducu temperaturu']].forEach(function (p) { if (sup.indexOf(p[0]) < 0) M.push(p[1] + ' (PID ' + p[0] + ') avtomobil tərəfindən dəstəklənmir.'); });
    if (sup.indexOf('10') < 0 && sup.indexOf('0B') < 0) M.push('Nə MAF (10), nə də MAP (0B) PID-i dəstəklənmir.');
    if (sup.indexOf('03') < 0) M.push('Yanacaq sistemi vəziyyəti (PID 03) dəstəklənmir: qapalı döngə təsdiqlənmir.');
    if (sup.indexOf('0D') < 0) M.push('Sürət (PID 0D) dəstəklənmir: avtomobilin dayandığı yoxlanmır, neytral/park şərti istifadəçiyə aiddir.');
    if (!codes) M.push('Xəta kodları oxunmayıb.');
    if (!m6) M.push('Mode 06 katalizator monitoru (MID 21) oxunmayıb və ya dəstəklənmir (isteğe bağlı).');
    if (fh.adequate === false) M.push('Ön sensorun reaksiya sürəti üçün "Fokus rejimi" lazımdır (median Δt ' + f2(fh.dt) + ' s).');
    if (inp.focusUsed) out.notes.push('Fokus rejimində yalnız O2 və RPM sorğulanır: soyuducu temperaturu və sürət son oxunmuş dəyərdən götürülür.');
    out.notes.push('Yalnız 1-ci sıra (B1S1/B1S2) təhlil olunur.');
    out.notes.push('Sensor tipi PID aralığına görə təyin olunur (SAE J1979): 14–1B darzolaqlı, 24–2B və 34–3B genişzolaqlı. ECU-nun real sensor növü ayrıca təsdiqlənmir.');
    out.sensorSummary = sens;
    return out;
  }

  /* ---------- Qrafik (SVG) ---------- */
  function svgChart(o) {
    var w = o.w || 320, h = o.h || 110, pad = 6, now = o.now, win = (o.win || 60) * 1000;
    var s = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" xmlns="http://www.w3.org/2000/svg" style="background:#0a101c;border-radius:10px">';
    var mn = o.min, mx = o.max;
    var pts = (o.series || []).map(function (se) { return se.data.filter(function (p) { return p.t >= now - win; }); });
    if (mn === undefined || mx === undefined) {
      var all = [];
      pts.forEach(function (a) { a.forEach(function (p) { all.push(p.v); }); });
      if (!all.length) return s + '<text x="10" y="20" fill="#92a3c1" font-size="12">Məlumat yoxdur</text></svg>';
      mn = Math.min.apply(null, all); mx = Math.max.apply(null, all);
      if (mx === mn) { mn -= 0.5; mx += 0.5; }
    }
    function X(t) { return pad + (t - (now - win)) / win * (w - 2 * pad); }
    function Y(v) { return h - pad - (v - mn) / (mx - mn) * (h - 2 * pad); }
    (o.refs || []).forEach(function (r) {
      if (r.v < mn || r.v > mx) return;
      s += '<line x1="' + pad + '" x2="' + (w - pad) + '" y1="' + Y(r.v).toFixed(1) + '" y2="' + Y(r.v).toFixed(1) + '" stroke="#475569" stroke-dasharray="4 3"/><text x="' + (pad + 2) + '" y="' + (Y(r.v) - 2).toFixed(1) + '" fill="#92a3c1" font-size="9">' + r.l + '</text>';
    });
    (o.series || []).forEach(function (se, i) {
      var a = pts[i];
      if (a.length < 2) return;
      s += '<polyline fill="none" stroke="' + se.color + '" stroke-width="2" points="' + a.map(function (p) { return X(p.t).toFixed(1) + ',' + Y(p.v).toFixed(1); }).join(' ') + '"/>';
    });
    return s + '</svg>';
  }

  /* ---------- Hesabat mətni ---------- */
  function reportText(a, meta) {
    var o = ['AC OBD: O2 sensorları və katalizator differensial diaqnostikası', '', DISCLAIMER, ''];
    if (meta && meta.veh) o.push('Avtomobil: ' + meta.veh);
    o.push('', 'SENSORLAR:');
    var ss = a.sensorSummary;
    if (ss && ss.sensors.length) ss.sensors.forEach(function (s) { o.push('  PID ' + s.pid + ': ' + (s.pos || 'mövqe bilinmir') + ', ' + s.kindAz + ', ' + (s.confirmed ? 'təsdiqlənib' : 'TƏSDİQLƏNMƏYİB')); });
    else o.push('  O2 PID-i yoxdur');
    a.results.forEach(function (r) {
      o.push('', r.title.toUpperCase() + ': ' + r.level + (r.pts ? ' (xal ' + r.pts + ')' : ''));
      if (r.reasons.length) { o.push('  Niyə müəyyən edilə bilmir:'); r.reasons.forEach(function (x) { o.push('   - ' + x); }); }
      if (r.measured.length) { o.push('  Ölçülmüş göstəricilər:'); r.measured.forEach(function (x) { o.push('   - ' + x); }); }
      if (r.evidence.length) { o.push('  Sübut:'); r.evidence.forEach(function (x) { o.push('   - ' + x); }); }
      o.push('  Növbəti yoxlama:'); r.next.forEach(function (x) { o.push('   - ' + x); });
      o.push('  ' + r.physical);
    });
    o.push('', 'MƏLUMAT ÇATIŞMAZLIĞI:');
    (a.missing.length ? a.missing : ['yoxdur']).forEach(function (x) { o.push('  - ' + x); });
    o.push('', 'QEYDLƏR:'); a.notes.forEach(function (x) { o.push('  - ' + x); });
    o.push('', a.advice);
    return o.join('\n');
  }

  /* ---------- Test sessiyası (canlı) ---------- */
  var subs = [], st = null, timer = null;
  function mkReg() { return { sec: 0, ser: {} }; }
  function newState() { return { on: false, focus: false, focusUsed: false, t0: 0, ids: [], ident: null, last: {}, lastT: {}, all: {}, rpmH: [], cur: 'unknown', reg: { cold: mkReg(), idle: mkReg(), r2500: mkReg() }, m06: null, m06Err: '' }; }
  st = newState();
  function emit() { subs.forEach(function (f) { try { f(); } catch (e) {} }); }
  function lastVal(id, maxAge) { var x = st.last[id]; return x && Date.now() - x.t <= maxAge ? x.v : null; }
  function curCtx() {
    var h = st.rpmH.filter(function (p) { return Date.now() - p.t <= 6000; }).map(function (p) { return p.v; });
    return { rpm: lastVal('0C', 5000), ect: lastVal('05', 120000), spd: lastVal('0D', st.focus ? 120000 : 5000), rpmRange: h.length >= 3 ? Math.max.apply(null, h) - Math.min.apply(null, h) : 9999 };
  }
  function idsFor(focus) {
    var sup = OBD.supported, id = st.ident, o = [];
    [id.front, id.rear].forEach(function (s) { if (s && o.indexOf(s.pid) < 0) o.push(s.pid); });
    var base = ['0C'];
    var ctx = focus ? base : CTX_IDS;
    ctx.forEach(function (p) { if (sup.indexOf(p) >= 0 && window.PIDS[p] && o.indexOf(p) < 0) o.push(p); });
    return o;
  }
  function onValue() {
    if (!st.on) return;
    st.ids.forEach(function (id) {
      var r = OBD.values[id];
      if (!r || r.v === null || r.nodata || !r.t || st.lastT[id] === r.t) return;
      st.lastT[id] = r.t;
      st.last[id] = { v: r.v, t: r.t };
      var a = st.all[id] || (st.all[id] = []);
      a.push({ t: r.t, v: r.v });
      if (a.length > 1500) a.shift();
      if (id === '0C') { st.rpmH.push({ t: r.t, v: r.v }); if (st.rpmH.length > 12) st.rpmH.shift(); }
      var rg = classify(curCtx());
      if (st.reg[rg]) {
        var s = st.reg[rg].ser[id] || (st.reg[rg].ser[id] = { t: [], v: [] });
        s.t.push(r.t); s.v.push(r.v);
        if (s.v.length > 600) { s.t.shift(); s.v.shift(); }
      }
    });
  }
  function tick() {
    if (!st.on) return;
    st.cur = classify(curCtx());
    if (st.reg[st.cur]) st.reg[st.cur].sec++;
    emit();
  }
  function start(focus) {
    if (OBD.S.state !== 'ecu') throw new Error('Real ECU-ya qoşulmamısınız.');
    var ident = identify(OBD.supported, window.Adapter && Adapter.map ? Adapter.map() : null);
    if (!ident.front && !ident.rear) throw new Error('B1S1 və B1S2 sensor PID-ləri təsdiqlənməyib: test mənasızdır. ' + (ident.issues[0] || ''));
    var keepM06 = st.m06, keepErr = st.m06Err;
    st = newState(); st.ident = ident; st.m06 = keepM06; st.m06Err = keepErr;
    st.focus = !!focus; st.focusUsed = !!focus; st.t0 = Date.now(); st.on = true;
    st.ids = idsFor(st.focus);
    OBD.startPoll(st.ids);
    clearInterval(timer); timer = setInterval(tick, 1000);
    emit();
  }
  function setFocus(f) {
    if (!st.on) return;
    if (!!f !== st.focus && (st.rpmH.length || Object.keys(st.all).length)) { // nümunələr rejimlər arasında qarışmasın: köhnəni arxivləşdirib təzədən topla
      var old = st; st = newState(); st.ident = old.ident; st.m06 = old.m06; st.m06Err = old.m06Err; st.on = true; st.t0 = Date.now(); st.focusUsed = old.focusUsed;
      st.modeReset = true; st.archive = { focus: old.focus, t0: old.t0, reg: old.reg, until: Date.now() };
    }
    st.focus = !!f; if (f) st.focusUsed = true;
    st.ids = idsFor(st.focus);
    OBD.startPoll(st.ids);
    emit();
  }
  function stop() {
    if (!st.on) return;
    st.on = false; clearInterval(timer);
    try { OBD.stopPoll(); } catch (e) {}
    emit();
  }
  function codesOf(d) {
    if (!d) return null;
    var out = [], got = false;
    ['stored', 'pending', 'permanent'].forEach(function (k) { var r = d[k]; if (r && r.ok) { got = true; r.codes.forEach(function (c) { if (out.indexOf(c) < 0) out.push(c); }); } });
    return got ? out : null;
  }
  function collect() {
    return { sensors: st.ident || identify(OBD.supported, window.Adapter && Adapter.map ? Adapter.map() : null), reg: st.reg, supported: OBD.supported, codes: codesOf(window.Session && Session.ctx.dtc), m06: st.m06, focusUsed: st.focusUsed, modeReset: !!st.modeReset, archive: st.archive || null };
  }
  async function readMode06() {
    if (st.on) throw new Error('Əvvəl testi dayandırın.');
    st.m06 = null; st.m06Err = '';
    var list = await OBD.mode06List();
    if (list.indexOf(0x21) < 0) { st.m06Err = 'Bu avtomobil Mode 06 MID 21 (katalizator monitoru, 1-ci sıra) vermir.'; emit(); return null; }
    var r = await OBD.mode06Read(0x21);
    if (!r.tests.length) { st.m06Err = 'MID 21 üçün test nəticəsi gəlmədi.'; emit(); return null; }
    st.m06 = r; emit();
    return r;
  }

  OBD.on(function (type) { if (type === 'value') onValue(); else if (st.on && OBD.S.state !== 'ecu' && OBD.S.state !== 'reconnecting') stop(); });

  return {
    LV: LV, identify: identify, classify: classify, analyze: analyze, svgChart: svgChart, reportText: reportText,
    start: start, stop: stop, setFocus: setFocus, state: function () { return st; }, collect: collect, readMode06: readMode06,
    on: function (f) { subs.push(f); }, stats: stats, medDt: medDt, crossings: crossings
  };
})();

