window.Report = (function () {
  var extra = [];
  function f(v, d) { return (typeof v === 'number' && isFinite(v)) ? v.toFixed(d === undefined ? 1 : d) : '—'; }
  function avg(a) { if (!a || !a.length) return null; var s = 0; a.forEach(function (x) { s += x; }); return s / a.length; }
  function val(id) { var r = OBD.values[id]; return (r && r.v !== null && !r.nodata) ? r : null; }

  function mode() {
    var rpm = val('0C'), spd = val('0D'), ld = val('04');
    if (!rpm) return 'Müəyyən edilə bilmədi (RPM oxunmur)';
    if (rpm.v < 300) return 'Mühərrik söndürülüb (RPM ' + f(rpm.v, 0) + ')';
    if (spd && spd.v > 2) return 'Hərəkətdə (' + f(spd.v, 0) + ' km/h, RPM ' + f(rpm.v, 0) + ')';
    if (rpm.v < 1100 && (!ld || ld.v < 40)) return 'Boşda işləyir (RPM ' + f(rpm.v, 0) + (ld ? ', yük ' + f(ld.v, 0) + ' %' : '') + ')';
    return 'Park halında, yüksək dövr/yük (RPM ' + f(rpm.v, 0) + ')';
  }

  function findings() {
    var out = [], rpm = val('0C'), run = rpm && rpm.v > 400;
    function add(sev, msg, steps) { out.push({ sev: sev, msg: msg, steps: steps }); }
    var cl = val('05');
    if (cl) {
      if (cl.max > 110) add('ŞÜBHƏLİ', 'Soyuducu temperaturu ' + f(cl.max) + ' °C-ə çatıb (yüksəkdir).', 'Soyuducu maye səviyyəsi, ventilyator, termostat, radiator yoxlanmalıdır.');
      else if (cl.hist.length > 60 && cl.max < 70) add('MƏLUMAT', 'Mühərrik iş temperaturuna çatmayıb (maks ' + f(cl.max) + ' °C). Trim/O2 nəticələri tam etibarlı sayılmaz.', 'Test üçün mühərriki qızdırıb təkrar edin. Qızmırsa termostat ehtimalı var.');
    }
    ['06', '07', '08', '09'].forEach(function (id) {
      var r = val(id); if (!r || r.hist.length < 10) return;
      var a = avg(r.hist), lt = (id === '07' || id === '09');
      if (Math.abs(a) > 10) {
        var lean = a > 0;
        add('ŞÜBHƏLİ', PIDS[id].en + ' orta ' + f(a) + ' % (' + (lean ? 'qarışıq kasıbdır' : 'qarışıq zəngindir') + ').',
          lean ? 'Vakuum/hava sızması, çirkli MAF, aşağı yanacaq təzyiqi, tıxalı injektor yoxlanmalıdır.'
               : 'Yanacaq təzyiqi, sızan injektor, O2 sensoru, hava filtri yoxlanmalıdır.');
      } else if (Math.abs(a) > 5 && lt) add('MƏLUMAT', PIDS[id].en + ' orta ' + f(a) + ' % (sərhədə yaxın).', 'Daha uzun test və təkrar ölçmə məsləhətdir.');
    });
    var v = val('42') || val('RV');
    if (v) {
      if (run && v.min < 13.0) add('ŞÜBHƏLİ', 'Mühərrik işləyərkən gərginlik minimum ' + f(v.min, 2) + ' V (şarj aşağıdır).', 'Akkumulyator klemmaları, generator şarjı, qayış yoxlanmalıdır.');
      if (v.max > 15.2) add('ŞÜBHƏLİ', 'Gərginlik ' + f(v.max, 2) + ' V-a qalxıb (yüksəkdir).', 'Generator reqlyatoru yoxlanmalıdır.');
      if (!run && v.v < 12.0) add('MƏLUMAT', 'Mühərrik söndürülüb, gərginlik ' + f(v.v, 2) + ' V.', 'Akkumulyator yükünü ölçün.');
    }
    ['14', '15'].forEach(function (id) {
      var r = val(id); if (!r || r.hist.length < 30 || !run) return;
      if (id === '14' && (r.max - r.min) < 0.3) add('ŞÜBHƏLİ', 'O2 B1S1 az dəyişir (' + f(r.min, 2) + '–' + f(r.max, 2) + ' V). Sensor tənbəl ola bilər və ya open loop-dadır.', 'Mühərrik qızdıqdan sonra təkrar yoxlayın. Dəyişməsə sensor/heater yoxlanmalıdır.');
    });
    var fs = val('03'); if (fs && fs.txt) add('MƏLUMAT', 'Yanacaq sisteminin vəziyyəti: ' + fs.txt, '');
    return out;
  }

  function build() {
    var L = [], now = new Date();
    L.push('AC OBD HESABATI — ' + now.toLocaleString());
    L.push('');
    L.push('=== AI-YA SORĞU ===');
    L.push('Aşağıda OBD2 adapteri ilə oxunmuş real məlumatlar var. Zəhmət olmasa: 1) ən ehtimal olunan problemləri əsaslandırılmış səbəblərlə sırala, 2) yoxlama addımlarını prioritetlə yaz, 3) əmin olmadığın yerləri ayrıca qeyd et, 4) məlumat çatışmayan hissələr üçün hansı əlavə testlər lazımdır de. Nəticələri qəti diaqnoz kimi yox, ehtimal kimi ver.');
    L.push('Avtomobil: [marka / model / il / mühərrik / yürüş — doldurun]');
    L.push('Əlavə şikayət: [məs. titrəyiş, sərf, səs — doldurun]');
    L.push('');
    L.push('=== BAĞLANTI ===');
    L.push('Adapter: ' + (OBD.S.deviceName || '—'));
    L.push('ELM327: ' + (OBD.S.elmVersion || '—'));
    L.push('Protokol: ' + (OBD.S.protocol || '—'));
    L.push('Vəziyyət: ' + OBD.S.state + (OBD.S.error ? ' | Xəta: ' + OBD.S.error : ''));
    L.push('Dəstəklənən PID (' + OBD.supported.length + '): ' + (OBD.supported.join(' ') || '—'));
    if (OBD.S.warns.length) L.push('Komanda xəbərdarlıqları: ' + OBD.S.warns.join('; '));
    L.push('Oxuma sürəti: ' + f(OBD.rate) + ' sorğu/san');
    L.push('');
    L.push('=== MÜHƏRRİKİN İŞ REJİMİ ===');
    L.push(mode());
    L.push('');
    L.push('=== CANLI DƏYƏRLƏR ===');
    var ids = Object.keys(OBD.values), real = 0, nod = [];
    ids.forEach(function (id) {
      var r = OBD.values[id], p = PIDS[id]; if (!p) return;
      if (r.v === null) { nod.push(id); return; }
      real++;
      var d = p.fix === undefined ? 1 : p.fix;
      L.push(id + ' ' + p.en + ': son ' + (r.txt || f(r.v, d)) + ' ' + p.unit + ' | min ' + f(r.min, d) + ' | maks ' + f(r.max, d) + ' | orta ' + f(avg(r.hist), d) + ' | nümunə ' + r.hist.length);
    });
    if (!real) L.push('Real dəyər oxunmayıb. Əvvəl Canlı bölməsində "Başlat" basın.');
    L.push('');
    L.push('=== ŞÜBHƏLƏR VƏ YOXLAMA ADDIMLARI (qaydalara əsaslanır, qəti diaqnoz deyil) ===');
    var fi = findings(), sus = 0;
    fi.forEach(function (x) { if (x.sev === 'ŞÜBHƏLİ') sus++; L.push('[' + x.sev + '] ' + x.msg + (x.steps ? '\n   Yoxlama: ' + x.steps : '')); });
    if (!fi.length) L.push('Aşkar edilmiş kənarlaşma yoxdur (yalnız oxunan PID-lər əsasında).');
    L.push('');
    L.push('=== VERİLƏNLƏRİN ETİBARLILIĞI ===');
    L.push('Real oxunan PID: ' + real + ' | Cavabsız: ' + (nod.join(' ') || 'yoxdur'));
    L.push('Bu versiyada DTC (Mode 03/07/0A), Freeze Frame və Mode 06 OXUNMUR. Yəni xəta kodu olmaması bu hesabatdan çıxarıla bilməz.');
    L.push('Dekodlaşdırılmayan və ya dəstəklənməyən göstəricilər normal/nasaz kimi təqdim edilmir.');
    extra.forEach(function (e) {
      try { var t = e.fn(); if (t) { L.push(''); L.push('=== ' + e.title + ' ==='); L.push(t); } } catch (x) { L.push('(' + e.title + ' xətası: ' + x.message + ')'); }
    });
    L.push('');
    L.push('=== YEKUN QİYMƏTLƏNDİRMƏ ===');
    if (!real) L.push('Qiymətləndirmə mümkün deyil: canlı məlumat yoxdur.');
    else if (sus) L.push(sus + ' şübhəli göstərici var. Yuxarıdakı yoxlama addımlarına baxın. Yalnız canlı PID əsasında ehtimaldır.');
    else L.push('Oxunan PID-lərdə açıq nasazlıq əlaməti yoxdur. Bu, maşının tam sağlam olduğunu göstərmir (DTC/Mode 06 yoxlanmayıb).');
    L.push('');
    L.push('=== ADAPTER JURNALI (son 150 sətir) ===');
    L.push(Log.all().slice(-150).join('\n'));
    return L.join('\n');
  }

  function copy(t, ok) {
    function fb() {
      var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select();
      var r = false; try { r = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(a); ok(r);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { ok(true); }, fb);
    else fb();
  }
  function download(t) {
    var d = new Date(), p = function (n) { return ('0' + n).slice(-2); };
    var name = 'AC-OBD-hesabat-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.txt';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  function msg(s) { var e = document.getElementById('rp-msg'); if (e) e.textContent = s; }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-rp]'); if (!el) return;
    var a = el.getAttribute('data-rp'), t = build();
    if (a === 'copy') copy(t, function (ok) { msg(ok ? 'Kopyalandı. İndi ChatGPT/Claude-a yapışdırın.' : 'Kopyalanmadı. Önbaxışdan əl ilə seçin.'); });
    else if (a === 'dl') { try { download(t); msg('Yükləmə başladı. İşləməsə "Kopyala" istifadə edin.'); } catch (x) { msg('Yükləmə alınmadı: ' + x.message); } }
    else if (a === 'prev') { var pre = document.getElementById('rp-pre'); if (pre) { pre.textContent = t; pre.style.display = 'block'; } }
  });

  return {
    build: build,
    addSection: function (title, fn) { extra.push({ title: title, fn: fn }); },
    card: function () {
      return '<div class="card"><b>Hesabat (AI üçün)</b>' +
        '<p class="sm">Bütün canlı göstəricilər, şübhələr, rejim və jurnal bir mətndə.</p>' +
        '<button class="btn" data-rp="copy">Hesabatı kopyala</button>' +
        '<button class="btn alt" data-rp="dl">TXT yüklə</button>' +
        '<button class="btn alt" data-rp="prev">Önbaxış</button>' +
        '<p class="sm" id="rp-msg"></p><pre class="log" id="rp-pre" style="display:none"></pre></div>';
    }
  };
})();
