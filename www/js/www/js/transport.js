window.Transport = (function () {
  var st = { id: null, wSvc: null, w: null, nSvc: null, n: null, wnr: false, onData: null, onDisc: null };
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
    await B().initialize();
    await B().requestLEScan({ allowDuplicates: false }, function (r) {
      onResult({ id: r.device.deviceId, name: r.localName || r.device.name || '', rssi: r.rssi });
    });
    await new Promise(function (res) { setTimeout(res, ms); });
    try { await B().stopLEScan(); } catch (e) {}
  }
  async function connect(id, onDisc) {
    st.id = id; st.onDisc = onDisc;
    await B().initialize();
    await B().connect(id, function () {
      Log.add('BLE', 'ayrıldı');
      if (st.onDisc) st.onDisc();
    }, { timeout: 10000 });
    return await B().getServices(id);
  }
  async function reconnect() {
    await B().initialize();
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
    if (onData) st.onData = onData;
    await B().startNotifications(st.id, st.nSvc, st.n, function (dv) {
      if (st.onData) st.onData(txt(dv));
    });
  }
  async function stopNotify() {
    try { await B().stopNotifications(st.id, st.nSvc, st.n); } catch (e) {}
  }
  async function write(s) {
    for (var i = 0; i < s.length; i += 20) {
      var dv = enc(s.substr(i, 20));
      if (st.wnr) await B().writeWithoutResponse(st.id, st.wSvc, st.w, dv);
      else await B().write(st.id, st.wSvc, st.w, dv);
    }
  }
  async function disconnect() {
    try { await B().disconnect(st.id); } catch (e) {}
  }
  return { scan: scan, connect: connect, reconnect: reconnect, bind: bind, startNotify: startNotify, stopNotify: stopNotify, write: write, disconnect: disconnect };
})();
