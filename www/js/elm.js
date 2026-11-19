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

  // gen: abort() çağırılanda artır. Abort-dan ƏVVƏL növbəyə düşmüş sorğular (məs. bağlantı kəsilib) göndərilmir.
  var gen = 0;

  // Növbəyə baxmadan bir əmri göndərir. Yalnız növbə daxilində (send / exclusive) çağırılır.
  function sendNow(cmd, timeout) {
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
  }

  // Bütün OBD sorğuları BU vahid növbədən keçir: eyni anda yalnız bir əmr adapterdədir.
  function send(cmd, timeout) {
    var g = gen;
    var p = queue.then(function () {
      if (g !== gen) throw new Error('abort');
      return sendNow(cmd, timeout);
    });
    queue = p.catch(function () {});
    return p;
  }

  // Bir neçə əmrdən ibarət ardıcıllığı (məs. ATSH ... sorğu ... ATSH bərpa) başqa bölmələrin sorğuları
  // arasına girmədən icra edir. fn({send}) içində yalnız tx.send istifadə olunmalıdır.
  function exclusive(fn) {
    var g = gen;
    var p = queue.then(function () {
      if (g !== gen) throw new Error('abort');
      return fn({ send: function (cmd, t) { if (g !== gen) return Promise.reject(new Error('abort')); return sendNow(cmd, t); } });
    });
    queue = p.catch(function () {});
    return p;
  }

  // Yalnız oxuma (idempotent) əmrləri üçün: timeout və ya adapter/şin xətası olduqda məhdud sayda təkrar.
  // "NO DATA" təkrar edilmir (bu ECU-nun real cavabıdır).
  var RETRYABLE = /BUS BUSY|BUFFER FULL|CAN ERROR|BUS ERROR|FB ERROR|DATA ERROR|<DATA ERROR|STOPPED|LV RESET/i;
  async function sendRetry(cmd, timeout, tries) {
    var n = Math.max(0, tries === undefined ? 1 : tries), last;
    for (var i = 0; i <= n; i++) {
      try {
        var l = await send(cmd, timeout);
        if (i < n && l.length && l.every(function (x) { return RETRYABLE.test(x); })) { Log.add('INFO', 'təkrar ' + (i + 1) + ': ' + cmd + ' → ' + l.join(' ')); continue; }
        return l;
      } catch (e) {
        last = e;
        if (e && e.message === 'abort') throw e;
        if (i < n) Log.add('INFO', 'təkrar ' + (i + 1) + ': ' + cmd + ' → ' + (e && e.message));
      }
    }
    throw last || new Error('timeout');
  }

  function abort(msg) {
    gen++;
    if (waiting) {
      var w = waiting; waiting = null;
      clearTimeout(w.timer);
      w.reject(new Error(msg || 'abort'));
    }
    buf = '';
    late = false;
  }

  return { onData: onData, send: send, sendRetry: sendRetry, exclusive: exclusive, abort: abort };
})();
