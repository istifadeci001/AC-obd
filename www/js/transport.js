window.Transport = (function () {
  var st = { id: null, wSvc: null, w: null, nSvc: null, n: null, wnr: false, onData: null, onDisc: null, scanning: false, initialized: false };
  var initPromise = null;
  async function initialize() {
    if (!B()) throw new Error('BLE modulu yüklənməyib. Android build zamanı BLE bundle yaradılmalıdır.');
    if (st.initialized) return;
    if (!initPromise) initPromise = B().initialize().then(function () { st.initialized = true; }).catch(function (e) { initPromise = null; throw e; });
    return initPromise;
  }
  function B() { return window.BleClient; }
  function txt(dv) {
    var s = '';
    for (var i = 0; i < dv.byteLength; i++) s += String.fromCharCode(dv.getUint8(i));
    return s;
  }
  function enc(s) {
    var b = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
    return new DataView(b.buffer);
  }
  async function scan(onResult, ms) {
    await initialize();
    if (st.scanning) throw new Error('Cihaz axtarışı artıq davam edir');
    st.scanning = true;
    try {
      await B().requestLEScan({ allowDuplicates: false }, function (r) {
        if (!r || !r.device || !r.device.deviceId || typeof onResult !== 'function') return;
        onResult({ id: r.device.deviceId, name: r.localName || r.device.name || '', rssi: r.rssi });
      });
      await new Promise(function (res) { setTimeout(res, Math.max(1000, Number(ms) || 10000)); });
    } finally {
      try { await B().stopLEScan(); } finally { st.scanning = false; }
    }
  }
  async function connect(id, onDisc) {
    if (!id) throw new Error('Adapter cihaz ID-si boşdur');
    await initialize();
    st.id = id; st.onDisc = onDisc;
    try {
      await B().connect(id, function () {
        Log.add('BLE', 'ayrıldı');
        if (st.onDisc) st.onDisc();
      }, { timeout: 15000 });
      var services = await B().getServices(id);
      if (!Array.isArray(services) || !services.length) throw new Error('Adapter GATT xidmətləri təqdim etmədi');
      return services;
    } catch (e) {
      try { await B().disconnect(id); } catch (ignore) {}
      st.id = null; st.wSvc = st.w = st.nSvc = st.n = null;
      throw e;
    }
  }
  async function reconnect() {
    if (!st.id) throw new Error('Yenidən qoşulmaq üçün adapter ID-si yoxdur');
    await initialize();
    await B().connect(st.id, function () {
      Log.add('BLE', 'ayrıldı');
      if (st.onDisc) st.onDisc();
    }, { timeout: 10000 });
    await B().getServices(st.id);
  }
  function bind(wSvc, w, nSvc, n, wnr) {
    st.wSvc = wSvc; st.w = w; st.nSvc = nSvc; st.n = n; st.wnr = !!wnr;
  }
  async function startNotify(onData) {
    if (!st.id || !st.nSvc || !st.n) throw new Error('BLE bildiriş kanalı seçilməyib');
    if (onData) st.onData = onData;
    await B().startNotifications(st.id, st.nSvc, st.n, function (dv) {
      if (st.onData) st.onData(txt(dv));
    });
  }
  async function stopNotify() {
    try { await B().stopNotifications(st.id, st.nSvc, st.n); } catch (e) {}
  }
  async function write(s) {
    if (!st.id || !st.wSvc || !st.w) throw new Error('BLE yazı kanalı seçilməyib');
    s = String(s);
    for (var i = 0; i < s.length; i += 20) {
      var dv = enc(s.substr(i, 20));
      if (st.wnr) await B().writeWithoutResponse(st.id, st.wSvc, st.w, dv);
      else await B().write(st.id, st.wSvc, st.w, dv);
    }
  }
  async function disconnect() {
    var id = st.id;
    try { if (id && B()) await B().disconnect(id); } finally {
      st.id = null; st.wSvc = st.w = st.nSvc = st.n = null; st.wnr = false;
    }
  }
  return { scan: scan, connect: connect, reconnect: reconnect, bind: bind, startNotify: startNotify, stopNotify: stopNotify, write: write, disconnect: disconnect };
})();
