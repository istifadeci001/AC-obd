window.Log = (function () {
  var lines = [], subs = [];
  function add(kind, msg) {
    var d = new Date();
    var ts = d.toTimeString().slice(0, 8) + '.' + ('00' + d.getMilliseconds()).slice(-3);
    lines.push(ts + ' ' + kind + ' ' + msg);
    if (lines.length > 400) lines.shift();
    subs.forEach(function (f) { try { f(); } catch (e) {} });
  }
  return {
    add: add,
    all: function () { return lines.slice(); },
    text: function () { return lines.join('\n'); },
    on: function (f) { subs.push(f); },
    clear: function () { lines = []; subs.forEach(function (f) { try { f(); } catch (e) {} }); }
  };
})();
