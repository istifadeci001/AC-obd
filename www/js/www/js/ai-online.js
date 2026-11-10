window.AIOnline = (function () {
  var memKey = '';
  var SYS = 'Sən avtomobil diaqnostika köməkçisisən. Azərbaycan dilində, sadə və qısa cavab ver. Xəta kodunun mənasını, ən çox rast gəlinən səbəbləri (ehtimal sırası ilə), simptomları və növbəti yoxlama addımlarını yaz. Qəti diaqnoz vermə. Hissəni yoxlamadan dəyişməyi məsləhət görmə. Əmin olmadığın məlumatı uydurma, bunu açıq yaz.';
  function getKey() { return memKey || Store.get('ai_key', ''); }
  function removeSaved() { try { localStorage.removeItem('acobd:ai_key'); } catch (e) {} }
  function setKey(k, persist) { memKey = k; if (persist) Store.set('ai_key', k); else removeSaved(); }
  function clearKey() { memKey = ''; removeSaved(); }
  function cfg() {
    return { provider: Store.get('ai_provider', 'anthropic'), model: Store.get('ai_model', ''), endpoint: Store.get('ai_endpoint', 'https://api.openai.com/v1/chat/completions') };
  }
  function buildPrompt(o) {
    var s = 'Xəta kodu: ' + o.code + '\n';
    if (o.vehicle) s += 'Avtomobil: ' + o.vehicle + '\n';
    if (o.local) s += 'Proqramın lokal bazasındakı qısa izah: ' + o.local + '\n';
    if (o.stats) s += 'Canlı göstəricilər (orta): ' + o.stats + '\n';
    return s + 'Bu kodun mənasını və yoxlama yolunu izah et.';
  }
  async function ask(prompt) {
    var c = cfg(), key = getKey();
    if (!Store.get('ai_allow', false)) throw new Error('İnternetə göndərməyə icazə verilməyib.');
    if (!key) throw new Error('API açarı daxil edilməyib.');
    if (!c.model) throw new Error('Model adı daxil edilməyib.');
    var url, headers, body;
    if (c.provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' };
      body = { model: c.model, max_tokens: 1000, system: SYS, messages: [{ role: 'user', content: prompt }] };
    } else {
      url = c.endpoint;
      headers = { 'content-type': 'application/json', 'authorization': 'Bearer ' + key };
      body = { model: c.model, messages: [{ role: 'system', content: SYS }, { role: 'user', content: prompt }] };
    }
    var r = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });
    var txt = await r.text(), data = null;
    try { data = JSON.parse(txt); } catch (e) {}
    if (!r.ok) {
      var m = data && data.error ? (data.error.message || data.error) : '';
      throw new Error('Server xətası ' + r.status + (m ? ': ' + (typeof m === 'string' ? m : JSON.stringify(m)) : ''));
    }
    var out = '';
    if (c.provider === 'anthropic') out = ((data && data.content) || []).map(function (x) { return x.text || ''; }).join('');
    else out = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
    if (!out) throw new Error('Boş cavab alındı.');
    return out;
  }
  return { buildPrompt: buildPrompt, ask: ask, setKey: setKey, clearKey: clearKey, hasKey: function () { return !!getKey(); }, persisted: function () { return !!Store.get('ai_key', ''); } };
})();
