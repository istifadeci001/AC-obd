window.ELM = (function () {
  var buf = '', waiting = null, queue = Promise.resolve();
  var late = false, drain = null;

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
        // heç kim gözləmir: timeout-dan sonra gecikmiş cavab gəldi, atırıq
        buf = '';
        late = false;
        if (drain) { var d = drain; drain = null; clearTimeout(d.timer); d.resolve(); }
      }
    }
  }

  // timeout olubsa, gecikmiş cavabın ('>' işarəsinin) gəlməsini gözləyir ki,
  // növbəti əmrə köhnə əmrin cavabı verilməsin
  function settle() {
    return new Promise(function (resolve) {
      var d = { resolve: resolve };
      d.timer = setTimeout(function () { if (drain === d) drain = null; resolve(); }, 1500);
      drain = d;
    });
  }

  function send(cmd, timeout) {
    var p = queue.then(function () {
      var pre = Promise.resolve();
      if (late) {
        late = false;
        pre = settle().then(function () { Log.add('INFO', 'gecikmiş cavab təmizləndi'); });
      }
      return pre.then(function () {
        return new Promise(function (resolve, reject) {
          buf = '';
          var timer = setTimeout(function () {
            waiting = null;
            late = true;
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
    late = false;
  }

  return { onData: onData, send: send, abort: abort };
})();
