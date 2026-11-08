(function () {
  'use strict';

  var SECTIONS = ['dashboard', 'connect', 'live', 'monitor', 'diag', 'dtc', 'freeze', 'advanced', 'vehicle', 'logging', 'reports', 'garage', 'settings'];
  var PHASE = { connect: 3, live: 6, monitor: 10, diag: 9, dtc: 7, freeze: 7, advanced: 13, vehicle: 5, logging: 8, reports: 11 };
  var BOTTOM = ['dashboard', 'connect', 'live', 'dtc'];
  var SYSTEMS = ['Engine ECU', 'Transmission / TCM', 'ABS', 'ESP', 'SRS / Airbag', 'EPS / Steering', 'BCM', 'HVAC / Climate Control', 'TPMS', 'Instrument Cluster', 'Immobilizer', 'Parking Assistance'];
  var lang = Store.get('lang', 'az');
  var viewEl = document.getElementById('view');

  function t(k) {
    var d = I18N[lang] || I18N.az;
    if (d[k] !== undefined) return d[k];
    return I18N.az[k] !== undefined ? I18N.az[k] : k;
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function list(a) {
    return '<ul>' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }

  function getGarage() { return Store.get('garage', []); }
  function getActive() {
    var id = Store.get('activeVehicle', null);
    var g = getGarage();
    for (var i = 0; i < g.length; i++) if (g[i].id === id) return g[i];
    return null;
  }
  function vehicleLine(v) {
    return esc([v.make, v.model, v.year].filter(Boolean).join(' ') + (v.engine ? ' · ' + v.engine : ''));
  }

  function pending(sec, extra) {
    return '<h2>' + esc(t('nav_' + sec)) + '</h2>' +
      '<div class="card warn"><span class="tag">' + esc(t('tag_placeholder')) + '</span>' +
      '<p>' + esc(t('phase_msg').replace('{n}', PHASE[sec])) + '</p>' +
      '<p>' + esc(t('no_data')) + '</p></div>' + (extra || '');
  }

  function dtcResult(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return '';
    var d = DTC_DB[code];
    if (!d) return '<div class="card">' + esc(t('dtc_notfound')) + '</div>';
    var name = lang === 'en' ? d.en : d.az;
    return '<div class="card"><b>' + esc(code) + '</b><p>' + esc(name) + '</p>' +
      (lang === 'az' ? '<p class="sm">' + esc(d.en) + '</p>' : '') +
      '<label>' + esc(t('dtc_causes')) + '</label>' + list(d.causes) +
      '<label>' + esc(t('dtc_symptoms')) + '</label>' + list(d.symptoms) +
      '<label>' + esc(t('dtc_check')) + '</label>' + list(d.check) +
      '<label>' + esc(t('dtc_sensors')) + '</label>' + list(d.sensors) +
      '<label>' + esc(t('dtc_related')) + '</label><p>' + esc(d.related.join(', ')) + '</p>' +
      '<p class="sm">' + esc(t('dtc_note')) + '</p></div>';
  }

  var SCREENS = {
    dashboard: function () {
      var v = getActive();
      var n = Object.keys(DTC_DB).length;
      var tiles = SECTIONS.filter(function (s) { return s !== 'dashboard'; }).map(function (s) {
        return '<a class="tile" href="#' + s + '">' + esc(t('nav_' + s)) + '</a>';
      }).join('');
      return '<h2>' + esc(t('nav_dashboard')) + '</h2>' +
        '<div class="card">' +
        '<div class="row"><span class="k">' + esc(t('dash_conn')) + '</span><span class="no">' + esc(t('conn_off')) + '</span></div>' +
        '<div class="row"><span class="k">' + esc(t('dash_data')) + '</span><span class="no">' + esc(t('dash_data_val')) + '</span></div>' +
        '<div class="row"><span class="k">' + esc(t('dash_vehicle')) + '</span><span>' + (v ? vehicleLine(v) : esc(t('dash_none_vehicle'))) + '</span></div>' +
        '<div class="row"><span class="k">' + esc(t('dash_dtcdb')) + '</span><span>' + n + ' ' + esc(t('dash_codes')) + '</span></div>' +
        '</div><div class="grid">' + tiles + '</div>';
    },
    connect: function () {
      var steps = ['c1', 'c2', 'c3', 'c4'].map(function (k) {
        return '<div class="row"><span class="k">' + esc(t(k)) + '</span><span class="no">—</span></div>';
      }).join('');
      return pending('connect', '<div class="card">' + steps + '</div>');
    },
    live: function () { return pending('live'); },
    monitor: function () { return pending('monitor'); },
    diag: function () { return pending('diag'); },
    dtc: function () {
      return pending('dtc',
        '<div class="card"><label>' + esc(t('dtc_search')) + '</label>' +
        '<input id="dtcq" type="text" autocapitalize="characters" autocomplete="off" placeholder="' + esc(t('dtc_ph')) + '"></div>' +
        '<div id="dtcres"></div>');
    },
    freeze: function () { return pending('freeze'); },
    advanced: function () {
      var rows = SYSTEMS.map(function (s) {
        return '<div class="row"><span>' + esc(s) + '</span><span class="no">' + esc(t('adv_status')) + '</span></div>';
      }).join('');
      return pending('advanced', '<div class="card"><p>' + esc(t('adv_note')) + '</p>' + rows + '</div>');
    },
    vehicle: function () {
      var v = getActive();
      var extra = '';
      if (v) {
        extra = '<div class="card"><label>' + esc(t('veh_profile')) + '</label><p>' + vehicleLine(v) + '</p></div>';
      }
      return pending('vehicle', extra);
    },
    logging: function () { return pending('logging'); },
    reports: function () { return pending('reports'); },
    garage: function () {
      var g = getGarage();
      var aid = Store.get('activeVehicle', null);
      var items = g.length ? g.map(function (v) {
        return '<div class="card"><b>' + esc(v.name || v.model || '—') + '</b>' +
          (v.id === aid ? ' <span class="ok sm">' + esc(t('g_active')) + '</span>' : '') +
          '<p>' + vehicleLine(v) + '</p>' +
          '<p class="sm">' + esc([v.fuel, v.trans].filter(Boolean).join(' · ')) + '</p>' +
          (v.id === aid ? '' : '<button class="btn alt" data-act="use" data-id="' + esc(v.id) + '">' + esc(t('g_use')) + '</button>') +
          '<button class="btn del" data-act="del" data-id="' + esc(v.id) + '">' + esc(t('g_delete')) + '</button></div>';
      }).join('') : '<div class="card"><p>' + esc(t('g_empty')) + '</p></div>';
      return '<h2>' + esc(t('nav_garage')) + '</h2>' + items +
        '<div class="card"><p class="sm">' + esc(t('g_note')) + '</p>' +
        '<form id="gform" autocomplete="off">' +
        '<input name="name" placeholder="' + esc(t('g_name')) + '">' +
        '<input name="make" placeholder="' + esc(t('g_make')) + '">' +
        '<input name="model" placeholder="' + esc(t('g_model')) + '">' +
        '<input name="year" inputmode="numeric" placeholder="' + esc(t('g_year')) + '">' +
        '<input name="engine" placeholder="' + esc(t('g_engine')) + '">' +
        '<input name="fuel" placeholder="' + esc(t('g_fuel')) + '">' +
        '<input name="trans" placeholder="' + esc(t('g_trans')) + '">' +
        '<button class="btn" type="submit">' + esc(t('g_save')) + '</button>' +
        '<button class="btn alt" type="button" data-act="sample">' + esc(t('g_sample')) + '</button>' +
        '</form></div>';
    },
    settings: function () {
      return '<h2>' + esc(t('nav_settings')) + '</h2><div class="card">' +
        '<label>' + esc(t('set_lang')) + '</label>' +
        '<button class="btn' + (lang === 'az' ? '' : ' alt') + '" data-act="lang" data-v="az">Azərbaycan</button>' +
        '<button class="btn' + (lang === 'en' ? '' : ' alt') + '" data-act="lang" data-v="en">English</button>' +
        '<div class="row"><span class="k">' + esc(t('set_version')) + '</span><span>' + esc(t('set_version_val')) + '</span></div>' +
        '<div class="row"><span class="k">' + esc(t('set_demo')) + '</span><span>' + esc(t('set_demo_val')) + '</span></div>' +
        '</div><button class="btn del" data-act="reset">' + esc(t('set_reset')) + '</button>';
    }
  };

  function currentSection() {
    var id = (location.hash || '#dashboard').slice(1);
    return SECTIONS.indexOf(id) >= 0 ? id : 'dashboard';
  }

  function render() {
    var sec = currentSection();
    document.documentElement.lang = lang;
    document.getElementById('conn').textContent = t('conn_off');
    viewEl.innerHTML = SCREENS[sec]();

    var nav = BOTTOM.map(function (s) {
      return '<a href="#' + s + '" class="' + (s === sec ? 'on' : '') + '">' + esc(t('short_' + s)) + '</a>';
    }).join('') + '<button type="button" data-act="menu">☰ ' + esc(t('more')) + '</button>';
    document.getElementById('nav').innerHTML = nav;

    document.getElementById('drawerlist').innerHTML = SECTIONS.map(function (s) {
      return '<a href="#' + s + '" class="' + (s === sec ? 'on' : '') + '">' + esc(t('nav_' + s)) + '</a>';
    }).join('');

    closeDrawer();
    window.scrollTo(0, 0);
  }

  function openDrawer() { document.getElementById('drawer').classList.add('open'); }
  function closeDrawer() { document.getElementById('drawer').classList.remove('open'); }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (el) {
      var act = el.getAttribute('data-act');
      if (act === 'menu') openDrawer();
      else if (act === 'lang') { lang = el.getAttribute('data-v'); Store.set('lang', lang); render(); }
      else if (act === 'use') { Store.set('activeVehicle', el.getAttribute('data-id')); render(); }
      else if (act === 'del') {
        if (confirm(t('del_confirm'))) {
          var id = el.getAttribute('data-id');
          Store.set('garage', getGarage().filter(function (v) { return v.id !== id; }));
          if (Store.get('activeVehicle', null) === id) Store.set('activeVehicle', null);
          render();
        }
      } else if (act === 'sample') {
        var f = document.getElementById('gform');
        f.name.value = 'Kia Forte';
        f.make.value = 'Kia';
        f.model.value = 'Forte';
        f.year.value = '2014';
        f.engine.value = '1.8 DOHC';
        f.fuel.value = 'Benzin';
        f.trans.value = 'Avtomatik';
      } else if (act === 'reset') {
        if (confirm(t('set_reset_confirm'))) { Store.clearAll(); lang = 'az'; render(); }
      }
      return;
    }
    if (e.target.id === 'drawer') closeDrawer();
  });

  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'gform') return;
    e.preventDefault();
    var f = e.target;
    var v = {
      id: 'v' + Date.now(),
      name: f.name.value.trim(),
      make: f.make.value.trim(),
      model: f.model.value.trim(),
      year: f.year.value.trim(),
      engine: f.engine.value.trim(),
      fuel: f.fuel.value.trim(),
      trans: f.trans.value.trim()
    };
    if (!v.make && !v.model && !v.name) return;
    var g = getGarage();
    g.push(v);
    Store.set('garage', g);
    if (!Store.get('activeVehicle', null)) Store.set('activeVehicle', v.id);
    render();
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'dtcq') {
      document.getElementById('dtcres').innerHTML = dtcResult(e.target.value);
    }
  });

  document.getElementById('menu').addEventListener('click', openDrawer);
  window.addEventListener('hashchange', render);
  render();
})();
