(function () {
  'use strict';
  var view = document.getElementById('view');
  var msg = '', err = '', busy = '', showSrc = false;
  var DIF = { easy: 'asan', medium: 'orta', hard: 'çətin' };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cur() { return (location.hash || '#dashboard').slice(1); }
  function card(i, c) { return '<div class="card' + (c ? ' ' + c : '') + '">' + i + '</div>'; }
  function row(k, v, c) { return '<div class="row"><span class="k">' + esc(k) + '</span><span class="' + (c || '') + '">' + esc(v) + '</span></div>'; }
  function btn(l, a, c) { return '<button class="btn' + (c ? ' ' + c : '') + '" data-dc="' + a + '">' + esc(l) + '</button>'; }
  function link(l, href) {
    return '<a class="btn alt" style="display:block;text-align:center;text-decoration:none;margin:4px 0 10px;padding:13px;border-radius:14px" href="' + esc(href) + '" rel="noopener">' + esc(l) + '</a>';
  }
  function ul(a) { return a && a.length ? '<ul>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="sm">—</p>'; }
  function code() { return String(Store.get('dtc_open', '')).toUpperCase(); }
  function veh() {
    var g = Store.get('garage', []), id = Store.get('activeVehicle', null), v = null;
    g.forEach(function (x) { if (x.id === id) v = x; });
    return v ? [v.make, v.model, v.year].filter(Boolean).join(' ') : '';
  }
  function sysOf(c) { return c[0] === 'P' ? 'Powertrain (mühərrik və transmissiya)' : (c[0] === 'B' ? 'Body (kuzov)' : (c[0] === 'C' ? 'Chassis (şassi)' : 'Network (şəbəkə, rabitə)')); }
  function genOf(c) { return (c[1] === '0' || (c[0] === 'P' && c[1] === '2')) ? 'Generic (SAE ümumi kod)' : 'Manufacturer-specific (istehsalçıya xas)'; }
  function danger(e, c) {
    var f = e.flags || [0, 0, 0, 0];
    if (/^P03(0\d|16)$/.test(c)) return ['Yüksək', 'Yanma buraxma katalizatora zərər verə bilər. Check Engine yanıb-sönürsə avtomobili sürməyin.'];
    if (c === 'P0217') return ['Yüksək', 'Mühərrikin qızması: davam etdirmək ciddi zərər verə bilər.'];
    if (f[3]) return ['Yüksək', 'Mənbə məlumatına görə təcili (limp) rejim mümkündür.'];
    if (f[0] || f[1]) return ['Orta', 'Check Engine yana bilər, emissiya təsiri ola bilər.'];
    return ['Aşağı', 'Mənbə məlumatında təhlükə qeydi yoxdur.'];
  }

  function render() {
    var c = code();
    if (!/^[PBCU][0-3][0-9A-F]{3}$/.test(c)) {
      view.innerHTML = '<h2>Xəta kodu</h2>' + card('<p>Kod seçilməyib. «Xəta kodları» bölməsində koda baxın.</p>');
      return;
    }
    var e = window.DTC_DB[c], v = veh(), az = Store.get('dtc_az:' + c, ''), dg = danger(e, c), f = e.flags;
    var q = encodeURIComponent(c + (v ? ' ' + v : ''));
    var seq = ['Freeze Frame-i oxuyun, kodun yarandığı şərtləri (RPM, temperatur, yük) qeyd edin', 'Əlaqəli kodlarla birlikdə qiymətləndirin']
      .concat(e.check || [], ['Səbəbləri ehtimal sırası ilə yoxlayın, hər birini ölçmə ilə təsdiqləyin', 'Təmirdən sonra kodları silin və yenidən yoxlayın (sürüş dövrü lazım ola bilər)']);
    var status = e.family ? 'Bazada bu kod yoxdur: yalnız ailə üzrə ümumi izah (yoxlanmış deyil)'
      : (e.big ? (e.translated ? 'Ad bizim bazadan (yoxlanmamış), əlavə məlumat obdex-dən (CC0)' : 'Mənbə: obdex (CC0). Bizim tərəfdən yoxlanmayıb, Azərbaycan tərcüməsi yoxdur') : 'Bizim bazadan (yoxlanmamış)');
    var h = btn('← Geri', 'back', 'alt') + '<h2>' + esc(c) + '</h2>';
    if (busy) h += card('<p class="no">' + esc(busy) + '</p>');
    if (err) h += card('<p class="bad">' + esc(err) + '</p>');
    h += card('<b>' + esc(e.az) + '</b>' + (e.en && e.az !== e.en ? '<p class="sm">' + esc(e.en) + '</p>' : '') +
      row('Sistem', sysOf(c)) + row('Növ', genOf(c)) +
      (f ? row('Check Engine (MIL)', f[0] ? 'yana bilər' : 'yox') + row('Emissiya ilə əlaqəli', f[1] ? 'bəli' : 'xeyr') + row('Sürüş dövrü lazımdır', f[2] ? 'bəli' : 'xeyr') + row('Təcili rejim', f[3] ? 'mümkündür' : 'qeyd yoxdur') : ''));
    if (e.desc) h += card('<label>Ətraflı izah (ingiliscə, mənbədən)</label><p>' + esc(e.desc) + '</p>' +
      (az ? '<label>Azərbaycanca tərcümə (AI, yoxlanmamış)</label><p>' + esc(az) + '</p>' : btn('Azərbaycanca tərcümə et (AI)', 'tr', 'alt')));
    h += card('<label>Mümkün səbəblər</label>' + ul(e.causes) + '<label>Əlamətlər</label>' + ul(e.symptoms) + '<label>Yoxlanmalı hissələr</label>' + ul(e.sensors));
    h += card('<label>Diaqnostika ardıcıllığı (ümumi)</label><ol>' + seq.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>');
    h += card('<label>Təmir variantları</label>' + (e.diff ? row('Mürəkkəblik (mənbə)', DIF[e.diff[0]] || e.diff[0] || '—') + row('Özün etmək (mənbə)', e.diff[1] ? 'mümkündür' : 'tövsiyə olunmur və ya bilinmir') : '<p class="sm">Bu kod üçün təmir məlumatı yoxdur.</p>') +
      '<p class="sm">Hissəni yalnız ölçmə ilə təsdiqləndikdən sonra dəyişin.</p>');
    h += card('<label>Təhlükə səviyyəsi (təxmini, bizim qayda)</label>' + row('Səviyyə', dg[0], dg[0] === 'Yüksək' ? 'bad' : (dg[0] === 'Orta' ? 'no' : 'ok')) + '<p class="sm">' + esc(dg[1]) + '</p>',
      dg[0] === 'Yüksək' ? 'warn' : '');
    if (e.related && e.related.length) h += card('<label>Əlaqəli kodlar</label>' + e.related.map(function (r) {
      return '<button class="btn alt" style="width:auto;display:inline-block;margin:4px 4px 0 0;padding:8px 12px" data-dc="open" data-c="' + esc(r) + '">' + esc(r) + '</button>';
    }).join(''));
    h += card('<label>Mənbə və etibarlılıq</label><p>' + esc(status) + '</p>' + (e.rev ? row('Mənbədə yoxlanma tarixi', e.rev) : '') +
      '<p class="sm">Aşağıdakı xarici axtarışlar proqramın öz bazasından deyil, internetdəndir.</p>');
    h += card(btn('AI ilə təhlil et', 'ai') +
      link('Google-da axtar', 'https://www.google.com/search?q=' + q + '+causes+diagnosis') +
      link('YouTube-da axtar', 'https://www.youtube.com/results?search_query=' + q + '+diagnosis+repair') +
      btn('Rəsmi mənbələr', 'src', 'alt') +
      (showSrc ? (e.src ? '<p class="sm">Mənbə məlumatında göstərilən istinad:</p>' + link('Mənbəni aç', e.src) : '<p class="sm">Bu kod üçün istinad yoxdur.</p>') +
        '<p class="sm">İstehsalçının servis sənədləri (məsələn Kia) adətən abunə tələb edir. Proqram təxmini keçid vermir. Rəsmi dilerdən və ya istehsalçının texniki portalından alın.</p>' : ''));
    view.innerHTML = h;
  }

  async function translate(c) {
    var e = window.DTC_DB[c];
    var p = 'Aşağıdakı ingiliscə avtomobil xəta kodu mətnini Azərbaycan dilinə dəqiq tərcümə et. Yalnız tərcüməni yaz.\nKod: ' + c + '\nAd: ' + e.en + (e.desc ? '\nTəsvir: ' + e.desc : '');
    if (!confirm('Bu mətn internetə göndəriləcək:\n\n' + p + '\n\nDavam edək?')) return;
    busy = 'Tərcümə edilir…'; err = ''; render();
    try { Store.set('dtc_az:' + c, await AIOnline.ask(p)); }
    catch (x) { err = x.message + ' («AI izah» bölməsində icazə, açar və model adını daxil edin.)'; }
    busy = ''; render();
  }

  document.addEventListener('click', function (e) {
    var l = e.target.closest('[data-ex="look"]');
    if (l) {
      e.stopImmediatePropagation(); e.preventDefault();
      Store.set('dtc_open', l.getAttribute('data-c')); showSrc = false; location.hash = '#dtcinfo';
      return;
    }
  }, true);
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-dc]');
    if (!el) return;
    var a = el.getAttribute('data-dc'), c = code();
    err = '';
    if (a === 'back') history.back();
    else if (a === 'ai') { Store.set('ai_pending_code', c); location.hash = '#aionline'; }
    else if (a === 'src') { showSrc = !showSrc; render(); }
    else if (a === 'open') { Store.set('dtc_open', el.getAttribute('data-c')); showSrc = false; render(); window.scrollTo(0, 0); }
    else if (a === 'tr') translate(c);
  });
  new MutationObserver(function () {
    view.querySelectorAll('[data-ex="look"]').forEach(function (b) { b.textContent = 'ƏTRAFLI ARAŞDIR'; });
  }).observe(view, { childList: true });
  window.addEventListener('hashchange', function () {
    if (cur() === 'dtcinfo') { showSrc = false; msg = ''; err = ''; render(); window.scrollTo(0, 0); }
  });
  if (cur() === 'dtcinfo') render();
})();
