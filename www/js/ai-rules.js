window.AIRules = (function () {
  var KB = {
    vac: { az: 'Havanın sızması (vakuum şlanqı, giriş kollektoru, conta)',
      next: ['Vakuum şlanqlarını və giriş sisteminin birləşmələrini gözlə yoxlayın', 'Boş gedişdə və ~2500 RPM-də STFT/LTFT-ni ayrıca ölçün (sızma adətən boş gedişdə daha pis olur)'],
      fix: 'Sızma yeri təsdiqləndikdən sonra şlanq və ya contanı dəyişin.' },
    maf: { az: 'MAF sensorunun çirklənməsi və ya səhv ölçməsi',
      next: ['MAF qiymətini boş gedişdə və yüksək RPM-də izləyin', 'Hava filtrini və MAF qarşısındakı hava yolunu yoxlayın'],
      fix: 'MAF üçün nəzərdə tutulmuş təmizləyici ilə təmizləyin; əvvəl hava sızmasını istisna edin.' },
    fuelp: { az: 'Yanacaq təchizatı (təzyiq, filtr, injektor tıxanması)',
      next: ['Yanacaq təzyiqini manometrlə yoxlayın', 'Yanacaq filtrinin və nasosun vəziyyətinə baxın'],
      fix: 'Təzyiq ölçüsü normadan kənardırsa, filtr və nasosu qiymətləndirin.' },
    rich: { az: 'Zəngin qarışığın səbəbləri (injektor sızması, yüksək yanacaq təzyiqi, tıxanmış hava filtri)',
      next: ['Hava filtrini yoxlayın', 'Yanacaq təzyiqini və injektorların sızmasını yoxlayın', 'O2 sensorunun reaksiyasını izləyin'],
      fix: 'Səbəb ölçmə ilə təsdiqləndikdən sonra müvafiq detalı dəyişin.' },
    cool: { az: 'Soyutma sistemi (maye səviyyəsi, ventilyator, termostat, nasos)',
      next: ['Soyuq mühərrikdə maye səviyyəsini yoxlayın', 'Ventilyatorun işə düşdüyünü yoxlayın'],
      fix: 'Qızmanın səbəbi tapılana qədər avtomobili sürməyin.' },
    thermo: { az: 'Termostatın açıq qalması və ya soyutma temperatur sensoru',
      next: ['Soyuq startdan sonra temperaturun artım sürətini izləyin', 'Temperatur sensorunu başqa alətlə müqayisə edin'],
      fix: 'Temperatur normaya çatmırsa termostatı qiymətləndirin.' },
    charge: { az: 'Şarj sistemi (generator, qayış, akkumulyator birləşmələri)',
      next: ['Akkumulyator klemmalarını yoxlayın', 'Mühərrik işləyərkən akkumulyatorda gərginliyi multimetrlə ölçün', 'Generator qayışını yoxlayın'],
      fix: 'Multimetr ölçüsü də aşağıdırsa generatoru yoxlayın.' },
    overv: { az: 'Generator gərginlik tənzimləyicisi (yüksək gərginlik)',
      next: ['Akkumulyatorda gərginliyi multimetrlə ölçün'],
      fix: 'Ölçü təsdiqlənirsə generatoru yoxlayın.' },
    cat: { az: 'Katalizatorun səmərəliliyinin düşməsi',
      next: ['Əvvəl misfire, yanacaq korreksiyası və egzoz sızmasını istisna edin', 'Ön və arxa O2 sensorunu eyni vaxtda qrafikdə müqayisə edin'],
      fix: 'Yalnız digər səbəblər istisna olunandan sonra katalizatoru dəyişin.' },
    o2: { az: 'O2 sensorunun yavaş və ya nasaz işləməsi',
      next: ['O2 sensorunu isti mühərrikdə qrafikdə izləyin', 'Sensorun qızdırıcı dövrəsini yoxlayın'],
      fix: 'Reaksiya yavaşdırsa sensoru dəyişin.' },
    misfire: { az: 'Yanma buraxma (misfire): şam, sarğı, sızma, yanacaq',
      next: ['Şam və alışdırma sarğılarını yoxlayın', 'Hansı silindrdə olduğunu P0301–P0304 kodlarından müəyyənləşdirin'],
      fix: 'Nasaz silindrin şamını və ya sarğısını dəyişin.' },
    idle: { az: 'Boş gediş nəzarəti (drossel çirkliliyi, sızma)',
      next: ['Drossel klapanını yoxlayın', 'Vakuum sızmasını yoxlayın'],
      fix: 'Drosseli təmizləyin; sızma varsa aradan qaldırın.' },
    comm: { az: 'Elektrik və ya rabitə problemi (akkumulyator, kabel, kontakt)',
      next: ['Akkumulyator gərginliyini yoxlayın', 'Kontaktları və yerləşmə (massa) nöqtələrini yoxlayın'],
      fix: 'Əvvəl gərginlik və massa nöqtələrini düzəldin.' }
  };

  function avg(a) { return a.reduce(function (s, x) { return s + x; }, 0) / a.length; }
  function sd(a) { var m = avg(a); return Math.sqrt(avg(a.map(function (x) { return (x - m) * (x - m); }))); }
  function rng(a) { return Math.max.apply(null, a) - Math.min.apply(null, a); }
  function f1(x) { return x.toFixed(1); }
  function name(k) { return KB[k] ? KB[k].az : k; }

  function analyze(V, dtc) {
    var A = { symptoms: [], anomalies: [], hyps: [], missing: [], next: [], fix: [], safety: [], n: 0 };
    var H = {};
    V = V || {};
    function hs(id) { return (V[id] && V[id].hist) ? V[id].hist : []; }
    function ok(id, n) { return hs(id).length >= (n || 5); }
    function add(k, p, ev) { var x = H[k] || (H[k] = { key: k, score: 0, ev: [] }); x.score += p; x.ev.push(ev); }
    function an(k, text) { A.anomalies.push({ k: k, text: text }); }
    Object.keys(V).forEach(function (id) { if (hs(id).length) A.n++; });

    var codes = [];
    if (dtc) ['stored', 'pending', 'permanent'].forEach(function (t) {
      if (dtc[t] && dtc[t].codes) dtc[t].codes.forEach(function (c) { if (codes.indexOf(c) < 0) codes.push(c); });
    });

    var st = ok('06') ? avg(hs('06')) : null, lt = ok('07') ? avg(hs('07')) : null;
    var txt = (st !== null ? 'STFT orta ' + f1(st) + ' %' : '') + (lt !== null ? ' LTFT orta ' + f1(lt) + ' %' : '');
    if ((st !== null && st > 10) || (lt !== null && lt > 10)) {
      an('lean', 'Yanacaq korreksiyası müsbət tərəfdə (qarışıq kasıb): ' + txt);
      add('vac', 2, txt + ' (> +10 %)'); add('maf', 1, txt + ' (> +10 %)'); add('fuelp', 1, txt + ' (> +10 %)');
    }
    if ((st !== null && st < -10) || (lt !== null && lt < -10)) {
      an('rich', 'Yanacaq korreksiyası mənfi tərəfdə (qarışıq zəngin): ' + txt);
      add('rich', 2, txt + ' (< -10 %)'); add('o2', 1, txt + ' (< -10 %)');
    }

    if (ok('05')) {
      var ct = hs('05'), cl = ct[ct.length - 1];
      if (cl > 108) {
        an('hot', 'Soyuducu temperaturu yüksəkdir: ' + f1(cl) + ' °C');
        add('cool', 3, 'Soyuducu ' + f1(cl) + ' °C');
        A.safety.push('Temperatur yüksəkdirsə mühərriki söndürün və soyumasını gözləyin; qızmış sistemi açmayın.');
      }
      var rt = hs('1F'), run = rt.length ? rt[rt.length - 1] : null;
      if (run !== null && run > 600 && cl < 70) {
        an('cold', 'Mühərrik ' + Math.round(run) + ' san işləyib, amma temperatur ' + f1(cl) + ' °C');
        add('thermo', 2, 'İşləmə vaxtı ' + Math.round(run) + ' san, temperatur ' + f1(cl) + ' °C');
      }
    }

    if (ok('0C', 15)) {
      var rp = hs('0C'), sp = hs('0D');
      var moving = sp.length && sp[sp.length - 1] > 0;
      if (!moving && avg(rp) < 1300) {
        var rs = sd(rp), rr = rng(rp);
        if (rs > 100 || rr > 400) {
          an('idleu', 'Boş gedişdə RPM qeyri-sabitdir (std ' + f1(rs) + ', aralıq ' + Math.round(rr) + ' rpm; qaza basılmayıbsa)');
          var e = 'RPM qeyri-sabitdir (aralıq ' + Math.round(rr) + ' rpm)';
          add('idle', 1, e); add('vac', 1, e);
          add('misfire', codes.some(function (c) { return /^P030[0-9]$/.test(c); }) ? 2 : 1, e);
        }
      }
    }

    var vId = ok('42') ? '42' : (ok('RV') ? 'RV' : null);
    if (vId && ok('0C')) {
      var rl = hs('0C');
      if (rl[rl.length - 1] > 500) {
        var vv = avg(hs(vId)), src = vId === 'RV' ? 'adapter ölçüsü' : 'ECU';
        if (vv < 13.0) { an('vlow', 'Mühərrik işləyərkən gərginlik aşağıdır: ' + vv.toFixed(2) + ' V (' + src + ')'); add('charge', 2, 'Gərginlik ' + vv.toFixed(2) + ' V (' + src + ')'); add('comm', 1, 'Gərginlik ' + vv.toFixed(2) + ' V'); }
        if (vv > 15.0) { an('vhigh', 'Gərginlik yüksəkdir: ' + vv.toFixed(2) + ' V'); add('overv', 2, 'Gərginlik ' + vv.toFixed(2) + ' V'); }
      }
    }

    if (ok('14', 20)) {
      var fr = rng(hs('14'));
      if (fr < 0.3) { an('o2f', 'Ön O2 sensoru az dəyişir (aralıq ' + fr.toFixed(2) + ' V). Soyuq/açıq döngə də ola bilər'); add('o2', 1, 'Ön O2 aralığı ' + fr.toFixed(2) + ' V'); }
      if (ok('15', 20)) {
        var rr2 = rng(hs('15'));
        if (fr > 0.4 && rr2 > 0.5 * fr) {
          an('cat', 'Arxa O2 dalğalanması ön sensora yaxındır (arxa ' + rr2.toFixed(2) + ' V, ön ' + fr.toFixed(2) + ' V)');
          add('cat', 2, 'Arxa O2 aralığı ' + rr2.toFixed(2) + ' V, ön ' + fr.toFixed(2) + ' V');
        }
      }
    }

    codes.forEach(function (c) {
      var e = 'Xəta kodu ' + c;
      if (c === 'P0420' || c === 'P0430') add('cat', 1, e + ' (tək başına katalizatoru təsdiq etmir)');
      else if (/^P030[0-9]$/.test(c)) add('misfire', 2, e);
      else if (c === 'P0171' || c === 'P0174') { add('vac', 1, e); add('maf', 1, e); add('fuelp', 1, e); }
      else if (c === 'P0172' || c === 'P0175') add('rich', 2, e);
      else if (c === 'P0101' || c === 'P0102' || c === 'P0103') add('maf', 2, e);
      else if (c === 'P0128') add('thermo', 2, e);
      else if (/^U/.test(c)) add('comm', 2, e);
    });
    if (codes.indexOf('P0420') >= 0) A.safety.push('P0420 çıxıbsa katalizatoru dərhal dəyişməyin: əvvəl O2 sensorları, yanacaq korreksiyaları, misfire və egzoz sızmasını yoxlayın.');

    Object.keys(H).forEach(function (k) {
      var h = H[k];
      h.level = h.score >= 4 ? 'Yüksək' : (h.score >= 2 ? 'Orta' : 'Aşağı');
      A.hyps.push(h);
    });
    A.hyps.sort(function (a, b) { return b.score - a.score; });
    A.hyps.slice(0, 3).forEach(function (h) {
      KB[h.key].next.forEach(function (s) { if (A.next.indexOf(s) < 0) A.next.push(s); });
      if (A.fix.indexOf(KB[h.key].fix) < 0) A.fix.push(KB[h.key].fix);
    });
    if (!A.next.length) A.next.push('Daha çox göstərici seçib 2–3 dəqiqə izləyin, sonra yenidən təhlil edin');

    if (codes.length) A.symptoms.push('Xəta kodu: ' + codes.join(', '));
    if (A.anomalies.length) A.symptoms.push('Göstəricilərdə anormallıq aşkarlandı (aşağıya baxın)');
    if (!A.symptoms.length) A.symptoms.push(A.n ? 'Ölçülmüş göstəricilərdə qaydalara görə anormallıq tapılmadı' : 'Təhlil üçün canlı məlumat yoxdur');

    [['0C', 'RPM'], ['05', 'Soyuducu temperaturu'], ['06', 'STFT'], ['07', 'LTFT'], ['14', 'O2 ön'], ['15', 'O2 arxa'], ['42', 'Modul gərginliyi']].forEach(function (p) {
      if (!ok(p[0])) A.missing.push(p[1] + ' (dəstəklənmir, seçilməyib və ya kifayət qədər nümunə yoxdur)');
    });
    if (!dtc) A.missing.push('Xəta kodları oxunmayıb');
    A.missing.push('Misfire sayğacları və Mode 06 nəticələri bu versiyada oxunmur');
    A.safety.push('Bu ehtimal təhlilidir, qəti diaqnoz deyil. Detalı yalnız ölçmə ilə təsdiqləndikdən sonra dəyişin.');
    return A;
  }

  return { analyze: analyze, name: name };
})();
