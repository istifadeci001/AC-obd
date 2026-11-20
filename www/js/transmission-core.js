(function (root) {
  'use strict';
  function hexBytes(s) {
    var out = [];
    for (var i = 0; i + 1 < s.length; i += 2) {
      var n = parseInt(s.slice(i, i + 2), 16);
      if (!isNaN(n)) out.push(n);
    }
    return out;
  }
  function parseFrames(lines, service, pid) {
    var marker = service.toUpperCase() + (pid || '').toUpperCase(), out = [];
    (lines || []).forEach(function (line) {
      var s = String(line).replace(/[^0-9a-f]/ig, '').toUpperCase();
      if (s.length < 7) return;
      var id = s.slice(0, 3);
      if (!/^7E[89A-F]$/.test(id)) return;
      var at = s.indexOf(marker, 3);
      if (at < 0) return;
      out.push({ responseId: id, requestId: (parseInt(id, 16) - 8).toString(16).toUpperCase().padStart(3, '0'), data: hexBytes(s.slice(at + marker.length)) });
    });
    return out;
  }
  function supportedPids(bytes, base) {
    if (!bytes || bytes.length < 4) return [];
    var mask = bytes[0] * 16777216 + bytes[1] * 65536 + bytes[2] * 256 + bytes[3], out = [];
    for (var i = 0; i < 32; i++) if (Math.floor(mask / Math.pow(2, 31 - i)) % 2) out.push((base || 0) + i + 1);
    return out;
  }
  function decodeGearA4(bytes) {
    if (!bytes || bytes.length < 4) return null;
    var flags = bytes[0], gearSupported = !!(flags & 0x80), ratioSupported = !!(flags & 0x40);
    return { gearSupported: gearSupported, gear: gearSupported ? (bytes[1] & 15) : null, ratioSupported: ratioSupported, ratio: ratioSupported ? ((bytes[2] * 256 + bytes[3]) / 1000) : null };
  }
  function decodeDtcBytes(bytes) {
    var out = [], types = ['P', 'C', 'B', 'U'];
    for (var i = 0; i + 1 < (bytes || []).length; i += 2) {
      var a = bytes[i], b = bytes[i + 1];
      if (a === 0 && b === 0) continue;
      var code = types[(a >> 6) & 3] + ((a >> 4) & 3).toString() + (a & 15).toString(16).toUpperCase() + b.toString(16).toUpperCase().padStart(2, '0');
      out.push(code);
    }
    return out;
  }
  var api = { parseFrames: parseFrames, supportedPids: supportedPids, decodeGearA4: decodeGearA4, decodeDtcBytes: decodeDtcBytes };
  root.TransmissionCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
