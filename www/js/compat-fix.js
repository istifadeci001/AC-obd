(function () {
  var base = Compat.list;
  Compat.list = function () {
    var L = base(), vin = Session.ctx.vin, ai = Adapter.info(), sm = Adapter.map();
    L.forEach(function (x) {
      if (x.name.indexOf('VIN oxumaq') === 0 && vin) {
        var old = x.d;
        x.st = 'ok';
        x.d = 'ECU-dan oxunub (Mode 09, PID 02)' + (old ? '. Qeyd: PID 00 maskası fərqli cavab verib (' + old + ')' : '');
      }
    });
    var extra = [];
    if (ai) extra.push({ name: 'Adapter növü', st: 'ok', d: (ai.stn ? 'STN çipi (ELM327 uyğun, sürətli/peşəkar)' : 'ELM327 uyğun') + (ai.ati ? ': ' + ai.ati : '') + (ai.v15 ? '. v1.5 ELM Electronics-in rəsmi buraxılışı deyil, klon ehtimalı var' : '') });
    if (sm) extra.push({ name: 'O2 sensor mövqeləri (PID 13/1D)', st: sm.scheme ? 'ok' : 'unk', d: sm.scheme ? 'Sxem ' + sm.scheme + ', maska ' + ('00000000' + sm.mask.toString(2)).slice(-8) : 'ECU mövqe məlumatı vermədi: ön/arxa sensor mövqeləri təsdiqlənmir' });
    L.splice.apply(L, [2, 0].concat(extra));
    return L;
  };
})();
