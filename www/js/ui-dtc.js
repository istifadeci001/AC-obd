(function () {
  'use strict';
  var view = document.getElementById('view');
  var err = '', busy = '', showSrc = false;
  var IDX = { az: 0, ru: 1, en: 2 };
  var BTN = { az: 'ƏTRAFLI ARAŞDIR', ru: 'ПОДРОБНЕЕ', en: 'DETAILS' };
  var LB = {
    back: ['← Geri', '← Назад', '← Back'],
    code: ['Xəta kodu', 'Код неисправности', 'Fault code'],
    nosel: ['Kod seçilməyib. «Xəta kodları» bölməsində koda baxın.', 'Код не выбран. Откройте раздел «Коды неисправностей».', 'No code selected. Open the Fault Codes section.'],
    lang: ['Açıqlama dili', 'Язык описания', 'Description language'],
    trinfo: ['Tərcümə olunmuş kod sayı', 'Переведено кодов', 'Translated codes'],
    notr: ['Tərcümə bazası yüklənməyib: tərcümə işi hələ işlədilməyib və ya APK yenilənməyib. İngiliscə göstərilir.', 'База переводов не загружена: перевод ещё не выполнен или APK не обновлён. Показан английский текст.', 'Translation data not loaded: the translation job has not been run or the APK is not updated. English is shown.'],
    sys: ['Sistem', 'Система', 'System'],
    type: ['Növ', 'Тип', 'Type'],
    sysP: ['Powertrain (mühərrik və transmissiya)', 'Powertrain (двигатель и трансмиссия)', 'Powertrain (engine and transmission)'],
    sysB: ['Body (kuzov)', 'Body (кузов)', 'Body'],
    sysC: ['Chassis (şassi)', 'Chassis (шасси)', 'Chassis'],
    sysU: ['Network (şəbəkə, rabitə)', 'Network (сеть, связь)', 'Network (communication)'],
    gen: ['Generic (SAE ümumi kod)', 'Generic (общий код SAE)', 'Generic (SAE common code)'],
    mfr: ['Manufacturer-specific (istehsalçıya xas)', 'Manufacturer-specific (код производителя)', 'Manufacturer-specific'],
    mil: ['Check Engine (MIL)', 'Check Engine (MIL)', 'Check Engine (MIL)'],
    emis: ['Emissiya ilə əlaqəli', 'Связан с выбросами', 'Emissions related'],
    drive: ['Sürüş dövrü lazımdır', 'Нужен цикл езды', 'Drive cycle needed'],
    limp: ['Təcili rejim', 'Аварийный режим', 'Limp mode'],
    yes: ['bəli', 'да', 'yes'], no: ['xeyr', 'нет', 'no'],
    may: ['yana bilər', 'может загореться', 'may light'], none: ['yox', 'нет', 'no'],
    possible: ['mümkündür', 'возможен', 'possible'], nonote: ['qeyd yoxdur', 'нет данных', 'no note'],
    desc: ['Ətraflı izah', 'Подробное описание', 'Detailed description'],
    descen: [' (ingiliscə, mənbədən)', ' (на английском, из источника)', ' (from source)'],
    trai: ['Tərcümə (AI, yoxlanmamış)', 'Перевод (ИИ, не проверен)', 'Translation (AI, unverified)'],
    btntr: ['Tərcümə et (AI)', 'Перевести (ИИ)', 'Translate (AI)'],
    causes: ['Mümkün səbəblər', 'Возможные причины', 'Possible causes'],
    symptoms: ['Əlamətlər', 'Симптомы', 'Symptoms'],
    parts: ['Yoxlanmalı hissələr', 'Что проверить', 'Parts to check'],
    seq: ['Diaqnostika ardıcıllığı (ümumi)', 'Порядок диагностики (общий)', 'Diagnostic sequence (general)'],
    seq1: ['Freeze Frame-i oxuyun, kodun yarandığı şərtləri (RPM, temperatur, yük) qeyd edin', 'Считайте Freeze Frame, запишите условия появления кода (обороты, температура, нагрузка)', 'Read Freeze Frame and note the conditions (RPM, temperature, load)'],
    seq2: ['Əlaqəli kodlarla birlikdə qiymətləndirin', 'Оцените вместе со связанными кодами', 'Evaluate together with related codes'],
    seq3: ['Səbəbləri ehtimal sırası ilə yoxlayın, hər birini ölçmə ilə təsdiqləyin', 'Проверяйте причины по вероятности, каждую подтверждайте измерением', 'Check causes in order of likelihood and confirm each by measurement'],
    seq4: ['Təmirdən sonra kodları silin və yenidən yoxlayın (sürüş dövrü lazım ola bilər)', 'После ремонта сотрите коды и проверьте снова (может потребоваться цикл езды)', 'After repair clear the codes and recheck (a drive cycle may be needed)'],
    repair: ['Təmir variantları', 'Варианты ремонта', 'Repair options'],
    diff: ['Mürəkkəblik (mənbə)', 'Сложность (источник)', 'Difficulty (source)'],
    diy: ['Özün etmək (mənbə)', 'Самостоятельно (источник)', 'Do it yourself (source)'],
    diyno: ['tövsiyə olunmur və ya bilinmir', 'не рекомендуется или неизвестно', 'not advised or unknown'],
    norepair: ['Bu kod üçün təmir məlumatı yoxdur.', 'Нет данных о ремонте для этого кода.', 'No repair data for this code.'],
    repnote: ['Hissəni yalnız ölçmə ilə təsdiqləndikdən sonra dəyişin.', 'Меняйте деталь только после подтверждения измерением.', 'Replace a part only after confirming by measurement.'],
    danger: ['Təhlükə səviyyəsi (təxmini, bizim qayda)', 'Уровень опасности (оценка, наше правило)', 'Danger level (approximate, our rule)'],
    level: ['Səviyyə', 'Уровень', 'Level'],
    dgH: ['Yüksək', 'Высокий', 'High'], dgM: ['Orta', 'Средний', 'Medium'], dgL: ['Aşağı', 'Низкий', 'Low'],
    nmis: ['Yanma buraxma katalizatora zərər verə bilər. Check Engine yanıb-sönürsə avtomobili sürməyin.', 'Пропуски зажигания могут повредить катализатор. Если Check Engine мигает, не езжайте.', 'Misfire can damage the catalyst. If Check Engine flashes, do not drive.'],
    nhot: ['Mühərrikin qızması: davam etdirmək ciddi zərər verə bilər.', 'Перегрев двигателя: продолжение движения может нанести серьёзный ущерб.', 'Engine overheating: continuing may cause serious damage.'],
    nlimp: ['Mənbə məlumatına görə təcili (limp) rejim mümkündür.', 'По данным источника возможен аварийный (limp) режим.', 'The source says limp mode is possible.'],
    nmil: ['Check Engine yana bilər, emissiya təsiri ola bilər.', 'Может загореться Check Engine, возможно влияние на выбросы.', 'Check Engine may light, emissions may be affected.'],
    nlow: ['Mənbə məlumatında təhlükə qeydi yoxdur.', 'В данных источника нет отметок об опасности.', 'The source has no danger note.'],
    related: ['Əlaqəli kodlar', 'Связанные коды', 'Related codes'],
    srcsec: ['Mənbə və etibarlılıq', 'Источник и достоверность', 'Source and reliability'],
    stfam: ['Bazada bu kod yoxdur: yalnız ailə üzrə ümumi izah (yoxlanmış deyil).', 'Кода нет в базе: только общее описание семейства (не проверено).', 'Code not in database: general family description only (unverified).'],
    stbig: ['Mənbə: obdex (CC0). Bizim tərəfdən yoxlanmayıb.', 'Источник: obdex (CC0). Нами не проверено.', 'Source: obdex (CC0). Not verified by us.'],
    sttr: ['AZ/RU açıqlama maşın tərcüməsidir (AI), yoxlanmayıb.', 'Описание AZ/RU — машинный перевод (ИИ), не проверен.', 'AZ/RU text is machine translation (AI), unverified.'],
    stown: ['Ad bizim əl ilə yazılmış bazadan, yoxlanmamışdır.', 'Название из нашей базы, написанной вручную, не проверено.', 'Name from our hand-written database, unverified.'],
    rev: ['Mənbədə yoxlanma tarixi', 'Дата проверки в источнике', 'Reviewed date in source'],
    extnote: ['Aşağıdakı xarici axtarışlar proqramın öz bazasından deyil, internetdəndir.', 'Внешний поиск ниже — из интернета, не из базы приложения.', 'The external searches below come from the internet, not from the app database.'],
    bai: ['AI ilə təhlil et', 'Анализ с помощью ИИ', 'Analyze with AI'],
    bg: ['Google-da axtar', 'Искать в Google', 'Search on Google'],
    by: ['YouTube-da axtar', 'Искать на YouTube', 'Search on YouTube'],
    bsrc: ['Rəsmi mənbələr', 'Официальные источники', 'Official sources'],
    srcinfo: ['Mənbə məlumatında göstərilən istinad:', 'Ссылка из данных источника:', 'Reference from the source data:'],
    srcopen: ['Mənbəni aç', 'Открыть источник', 'Open source'],
    srcnone: ['Bu kod üçün istinad yoxdur.', 'Для этого кода нет ссылки.', 'No reference for this code.'],
    srcnote: ['İstehsalçının servis sənədləri (məsələn Kia) adətən abunə tələb edir. Proqram təxmini keçid vermir. Rəsmi dilerdən və ya istehsalçının texniki portalından alın.', 'Сервисная документация производителя (например Kia) обычно требует подписки. Приложение не даёт предположительных ссылок. Получите её у дилера или на техническом портале производителя.', 'Manufacturer service documents (e.g. Kia) usually need a subscription. The app gives no guessed links. Get them from the dealer or the manufacturer technical portal.'],
    translating: ['Tərcümə edilir…', 'Идёт перевод…', 'Translating…'],
    csend: ['Bu mətn internetə göndəriləcək:', 'Этот текст будет отправлен в интернет:', 'This text will be sent online:'],
    cq: ['Davam edək?', 'Продолжить?', 'Continue?'],
    aihint: [' («AI izah» bölməsində icazə, açar və model adını daxil edin.)', ' (в разделе «AI-пояснение» укажите разрешение, ключ и модель.)', ' (set permission, key and model in the AI Explain section.)']
  };
  function lg() { return window.DTCLang ? DTCLang.get() : 'az'; }
  function t(k) { var a = LB[k]; return a ? a[IDX[lg()]] : k; }
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
  function sysOf(c) { return t(c[0] === 'P' ? 'sysP' : (c[0] === 'B' ? 'sysB' : (c[0] === 'C' ? 'sysC' : 'sysU'))); }
  function genOf(c) { return t((c[1] === '0' || (c[0] === 'P' && c[1] === '2')) ? 'gen' : 'mfr'); }
  function danger(e, c) {
    var f = e.flags || [0, 0, 0, 0];
    if (/^P03(0\d|16)$/.test(c)) return ['dgH', 'nmis'];
    if (c === 'P0217') return ['dgH', 'nhot'];
    if (f[3]) return ['dgH', 'nlimp'];
    if (f[0] || f[1]) return ['dgM', 'nmil'];
    return ['dgL', 'nlow'];
  }
  function trKey(c) { return 'dtc_tr:' + lg() + ':' + c; }

  function render() {
    var c = code(), L = lg();
    if (!/^[PBCU][0-3][0-9A-F]{3}$/.test(c)) {
      view.innerHTML = '<h2>' + esc(t('code')) + '</h2>' + card('<p>' + esc(t('nosel')) + '</p>');
      return;
    }
    var e = window.DTC_DB[c], v = veh(), cached = Store.get(trKey(c), ''), dg = danger(e, c), f = e.flags;
    var q = encodeURIComponent(c + (v ? ' ' + v : ''));
    var seq = [t('seq1'), t('seq2')].concat(e.check || [], [t('seq3'), t('seq4')]);
    var status = e.family ? t('stfam') : (e.big ? t('stbig') + (e.translated ? ' ' + t('sttr') : '') + (e.own && L === 'az' ? ' ' + t('stown') : '') : t('stown'));
    var name = L === 'en' ? e.en : e.az;
    var chips = ['az', 'ru', 'en'].map(function (l) {
      return '<button class="btn' + (L === l ? '' : ' alt') + '" data-dc="lang" data-l="' + l + '" style="display:inline-block;width:auto;margin:0 8px 8px 0;padding:9px 18px">' + l.toUpperCase() + '</button>';
    }).join('');
    var h = btn(t('back'), 'back', 'alt') + '<h2>' + esc(c) + '</h2>';
    h += card('<label>' + esc(t('lang')) + '</label>' + chips +
      (L !== 'en' ? '<p class="sm">' + esc(t('trinfo')) + ': ' + DTCLang.count() + '</p>' + (DTCLang.count() ? '' : '<p class="no">' + esc(t('notr')) + '</p>') : ''));
    if (busy) h += card('<p class="no">' + esc(busy) + '</p>');
    if (err) h += card('<p class="bad">' + esc(err) + '</p>');
    h += card('<b>' + esc(name) + '</b>' + (L !== 'en' && e.en && e.en !== name ? '<p class="sm">' + esc(e.en) + '</p>' : '') +
      row(t('sys'), sysOf(c)) + row(t('type'), genOf(c)) +
      (f ? row(t('mil'), f[0] ? t('may') : t('none')) + row(t('emis'), f[1] ? t('yes') : t('no')) + row(t('drive'), f[2] ? t('yes') : t('no')) + row(t('limp'), f[3] ? t('possible') : t('nonote')) : ''));
    if (e.desc) {
      var inLang = e.translated || L === 'en';
      h += card('<label>' + esc(t('desc') + (inLang ? '' : t('descen'))) + '</label><p>' + esc(e.desc) + '</p>' +
        (!inLang ? (cached ? '<label>' + esc(t('trai')) + '</label><p>' + esc(cached) + '</p>' : btn(t('btntr'), 'tr', 'alt')) : ''));
    }
    h += card('<label>' + esc(t('causes')) + '</label>' + ul(e.causes) + '<label>' + esc(t('symptoms')) + '</label>' + ul(e.symptoms) + '<label>' + esc(t('parts')) + '</label>' + ul(e.sensors));
    h += card('<label>' + esc(t('seq')) + '</label><ol>' + seq.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>');
    h += card('<label>' + esc(t('repair')) + '</label>' + (e.diff ? row(t('diff'), e.diff[0] || '—') + row(t('diy'), e.diff[1] ? t('possible') : t('diyno')) : '<p class="sm">' + esc(t('norepair')) + '</p>') +
      '<p class="sm">' + esc(t('repnote')) + '</p>');
    h += card('<label>' + esc(t('danger')) + '</label>' + row(t('level'), t(dg[0]), dg[0] === 'dgH' ? 'bad' : (dg[0] === 'dgM' ? 'no' : 'ok')) + '<p class="sm">' + esc(t(dg[1])) + '</p>',
      dg[0] === 'dgH' ? 'warn' : '');
    if (e.related && e.related.length) h += card('<label>' + esc(t('related')) + '</label>' + e.related.map(function (r) {
      return '<button class="btn alt" style="width:auto;display:inline-block;margin:4px 4px 0 0;padding:8px 12px" data-dc="open" data-c="' + esc(r) + '">' + esc(r) + '</button>';
    }).join(''));
    h += card('<label>' + esc(t('srcsec')) + '</label><p>' + esc(status) + '</p>' + (e.rev ? row(t('rev'), e.rev) : '') + '<p class="sm">' + esc(t('extnote')) + '</p>');
    h += card(btn(t('bai'), 'ai') +
      link(t('bg'), 'https://www.google.com/search?q=' + q + '+causes+diagnosis') +
      link(t('by'), 'https://www.youtube.com/results?search_query=' + q + '+diagnosis+repair') +
      btn(t('bsrc'), 'src', 'alt') +
      (showSrc ? (e.src ? '<p class="sm">' + esc(t('srcinfo')) + '</p>' + link(t('srcopen'), e.src) : '<p class="sm">' + esc(t('srcnone')) + '</p>') +
        '<p class="sm">' + esc(t('srcnote')) + '</p>' : ''));
    view.innerHTML = h;
  }

  async function translate(c) {
    var L = lg(), e = window.DTC_DB[c];
    var p = 'Translate the following automotive diagnostic trouble code text from English to ' + (L === 'ru' ? 'Russian' : 'Azerbaijani') + '. Reply with the translation only.\nCode: ' + c + '\nTitle: ' + e.en + (e.desc ? '\nDescription: ' + e.desc : '');
    if (!confirm(t('csend') + '\n\n' + p + '\n\n' + t('cq'))) return;
    busy = t('translating'); err = ''; render();
    try { Store.set(trKey(c), await AIOnline.ask(p)); }
    catch (x) { err = x.message + t('aihint'); }
    busy = ''; render();
  }

  document.addEventListener('click', function (e) {
    var l = e.target.closest('[data-ex="look"]');
    if (l) {
      e.stopImmediatePropagation(); e.preventDefault();
      Store.set('dtc_open', l.getAttribute('data-c')); showSrc = false; location.hash = '#dtcinfo';
    }
  }, true);
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-dc]');
    if (!el) return;
    var a = el.getAttribute('data-dc'), c = code();
    err = '';
    if (a === 'back') { if (window.AppNav) AppNav.back(); else history.back(); }
    else if (a === 'lang') { DTCLang.set(el.getAttribute('data-l')); if (cur() === 'dtcinfo') render(); }
    else if (a === 'ai') { Store.set('ai_pending_code', c); location.hash = '#aionline'; }
    else if (a === 'src') { showSrc = !showSrc; render(); }
    else if (a === 'open') { Store.set('dtc_open', el.getAttribute('data-c')); showSrc = false; render(); window.scrollTo(0, 0); }
    else if (a === 'tr') translate(c);
  });
  new MutationObserver(function () {
    view.querySelectorAll('[data-ex="look"]').forEach(function (b) { b.textContent = BTN[lg()]; });
  }).observe(view, { childList: true });
  window.addEventListener('hashchange', function () {
    if (cur() === 'dtcinfo') { showSrc = false; err = ''; render(); window.scrollTo(0, 0); }
  });
  if (cur() === 'dtcinfo') render();
})();
