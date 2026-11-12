window.DTCLang = (function () {
  var lang = Store.get('dtc_lang', 'az'), subs = [], st = {};
  function key(l) { return 'DTC_TR_' + l; }
  function tr() { return window[key(lang)] || null; }
  function refresh() {
    subs.forEach(function (f) { try { f(); } catch (e) {} });
    try { window.dispatchEvent(new Event('hashchange')); } catch (e) {}
  }
  function load(l, cb) {
    if (l === 'en' || window[key(l)]) { if (cb) cb(true); return; }
    if (st[l] === 'loading') return;
    st[l] = 'loading';
    var s = document.createElement('script');
    s.src = 'data/dtc-' + l + '.js';
    s.onload = function () { st[l] = 'ok'; if (cb) cb(true); };
    s.onerror = function () { st[l] = 'none'; if (cb) cb(false); };
    document.head.appendChild(s);
  }
  function set(l) {
    lang = l;
    Store.set('dtc_lang', l);
    if (l === 'en' || window[key(l)]) refresh(); else load(l, refresh);
  }
  load(lang, function () { if (lang !== 'en') refresh(); });
  return {
    get: function () { return lang; },
    set: set,
    tr: tr,
    count: function (l) { var t = window[key(l || lang)]; return t ? Object.keys(t).length : 0; },
    on: function (f) { subs.push(f); }
  };
})();
