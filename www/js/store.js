window.Store = (function () {
  var PREFIX = 'acobd:';
  function get(key, def) {
    try {
      var v = localStorage.getItem(PREFIX + key);
      return v === null ? def : JSON.parse(v);
    } catch (e) { return def; }
  }
  function set(key, val) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(val)); return true; }
    catch (e) {
      try { window.dispatchEvent(new CustomEvent('acobd-store-fail', { detail: key })); } catch (x) {}
      return false;
    }
  }
  function keys() {
    var o = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) o.push(k);
      }
    } catch (e) {}
    return o;
  }
  function clearAll() { keys().forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} }); }
  function dump(skip) {
    var o = {};
    keys().forEach(function (k) {
      if (!skip || !skip(k)) { try { o[k] = localStorage.getItem(k); } catch (e) {} }
    });
    return o;
  }
  function load(obj) {
    var n = 0;
    Object.keys(obj).forEach(function (k) {
      if (k.indexOf(PREFIX) === 0 && typeof obj[k] === 'string') {
        try { localStorage.setItem(k, obj[k]); n++; } catch (e) {}
      }
    });
    return n;
  }
  return { get: get, set: set, clearAll: clearAll, dump: dump, load: load, keys: keys };
})();
