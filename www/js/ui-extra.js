(function () {
  'use strict';
  var view = document.getElementById('view'), S = OBD.S, ctx = Session.ctx;
  var busy = '', errMsg = '', msg = '', lastAI = null, repOpen = null, notesDraft = '', rnDraft = '', cmpRes = null;
  var mon = { on: false, timer: null, every: 10, seen: {} };
  var screens = {};

  function L() { return Store.get('lang', 'az'); }
  function T(a, e) { return L() === 'en' ? e : a; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cur() { return (location.hash || '#dashboard').slice(1); }
  function card(inner, cls) { return '<div class="card' + (cls ? ' ' + cls : '') + '">' + inner + '</div>'; }
  function btn(label, act, extra, cls) {
    return '<button class="btn' + (cls ? ' ' + cls : '') + '" data-ex="' + act + '" ' + (extra || '') + '>' + esc(label) + '</button>';
  }
  function row(k, v, cls) {
    return '<div class="row"><span class="k">' + esc(k) + '</span><span class="' + (cls || '') + '">' + esc(v) + '</span></div>';
  }
  function title(a, e) { return '<h2>' + esc(T(a, e)) + '</h2>'; }
  function needEcu() {
    return S.state === 'ecu' ? '' : card('<p>' + esc(T('Real ECU-ya qoşulmamısınız. Əvvəl "Qoşul" bölməsində adapteri qoşun. Heç bir saxta dəyər göstərilmir.', 'Not connected to a real ECU. Connect the adapter first. No fake values are shown.')) + '</p>', 'warn');
  }
  function stat() {
    return (busy ? card('<p class="no">' + esc(busy) + '</p>') : '') +
      (errMsg ? card('<p class="bad">' + esc(errMsg) + '</p>') : '') +
      (msg ? card('<p class="ok">' + esc(msg) + '</p>') : '');
  }
  function off() { return (S.state !== 'ecu' || busy) ? 'disabled' : ''; }
  function ul(a) {
    return a.length ? '<ul>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="sm">—</p>';
  }
  function rerender() { var c = cur(); if (screens[c]) view.innerHTML = screens[c](); }
  function fail(e) { return { ok: false, codes: [], status: e.message }; }

  async function run(label, fn) {
    if (busy) return;
    errMsg = ''; msg = ''; busy = label; rerender();
    try { await fn(); } catch (e) { Log.add('ERR', label + ': ' + e.message); errMsg = e.message; }
    busy = ''; rerender();
  }

  async function readAll() {
    OBD.stopPoll();
    busy = T('Kodlar oxunur…', 'Reading codes…'); rerender();
    var d = { t: new Date().toISOString() };
    d.stored = await OBD.readDtcs('03').catch(fail);
    d.pending = await OBD.readDtcs('07').catch(fail);
    d.permanent = await OBD.readDtcs('0A').catch(fail);
    ctx.dtc = d;
    busy = T('Freeze Frame oxunur…', 'Reading Freeze Frame…'); rerender();
    ctx.freeze = await OBD.readFreeze().catch(function (e) { return { dtc: null, pids: {}, status: e.message }; });
  }

  function nrcText(r) {
    var m = {
      '22': T('şərtlər uyğun deyil (mühərriki söndürüb açarı ON saxlayın)', 'conditions not correct (engine off, key ON)'),
      '11': T('bu servis dəstəklənmir', 'service not supported'),
      '12': T('alt funksiya dəstəklənmir', 'sub-function not supported'),
      '21': T('ECU məşğuldur, təkrar yoxlayın', 'ECU busy, retry'),
      '78': T('ECU cavab hazırlayır', 'ECU still processing')
    };
    return r.nrc ? (m[r.nrc] || (T('kod ', 'code ') + r.nrc)) : T('cavab alınmadı', 'no response');
  }

  async function clearFlow() {
    if (busy) return;
    errMsg = ''; msg = '';
    var spd = null, rpm = null;
    OBD.stopPoll();
    busy = T('Avtomobil vəziyyəti yoxlanır…', 'Checking vehicle state…'); rerender();
    try { spd = await OBD.readSpeed(); rpm = await OBD.readRpm(); } catch (e) { Log.add('ERR', 'silmə yoxlaması: ' + e.message); }
    busy = '';
    if (spd === null) { errMsg = T('Sürət ECU-dan oxunmadı, avtomobilin dayandığını təsdiq etmək mümkün deyil. Silmə bloklandı.', 'Speed could not be read from the ECU, so standstill cannot be confirmed. Erase blocked.'); rerender(); return; }
    if (spd > 0) { errMsg = T('Avtomobil hərəkətdədir (' + spd + ' km/saat). Silmə bloklandı.', 'Vehicle is moving (' + spd + ' km/h). Erase blocked.'); rerender(); return; }
    if (rpm !== null && rpm > 0 && !confirm(T('Mühərrik işləyir (' + Math.round(rpm) + ' rpm). Bir çox avtomobil kod silməni yalnız mühərrik söndürülü, açar ON halında qəbul edir. Yenə də davam edək?', 'Engine is running (' + Math.round(rpm) + ' rpm). Many vehicles accept code erase only with the engine off and key ON. Continue anyway?'))) { rerender(); return; }
    if (!confirm(T('Xəta kodları və Freeze Frame silinəcək, Check Engine işığı sönəcək, hazırlıq (readiness) testləri sıfırlanacaq. Nasazlıq düzəlmir, yalnız qeyd silinir. Əvvəl kodlar telefonda saxlanılacaq. Davam edək?', 'Fault codes and Freeze Frame will be erased, the Check Engine light will go off and readiness tests will reset. The fault is not fixed, only the record is erased. Codes will be saved on the phone first. Continue?'))) { rerender(); return; }
    await run(T('Kodlar saxlanılır…', 'Saving codes…'), async function () {
      await readAll();
      var d = ctx.dtc;
      if (!d || !(d.stored.ok || d.pending.ok || d.permanent.ok)) throw new Error(T('Kodlar oxunmadığı üçün ehtiyat nüsxə saxlanmadı. Silmə dayandırıldı.', 'Codes could not be read, so no backup was saved. Erase stopped.'));
      var bk = Store.get('dtcbackup', []);
      bk.unshift({ t: d.t, dtc: d, freeze: ctx.freeze });
      if (!Store.set('dtcbackup', bk.slice(0, 10))) throw new Error(T('Ehtiyat nüsxə yaddaşa yazılmadı (yaddaş dolu ola bilər). Silmə dayandırıldı.', 'Backup could not be written (storage may be full). Erase stopped.'));
    });
    if (errMsg || !ctx.dtc) return;
    if (!confirm(T('Kodlar saxlandı. Son təsdiq: kodlar silinsin?', 'Codes saved. Final confirmation: erase codes?'))) return;
    await run(T('Silinir…', 'Erasing…'), async function () {
      var r = await OBD.clearDtcs();
      if (!r.ok) throw new Error(T('ECU silməni rədd etdi: ', 'ECU refused to erase: ') + nrcText(r) + ' [' + r.raw + ']');
      await new Promise(function (res) { setTimeout(res, 2000); });
      await readAll();
      var d = ctx.dtc;
      var st = d.stored.ok ? d.stored.codes : [], pe = d.pending.ok ? d.pending.codes : [], pm = d.permanent.ok ? d.permanent.codes : [];
      if (!st.length && !pe.length) {
        msg = T('Silindi: saxlanmış və gözləyən kod yoxdur.', 'Erased: no stored or pending codes.') +
          (pm.length ? T(' Daimi (0A) kodlar qalır: ' + pm.join(', ') + '. Bu normaldır: ECU onları yalnız nasazlıq düzəldikdən sonra özü silir.', ' Permanent (0A) codes remain: ' + pm.join(', ') + '. This is normal: the ECU clears them itself after the fault is fixed.') : '');
      } else {
        errMsg = T('ECU əmri qəbul etdi, amma kodlar qalır: ' + st.concat(pe).join(', ') + '. Mühərriki söndürüb açarı ON saxlayaraq təkrar yoxlayın. Nasazlıq aktivdirsə kod yenidən yazıla bilər.', 'ECU accepted the command, but codes remain: ' + st.concat(pe).join(', ') + '. Retry with the engine off and key ON. If the fault is active the code may be set again.');
      }
    });
  }

  function codeBlock(label, r) {
    if (!r) return '';
    var h = '<label>' + esc(label) + '</label>';
    if (!r.ok) h += '<p class="sm">' + esc(T('Cavab: ', 'Reply: ') + (r.status || '—') + T(' — kod yoxdur və ya bu rejim dəstəklənmir.', ' — no codes or mode not supported.')) + '</p>';
    else if (!r.codes.length) h += '<p class="ok">' + esc(T('Kod yoxdur', 'No codes')) + '</p>';
    else r.codes.forEach(function (c) {
      var d = window.DTC_DB[c];
      h += '<div class="row"><span><b>' + esc(c) + '</b><br><span class="sm">' + esc(d ? (L() === 'en' ? d.en : d.az) : T('bazada yoxdur', 'not in database')) + '</span></span>' +
        '<span style="display:flex;gap:6px"><button class="btn alt" style="width:auto;margin:0" data-ex="look" data-c="' + esc(c) + '">' + esc(T('bax', 'view')) + '</button>' +
        '<button class="btn alt" style="width:auto;margin:0" data-ex="aiexp" data-c="' + esc(c) + '">AI</button></span></div>';
    });
    return h;
  }

  screens.dtc = function () {
    var d = ctx.dtc, bk = Store.get('dtcbackup', []);
    var h = title('Xəta kodları (Fault Codes)', 'Fault Codes') + needEcu() + stat() +
      Compat.note('dtc03', 'Saxlanmış kodlar (Mode 03)') + Compat.note('dtc0a', 'Daimi kodlar (Mode 0A)');
    h += card('<p>' + esc(T('Kodları oxumaq təhlükəsizdir. Silmək kodları və Freeze Frame-i itirir, ona görə əvvəl avtomatik saxlanılır.', 'Reading codes is safe. Erasing loses codes and Freeze Frame, so they are saved first.')) + '</p>' +
      btn(T('Bütün kodları oxu (03, 07, 0A)', 'Read all codes (03, 07, 0A)'), 'readall', off()) +
      (d ? codeBlock(T('Saxlanmış (03)', 'Stored (03)'), d.stored) + codeBlock(T('Gözləyən (07)', 'Pending (07)'), d.pending) + codeBlock(T('Daimi (0A)', 'Permanent (0A)'), d.permanent) : ''));
    h += card('<label>' + esc(T('Kodu bazadan axtar', 'Look up a code')) + '</label>' +
      '<input id="dtcq" type="text" autocapitalize="characters" autocomplete="off" placeholder="P0420"><div id="dtcres"></div>');
    h += card('<label>' + esc(T('Kodları sil (Mode 04)', 'Erase codes (Mode 04)')) + '</label>' +
      '<p>' + esc(T('Silmədən əvvəl sürət və mühərrik yoxlanır, kodlar saxlanılır, iki təsdiq istənir. Bəzi avtomobillərdə mühərrik söndürülməlidir (açar ON). Daimi (0A) kodlar silinmir.', 'Speed and engine are checked, codes are saved, two confirmations are required. Some vehicles need the engine off (key ON). Permanent (0A) codes are not erased.')) + '</p>' +
      btn(T('Kodları sil', 'Erase codes'), 'clear', off(), 'del') +
      '<p class="sm">' + esc(T('Telefonda saxlanmış ehtiyat nüsxə: ', 'Backups saved on phone: ') + bk.length) + '</p>');
    return h;
  };

  screens.freeze = function () {
    var f = ctx.freeze;
    var h = title('Dondurulmuş kadr (Freeze Frame)', 'Freeze Frame') + needEcu() + stat() + Compat.note('freeze', 'Freeze Frame (Mode 02)') +
      card(btn(T('Freeze Frame oxu (Mode 02)', 'Read Freeze Frame (Mode 02)'), 'readfz', off()));
    if (f) {
      var b = '';
      if (!f.dtc) b = '<p>' + esc(f.status || T('Freeze Frame yoxdur', 'No Freeze Frame')) + '</p>';
      else {
        b = row('DTC', f.dtc);
        Object.keys(f.pids).forEach(function (id) {
          var p = window.PIDS[id];
          b += row(L() === 'en' ? p.en : p.az, f.pids[id].v.toFixed(p.fix) + ' ' + p.unit);
        });
        if (!Object.keys(f.pids).length) b += '<p class="sm">' + esc(T('Dəyərlər oxunmadı: ECU Freeze Frame PID-lərini vermədi.', 'No values read: the ECU returned no Freeze Frame PIDs.')) + '</p>';
      }
      h += card(b);
    }
    return h;
  };

  screens.vehicle = function () {
    var g = Store.get('garage', []), aid = Store.get('activeVehicle', null), v = null;
    g.forEach(function (x) { if (x.id === aid) v = x; });
    var dv = ctx.vin ? OBD.decodeVin(ctx.vin) : null;
    var h = title('Avtomobil məlumatı (Vehicle Information)', 'Vehicle Information') + needEcu() + stat() + Compat.note('vin', 'VIN (Mode 09)');
    h += card('<label>' + esc(T('Profil (siz daxil etmisiniz, ECU-dan deyil)', 'Profile (user entered, not from ECU)')) + '</label>' +
      (v ? row(T('Avtomobil', 'Vehicle'), [v.make, v.model, v.year].filter(Boolean).join(' ')) + row(T('Mühərrik', 'Engine'), v.engine || '—') : '<p>' + esc(T('Qarajda aktiv avtomobil yoxdur.', 'No active vehicle in Garage.')) + '</p>'));
    h += card('<label>' + esc(T('Adapter və ECU (oxunub)', 'Adapter and ECU (read)')) + '</label>' +
      row('ELM327', S.elmVersion || '—') + row(T('Protokol', 'Protocol'), S.protocol || '—') +
      row(T('Dəstəklənən PID', 'Supported PIDs'), S.supported.length ? String(S.supported.length) : '—') +
      row('VIN', ctx.vin || '—') +
      (dv ? row(T('Ölkə (təxmini)', 'Country (approx.)'), dv.region) + row(T('Model ili (təxmini)', 'Model year (approx.)'), dv.year) : '') +
      row(T('Kalibrasiya ID', 'Calibration ID'), ctx.cal || '—') +
      btn(T('VIN və kalibrasiya oxu (Mode 09)', 'Read VIN and calibration (Mode 09)'), 'readvin', off()) +
      '<p class="sm">' + esc(T('Bəzi avtomobillər Mode 09-u dəstəkləmir. Ölkə və il VIN-dən təxmini çıxarılır.', 'Some vehicles do not support Mode 09. Country and year are approximate, decoded from the VIN.')) + '</p>');
    return h;
  };

  function renderAI(r) {
    var h = card('<label>' + esc(T('Aşkarlanan simptom', 'Detected symptom')) + '</label>' + ul(r.symptoms) +
      '<label>' + esc(T('Aşkar edilmiş anormallıq', 'Detected anomalies')) + '</label>' + ul(r.anomalies.map(function (a) { return a.text; })));
    var hy = r.hyps.length ? r.hyps.map(function (x) {
      return '<div class="row"><span><b>' + esc(AIRules.name(x.key)) + '</b></span><span class="' + (x.level === 'Aşağı' ? 'sm' : 'no') + '">' + esc(x.level) + '</span></div>' + ul(x.ev);
    }).join('') : '<p class="sm">' + esc(T('Ölçülmüş məlumatda kifayət qədər əlamət yoxdur.', 'Not enough evidence in measured data.')) + '</p>';
    h += card('<label>' + esc(T('Ehtimal olunan nasazlıqlar (əsaslandırma ilə)', 'Probable faults (with reasoning)')) + '</label>' + hy +
      '<p class="sm">' + esc(T('Ehtimal səviyyəsi sadə qaydalara əsaslanır, statistik deyil.', 'Probability levels come from simple rules, not statistics.')) + '</p>');
    h += card('<label>' + esc(T('Çatışmayan məlumat', 'Missing data')) + '</label>' + ul(r.missing));
    h += card('<label>' + esc(T('Növbəti yoxlama addımı', 'Next check')) + '</label>' + ul(r.next) +
      '<label>' + esc(T('Təmir tövsiyəsi', 'Repair advice')) + '</label>' + ul(r.fix));
    h += card('<label>' + esc(T('Təhlükəsizlik xəbərdarlığı', 'Safety warning')) + '</label>' + ul(r.safety), 'warn');
    return h;
  }

  screens.diag = function () {
    var h = title('Ağıllı diaqnostika (Smart Diagnostics)', 'Smart Diagnostics');
    h += card('<p>' + esc(T('Təhlil son oxunmuş canlı məlumatlara və oxunmuş xəta kodlarına əsaslanır. Əvvəl Canlı bölməsində məlumat toplayın (2–3 dəqiqə).', 'Analysis uses the last live data and read fault codes. First collect data in Live (2–3 minutes).')) + '</p>' +
      btn(T('Təhlil et', 'Analyze'), 'ai', ''));
    if (lastAI) h += renderAI(lastAI);
    return h;
  };

  function monTick() {
    if (!OBD.polling) return;
    var r = AIRules.analyze(OBD.values, ctx.dtc);
    r.anomalies.forEach(function (a) {
      if (mon.seen[a.k]) return; mon.seen[a.k] = 1;
      Session.addEvent({ t: new Date().toISOString(), text: a.text });
    });
    r.hyps.forEach(function (h) {
      if (h.score < 2) return;
      var k = h.key + ':' + h.level; if (mon.seen[k]) return; mon.seen[k] = 1;
      Session.addEvent({ t: new Date().toISOString(), text: AIRules.name(h.key) + ' — ' + h.level });
    });
    if (cur() === 'monitor') rerender();
  }

  screens.monitor = function () {
    var ev = Session.events().slice(0, 20), ts = Session.tests();
    var h = title('AI canlı monitor (AI Live Monitor)', 'AI Live Monitor');
    h += card('<p>' + esc(T('Analiz lokal aparılır, internetə heç nə göndərilmir. Canlı oxuma işləməlidir.', 'Analysis runs locally, nothing is sent online. Live reading must be running.')) + '</p>' +
      '<label>' + esc(T('Analiz intervalı', 'Analysis interval')) + '</label>' +
      '<select id="mevery" data-ex="every">' + [5, 10, 30].map(function (n) { return '<option value="' + n + '"' + (mon.every === n ? ' selected' : '') + '>' + n + ' ' + T('san', 's') + '</option>'; }).join('') + '</select>' +
      row(T('Vəziyyət', 'Status'), mon.on ? T('işləyir', 'running') : T('dayanıb', 'stopped'), mon.on ? 'ok' : 'no') +
      row(T('Canlı oxuma', 'Live reading'), OBD.polling ? T('işləyir', 'running') : T('yoxdur', 'off'), OBD.polling ? 'ok' : 'no') +
      (mon.on ? btn(T('Dayandır', 'Stop'), 'mstop', '', 'del') : btn(T('Başlat', 'Start'), 'mstart', '')));
    h += card('<label>' + esc(T('Hadisələr', 'Events')) + '</label>' +
      (ev.length ? ev.map(function (e) { return '<div class="row"><span>' + esc(e.text) + '</span><span class="sm">' + esc(e.t.slice(11, 19)) + '</span></div>'; }).join('') : '<p class="sm">—</p>') +
      (ev.length ? btn(T('Hadisələri təmizlə', 'Clear events'), 'mclear', '', 'alt') : ''));
    h += card('<label>' + esc(T('Test nəticəsini saxla (əvvəl/sonra müqayisə üçün)', 'Save test result (for before/after comparison)')) + '</label>' +
      '<input id="tlabel" placeholder="' + esc(T('Məs. Soyuq start', 'e.g. Cold start')) + '">' +
      btn(T('Cari nəticəni saxla', 'Save current result'), 'tsave', '') +
      (ts.length >= 2 ? '<label>' + esc(T('Müqayisə', 'Compare')) + '</label>' +
        '<select id="cmpa">' + ts.map(function (t) { return '<option value="' + t.id + '">' + esc(t.label + ' ' + t.t.slice(5, 16).replace('T', ' ')) + '</option>'; }).join('') + '</select>' +
        '<select id="cmpb">' + ts.map(function (t, i) { return '<option value="' + t.id + '"' + (i === 1 ? ' selected' : '') + '>' + esc(t.label + ' ' + t.t.slice(5, 16).replace('T', ' ')) + '</option>'; }).join('') + '</select>' +
        btn(T('Müqayisə et (B − A orta)', 'Compare (B − A average)'), 'tcmp', '', 'alt') : '<p class="sm">' + esc(T('Müqayisə üçün ən azı 2 test saxlayın.', 'Save at least 2 tests to compare.')) + '</p>') +
      (cmpRes ? cmpRes.map(function (r) {
        var p = window.PIDS[r.id];
        return row((L() === 'en' ? p.en : p.az), r.a.toFixed(p.fix) + ' → ' + r.b.toFixed(p.fix) + ' (' + (r.d >= 0 ? '+' : '') + r.d.toFixed(p.fix) + ')');
      }).join('') : ''));
    return h;
  };

  screens.logging = function () {
    var h = title('Məlumat qeydi (Data Logging)', 'Data Logging') + stat();
    h += card('<p>' + esc(T('Qeyd 1 saniyədən bir nümunə yazır (ən çox 1500 nümunə). Telefonda ən çox 10 sessiya saxlanılır.', 'Recording writes one sample per second (max 1500 samples). Up to 10 sessions are kept on the phone.')) + '</p>' +
      row(T('Qeyd', 'Recording'), Session.isRec() ? T('gedir', 'running') : T('dayanıb', 'stopped'), Session.isRec() ? 'ok' : 'no') +
      row(T('Nümunə sayı', 'Samples'), String(Session.rowCount())) +
      (Session.isRec() ? btn(T('Qeydi dayandır', 'Stop recording'), 'rstop', '', 'del') : btn(T('Qeydi başlat (canlı oxuma işləməlidir)', 'Start recording (live reading must run)'), 'rstart', OBD.polling ? '' : 'disabled')) +
      (Session.rowCount() ? btn(T('CSV paylaş / kopyala', 'Share / copy CSV'), 'csvcur', '', 'alt') : ''));
    h += card('<label>' + esc(T('Qeydlər', 'Notes')) + '</label>' +
      '<input id="exnotes" value="' + esc(notesDraft) + '" placeholder="' + esc(T('Məs. soyuq start, boş gediş', 'e.g. cold start, idle')) + '">' +
      btn(T('Sessiyanı saxla', 'Save session'), 'ssave', '') +
      '<p class="sm">' + esc(T('Sessiyaya avtomobil profili, kodlar, Freeze Frame, canlı statistika və təhlil daxil olur. Hesabatlar bölməsindən açın.', 'The session includes vehicle profile, codes, Freeze Frame, live stats and analysis. Open it in Reports.')) + '</p>');
    return h;
  };

  function findSession(id) { var r = null; Session.sessions().forEach(function (x) { if (x.id === id) r = x; }); return r; }

  screens.reports = function () {
    var h = title('Hesabatlar (Reports)', 'Reports') + stat();
    if (repOpen) {
      var s = findSession(repOpen);
      if (!s) { repOpen = null; return screens.reports(); }
      rnDraft = rnDraft || s.notes || '';
      h += card('<pre class="log" style="max-height:none">' + esc(Session.reportText(s, L())) + '</pre>' +
        btn(T('Mətni paylaş', 'Share text'), 'rshare', 'data-id="' + s.id + '"') +
        btn(T('Mətni kopyala', 'Copy text'), 'rcopy', 'data-id="' + s.id + '"', 'alt') +
        (s.n ? btn(T('CSV paylaş / kopyala', 'Share / copy CSV'), 'rcsv', 'data-id="' + s.id + '"', 'alt') : '') +
        '<label>' + esc(T('Qeydləri dəyiş', 'Edit notes')) + '</label><input id="rnotes" value="' + esc(rnDraft) + '">' +
        btn(T('Qeydləri saxla', 'Save notes'), 'rnotes', 'data-id="' + s.id + '"', 'alt') +
        btn(T('Sil', 'Delete'), 'rdel', 'data-id="' + s.id + '"', 'del') +
        btn(T('Geri', 'Back'), 'rback', '', 'alt'));
      return h;
    }
    var l = Session.sessions();
    h += card('<p class="no">' + esc(T('PDF hesabat hələ yoxdur: Azərbaycan hərfləri (ə, ı, ş, ğ) üçün şrift quraşdırılmalıdır. Hələlik mətn hesabatı paylaşın.', 'PDF report is not available yet: it needs a font for Azerbaijani letters. For now share the text report.')) + '</p>');
    h += l.length ? l.map(function (s) {
      var v = s.vehicle;
      return card('<b>' + esc(s.t.replace('T', ' ').slice(0, 16)) + '</b><p>' + esc(v ? [v.make, v.model, v.year].filter(Boolean).join(' ') : '—') + '</p>' +
        btn(T('Aç', 'Open'), 'ropen', 'data-id="' + s.id + '"', 'alt'));
    }).join('') : card('<p>' + esc(T('Saxlanmış sessiya yoxdur. Məlumat qeydi bölməsindən sessiya saxlayın.', 'No saved sessions. Save one in Data Logging.')) + '</p>');
    return h;
  };

  function shareMsg(r) {
    if (r === 'copy') { msg = T('Mətn kopyalandı. İstənilən yerə yapışdırın.', 'Text copied. Paste it anywhere.'); }
    else if (r === 'fail') { errMsg = T('Paylaşmaq və kopyalamaq alınmadı.', 'Share and copy failed.'); }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-ex]');
    if (!el || el.tagName === 'SELECT') return;
    var a = el.getAttribute('data-ex'), id = el.getAttribute('data-id');
    msg = ''; errMsg = '';
    if (a === 'readall') run(T('Oxunur…', 'Reading…'), readAll);
    else if (a === 'clear') clearFlow();
    else if (a === 'look') {
      var q = document.getElementById('dtcq');
      if (q) { q.value = el.getAttribute('data-c'); q.dispatchEvent(new Event('input', { bubbles: true })); q.scrollIntoView(); }
    }
    else if (a === 'aiexp') { Store.set('ai_pending_code', el.getAttribute('data-c')); location.hash = '#aionline'; }
    else if (a === 'readfz') run(T('Freeze Frame oxunur…', 'Reading Freeze Frame…'), async function () { OBD.stopPoll(); ctx.freeze = await OBD.readFreeze(); });
    else if (a === 'readvin') run(T('VIN oxunur…', 'Reading VIN…'), async function () {
      OBD.stopPoll();
      var r = await OBD.readVehicleInfo(); ctx.vin = r.vin; ctx.cal = r.cal;
      if (!r.vin && !r.cal) throw new Error(T('ECU VIN və kalibrasiya vermədi (Mode 09 dəstəklənməyə bilər).', 'ECU returned no VIN or calibration (Mode 09 may be unsupported).'));
    });
    else if (a === 'ai') { lastAI = AIRules.analyze(OBD.values, ctx.dtc); rerender(); }
    else if (a === 'mstart') {
      mon.seen = {}; mon.on = true; clearInterval(mon.timer);
      mon.timer = setInterval(monTick, mon.every * 1000); rerender();
    }
    else if (a === 'mstop') { mon.on = false; clearInterval(mon.timer); rerender(); }
    else if (a === 'mclear') { Session.clearEvents(); rerender(); }
    else if (a === 'tsave') {
      var lb = document.getElementById('tlabel');
      if (!Object.keys(OBD.values).length) errMsg = T('Saxlamaq üçün canlı məlumat yoxdur.', 'No live data to save.');
      else { Session.saveTest(lb ? lb.value.trim() : ''); msg = T('Test nəticəsi saxlanıldı.', 'Test result saved.'); }
      rerender();
    }
    else if (a === 'tcmp') {
      cmpRes = Session.compare(document.getElementById('cmpa').value, document.getElementById('cmpb').value);
      if (!cmpRes.length) errMsg = T('Ortaq göstərici tapılmadı.', 'No common indicators.');
      rerender();
    }
    else if (a === 'rstart') { if (!Session.start()) errMsg = T('Əvvəl Canlı bölməsində oxumanı başladın.', 'Start live reading first.'); rerender(); }
    else if (a === 'rstop') { Session.stop(); rerender(); }
    else if (a === 'csvcur') Session.share(Session.currentCsv(), 'AC OBD CSV').then(function (r) { shareMsg(r); rerender(); });
    else if (a === 'ssave') {
      var r = Session.save(notesDraft);
      if (!r) errMsg = T('Saxlamaq alınmadı (yaddaş dolu ola bilər).', 'Save failed (storage may be full).');
      else { msg = T('Sessiya saxlanıldı. Hesabatlar bölməsindən açın.', 'Session saved. Open it in Reports.') + (r.rowsOk ? '' : T(' Qeyd sətirləri yaddaşa sığmadı.', ' Recorded rows did not fit in storage.')); }
      rerender();
    }
    else if (a === 'ropen') { repOpen = id; rnDraft = ''; rerender(); }
    else if (a === 'rback') { repOpen = null; rnDraft = ''; rerender(); }
    else if (a === 'rdel') { if (confirm(T('Bu sessiya silinsin?', 'Delete this session?'))) { Session.del(id); repOpen = null; rerender(); } }
    else if (a === 'rnotes') { Session.updateNotes(id, rnDraft); msg = T('Qeydlər saxlanıldı.', 'Notes saved.'); rerender(); }
    else if (a === 'rshare') { var s1 = findSession(id); Session.share(Session.reportText(s1, L()), 'AC OBD').then(function (r) { shareMsg(r); rerender(); }); }
    else if (a === 'rcopy') { var s2 = findSession(id); msg = Session.copy(Session.reportText(s2, L())) ? T('Kopyalandı.', 'Copied.') : ''; if (!msg) errMsg = T('Kopyalama alınmadı.', 'Copy failed.'); rerender(); }
    else if (a === 'rcsv') { var s3 = findSession(id); Session.share(Session.csv(s3.cols, Session.rowsOf(id)), 'AC OBD CSV').then(function (r) { shareMsg(r); rerender(); }); }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'mevery') {
      mon.every = parseInt(e.target.value, 10) || 10;
      if (mon.on) { clearInterval(mon.timer); mon.timer = setInterval(monTick, mon.every * 1000); }
    }
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'exnotes') notesDraft = e.target.value;
    if (e.target.id === 'rnotes') rnDraft = e.target.value;
  });

  function apply() {
    var c = cur();
    if (screens[c]) { msg = ''; errMsg = ''; view.innerHTML = screens[c](); }
  }
  window.addEventListener('hashchange', apply);
  apply();
})();
