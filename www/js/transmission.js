(function () {
  'use strict';
  if (!window.OBD || !window.ELM || !window.TransmissionCore) return;
  var view = document.getElementById('view'), core = window.TransmissionCore;
  var result = null, busy = false, error = '', message = '', timer = null, timerStart = 0, timerName = '', measured = {}, fluid = { color: '', smell: '', debris: '' };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function cur() { return (location.hash || '#dashboard').slice(1); }
  function card(s, cls) { return '<div class="card' + (cls ? ' ' + cls : '') + '">' + s + '</div>'; }
  function row(k, v, cls) { return '<div class="row"><span class="k">' + esc(k) + '</span><span class="' + (cls || 'sm') + '">' + esc(v) + '</span></div>'; }
  function btn(label, act, disabled, cls) { return '<button class="btn ' + (cls || '') + '" data-tr="' + act + '" ' + (disabled ? 'disabled' : '') + '>' + esc(label) + '</button>'; }
  function connected() { return OBD.S.state === 'ecu'; }
  function render() {
    if (cur() !== 'transmission') return;
    var h = '<h2>Karobka testi · Transmission Diagnostics</h2>';
    h += card('<b>Kia Forte 2015 · 1.8 MPI · A6GF1 (ilkin uyğunluq)</b><p class="sm">Bu transmissiya tipi servis məlumatlarında 1.8 MPI üçün göstərilir. Avtomobilin VIN/karobka kodu ilə son təsdiq ayrıca edilməlidir.</p>');
    h += card(row('Adapter', OBD.S.deviceName || 'Qoşulmayıb', connected() ? 'ok' : 'no') + row('ECU bağlantısı', connected() ? 'ECU əlçatandır' : 'Əvvəl adapterə qoşulun', connected() ? 'ok' : 'no'));
    if (!connected()) h += card('<p>TCM yoxlaması üçün əvvəlcə “Qoşul” bölməsində ELM327 adapterinə qoşulun. Mühərrik məlumatları karobka məlumatı kimi göstərilməyəcək.</p>', 'warn');
    h += card('<b>1. TCM aşkarlanması və standart məlumatlar</b><p class="sm">CAN cavab başlıqları aktiv edilərək ECU cavabları ayrılır. 7E8–7EF cavablarından uyğun sorğu ünvanı müəyyən edilir. TCM-in cavab verməsi avtomobil və adapterdən asılıdır.</p>' + btn(busy ? 'Yoxlanılır…' : 'TCM-i tap və oxu', 'scan', !connected() || busy) + (result ? renderResult() : '<p class="sm">Hələ skan edilməyib.</p>'));
    h += card('<b>2. D/R qoşulma gecikməsi — əl ilə ölçmə</b><p class="sm">Bu, sensorla avtomatik ölçmə deyil: köməkçi şəxs taymeri başladıb ötürmənin qoşulduğunu təsdiqləməlidir. Sürücü telefona toxunmamalıdır. Avtomobil düz yerdə, ayaq əyləci basılı, təhlükəsiz şəraitdə olmalıdır.</p>' +
      '<div class="row"><span>P → D</span><span>' + esc(measured.PD === undefined ? 'ölçülməyib' : measured.PD.toFixed(2) + ' s') + '</span></div>' +
      '<div class="row"><span>P → R</span><span>' + esc(measured.PR === undefined ? 'ölçülməyib' : measured.PR.toFixed(2) + ' s') + '</span></div>' +
      (timer ? '<p class="big">' + ((Date.now() - timerStart) / 1000).toFixed(2) + ' s · ' + esc(timerName) + '</p>' : '') +
      '<div class="grid"><button class="btn" data-tr="startPD" ' + (timer || !connected() ? 'disabled' : '') + '>P → D başlat</button><button class="btn" data-tr="startPR" ' + (timer || !connected() ? 'disabled' : '') + '>P → R başlat</button></div>' +
      btn('Qoşuldu — vaxtı qeyd et', 'stopTimer', !timer, 'alt') + '<p class="sm">Gecikməyə universal saniyə norması qoyulmur; nəticə Kia servis spesifikasiyası ilə müqayisə edilməlidir.</p>');
    h += card('<b>3. ATF yağının fiziki yoxlanması</b><p class="sm">OBD yağın rəngini, qoxusunu və metal qırıntılarını ölçmür. Bunlar fiziki baxışla qeyd olunur. ATF temperaturu TCM-dən oxunarsa ayrıca real dəyər kimi göstəriləcək.</p>' +
      '<label>Yağın rəngi</label><select id="tr-color"><option value="">Seçilməyib</option><option>Qırmızı / çəhrayı</option><option>Tünd qəhvəyi</option><option>Qara</option><option>Naməlum</option></select>' +
      '<label>Qoxu</label><select id="tr-smell"><option value="">Seçilməyib</option><option>Normal</option><option>Yanıq qoxusu</option><option>Naməlum</option></select>' +
      '<label>Metal qırıntısı / çöküntü</label><select id="tr-debris"><option value="">Seçilməyib</option><option>Görünmür</option><option>Var</option><option>Yoxlanmayıb</option></select>' + btn('Fiziki yoxlama qeydlərini saxla', 'fluidSave', false, 'alt') + '<p class="sm">Bu seçimlər istifadəçi qeydləridir, OBD ölçümü deyil.</p>');
    h += card('<b>4. Nəticə və jurnal</b>' + btn('Hesabatı TXT kimi yüklə', 'export', !result && !Object.keys(measured).length && !fluid.color && !fluid.smell && !fluid.debris, 'alt') + (message ? '<p class="ok">' + esc(message) + '</p>' : '') + (error ? '<p class="bad">' + esc(error) + '</p>' : ''));
    view.innerHTML = h;
    var c = document.getElementById('tr-color'); if (c) c.value = fluid.color;
    c = document.getElementById('tr-smell'); if (c) c.value = fluid.smell;
    c = document.getElementById('tr-debris'); if (c) c.value = fluid.debris;
  }
  function renderResult() {
    if (!result) return '';
    var h = '<p class="sm">Skan vaxtı: ' + esc(result.time) + '</p>';
    h += row('Aşkarlanan CAN ECU', result.responders.length ? result.responders.map(function (x) { return x.responseId + ' (sorğu ' + x.requestId + ')'; }).join(', ') : 'Cavab tapılmadı', result.responders.length ? 'ok' : 'no');
    if (result.responders.length && !result.responders.some(function (x) { return x.tcmCandidate; })) h += row('TCM aşkarlanması', '7E9 cavabı görünmədi — TCM nasazdır nəticəsi çıxarmaq olmaz', 'no');
    if (result.responders.length) result.responders.forEach(function (ecu) {
      h += '<div class="gl"><b>ECU ' + esc(ecu.responseId) + ' / request ' + esc(ecu.requestId) + '</b>';
      h += row('TCM namizədi', ecu.tcmCandidate ? '7E9: TCM namizədi (ünvanla ehtimal), tam təsdiq deyil' : 'ECU cavabı; TCM olduğu təsdiqlənməyib', ecu.tcmCandidate ? 'ok' : 'sm');
      h += row('PID 01 00 dəstəyi', ecu.supportKnown ? (ecu.supported.length ? ecu.supported.join(', ') : 'maskada əlavə PID yoxdur') : 'NO DATA');
      var gear = ecu.gear;
      h += row('Mode 01 PID A4 — faktiki ötürmə', gear ? (gear.gearSupported ? 'Gear code: ' + gear.gear : 'Gear status dəstəklənmir') : (ecu.supportKnown && ecu.supported.indexOf(0xA4) < 0 ? 'UNSUPPORTED' : 'NO DATA'));
      h += row('PID A4 — ötürmə nisbəti', gear && gear.ratioSupported ? gear.ratio.toFixed(3) : (gear ? 'Dəstəklənmir' : 'NO DATA'));
      if (ecu.pids.A4) h += row('PID A4 xam cavab', ecu.pids.A4);
      h += row('Mode 03 ümumi OBD DTC (TCM-in tam xəta siyahısı deyil)', ecu.dtcs === null ? 'NO DATA — xəta yoxdur demək deyil' : (ecu.dtcs.length ? ecu.dtcs.join(', ') : 'Cavab var, kod siyahısı boşdur'), ecu.dtcs && ecu.dtcs.length ? 'no' : 'sm');
      h += '</div>';
    });
    h += '<div class="gl">' + row('ATF temperaturu', 'Kia enhanced PID xəritəsi yoxdur · NO DATA') + row('ISS — giriş valı RPM', 'Kia enhanced PID xəritəsi yoxdur · NO DATA') + row('OSS — çıxış valı RPM', 'Kia enhanced PID xəritəsi yoxdur · NO DATA') + row('TCC slip', 'Kia enhanced PID xəritəsi yoxdur · NO DATA') + row('Line pressure / ATF life', 'Bu adapter/protokol üçün təsdiqlənmiş PID yoxdur · NO DATA') + '</div>' + '<p class="sm">Naməlum Kia sorğuları göndərilmir. Bu göstəriciləri əlavə etmək üçün A6GF1-ə uyğun təsdiqlənmiş DID/PID xəritəsi və uyğun adapter lazımdır.</p>';
    return h;
  }
  function getRespIds(lines, service, pid) {
    var all = core.parseFrames(lines, service, pid), seen = {};
    return all.filter(function (x) { if (seen[x.responseId]) return false; seen[x.responseId] = true; return true; });
  }
  async function scan() {
    OBD.stopPoll(); busy = true; error = ''; message = ''; result = null; render();
    try {
      result = await ELM.exclusive(async function (tx) {
        var out = { time: new Date().toISOString(), responders: [], notes: [] };
        try {
          var a = await tx.send('ATH1', 2000); Log.add('TCM', 'ATH1 ' + a.join(' '));
          await tx.send('ATSH7DF', 2000);
          var lines = await tx.send('0101', 5000);
          Log.add('TCM', '0101 ' + lines.join(' | '));
          var ids = getRespIds(lines, '41', '01');
          var seen = {};
          for (var i = 0; i < ids.length; i++) {
            var ecu = ids[i]; if (seen[ecu.responseId]) continue; seen[ecu.responseId] = true;
            var rec = { responseId: ecu.responseId, requestId: ecu.requestId, tcmCandidate: ecu.responseId === '7E9', supported: [], supportKnown: false, pids: {}, gear: null, dtcs: null };
            await tx.send('ATSH' + rec.requestId, 2000);
            var base = 0;
            while (base <= 0xA0) {
              var basePid = base.toString(16).toUpperCase().padStart(2, '0');
              var supLines = await tx.send('01' + basePid, 3500);
              var supFrames = core.parseFrames(supLines, '41', basePid);
              if (!supFrames.length || supFrames[0].data.length < 4) { if (base === 0) break; else break; }
              rec.supportKnown = true;
              var block = core.supportedPids(supFrames[0].data, base);
              rec.supported = rec.supported.concat(block);
              if (block.indexOf(base + 0x20) < 0 || base >= 0xA0) break;
              base += 0x20;
            }
            if (!rec.supportKnown || rec.supported.indexOf(0xA4) >= 0) {
              try {
                var pl = await tx.send('01A4', 3000), pf = core.parseFrames(pl, '41', 'A4');
                if (pf.length) { rec.pids.A4 = pf[0].data.map(function (b) { return b.toString(16).toUpperCase().padStart(2, '0'); }).join(' '); rec.gear = core.decodeGearA4(pf[0].data); }
              } catch (e) { Log.add('TCM', 'PID A4: ' + e.message); }
            }
            try {
              var dl = await tx.send('03', 4000), df = core.parseFrames(dl, '43', '');
              if (df.length) rec.dtcs = core.decodeDtcBytes(df[0].data);
            } catch (e) { Log.add('TCM', 'DTC: ' + e.message); }
            out.responders.push(rec);
          }
          if (!ids.length) out.notes.push('0101 sorğusuna CAN başlıqlı ECU cavabı tapılmadı. Adapter/ECU TCM cavabını dəstəkləməyə bilər.');
        } finally {
          try { await tx.send('ATSH7DF', 1500); } catch (e) {}
          try { await tx.send('ATH0', 1500); } catch (e) {}
        }
        return out;
      });
      if (!result.responders.length) error = 'TCM/ECU cavabı aşkarlanmadı. Bu, karobkanın nasaz olması demək deyil.';
      else message = 'ECU cavabları ayrıldı. TCM namizədi ayrıca işarələndi; PID nəticələri yalnız real cavaba əsaslanır.';
    } catch (e) { error = 'Skan alınmadı: ' + e.message; Log.add('TCM', error); }
    busy = false; render();
  }
  async function startTimer(name) {
    if (!connected() || timer || busy) return;
    OBD.stopPoll();
    error = ''; message = 'Avtomobilin dayanması və mühərrikin işləməsi yoxlanılır…'; render();
    try {
      var speed = await OBD.readSpeed(), rpm = await OBD.readRpm();
      if (speed === null) throw new Error('Sürət PID-i oxunmadı; təhlükəsiz dayanmanı təsdiqləmək mümkün deyil. Taymer başlamadı.');
      if (speed > 0) throw new Error('Avtomobil hərəkətdədir (' + speed + ' km/saat). D/R testi bloklandı.');
      if (rpm === null || rpm < 400) throw new Error('Mühərrikin işlədiyi təsdiqlənmədi. D/R gecikmə testi başlamadı.');
      if (!confirm('Yalnız köməkçi şəxs telefonu idarə edəcək. Avtomobil düz yerdədir, əl əyləci çəkilib və ayaq əyləci basılı saxlanacaq. ' + name.replace('P','P → ') + ' ölçməsini başladaq?')) return;
      timerName = name; timerStart = Date.now(); timer = true; message = 'Taymer başladı. Ötürmə qoşulan kimi köməkçi “Qoşuldu” düyməsinə bassın.';
    } catch (e) { error = e.message; message = ''; }
    render();
  }
  function stopTimer() { if (!timer) return; measured[timerName] = (Date.now() - timerStart) / 1000; timer = null; timerName = ''; render(); }
  function exportText() {
    var lines = ['ACOBD — TRANSMISSION TEST', 'Vehicle: Kia Forte 2015 1.8 MPI (A6GF1 provisional)', 'Date: ' + new Date().toISOString(), ''];
    if (result) { lines.push('TCM/ECU SCAN:'); lines.push(JSON.stringify(result, null, 2)); }
    lines.push('D/R delay manual timing: ' + JSON.stringify(measured));
    lines.push('ATF physical inspection (user-entered): ' + JSON.stringify(fluid));
    lines.push('Limitations: generic OBD cannot directly measure ATF chemical condition; enhanced Kia TCM data requires verified DID/PID mapping.');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })); a.download = 'ACOBD-transmission-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt'; document.body.appendChild(a); a.click(); a.remove();
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-tr]'); if (!el) return;
    var a = el.getAttribute('data-tr');
    if (a === 'scan') scan();
    else if (a === 'startPD') startTimer('PD');
    else if (a === 'startPR') startTimer('PR');
    else if (a === 'stopTimer') stopTimer();
    else if (a === 'fluidSave') { fluid.color = (document.getElementById('tr-color') || {}).value || ''; fluid.smell = (document.getElementById('tr-smell') || {}).value || ''; fluid.debris = (document.getElementById('tr-debris') || {}).value || ''; message = 'Fiziki yoxlama qeydləri saxlanıldı (OBD ölçümü deyil).'; render(); }
    else if (a === 'export') exportText();
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'tr-color') fluid.color = e.target.value;
    if (e.target.id === 'tr-smell') fluid.smell = e.target.value;
    if (e.target.id === 'tr-debris') fluid.debris = e.target.value;
  });
  window.addEventListener('hashchange', render);
  OBD.on(function () { if (cur() === 'transmission' && !busy) render(); });
  var drawer = document.getElementById('drawerlist');
  function addDrawer() { if (drawer && !drawer.querySelector('a[href="#transmission"]')) { var a = document.createElement('a'); a.href = '#transmission'; a.textContent = 'Karobka testi'; drawer.appendChild(a); } }
  if (drawer) { new MutationObserver(addDrawer).observe(drawer, { childList: true }); addDrawer(); }
  setInterval(function () { var el = document.getElementById('tr-clock'); if (timer && el) el.textContent = ((Date.now() - timerStart) / 1000).toFixed(2) + ' s · ' + timerName; }, 100);
  if (cur() === 'transmission') render();
})();
