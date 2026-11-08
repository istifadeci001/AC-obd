window.ELM = (function () {
  var buf = '', waiting = null, queue = Promise.resolve();

  function parse(raw, cmd) {
    return raw.replace(/>/g, '').split(/[\r\n]+/)
      .map(function (s) { return s.trim(); })
      .filter(function (l) {
        if (!l) return false;
        var u = l.toUpperCase();
        return u !== cmd.toUpperCase() && u !== 'SEARCHING...';
      });
  }

  function onData(t) {
    buf += t;
    Log.add('RX', JSON.stringify(t));
    if (buf.indexOf('>') >= 0) {
      if (waiting) {
        var w = waiting; waiting = null;
        clearTimeout(w.timer);
        var raw = buf; buf = '';
        w.resolve(parse(raw, w.cmd));
      } else {
        buf = '';
      }
    }
  }

  function send(cmd, timeout) {
    var p = queue.then(function () {
      return new Promise(function (resolve, reject) {
        buf = '';
        var timer = setTimeout(function () {
          waiting = null;
          Log.add('ERR', 'timeout ' + cmd);
          reject(new Error('timeout'));
        }, timeout || 2000);
        waiting = { resolve: resolve, reject: reject, timer: timer, cmd: cmd };
        Log.add('TX', cmd);
        Transport.write(cmd + '\r').catch(function (e) {
          clearTimeout(timer); waiting = null; reject(e);
        });
      });
    });
    queue = p.catch(function () {});
    return p;
  }

  function abort(msg) {
    if (waiting) {
      var w = waiting; waiting = null;
      clearTimeout(w.timer);
      w.reject(new Error(msg || 'abort'));
    }
    buf = '';
  }

  return { onData: onData, send: send, abort: abort };
})();
