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
    catch (e) { return false; }
  }
  function clearAll() {
    try {
      var del = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) del.push(k);
      }
      del.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) {}
  }
  return { get: get, set: set, clearAll: clearAll };
})();
