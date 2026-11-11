window.Adapter = (function () {
  var S = OBD.S, info = null, smap = null, ran = false;
  async function line(cmd) {
    try { return (await ELM.send(cmd, 2500)).join(' ').trim(); } catch (e) { return ''; }
  }
  function posOf(scheme, idx) {
    return scheme === '13'
      ? 'B' + (Math.floor(idx / 4) + 1) + 'S' + (idx % 4 + 1)
      : 'B' + (Math.floor(idx / 2) + 1) + 'S' + (idx % 2 + 1);
  }
  function idxOf(pid) {
    var n = parseInt(pid, 16);
    if (n >= 0x14 && n <= 0x1B) return n - 0x14;
    if (n >= 0x24 && n <= 0x2B) return n - 0x24;
    if (n >= 0x34 && n <= 0x3B) return n - 0x34;
    return -1;
  }
  function kind(pid) {
    var n = parseInt(pid, 16);
    if (n >= 0x14 && n <= 0x1B) return 'narrow';
    if (n >= 0x24 && n <= 0x2B) return 'wide';
    if (n >= 0x34 && n <= 0x3B) return 'wide-current';
    return null;
  }
  function pos(pid) {
    if (!smap || !smap.scheme) return null;
    var i = idxOf(pid);
    if (i < 0) return null;
    return { pos: posOf(smap.scheme, i), present: !!((smap.mask >> i) & 1) };
  }
  function relabel() {
    Object.keys(window.PIDS).forEach(function (id) {
      var k = kind(id), p = window.PIDS[id];
      if (!k || !p || p.custom) return;
      var q = pos(id), tp = k === 'narrow' ? 'gərginlik' : (k === 'wide' ? 'lambda, geniş diapazon' : 'cərəyan');
      var nm = q ? 'O2 sensoru ' + q.pos + ' (' + tp + ')' : 'O2 sensoru (mövqe bilinmir, ' + tp + ')';
      p.az = nm; p.en = nm;
    });
  }
  async function loadMap() {
    var scheme = '', mask = 0;
    var r = await OBD.raw('0113', 3000);
    var f = r.msgs.filter(function (x) { return x.indexOf('4113') === 0; })[0];
    if (f) { scheme = '13'; mask = parseInt(f.slice(4, 6), 16); }
    else {
      r = await OBD.raw('011D', 3000);
      f = r.msgs.filter(function (x) { return x.indexOf('411D') === 0; })[0];
      if (f) { scheme = '1D'; mask = parseInt(f.slice(4, 6), 16); }
    }
    smap = { scheme: scheme, mask: isNaN(mask) ? 0 : mask };
    relabel();
  }
  async function run() {
    if (ran || S.state !== 'ecu') return;
    ran = true;
    var i = { ati: await line('ATI'), sti: await line('STI'), at1: await line('AT@1') };
    i.stn = /STN|OBDLINK/i.test(i.sti) && i.sti.trim() !== '?';
    i.v15 = /v1\.5/i.test(i.ati);
    info = i;
    try { await loadMap(); } catch (e) { smap = { scheme: '', mask: 0 }; }
  }
  OBD.on(function () {
    if (S.state === 'ecu' && !ran) setTimeout(run, 1500);
    else if (S.state === 'idle' || S.state === 'error') { ran = false; info = null; smap = null; }
  });
  return { run: run, info: function () { return info; }, map: function () { return smap; }, pos: pos, kind: kind, posOf: posOf };
})();
