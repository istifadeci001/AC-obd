(function () {
  'use strict';
  if (!window.OBD || !window.ELM || !window.TransmissionCore) return;
  var view = document.getElementById('view'), core = window.TransmissionCore;
  var result = null, busy = false, error = '', message = '', fluid = { color: '', smell: '', debris: '' }, lastSavedName = '';
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
    h += card('<b>2. Sürüş zamanı transmissiya məlumatları</b><p class="sm">Avtomatik yol testi üçün TCM-dən real canlı göstəricilər tələb olunur. Hazırkı adapter jurnalında TCM adı görünür, lakin ISS, OSS, ATF temperaturu və faktiki pillə üçün təsdiqlənmiş Kia DID xəritəsi və real TCM cavabları hələ yoxdur. Buna görə bu versiya saxta pillə və keçid vaxtı yaratmır. TCM sorğu xəritəsi təsdiqlənəndə bu göstəricilər avtomatik qeydə alınacaq; sürücü telefona toxunmayacaq.</p>' + row('Cari faktiki pillə', 'NO DATA — TCM DID təsdiqlənməyib') + row('Pillə dəyişmə vaxtı', 'NO DATA — real TCM gear-state axını yoxdur') + row('ISS / OSS', 'NO DATA — TCM cavabı təsdiqlənməyib') + row('ATF temperaturu', 'NO DATA — TCM cavabı təsdiqlənməyib') + row('TCC slip', 'NO DATA — TCM cavabı təsdiqlənməyib') + row('Nəticə', 'Bu adapter jurnalından təkbaşına transmissiyanın sağlamlıq faizi hesablamaq olmaz'));
    h += card('<b>3. ATF yağının fiziki yoxlanması</b><p class="sm">OBD yağın rəngini, qoxusunu və metal qırıntılarını ölçmür. Bunlar fiziki baxışla qeyd olunur. ATF temperaturu TCM-dən oxunarsa ayrıca real dəyər kimi göstəriləcək.</p>' +
      '<label>Yağın rəngi</label><select id="tr-color"><option value="">Seçilməyib</option><option>Qırmızı / çəhrayı</option><option>Tünd qəhvəyi</option><option>Qara</option><option>Naməlum</option></select>' +
      '<label>Qoxu</label><select id="tr-smell"><option value="">Seçilməyib</option><option>Normal</option><option>Yanıq qoxusu</option><option>Naməlum</option></select>' +
      '<label>Metal qırıntısı / çöküntü</label><select id="tr-debris"><option value="">Seçilməyib</option><option>Görünmür</option><option>Var</option><option>Yoxlanmayıb</option></select>' + btn('Fiziki yoxlama qeydlərini saxla', 'fluidSave', false, 'alt') + '<p class="sm">Bu seçimlər istifadəçi qeydləridir, OBD ölçümü deyil.</p>');
    h += card('<b>4. Nəticə və jurnal</b>' + btn('ACOBD qovluğuna saxla', 'save', !hasData(), 'alt') + btn('Hesabatı kopyala', 'copy', !hasData(), 'alt') + btn('TXT yüklə', 'export', !hasData(), 'alt') + (lastSavedName ? row('Son fayl', lastSavedName, 'ok') : '') + (message ? '<p class="ok">' + esc(message) + '</p>' : '') + (error ? '<p class="bad">' + esc(error) + '</p>' : ''));
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
  function hasData() { return !!(result || fluid.color || fluid.smell || fluid.debris || (window.Log && Log.all && Log.all().length)); }
  function reportText() {
    var lines = ['ACOBD — TRANSMISSION DIAGNOSTICS', 'Vehicle: Kia Forte 2015 1.8 MPI (A6GF1 — ilkin uyğunluq)', 'Date: ' + new Date().toISOString(), 'Adapter: ' + ((OBD.S && OBD.S.deviceName) || '—'), 'Protocol: ' + ((OBD.S && OBD.S.protocol) || '—'), ''];
    if (result) { lines.push('TCM/ECU SCAN:'); lines.push(JSON.stringify(result, null, 2)); }
    lines.push('ATF physical inspection (user-entered, not OBD): ' + JSON.stringify(fluid));
    lines.push('', 'ROAD TEST STATUS:');
    lines.push('Current gear: NO DATA — verified Kia TCM DID mapping unavailable.');
    lines.push('Shift timing: NO DATA — no confirmed TCM gear-state stream.');
    lines.push('ISS / OSS / ATF temperature / TCC slip: NO DATA until real TCM responses are verified.');
    lines.push('', 'ADAPTER LOG (VIN response masked):');
    lines.push(window.Log && Log.safeText ? Log.safeText(400) : 'Adapter log unavailable.');
    lines.push('', 'RAW ELM TRANSACTIONS:');
    lines.push(window.RawLog && RawLog.text ? RawLog.text() : 'Raw adapter transaction log unavailable.');
    lines.push('', 'LIMITATION: Generic OBD PID results are not TCM enhanced data. No transmission health percentage is inferred from missing data.');
    return lines.join('\n');
  }
  function fileName() {
    var d = new Date(), p2 = function (n) { return ('0' + n).slice(-2); };
    return 'ACOBD-karobka-' + d.getFullYear() + p2(d.getMonth()+1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + '.txt';
  }
  async function saveReport(reason) {
    if (!hasData()) return { ok: true, skipped: true };
    if (!window.ACOBDFiles || typeof ACOBDFiles.saveText !== 'function') throw new Error('ACOBD fayl yaddaş modulu mövcud deyil');
    var name = fileName(), text = reportText();
    await ACOBDFiles.saveText(name, text);
    lastSavedName = name;
    if (reason !== 'app-exit') { message = 'Karobka hesabatı ACOBD qovluğunda saxlanıldı: ' + name; render(); }
    return { ok: true, name: name, text: text };
  }
  function copyReport() {
    var text = reportText();
    function fallback() { var a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} a.remove(); message = ok ? 'Karobka hesabatı kopyalandı.' : 'Kopyalama alınmadı.'; render(); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { message = 'Karobka hesabatı kopyalandı.'; render(); }, fallback); else fallback();
  }
  function exportText() {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([reportText()], { type: 'text/plain;charset=utf-8' })); a.download = fileName(); document.body.appendChild(a); a.click(); a.remove();
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-tr]'); if (!el) return;
    var a = el.getAttribute('data-tr');
    if (a === 'scan') scan();
    else if (a === 'save') saveReport('manual').catch(function (e) { error = 'Saxlanmadı: ' + e.message; render(); });
    else if (a === 'copy') copyReport();
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
  window.TransmissionDiagnostics = { hasData: hasData, saveReport: saveReport, reportText: reportText };
  if (cur() === 'transmission') render();
})();
