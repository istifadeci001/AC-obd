(function () {
  'use strict';
  var view = document.getElementById('view');
  function cur() { return (location.hash || '#dashboard').slice(1); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function srcText(c) {
    var b = window.DTC_BIG && window.DTC_BIG[c];
    if (!b) return '';
    var o = [c + ': ' + b.t, '', b.d];
    if (b.c.length) { o.push('', 'Possible causes:'); b.c.forEach(function (x) { o.push('- ' + x[0]); }); }
    if (b.s.length) { o.push('', 'Symptoms:'); b.s.forEach(function (x) { o.push('- ' + x); }); }
    return o.join('\n');
  }
  function code() { return String(Store.get('dtc_open', '')).toUpperCase(); }
  function patch() {
    var c = cur();
    if (c === 'dtcinfo') {
      var lg = window.DTCLang ? DTCLang.get() : 'az', k = code();
      if (lg === 'en' || view.querySelector('[data-gt]')) return;
      var txt = srcText(k), first = view.querySelector('.card');
      if (!txt || !first) return;
      var url = 'https://translate.google.com/?sl=en&tl=' + lg + '&op=translate&text=' + encodeURIComponent(txt);
      var d = document.createElement('div');
      d.className = 'card';
      d.setAttribute('data-gt', '1');
      d.innerHTML = '<label>' + (lg === 'ru' ? 'Перевести весь текст этого кода' : 'Bu kod haqqında bütün mətni tərcümə et') + '</label>' +
        '<a class="btn" style="display:block;text-align:center;text-decoration:none;margin:4px 0 10px;padding:14px;border-radius:14px" href="' + esc(url) + '" rel="noopener">🌐 Google Translate (' + lg.toUpperCase() + ')</a>' +
        '<button class="btn alt" data-gt-copy="1">' + (lg === 'ru' ? 'Скопировать текст' : 'Mətni kopyala') + '</button>' +
        '<p class="sm">' + (lg === 'ru' ? 'Текст этого кода отправляется в Google. Это машинный перевод, он не проверен.' : 'Yalnız bu kodun təsviri Google-a göndərilir. Maşın tərcüməsidir, yoxlanmamışdır.') + '</p>';
      first.parentNode.insertBefore(d, first.nextSibling);
    } else if (c === 'dtc') {
      var res = view.querySelector('#dtcres'), q = view.querySelector('#dtcq');
      if (!res || !q || res.querySelector('[data-gd]')) return;
      var v = String(q.value || '').trim().toUpperCase();
      if (!/^[PBCU][0-3][0-9A-F]{3}$/.test(v) || !res.firstChild) return;
      var b = document.createElement('button');
      b.className = 'btn';
      b.setAttribute('data-gd', v);
      b.textContent = (window.DTCLang && DTCLang.get() === 'ru') ? 'ПОДРОБНЕЕ' : 'ƏTRAFLI ARAŞDIR';
      res.appendChild(b);
    }
  }
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-gd]');
    if (g) { Store.set('dtc_open', g.getAttribute('data-gd')); location.hash = '#dtcinfo'; return; }
    if (e.target.closest('[data-gt-copy]')) {
      var t = srcText(code());
      if (t) { var ok = Session.copy(t); e.target.closest('[data-gt-copy]').textContent = ok ? '✔' : '✖'; }
    }
  });
  new MutationObserver(patch).observe(view, { childList: true, subtree: true });
  window.addEventListener('hashchange', function () { setTimeout(patch, 50); });
})();
