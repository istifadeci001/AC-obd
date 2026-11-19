(function () {
  'use strict';
  var view = document.getElementById('view'), S = OBD.S;
  var screens = {}, busy = '', msg = '', err = '', out = {};
  var cp = { name: '', unit: '', pid: '', formula: '' };
  var ai = { code: '', stats: false, persist: false, key: '' };
  var ITEMS = [
    ['compat', 'Dəstək yoxlaması (Compatibility)'],
    ['readiness', 'Hazırlıq testləri (Readiness)'],
    ['mode06', 'Mode 06 (xam)'],
    ['custompid', 'Fərdi PID (Custom PID)'],
    ['aionline', 'AI izah, internet (AI Explain)'],
    ['backup', 'Ehtiyat nüsxə (Backup)']
  ];
  var ST = {
    ok: ['✔ İşləyir', 'ok'], part: ['◐ Qismən', 'no'], no: ['✖ Dəstəklənmir', 'bad'], unk: ['? Yoxlanmayıb', 'sm'],
    todo: ['⏳ Hələ yazılmayıb', 'no'], never: ['⛔ Planlaşdırılmır', 'bad'], na: ['— Bu protokolda yoxdur', 'sm']
  };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cur() { return (location.hash || '#dashboard').slice(1); }
  function card(i, c) { return '<div class="card' + (c ? ' ' + c : '') + '">' + i + '</div>'; }
  function row(k, v, c) { return '<div class="row"><span class="k">' + esc(k) + '</span><span class="' + (c || '') + '">' + esc(v) + '</span></div>'; }
  function btn(l, a, x, c) { return '<button class="btn' + (c ? ' ' + c : '') + '" data-tl="' + a + '" ' + (x || '') + '>' + esc(l) + '</button>'; }
  function h2(t) { return '<h2>' + esc(t) + '</h2>'; }
  function hex(n) { return ('0' + n.toString(16)).slice(-2).toUpperCase(); }
  function bytes(h) {
    var o = [];
    for (var i = 0; i + 1 < h.length; i += 2) { var n = parseInt(h.substr(i, 2), 16); if (isNaN(n)) break; o.push(n); }
    return o;
  }
  function need() {
    return S.state === 'ecu' ? '' : card('<p>Real ECU-ya qoşulmamısınız. Əvvəl «Qoşul» bölməsində adapteri qoşun. Heç bir saxta dəyər göstərilmir.</p>', 'warn');
  }
  function stat() {
    return (busy ? card('<p class="no">' + esc(busy) + '</p>') : '') + (err ? card('<p class="bad">' + esc(err) + '</p>') : '') + (msg ? card('<p class="ok">' + esc(msg) + '</p>') : '');
  }
  function dis() { return (S.state !== 'ecu' || busy) ? 'disabled' : ''; }
  function rerender() { var c = cur(); if (screens[c]) view.innerHTML = screens[c](); }
  async function go(label, fn) {
    if (busy) return;
    err = ''; msg = ''; busy = label; rerender();
    try { await fn(); } catch (e) { Log.add('ERR', label + ': ' + e.message); err = e.message; }
    busy = ''; rerender();
  }
  function toast(t, good) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:90px;z-index:60;padding:10px;border-radius:8px;font-size:13px;color:#fff;background:' + (good ? '#14532d' : '#5a1111');
    d.textContent = t;
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 6000);
  }
  function activeVehicle() {
    var g = Store.get('garage', []), id = Store.get('activeVehicle', null), v = null;
    g.forEach(function (x) { if (x.id === id) v = x; });
    return v;
  }

  /* ---------- Fərdi PID ---------- */
  function register(p) {
    if (window.PIDS[p.pid] && !window.PIDS[p.pid].custom) return false;
    var f;
    try { f = Formula.compile(p.formula); } catch (e) { return false; }
    window.PIDS[p.pid] = { az: p.name, en: p.name, unit: p.unit, fix: 2, custom: true, dec: function (b) { return { v: f(b) }; } };
    return true;
  }
  Store.get('custompids', []).forEach(register);
  function cpCheck() {
    var pid = cp.pid.trim().toUpperCase();
    if (!/^[0-9A-F]{2}$/.test(pid)) throw new Error('PID iki hərfli hex olmalıdır (məs. 5A).');
    if (!cp.name.trim()) throw new Error('Ad boşdur.');
    return { pid: pid, f: Formula.compile(cp.formula) };
  }

  /* ---------- Ekranlar ---------- */
  screens.compat = function () {
    var h = h2('Dəstək yoxlaması (Compatibility)');
    h += card('<p>Avtomobilə qoşulanda proqram yalnız oxuma sorğuları ilə hansı funksiyanın bu avtomobildə işlədiyini yoxlayır. Silmə əmri göndərilmir.</p>' +
      btn('Yenidən yoxla', 'crun', (S.state === 'ecu' && !Compat.busy()) ? '' : 'disabled') +
      (Compat.busy() ? '<p class="no">Yoxlanılır…</p>' : ''));
    h += card(Compat.list().map(function (x) {
      var s = ST[x.st];
      return '<div class="row"><span>' + esc(x.name) + (x.d ? '<br><span class="sm">' + esc(x.d) + '</span>' : '') + '</span><span class="' + s[1] + '">' + esc(s[0]) + '</span></div>';
    }).join(''));
    return h;
  };

  screens.readiness = function () {
    var h = h2('Hazırlıq testləri (Readiness Monitor)') + need() + stat() + card(btn('Oxu (Mode 01, PID 01)', 'rdy', dis()));
    var r = out.rdy;
    if (r) {
      h += card(row('Check Engine lampası (MIL)', r.mil ? 'YANIR' : 'sönüb', r.mil ? 'bad' : 'ok') +
        row('ECU-da saxlanmış kod sayı', String(r.count)) +
        (r.diesel ? '<p class="sm">Dizel avtomobil: yalnız davamlı monitorlar göstərilir.</p>' : '') +
        r.items.map(function (x) {
          return row(x.name, !x.sup ? 'dəstəklənmir' : (x.done ? '✔ tamamlanıb' : '⏳ tamamlanmayıb'), !x.sup ? 'sm' : (x.done ? 'ok' : 'no'));
        }).join(''));
      h += card('<p class="sm">Kodları sildikdən və ya akkumulyatoru ayırdıqdan sonra testlər «tamamlanmayıb» olur. Tamamlanması üçün avtomobil müxtəlif rejimlərdə sürülməlidir (sürüş dövrü). Bu, texniki baxışa hazırlıq üçün məlumatdır.</p>');
    }
    return h;
  };

  function m6txt(t) {
    var f = window.Mode06 && Mode06.fmt ? Mode06.fmt(t) : { cls: 'sm', limitText: 'müqayisə edilmir', status: 'UNKNOWN', raw: (t && t.rawHex) || '—' };
    var fl = t && t.flags && t.flags.length ? ' · ' + t.flags.join(', ') : '';
    return '<span class="' + f.cls + '">' + esc(f.limitText) + ' · ' + esc(f.status) + esc(fl) + '</span><br><span class="sm">xam: ' + esc(f.raw) + '</span>';
  }
  screens.mode06 = function () {
    var h = h2('Mode 06 (On-board Monitoring, xam nəticələr)') + need() + stat();
    h += card('<p>Mode 06 monitor testlərinin xam nəticələrini göstərir. <b>Miqyas və test adları tətbiq olunmayıb</b>: dəyər və hədlər xam ədədlərdir, ✔/✖ yalnız dəyərin hədlər arasında olub-olmamasını göstərir. Nəticəni usta ilə birlikdə qiymətləndirin.</p>' + btn('Oxu (ən çox 12 MID)', 'm06', dis()));
    var r = out.m06;
    if (r) {
      h += card('<p class="sm">' + esc(r.length + ' MID oxundu') + '</p>' + r.map(function (m) {
        return '<div class="gl"><b>MID ' + hex(m.mid) + '</b>' + (m.raw && m.raw.length ? '<div class="sm">RAW: ' + m.raw.map(esc).join(' | ') + '</div>' : '') + (m.notes && m.notes.length ? '<div class="sm">' + m.notes.map(esc).join('; ') + '</div>' : '') + (m.tests.length ? m.tests.map(function (t) {
          return '<div class="sm">TID ' + hex(t.tid) + ' · UASID ' + hex(t.unit) + ' · dəyər ' + t.v + ' (' + t.mn + '…' + t.mx + ') ' + m6txt(t) + '</div>';
        }).join('') : '<div class="sm">nəticə yoxdur</div>') + '</div>';
      }).join(''));
    }
    return h;
  };

  screens.custompid = function () {
    var l = Store.get('custompids', []);
    var h = h2('Fərdi PID (Custom PID)') + need() + stat();
    h += card('<p>Yalnız <b>Mode 01 oxuma</b>. Düstur: A, B, C… (cavab baytları), + − × ÷ və mötərizə. Məs. mühərrik dövrü: <code>(A*256+B)/4</code>. Düstur təhlükəsiz hesablayıcı ilə icra olunur.</p>' +
      '<input id="cpn" placeholder="Ad" value="' + esc(cp.name) + '">' +
      '<input id="cpu" placeholder="Vahid (məs. °C)" value="' + esc(cp.unit) + '">' +
      '<input id="cpp" placeholder="PID (hex, məs. 5A)" value="' + esc(cp.pid) + '" autocapitalize="characters">' +
      '<input id="cpf" placeholder="Düstur (məs. A-40)" value="' + esc(cp.formula) + '">' +
      btn('Bir dəfə oxu və yoxla', 'cptest', dis(), 'alt') + btn('Saxla', 'cpsave', '') +
      (out.cp ? '<p class="ok">' + esc(out.cp) + '</p>' : ''));
    h += l.length ? card('<label>Saxlanmış fərdi PID-lər</label>' + l.map(function (p, i) {
      return '<div class="row"><span>' + esc(p.name) + '<br><span class="sm">PID ' + esc(p.pid) + ' · ' + esc(p.formula) + ' · ' + esc(p.unit) + '</span></span>' +
        '<button class="btn del" style="width:auto;margin:0" data-tl="cpdel" data-i="' + i + '">Sil</button></div>';
    }).join('') + '<p class="sm">Canlı bölməsində PID seçimində görünür (ECU bu PID-i dəstəklədikdə).</p>') : '';
    return h;
  };

  screens.backup = function () {
    var d = Store.dump(function (k) { return k === 'acobd:ai_key'; });
    var kb = (JSON.stringify(d).length / 1024).toFixed(1);
    return h2('Ehtiyat nüsxə (Backup)') + stat() +
      card('<p>Qaraj, arxiv, sessiyalar, ehtiyat kodlar və ayarlar yalnız bu telefonda saxlanılır. Tətbiqi silsəniz itir. Mütəmadi ehtiyat nüsxə alın.</p>' +
        row('Saxlanmış yazı sayı', String(Object.keys(d).length)) + row('Təxmini ölçü', kb + ' KB') +
        btn('Ehtiyat nüsxəni paylaş / kopyala', 'bkexp', '') +
        '<p class="sm">Paylaşma menyusu açılır: Telegram, e-poçt və ya qeydlərə göndərə bilərsiniz. API açarı daxil edilmir.</p>') +
      card('<label>Bərpa: ehtiyat nüsxənin mətnini bura yapışdırın</label>' +
        '<textarea id="bkin" style="width:100%;min-height:90px;background:#0e141b;color:#e6edf3;border:1px solid #243040;border-radius:8px;padding:8px;font-size:12px"></textarea>' +
        btn('Bərpa et', 'bkimp', '', 'alt'));
  };

  screens.aionline = function () {
    var pend = Store.get('ai_pending_code', '');
    if (pend) { ai.code = pend; Store.set('ai_pending_code', ''); }
    var prov = Store.get('ai_provider', 'anthropic'), allow = Store.get('ai_allow', false);
    var h = h2('AI izah, internet (AI Explain)') + stat();
    h += card('<p class="no">Bu funksiya xəta kodunu və (seçsəniz) avtomobil məlumatını internetdəki AI xidmətinə göndərir. Söndürülmüşdür, yalnız sizin icazənizlə işləyir. Hər sorğu provayderə görə pulludur, qiymətini provayderdən yoxlayın. AI cavabı təxmini olur və səhv ola bilər, qəti diaqnoz deyil.</p>' +
      '<label class="chk"><input type="checkbox" id="aiallow"' + (allow ? ' checked' : '') + '>İnternetə göndərməyə icazə verirəm</label>' +
      '<label>Provayder</label><select id="aiprov"><option value="anthropic"' + (prov === 'anthropic' ? ' selected' : '') + '>Anthropic (Claude)</option><option value="openai"' + (prov === 'openai' ? ' selected' : '') + '>OpenAI uyğun (chat/completions)</option></select>' +
      '<label>Model adı (provayderin sənədindən götürün)</label><input id="aimodel" value="' + esc(Store.get('ai_model', '')) + '" placeholder="model adı">' +
      (prov === 'openai' ? '<label>Ünvan (endpoint)</label><input id="aiep" value="' + esc(Store.get('ai_endpoint', 'https://api.openai.com/v1/chat/completions')) + '">' : '') +
      '<label>API açarı ' + (AIOnline.hasKey() ? '(daxil edilib' + (AIOnline.persisted() ? ', telefonda saxlanıb' : ', yalnız bu sessiya') + ')' : '(daxil edilməyib)') + '</label>' +
      '<input id="aikey" type="password" autocomplete="off" placeholder="açar" value="' + esc(ai.key) + '">' +
      '<label class="chk"><input type="checkbox" id="aipers"' + (ai.persist ? ' checked' : '') + '>Açarı bu telefonda saxla (şifrələnmir, tətbiq yaddaşında düz mətn)</label>' +
      btn('Açarı tətbiq et', 'aiapply', '', 'alt') + btn('Açarı sil', 'aiclear', '', 'del'));
    h += card('<label>Xəta kodu</label><input id="aicode" value="' + esc(ai.code) + '" placeholder="P0420" autocapitalize="characters">' +
      '<label class="chk"><input type="checkbox" id="aistats"' + (ai.stats ? ' checked' : '') + '>Canlı göstəricilərin ortalamasını da göndər</label>' +
      '<p class="sm">Avtomobil markası, modeli, ili və mühərriki (Qaraj) göndərilir. VIN göndərilmir. Göndərməzdən əvvəl dəqiq mətn göstərilir.</p>' +
      btn('Göndəriləcək mətni göstər və göndər', 'aiask', ''));
    if (out.ai) h += card('<label>AI cavabı (təxmini)</label><pre class="log" style="max-height:none;white-space:pre-wrap">' + esc(out.ai) + '</pre><p class="sm">Bu AI təxminidir, qəti diaqnoz deyil. Detalı yalnız ölçmə ilə təsdiqləndikdən sonra dəyişin.</p>');
    return h;
  };

  function statsLine() {
    var ids = ['0C', '05', '04', '06', '07'], o = [];
    ids.forEach(function (id) {
      var r = OBD.values[id], p = window.PIDS[id];
      if (r && r.hist && r.hist.length && p) {
        o.push(p.en + ' ' + (r.hist.reduce(function (s, x) { return s + x; }, 0) / r.hist.length).toFixed(1) + ' ' + p.unit);
      }
    });
    return o.join(', ');
  }

  /* ---------- Hadisələr ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-tl]');
    if (!el) return;
    var a = el.getAttribute('data-tl');
    msg = ''; err = '';
    if (a === 'crun') { Compat.run(); }
    else if (a === 'rdy') go('Oxunur…', async function () {
      var r = await OBD.readReadiness();
      if (!r) throw new Error('ECU hazırlıq məlumatı vermədi.');
      out.rdy = r;
    });
    else if (a === 'm06') go('Mode 06 oxunur…', async function () {
      OBD.stopPoll();
      var list = await OBD.mode06List();
      if (!list.length) throw new Error('Bu avtomobil Mode 06 MID siyahısı vermədi.');
      var n = Math.min(list.length, 12), res = [];
      for (var i = 0; i < n; i++) {
        busy = 'Mode 06 oxunur: MID ' + hex(list[i]) + ' (' + (i + 1) + '/' + n + ')'; rerender();
        res.push(await OBD.mode06Read(list[i]));
      }
      out.m06 = res;
    });
    else if (a === 'cptest') go('Oxunur…', async function () {
      var c = cpCheck();
      var r = await OBD.raw('01' + c.pid, 3000);
      var x = r.msgs.filter(function (m) { return m.indexOf('41' + c.pid) === 0; })[0];
      if (!x) throw new Error('ECU bu PID-ə cavab vermədi (' + (r.txt.join(' ') || 'cavab yoxdur') + ').');
      var b = bytes(x.slice(4));
      out.cp = 'Xam baytlar: ' + b.map(hex).join(' ') + ' → nəticə: ' + c.f(b).toFixed(3) + ' ' + cp.unit;
    });
    else if (a === 'cpsave') {
      try {
        var c = cpCheck(), l = Store.get('custompids', []);
        var item = { name: cp.name.trim(), unit: cp.unit.trim(), pid: c.pid, formula: cp.formula.trim() };
        if (!register(item)) throw new Error('Bu PID daxili siyahıdadır və ya düstur səhvdir.');
        l = l.filter(function (p) { return p.pid !== c.pid; });
        l.push(item);
        if (!Store.set('custompids', l)) throw new Error('Yaddaşa yazılmadı.');
        msg = 'Saxlanıldı.';
      } catch (x) { err = x.message; }
      rerender();
    }
    else if (a === 'cpdel') {
      var l2 = Store.get('custompids', []), i = parseInt(el.getAttribute('data-i'), 10), d = l2[i];
      if (d) { l2.splice(i, 1); Store.set('custompids', l2); if (window.PIDS[d.pid] && window.PIDS[d.pid].custom) delete window.PIDS[d.pid]; }
      rerender();
    }
    else if (a === 'bkexp') {
      var data = { app: 'acobd', v: 1, t: new Date().toISOString(), data: Store.dump(function (k) { return k === 'acobd:ai_key'; }) };
      Session.share(JSON.stringify(data), 'AC OBD ehtiyat nüsxə').then(function (r) {
        if (r === 'copy') msg = 'Ehtiyat nüsxə kopyalandı. İstədiyiniz yerə yapışdırıb saxlayın.';
        else if (r === 'fail') err = 'Paylaşmaq və kopyalamaq alınmadı.';
        rerender();
      });
    }
    else if (a === 'bkimp') {
      try {
        var t = document.getElementById('bkin').value.trim();
        var o = JSON.parse(t);
        if (!o || o.app !== 'acobd' || !o.data) throw new Error('Bu AC OBD ehtiyat nüsxəsi deyil.');
        // AI ayarları (ünvan, icazə, açar) bərpa edilmir: kənar mətn açarı başqa ünvana yönləndirməsin
        var cleanData = {};
        Object.keys(o.data).forEach(function (k) { if (!/^acobd:ai_/.test(k)) cleanData[k] = o.data[k]; });
        var n = Object.keys(cleanData).length;
        if (!confirm(n + ' yazı bərpa ediləcək, eyni adlı məlumat üzərinə yazılacaq (AI ayarları istisna). Davam edək?')) return;
        var ok = Store.load(cleanData);
        msg = ok + ' yazı bərpa olundu. Tətbiq yenilənir…';
        rerender();
        setTimeout(function () { location.reload(); }, 900);
      } catch (x) { err = 'Bərpa alınmadı: ' + x.message; rerender(); }
    }
    else if (a === 'aiapply') {
      if (!ai.key.trim()) { err = 'Açar boşdur.'; rerender(); return; }
      AIOnline.setKey(ai.key.trim(), ai.persist);
      ai.key = '';
      msg = 'Açar tətbiq olundu' + (ai.persist ? ' və telefonda saxlandı.' : ' (yalnız bu sessiya üçün).');
      rerender();
    }
    else if (a === 'aiclear') { AIOnline.clearKey(); ai.key = ''; msg = 'Açar silindi.'; rerender(); }
    else if (a === 'aiask') go('AI-yə sorğu göndərilir…', async function () {
      var code = ai.code.trim().toUpperCase();
      if (!/^[PBCU][0-3][0-9A-F]{3}$/.test(code)) throw new Error('Kod formatı düzgün deyil (məs. P0420).');
      var v = activeVehicle(), e2 = window.DTC_DB[code];
      var p = AIOnline.buildPrompt({
        code: code,
        vehicle: v ? [v.make, v.model, v.year, v.engine].filter(Boolean).join(' ') : '',
        local: e2 && !e2.family ? e2.az : '',
        stats: ai.stats ? statsLine() : ''
      });
      if (!confirm('Bu mətn internetə göndəriləcək:\nÜnvan: ' + AIOnline.target() + '\n\n' + p + '\n\nDavam edək?')) throw new Error('Göndərmə ləğv edildi.');
      out.ai = await AIOnline.ask(p);
    });
  });
  document.addEventListener('input', function (e) {
    var id = e.target.id, v = e.target.value;
    if (id === 'cpn') cp.name = v; else if (id === 'cpu') cp.unit = v; else if (id === 'cpp') cp.pid = v; else if (id === 'cpf') cp.formula = v;
    else if (id === 'aicode') ai.code = v; else if (id === 'aikey') ai.key = v;
    else if (id === 'aimodel') Store.set('ai_model', v.trim()); else if (id === 'aiep') Store.set('ai_endpoint', v.trim());
  });
  document.addEventListener('change', function (e) {
    var id = e.target.id;
    if (id === 'aiallow') Store.set('ai_allow', e.target.checked);
    else if (id === 'aiprov') { Store.set('ai_provider', e.target.value); rerender(); }
    else if (id === 'aistats') ai.stats = e.target.checked;
    else if (id === 'aipers') ai.persist = e.target.checked;
  });
  window.addEventListener('acobd-store-fail', function (e) {
    toast('Yaddaş dolub və ya yazıla bilmir (' + (e.detail || '') + '). Ehtiyat nüsxə alın və köhnə sessiyaları silin.');
  });
  Compat.on(function () {
    if (!Compat.busy() && Compat.has()) {
      var s = Compat.summary();
      toast('Dəstək yoxlaması bitdi: ' + s.ok + ' işləyir, ' + s.no + ' dəstəklənmir. «Dəstək yoxlaması» bölməsinə baxın.', s.no === 0);
    }
    if (cur() === 'compat') rerender();
  });

  /* ---------- Menyu və naviqasiya ---------- */
  function addDrawer() {
    var dl = document.getElementById('drawerlist');
    if (!dl) return;
    ITEMS.forEach(function (it) {
      if (!dl.querySelector('a[href="#' + it[0] + '"]')) {
        var a = document.createElement('a');
        a.href = '#' + it[0];
        a.textContent = it[1];
        dl.appendChild(a);
      }
    });
  }
  function apply() {
    var c = cur();
    if (screens[c]) { msg = ''; err = ''; view.innerHTML = screens[c](); window.scrollTo(0, 0); }
    addDrawer();
  }
  var dl0 = document.getElementById('drawerlist');
  if (dl0) new MutationObserver(addDrawer).observe(dl0, { childList: true });
  window.addEventListener('hashchange', apply);
  addDrawer();
  apply();
})();


// ===== Avto-jurnal ekranları: "Canlı göstərici" və "Canlı diaqnostika" (AutoLog mühərriki session.js-dədir) =====
(function () {
  'use strict';
  var view = document.getElementById('view');
  if (!view || !window.AutoLog) return;
  var ITEMS = [['autolive', 'Canlı göstərici (tam avto-jurnal)'], ['autodiag', 'Canlı diaqnostika (avto-jurnal)']];
  var screens = {}, msg = '', prev = false;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cur() { return (location.hash || '#dashboard').slice(1); }
  function p2(n) { return ('0' + n).slice(-2); }
  function mmss(ms) { var s = Math.max(0, Math.round(ms / 1000)); return p2(Math.floor(s / 60)) + ':' + p2(s % 60); }
  function sess() { return AutoLog.session() || AutoLog.restore(); }
  function row(k, v, c) { return '<div class="row"><span class="k">' + esc(k) + '</span><span class="' + (c || '') + '">' + esc(v) + '</span></div>'; }
  function btn(l, a, c) { return '<button class="btn' + (c ? ' ' + c : '') + '" data-al="' + a + '">' + esc(l) + '</button>'; }
  function PN(id) { var p = window.PIDS && PIDS[id]; return id === 'RV' ? 'Adapter gərginliyi' : (p ? (p.az || p.en) : id); }
  function PU(id) { var p = window.PIDS && PIDS[id]; return id === 'RV' ? 'V' : (p && p.unit ? p.unit : ''); }
  function FV(id, v) { var p = window.PIDS && PIDS[id], d = p && p.fix !== undefined ? p.fix : 2; return v === null || v === undefined ? '—' : Number(v).toFixed(d); }
  var SC = { REAL: 'ok', STALE: 'no', UNSUPPORTED: 'sm', INVALID: 'bad', UNKNOWN: 'sm' };

  function head(s, kind) {
    var h = '<div class="card"><h2>' + esc(kind === 'diag' ? 'Canlı diaqnostika (avto-jurnal)' : 'Canlı göstərici (tam avto-jurnal)') + '</h2>' +
      '<p class="sm">Adapter qoşulan kimi avtomatik başlayır: bütün PID-lər, kodlar, hazırlıq, freeze frame, Mode 06 və adapter məlumatı yazılır. Hesabatı kopyalayıb Claude, Gemini və ya ChatGPT-yə yapışdırın.</p>' +
      btn('📋 Hamısını kopyala', 'copy') + btn('⬇️ TXT yüklə', 'dl', 'alt') + btn('👁 Önbaxış', 'prev', 'alt') +
      (s && s.on ? btn('■ Dayandır', 'stop', 'alt') : (s ? btn('▶ Davam et', 'resume', 'alt') : '')) + btn('↻ Yenidən başlat', 'restart', 'alt') + btn('🎯 Sorğunu avto-jurnala qaytar', 'take', 'alt') +
      btn('Avto-başlat: ' + (AutoLog.auto() ? 'AÇIQ' : 'BAĞLI'), 'auto', 'alt') +
      '<p class="sm" id="al-msg">' + esc(msg) + '</p></div>' + (prev ? '<div class="card"><pre id="al-pre" style="white-space:pre-wrap;font-size:11px;max-height:60vh;overflow:auto"></pre></div>' : '');
    return h;
  }
  function dyn(kind) {
    var s = sess(), S = OBD.S, now = Date.now();
    if (!s) return '<div class="card"><p>Jurnal hələ yoxdur. Adapter ECU-ya qoşulanda avtomatik başlayacaq' + (AutoLog.auto() ? '' : ' (avto-başlat bağlıdır: "Yenidən başlat" basın)') + '.</p>' + row('Vəziyyət', S.state) + '</div>';
    var end = s.t1 || now, h = '<div class="card">' + row('Vəziyyət', s.on ? '● yazılır' : '■ dayandırılıb' + (s.restored ? ' (əvvəlki sessiya)' : ''), s.on ? 'ok' : 'no') +
      row('Müddət', mmss(end - s.t0)) + row('Nümunə sayı', String(s.ev.length)) + row('Oxunan PID sayı', String(Object.keys(s.cnt).length) + ' / ' + (s.supported.length || '—')) +
      row('Adapter', (S.deviceName || '—') + ' | ' + (S.elmVersion || '—')) + row('Protokol', S.protocol || '—') + row('Əlaqə', S.state) + '</div>';
    if (kind === 'full') {
      var ids = s.supported.slice(); Object.keys(s.cnt).forEach(function (i) { if (ids.indexOf(i) < 0) ids.push(i); });
      h += '<div class="card"><h2>Bütün PID-lər (a-dan z-yə)</h2>';
      ids.filter(function (i) { return parseInt(i, 16) % 32 !== 0 || isNaN(parseInt(i, 16)); }).sort().forEach(function (id) {
        var st = AutoLog.status(s, id, s.on ? now : end), c = s.cnt[id];
        h += '<div class="row"><span class="k">' + esc(id + ' ' + PN(id)) + '</span><span class="' + SC[st.st] + '">' + (c ? esc(FV(id, c.last) + ' ' + PU(id) + ' ') : '') + '[' + st.st + ']' + (st.why ? ' <span class="sm">' + esc(st.why) + '</span>' : '') + (c ? ' <span class="sm">n=' + c.n + '</span>' : '') + '</span></div>';
      });
      h += '</div>';
    } else {
      var an = AutoLog.analyze(s);
      h += '<div class="card"><h2>Fazalar</h2>';
      if (!an.phases.length) h += '<p class="sm">Məlumat yoxdur.</p>';
      an.phases.forEach(function (ph, i) {
        var st = ph.st, bits = [];
        function a(id, lab, how) { var x = st[id]; if (x) bits.push(lab + ' ' + FV(id, how === 'range' ? x.min : x.sum / x.n) + (how === 'range' ? '…' + FV(id, x.max) : '') + ' ' + PU(id)); }
        a('0C', 'RPM orta', 'avg'); a('0D', 'sürət maks', 'range'); a('05', 'ECT', 'range'); a('06', 'STFT', 'avg'); a('07', 'LTFT', 'avg'); a('34', 'O2 B1S1', 'range'); a('15', 'O2 B1S2', 'range'); a('42', 'gərginlik', 'avg');
        h += '<p><b>' + (i + 1) + '. ' + esc(ph.name) + '</b><br><span class="sm">' + mmss(ph.a * 1000) + ' → ' + mmss(ph.b * 1000) + ' (' + mmss((ph.b - ph.a) * 1000) + ')</span><br><span class="sm">' + esc(bits.join(' | ') || 'bu fazada göstərilən PID oxunmayıb') + '</span></p>';
      });
      h += '</div><div class="card"><h2>Əsas hadisələr</h2>';
      var evs = AutoLog.events(s, an).slice(-40);
      h += evs.length ? '<ul>' + evs.map(function (e) { return '<li><span class="sm">' + mmss(e.ms) + '</span> ' + esc(e.s) + '</li>'; }).join('') + '</ul>' : '<p class="sm">—</p>';
      h += '</div><div class="card"><h2>Xəta kodları</h2>' + (window.DtcStatus && s.snap.dtc && !s.snap.dtc.error ? '<ul>' + DtcStatus.lines(s.snap.dtc).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '<p class="sm">Hələ oxunmayıb.</p>') + '</div>';
    }
    return h;
  }
  function paint(kind) { var e = document.getElementById('al-dyn'); if (e) e.innerHTML = dyn(kind); if (prev) fillPrev(kind); }
  function fillPrev(kind) { var s = sess(), p = document.getElementById('al-pre'); if (p) p.textContent = s ? AutoLog.build(s, kind, { raw: false }) : 'Jurnal yoxdur.'; }
  screens.autolive = function () { return head(sess(), 'full') + '<div id="al-dyn">' + dyn('full') + '</div>'; };
  screens.autodiag = function () { return head(sess(), 'diag') + '<div id="al-dyn">' + dyn('diag') + '</div>'; };

  function copyTxt(t, ok) {
    function fb() { var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); var r = false; try { r = document.execCommand('copy'); } catch (e) {} document.body.removeChild(a); ok(r); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { ok(true); }, fb); else fb();
  }
  function dlTxt(t, kind) {
    var d = new Date(), name = 'AC-OBD-' + (kind === 'diag' ? 'diaqnostika' : 'jurnal') + '-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes()) + '.txt';
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  function say(t) { msg = t; var e = document.getElementById('al-msg'); if (e) e.textContent = t; }
  function rerender() { var c = cur(); if (screens[c]) view.innerHTML = screens[c](); if (prev) fillPrev(c === 'autodiag' ? 'diag' : 'full'); }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-al]'); if (!el) return;
    var a = el.getAttribute('data-al'), kind = cur() === 'autodiag' ? 'diag' : 'full', s = sess();
    if (a === 'copy' || a === 'dl') {
      if (!s) { say('Jurnal yoxdur.'); return; }
      try {
        if (a === 'copy') copyTxt(AutoLog.build(s, 'full', { raw: true }), function (ok) { say(ok ? 'Bütün jurnal, xam nümunələr daxil olmaqla kopyalandı. ChatGPT-yə yapışdıra bilərsiniz.' : 'Kopyalanmadı: TXT yüklə düyməsindən istifadə edin.'); });
        else { dlTxt(AutoLog.build(s, kind, { raw: true }), kind); say('Yükləmə başladı (xam nümunələrlə birlikdə). İşləməsə "Kopyala" istifadə edin.'); }
      } catch (x) { say('Alınmadı: ' + x.message); }
    } else if (a === 'prev') { prev = !prev; rerender(); }
    else if (a === 'stop') {
      AutoLog.stop(); say('Jurnal dayandırıldı. TXT ACOBD qovluğunda saxlanılır…'); rerender();
      AutoLog.exportStopped().then(function (r) {
        if (r.ok) say('Tam jurnal saxlanıldı: ' + r.location + '/' + r.name);
        else { dlTxt(r.text, 'full'); say('Tam jurnal ACOBD qovluğuna yazıla bilmədi; TXT yükləməsi başladıldı.'); }
        rerender();
      }).catch(function (x) { try { var ss = AutoLog.session(); if (ss) dlTxt(AutoLog.build(ss, 'full', { raw: true }), 'full'); say('ACOBD qovluğuna yazılmadı (' + x.message + '); TXT yükləməsi başladıldı.'); } catch (y) { say('TXT saxlanmadı: ' + x.message); } rerender(); });
    }
    else if (a === 'resume') { AutoLog.resume(); say('Jurnal davam edir.'); rerender(); }
    else if (a === 'restart') { AutoLog.clear(); if (OBD.S.state === 'ecu') AutoLog.start(true); say('Yeni jurnal başladı.'); rerender(); }
    else if (a === 'take') { AutoLog.takeOver(); say('Avto-jurnal sorğu siyahısını geri aldı.'); }
    else if (a === 'auto') { AutoLog.setAuto(!AutoLog.auto()); say('Avto-başlat ' + (AutoLog.auto() ? 'açıldı' : 'bağlandı') + '.'); rerender(); }
  });
  setInterval(function () { var c = cur(); if (screens[c]) paint(c === 'autodiag' ? 'diag' : 'full'); }, 2000);

  function addDrawer() {
    var dl = document.getElementById('drawerlist'); if (!dl) return;
    ITEMS.forEach(function (it) { if (!dl.querySelector('a[href="#' + it[0] + '"]')) { var a = document.createElement('a'); a.href = '#' + it[0]; a.textContent = it[1]; dl.appendChild(a); } });
  }
  function apply() { var c = cur(); if (screens[c]) { msg = ''; prev = false; AutoLog.takeOver(); rerender(); window.scrollTo(0, 0); } addDrawer(); }
  var dl0 = document.getElementById('drawerlist'); if (dl0) new MutationObserver(addDrawer).observe(dl0, { childList: true });
  window.addEventListener('hashchange', apply); addDrawer(); apply();
})();
