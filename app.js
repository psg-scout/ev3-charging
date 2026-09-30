(() => {
'use strict';
const CHARGERS = window.EV3_CHARGERS, PLACES = window.EV3_PLACES;
const KEY = 'ev3.v1';
const DEFAULTS = { battery: 81.4, eff: 3.5, winterEff: 3.0, season: 'auto', weeklyMiles: 150,
  low: 30, target: 80, pref: 'crownpoint', time: '08:30', nav: 'ask' };
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gbp = n => '£' + (Number(n) || 0).toFixed(2);
const DAY = 864e5;
const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ---------- state ----------
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object')
    return { settings: { ...DEFAULTS, ...(s.settings || {}) }, logs: Array.isArray(s.logs) ? s.logs : [], manual: s.manual || null };
  } catch (e) { /* ignore corrupt */ }
  return { settings: { ...DEFAULTS }, logs: [], manual: null };
}
let state = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
const chargerById = id => CHARGERS.find(c => c.id === id);

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2400); }
const todayISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
function isWinter(d = new Date()) { const s = state.settings.season; if (s === 'winter') return true; if (s === 'summer') return false; return [10, 11, 0, 1, 2].includes(d.getMonth()); }
const effNow = () => isWinter() ? +state.settings.winterEff : +state.settings.eff;
function haversineKm(a, b) { const R = 6371, r = x => x * Math.PI / 180; const dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
const appleUrl = p => `https://maps.apple.com/?daddr=${p.lat},${p.lng}&dirflg=d`;
const googleUrl = p => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=driving`;
// Navigation buttons honour the "Default navigation app" setting (ask / apple / google).
function navButtons(p) {
  const a = `href="${esc(appleUrl(p))}" target="_blank" rel="noopener noreferrer"`, g = `href="${esc(googleUrl(p))}" target="_blank" rel="noopener noreferrer"`;
  const nav = state.settings.nav;
  if (nav === 'apple' || nav === 'google') {
    const [pri, alt, altName] = nav === 'apple' ? [a, g, 'Google Maps'] : [g, a, 'Apple Maps'];
    return `<div class="nav nav-one"><a class="navbtn primary" data-nav="${nav}" ${pri}>${ico('navigation')}Navigate</a><a class="navalt" data-nav="${nav === 'apple' ? 'google' : 'apple'}" ${alt}>or ${altName}</a></div>`;
  }
  return `<div class="nav nav-two"><a class="navbtn apple" data-nav="apple" ${a}>Apple Maps</a><a class="navbtn google" data-nav="google" ${g}>Google Maps</a></div>`;
}
const isCPS = c => /ChargePlace/i.test(c.network);

// ---------- tabs ----------
const TITLES = { map: 'Map', chargers: 'Chargers', log: 'Log a charge', stats: 'Stats', plan: 'Planner', settings: 'Settings' };
function showTab(name) {
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  $$('.tabbar button').forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  $('#title').textContent = TITLES[name];
  if (name === 'map' && map) setTimeout(() => map.invalidateSize(), 50);
  if (name === 'stats') renderStats();
  if (name === 'plan') renderPlan();
  history.replaceState(null, '', '#' + name);
}
$$('.tabbar button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---------- map ----------
const POPUP_OPTS = { maxWidth: 280, autoPanPaddingTopLeft: [10, 125], autoPanPaddingBottomRight: [10, 70] };
let map = null, meMarker = null, meCircle = null, nearbyLayer = null; const markers = {};
function pinIcon(cls, emoji) { return L.divIcon({ className: '', html: `<div class="pin ${cls}"><span>${emoji}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28] }); }
function chargerPopup(c) {
  return `<h4>${esc(c.name)}</h4>
    <p><span class="badge ${c.type}">${c.type === 'rapid' ? 'Rapid DC' : 'AC'}</span>${esc(c.network)}</p>
    <p><b>Speed:</b> ${esc(c.speed)}</p>
    <p><b>Price:</b> ${esc(c.priceText)}<br><span class="muted small">${esc(window.EV3_PRICE_NOTE)}</span></p>
    <p>${esc(c.notes)}</p>
    ${isCPS(c) ? `<p class="small cps-warn">${ico('triangle-alert', 'ic-inline')}${esc(window.EV3_CPS_NOTE)}</p>` : ''}
    <p class="muted small">${esc(c.addr)}</p>
    ${navButtons(c)}
    <a class="logbtn" href="#log" data-logat="${c.id}">${ico('plus')}Log a charge here</a>`;
}
function initMap() {
  if (!window.L) { $('#map').innerHTML = '<p class="center muted" style="padding:40px">Map library failed to load (offline?). The rest of the app still works.</p>'; return; }
  map = L.map('map', { zoomControl: true, tap: true });
  // CARTO dark_all now serves an "API KEY REQUIRED" placeholder without a key, so we use standard OSM tiles
  // rendered dark + monochrome via a CSS filter on the tile pane (see styles.css).
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' }).addTo(map);
  nearbyLayer = L.layerGroup().addTo(map);
  map.on('popupopen', () => { const st = $('#nearbyStatus'); if (st && !st.classList.contains('loading')) st.classList.remove('show'); });
  initNearbyControl();
  const pts = [];
  const emo = { home: 'house', work: 'mic', gym: 'dumbbell' };
  PLACES.forEach(p => { pts.push([p.lat, p.lng]);
    markers[p.id] = L.marker([p.lat, p.lng], { icon: pinIcon('place', ico(emo[p.kind] || 'map-pin', '', 2.25)), title: p.name, zIndexOffset: 500 }).addTo(map)
      .bindPopup(() => `<h4>${esc(p.name)}</h4><p>${esc(p.note)}</p>${navButtons(p)}`, POPUP_OPTS); });
  CHARGERS.forEach(c => { pts.push([c.lat, c.lng]);
    markers[c.id] = L.marker([c.lat, c.lng], { icon: pinIcon(c.type, ico(c.type === 'rapid' ? 'zap' : 'plug', '', 2.25)), title: c.name }).addTo(map).bindPopup(() => chargerPopup(c), POPUP_OPTS); });
  map.fitBounds(pts, { padding: [30, 30] });
  $('#locateBtn').addEventListener('click', () => locate());
}
function locate(then) {
  if (!navigator.geolocation) return toast('Location not available');
  toast('Finding you…');
  navigator.geolocation.getCurrentPosition(pos => {
    const ll = [pos.coords.latitude, pos.coords.longitude];
    if (!meMarker) { meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000 }).addTo(map).bindPopup('You are here');
      meCircle = L.circle(ll, { radius: pos.coords.accuracy, weight: 1, color: '#2563eb', fillOpacity: .1 }).addTo(map); }
    else { meMarker.setLatLng(ll); meCircle.setLatLng(ll).setRadius(pos.coords.accuracy); }
    map.flyTo(ll, Math.max(map.getZoom(), 14));
    const near = CHARGERS.map(c => ({ c, d: haversineKm({ lat: ll[0], lng: ll[1] }, c) })).sort((a, b) => a.d - b.d)[0];
    if (typeof then === 'function') return then(ll, pos.coords.accuracy);
    toast(`Nearest: ${near.c.name} (${near.d.toFixed(1)} km)`);
  }, err => toast('Location error: ' + (err.message || err.code)), { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-logat]'); if (a) { e.preventDefault(); $('#fCharger').value = a.dataset.logat; onChargerChange(); showTab('log'); return; }
  const m = e.target.closest('[data-showmap]'); if (m) { showTab('map'); const mk = markers[m.dataset.showmap]; if (mk && map) setTimeout(() => { map.setView(mk.getLatLng(), 16); mk.openPopup(); }, 120); }
});

// ---------- UK-wide "chargers near me" (OpenStreetMap Overpass, no key) ----------
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const NEARBY_MAX = 200, NEARBY_MAX_SPAN_KM = 40;
const NEARBY_NOTE = 'Community data, may be incomplete; check Zapmap for live status.';
const SOCKETS = { type2: 'Type 2', type2_cable: 'Type 2 (tethered)', type2_combo: 'CCS2', chademo: 'CHAdeMO', type1: 'Type 1', type1_combo: 'CCS1',
  tesla_supercharger: 'Tesla Supercharger', tesla_supercharger_ccs: 'Tesla (CCS)', tesla_destination: 'Tesla Destination', bs1363: 'UK 3-pin', schuko: 'Schuko', cee_blue: 'CEE blue' };
let nearbySeq = 0;
function setNearbyStatus(text, kind) { const el = $('#nearbyStatus'); if (!el) return; el.textContent = text || ''; el.className = 'nearby-status' + (text ? ' show' : '') + (kind ? ' ' + kind : ''); clearTimeout(setNearbyStatus._t);
  if (text && kind !== 'loading') setNearbyStatus._t = setTimeout(() => el.classList.remove('show'), 6000); }
function initNearbyControl() {
  const box = document.createElement('div'); box.className = 'nearby-ctl';
  box.innerHTML = `<button id="nearbyBtn" type="button">${ico('search')}Find chargers here</button><button id="nearMeBtn" type="button" aria-label="Find chargers near me">${ico('locate')}Near me</button><button id="nearbyClear" type="button" class="hidden" aria-label="Clear results">${ico('x', '', 2.25)}</button>`;
  $('#tab-map').appendChild(box);
  const st = document.createElement('div'); st.id = 'nearbyStatus'; st.className = 'nearby-status'; st.setAttribute('role', 'status'); $('#tab-map').appendChild(st);
  $('#nearbyBtn').addEventListener('click', () => searchNearby(map.getBounds()));
  $('#nearMeBtn').addEventListener('click', () => { setNearbyStatus('Finding your location…', 'loading');
    locate(ll => { const bb = L.latLng(ll).toBounds(8000); map.fitBounds(bb); searchNearby(bb); }); });
  $('#nearbyClear').addEventListener('click', () => { nearbyLayer.clearLayers(); $('#nearbyClear').classList.add('hidden'); setNearbyStatus(''); });
}
function socketLines(t) {
  const out = [];
  Object.keys(t).forEach(k => { const m = k.match(/^socket:([a-z0-9_]+)$/); if (!m) return;
    const name = SOCKETS[m[1]] || m[1].replace(/_/g, ' '), cnt = t[k], outp = t[`socket:${m[1]}:output`];
    out.push(`${esc(name)}${/^\d+$/.test(cnt) ? ' × ' + esc(cnt) : ''}${outp ? ' · ' + esc(outp) : ''}`); });
  return out;
}
function nearbyPopup(e) {
  const t = e.tags || {}, name = t.name || t.brand || t.operator || t.network || 'Charging station';
  const op = [t.operator, t.network && t.network !== t.operator ? t.network : null, t.brand && ![t.operator, t.network].includes(t.brand) ? t.brand : null].filter(Boolean);
  const socks = socketLines(t), extra = [];
  if (t.capacity) extra.push(`Bays: ${esc(t.capacity)}`);
  if (t.fee) extra.push(`Fee: ${esc(t.fee)}`);
  if (t.charge) extra.push(`Price: ${esc(t.charge)}`);
  if (t.access && t.access !== 'yes') extra.push(`Access: ${esc(t.access)}`);
  if (t.opening_hours) extra.push(`Hours: ${esc(t.opening_hours)}`);
  const addr = [t['addr:street'], t['addr:city'], t['addr:postcode']].filter(Boolean).join(', ');
  return `<h4>${esc(name)}</h4>
    <p><span class="badge osm">OSM</span>${op.length ? esc(op.join(' · ')) : '<span class="muted">Operator not tagged</span>'}</p>
    <p><b>Sockets:</b> ${socks.length ? socks.join('<br>') : '<span class="muted">not tagged</span>'}</p>
    ${extra.length ? `<p class="small">${extra.join('<br>')}</p>` : ''}${addr ? `<p class="muted small">${esc(addr)}</p>` : ''}
    <p class="small cps-warn">${ico('info', 'ic-inline')}${esc(NEARBY_NOTE)}</p>
    ${navButtons(e)}`;
}
// Hedged requests: start the main server; if it hasn't answered after 6 s, also try the next mirror; first valid answer wins.
function overpassFetch(q) {
  return new Promise((resolve, reject) => {
    const ctrls = [], errs = []; let done = false, started = 0, hedge;
    const finish = (ok, v) => { if (done) return; done = true; clearTimeout(hedge); ctrls.forEach(c => c.abort()); ok ? resolve(v) : reject(v); };
    const next = () => { if (done || started >= OVERPASS.length) return; const url = OVERPASS[started++], ac = new AbortController(); ctrls.push(ac);
      const timer = setTimeout(() => ac.abort(), 25000);
      fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ac.signal })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(j => { if (!Array.isArray(j.elements)) throw new Error('Bad response'); finish(true, j); })
        .catch(err => { errs.push(err); if (started < OVERPASS.length) { clearTimeout(hedge); next(); } else if (errs.length === OVERPASS.length) finish(false, errs[errs.length - 1]); })
        .finally(() => clearTimeout(timer));
      clearTimeout(hedge); hedge = setTimeout(next, 6000); };
    next();
  });
}
async function searchNearby(bounds) {
  const b = bounds.pad ? bounds : L.latLngBounds(bounds), sw = b.getSouthWest(), ne = b.getNorthEast();
  const spanKm = Math.max(haversineKm({ lat: sw.lat, lng: sw.lng }, { lat: sw.lat, lng: ne.lng }), haversineKm({ lat: sw.lat, lng: sw.lng }, { lat: ne.lat, lng: sw.lng }));
  if (spanKm > NEARBY_MAX_SPAN_KM) { setNearbyStatus(`Zoom in to search – view is ~${Math.round(spanKm)} km wide (max ${NEARBY_MAX_SPAN_KM} km).`, 'warn'); return; }
  const seq = ++nearbySeq, btn = $('#nearbyBtn'); btn.disabled = true; setNearbyStatus('Searching OpenStreetMap for chargers…', 'loading');
  const bbox = [sw.lat, sw.lng, ne.lat, ne.lng].map(x => x.toFixed(5)).join(',');
  const q = `[out:json][timeout:25];nwr["amenity"="charging_station"](${bbox});out center tags ${NEARBY_MAX + 1};`;
  try {
    const j = await overpassFetch(q); if (seq !== nearbySeq) return;
    const els = j.elements.map(e => ({ ...e, lat: e.lat ?? e.center?.lat, lng: e.lon ?? e.center?.lon })).filter(e => isFinite(e.lat) && isFinite(e.lng));
    const capped = els.length > NEARBY_MAX, list = els.slice(0, NEARBY_MAX);
    nearbyLayer.clearLayers(); let shown = 0;
    list.forEach(e => { if (CHARGERS.some(c => haversineKm(c, e) < 0.04)) return; // already a curated pin
      shown++; L.marker([e.lat, e.lng], { icon: L.divIcon({ className: '', html: `<div class="npin">${ico('zap', '', 2.5)}</div>`, iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -10] }), title: (e.tags && e.tags.name) || 'Charging station (OSM)', zIndexOffset: -100 })
        .addTo(nearbyLayer).bindPopup(() => nearbyPopup(e), POPUP_OPTS); });
    $('#nearbyClear').classList.toggle('hidden', !shown);
    if (!els.length) setNearbyStatus('No public chargers tagged in this area. Try zooming out a little or check Zapmap.', 'warn');
    else setNearbyStatus(`Found ${shown} charger${shown === 1 ? '' : 's'}${capped ? ` (first ${NEARBY_MAX} shown – zoom in for more)` : ''}. ${NEARBY_NOTE}`, 'ok');
  } catch (err) { if (seq === nearbySeq) setNearbyStatus('Charger search failed (' + (err.name === 'AbortError' ? 'timed out' : err.message) + '). Check your connection and try again.', 'err'); }
  finally { if (seq === nearbySeq) btn.disabled = false; }
}

// ---------- chargers list ----------
let filter = 'all';
function nearestPlace(c) { return PLACES.map(p => ({ p, d: haversineKm(p, c) })).sort((a, b) => a.d - b.d)[0]; }
function renderChargers() {
  const sort = $('#sortSel').value;
  let list = CHARGERS.filter(c => filter === 'all' || c.type === filter);
  list.sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'price-desc' ? (a, b) => b.price - a.price || b.fee - a.fee : (a, b) => a.price - b.price || a.fee - b.fee);
  $('#chargerList').innerHTML = list.map(c => { const n = nearestPlace(c); return `<li data-id="${c.id}">
    <div class="row"><div><h3>${esc(c.name)}</h3><span class="badge ${c.type}">${c.type === 'rapid' ? 'Rapid DC' : 'AC'}</span><span class="small muted">${esc(c.network)}</span></div>
    <div class="price">${c.price}p${c.fee ? `<div class="small muted">+£${c.fee} fee</div>` : ''}</div></div>
    <p class="small"><b>${esc(c.speed)}</b><br>${esc(c.priceText)}<br>${esc(c.notes)}</p>
    <p class="small muted">${esc(c.addr)} · ${n.d.toFixed(1)} km from ${esc(n.p.name.replace(' – Kirkintilloch', ''))}</p>
    ${navButtons(c)}<button class="btn sm showmap" data-showmap="${c.id}">Show on map</button></li>`; }).join('');
}
$$('[data-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.filter; $$('[data-filter]').forEach(x => x.classList.toggle('on', x === b)); renderChargers(); }));
$('#sortSel').addEventListener('change', renderChargers);

// ---------- log ----------
let costTouched = false, kwhTouched = false;
function fillChargerSelect() {
  const opts = [...CHARGERS].sort((a, b) => a.price - b.price).map(c => `<option value="${c.id}">${esc(c.name)} — ${c.price}p${c.fee ? ' +£' + c.fee : ''}</option>`).join('');
  $('#fCharger').innerHTML = opts + '<option value="other">Other…</option>';
  $('#sPref').innerHTML = [...CHARGERS].map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
}
function currentPrice() {
  const id = $('#fCharger').value;
  if (id === 'other') return { price: parseFloat($('#fOtherPrice').value) || 0, fee: 0 };
  const c = chargerById(id); return { price: c.price, fee: c.fee || 0 };
}
function autoCost() {
  if (costTouched) return;
  const kwh = parseFloat($('#fKwh').value); if (!(kwh > 0)) { $('#fCost').value = ''; return; }
  const { price, fee } = currentPrice(); $('#fCost').value = (fee + kwh * price / 100).toFixed(2);
  $('#costHint').textContent = `Auto: ${fee ? '£' + fee.toFixed(2) + ' + ' : ''}${kwh} kWh × ${price}p (editable)`;
}
function autoKwh() {
  if (kwhTouched) return;
  const s = parseFloat($('#fStart').value), e = parseFloat($('#fEnd').value);
  if (e > s) { $('#fKwh').value = ((e - s) / 100 * state.settings.battery).toFixed(1); autoCost(); }
}
function onChargerChange() { $('#otherFields').classList.toggle('hidden', $('#fCharger').value !== 'other'); costTouched = false; autoCost(); }
$('#fCharger').addEventListener('change', onChargerChange);
$('#fOtherPrice').addEventListener('input', () => { costTouched = false; autoCost(); });
$('#fKwh').addEventListener('input', () => { kwhTouched = true; costTouched = false; autoCost(); });
$('#fCost').addEventListener('input', () => { costTouched = true; });
$('#fStart').addEventListener('input', autoKwh); $('#fEnd').addEventListener('input', autoKwh);
function resetLogForm() {
  $('#logForm').reset(); costTouched = kwhTouched = false;
  $('#fDate').value = todayISO(); $('#fCharger').value = state.settings.pref || CHARGERS[0].id; onChargerChange();
  const est = estimateSoc(); if (est) $('#fStart').value = Math.round(est.pct);
  $('#costHint').textContent = 'Cost auto-calculates from price (editable).';
}
$('#logForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('#fCharger').value, num = s => { const v = parseFloat($(s).value); return isNaN(v) ? null : v; };
  const c = chargerById(id);
  const entry = { id: 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: $('#fDate').value, created: Date.now(),
    chargerId: id, chargerName: c ? c.name : ($('#fOtherName').value.trim() || 'Other'),
    kwh: num('#fKwh'), cost: num('#fCost'), start: num('#fStart'), end: num('#fEnd'), odo: num('#fOdo') };
  if (!(entry.kwh > 0)) return toast('Enter kWh');
  if (entry.start != null && entry.end != null && entry.end < entry.start) return toast('End % must be ≥ start %');
  state.logs.push(entry); save(); resetLogForm(); renderAll(); toast('Charge saved ✓');
});
function sortedLogs() { return [...state.logs].sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created); }
function renderHistory() {
  const logs = sortedLogs().reverse();
  $('#history').innerHTML = logs.length ? logs.map(l => `<li><div class="row"><div>
      <h3>${esc(l.chargerName)}</h3>
      <div class="small muted">${new Date(l.date + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</div>
      <div class="small">${l.kwh} kWh · ${gbp(l.cost)} · ${l.kwh ? (l.cost / l.kwh * 100).toFixed(1) : '–'}p/kWh</div>
      <div class="small muted">${l.start != null ? l.start + '%' : '?'} → ${l.end != null ? l.end + '%' : '?'}${l.odo != null ? ' · ' + l.odo.toLocaleString('en-GB') + ' mi' : ''}</div>
    </div><button class="del" data-del="${l.id}" aria-label="Delete">${ico('trash-2')}</button></div></li>`).join('') : '<li class="muted center">No charges logged yet.</li>';
}
$('#history').addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (!b) return;
  if (!confirm('Delete this charge?')) return; state.logs = state.logs.filter(l => l.id !== b.dataset.del); save(); renderAll(); toast('Deleted'); });

// ---------- stats ----------
let period = 'week';
function weekStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function bucketKey(dateStr) { const d = new Date(dateStr + 'T12:00'); if (period === 'month') return dateStr.slice(0, 7);
  const w = weekStart(d); return `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(w.getDate()).padStart(2, '0')}`; }
function bucketLabel(k) { if (period === 'month') return new Date(k + '-01T12:00').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
  const d = new Date(k + 'T12:00'); return d.getDate() + '/' + (d.getMonth() + 1); }
function efficiencyPairs() {
  const logs = sortedLogs().filter(l => l.odo != null).sort((a, b) => a.odo - b.odo), out = [], B = state.settings.battery;
  for (let i = 1; i < logs.length; i++) { const p = logs[i - 1], c = logs[i], miles = c.odo - p.odo;
    const energy = (p.end != null && c.start != null && p.end > c.start) ? (p.end - c.start) / 100 * B : c.kwh;
    if (miles > 0 && energy > 0) out.push({ date: c.date, miles, energy }); }
  return out;
}
function makeBuckets() {
  const n = period === 'month' ? 6 : 8, keys = [], now = new Date();
  for (let i = n - 1; i >= 0; i--) { if (period === 'month') { const d = new Date(now.getFullYear(), now.getMonth() - i, 15); keys.push(d.toISOString().slice(0, 7)); }
    else { const w = weekStart(new Date(now - i * 7 * DAY)); keys.push(`${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(w.getDate()).padStart(2, '0')}`); } }
  const b = Object.fromEntries(keys.map(k => [k, { cost: 0, kwh: 0, n: 0, miles: 0, energy: 0 }]));
  state.logs.forEach(l => { const k = bucketKey(l.date); if (b[k]) { b[k].cost += l.cost || 0; b[k].kwh += l.kwh || 0; b[k].n++; } });
  efficiencyPairs().forEach(p => { const k = bucketKey(p.date); if (b[k]) { b[k].miles += p.miles; b[k].energy += p.energy; } });
  return keys.map(k => ({ k, ...b[k] }));
}
function renderStats() {
  const buckets = makeBuckets(), cur = buckets[buckets.length - 1];
  const totCost = state.logs.reduce((s, l) => s + (l.cost || 0), 0), totKwh = state.logs.reduce((s, l) => s + (l.kwh || 0), 0);
  const pairs = efficiencyPairs(), pm = pairs.reduce((s, p) => s + p.miles, 0), pe = pairs.reduce((s, p) => s + p.energy, 0);
  const label = period === 'month' ? 'this month' : 'this week';
  $('#kpis').innerHTML = `
    <div class="kpi"><b>${gbp(cur.cost)}</b><span>Spend ${label}</span></div>
    <div class="kpi"><b>${cur.kwh.toFixed(1)}</b><span>kWh ${label}</span></div>
    <div class="kpi"><b>${totKwh ? (totCost / totKwh * 100).toFixed(1) + 'p' : '–'}</b><span>Avg p/kWh (all time)</span></div>
    <div class="kpi"><b>${pe ? (pm / pe).toFixed(2) : '–'}</b><span>mi/kWh (odometer)</span></div>
    <div class="kpi"><b>${gbp(totCost)}</b><span>Total spend · ${state.logs.length} charges</span></div>
    <div class="kpi"><b>${pm ? (totCost && pe ? (totCost / totKwh * 100 / (pm / pe)).toFixed(1) + 'p' : '–') : '–'}</b><span>Cost per mile</span></div>`;
  $('#chartTitle').textContent = period === 'month' ? 'Spend per month' : 'Spend per week';
  drawChart(buckets);
  $('#statTable').innerHTML = `<tr><th>${period === 'month' ? 'Month' : 'Week of'}</th><th>£</th><th>kWh</th><th>p/kWh</th><th>mi/kWh</th></tr>` +
    buckets.slice().reverse().map(b => `<tr><td>${bucketLabel(b.k)}</td><td>${b.cost.toFixed(2)}</td><td>${b.kwh.toFixed(1)}</td><td>${b.kwh ? (b.cost / b.kwh * 100).toFixed(1) : '–'}</td><td>${b.energy ? (b.miles / b.energy).toFixed(2) : '–'}</td></tr>`).join('');
}
function drawChart(buckets) {
  const cv = $('#chart'), dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 340, h = 220;
  cv.width = w * dpr; cv.height = h * dpr; const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
  const cs = getComputedStyle(document.documentElement), txt = cs.getPropertyValue('--muted').trim(), line = cs.getPropertyValue('--line').trim(), acc = cs.getPropertyValue('--accent').trim();
  const pad = { l: 38, r: 8, t: 14, b: 28 }, max = Math.max(5, ...buckets.map(b => b.cost)) * 1.15, iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  ctx.font = '11px -apple-system,system-ui,sans-serif'; ctx.fillStyle = txt; ctx.strokeStyle = line; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = pad.t + ih - ih * i / 4; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillText('£' + (max * i / 4).toFixed(0), pad.l - 5, y + 4); }
  const bw = iw / buckets.length;
  buckets.forEach((b, i) => { const bh = ih * b.cost / max, x = pad.l + i * bw + bw * .18, y = pad.t + ih - bh;
    ctx.fillStyle = acc; ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(x, y, bw * .64, bh, [5, 5, 0, 0]) : ctx.rect(x, y, bw * .64, bh)); ctx.fill();
    ctx.fillStyle = txt; ctx.textAlign = 'center'; ctx.fillText(bucketLabel(b.k), pad.l + i * bw + bw / 2, h - 10);
    if (b.cost) ctx.fillText(b.cost.toFixed(0), pad.l + i * bw + bw / 2, y - 4); });
}
$$('[data-period]').forEach(b => b.addEventListener('click', () => { period = b.dataset.period; $$('[data-period]').forEach(x => x.classList.toggle('on', x === b)); renderStats(); }));
window.addEventListener('resize', () => { if ($('#tab-stats').classList.contains('active')) renderStats(); });

// ---------- planner ----------
function logTime(l) { const created = new Date(l.created); const sameDay = l.date === new Date(created - created.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  return sameDay ? l.created : new Date(l.date + 'T18:00').getTime(); }
function estimateSoc() {
  const S = state.settings; let base = null;
  const last = sortedLogs().filter(l => l.end != null).pop();
  if (last) base = { pct: last.end, t: logTime(last), src: `last charge end % (${last.chargerName})` };
  if (state.manual && (!base || state.manual.t >= base.t)) base = { pct: state.manual.pct, t: state.manual.t, src: 'your manual update' };
  if (!base) return null;
  const days = Math.max(0, (Date.now() - base.t) / DAY), miles = days * S.weeklyMiles / 7, eff = effNow();
  const used = miles / eff / S.battery * 100, pct = Math.max(0, Math.min(100, base.pct - used));
  return { pct, base, days, miles, eff, perDay: S.weeklyMiles / 7 / eff / S.battery * 100 };
}
function nextChargeDay(est) {
  const S = state.settings, pref = chargerById(S.pref);
  if (!est) return { text: 'Log a charge or set current % to get a suggestion.', due: false, soon: false };
  const daysLeft = est.perDay > 0 ? (est.pct - S.low) / est.perDay : Infinity;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (daysLeft <= 0) { const wk = today.getDay() % 6 !== 0;
    return { due: true, soon: true, daysLeft, text: `Today – below ${S.low}%. ${wk ? `Plug in at ${pref ? pref.name : 'work'}.` : 'Weekend: try Eastside/Donaldson St AC (40p) or Robroyston P&R rapid near the gym (43p).'}` }; }
  const dueDate = new Date(today.getTime() + Math.floor(daysLeft) * DAY);
  let d = new Date(dueDate); while (d.getDay() === 0 || d.getDay() === 6) d = new Date(d.getTime() - DAY); // latest workday on/before due
  if (d < today) d = today;
  const fmt = x => x.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  const isToday = d.getTime() === today.getTime();
  return { due: false, soon: daysLeft <= 1.5 || isToday, daysLeft, date: d,
    text: `${isToday ? 'Today' : fmt(d)} (≈${daysLeft.toFixed(1)} days until ${S.low}%, reached ~${fmt(dueDate)})` };
}
function weeklyPlanHtml() {
  const S = state.settings, eff = effNow(), wk = S.weeklyMiles / eff, pctWk = wk / S.battery * 100;
  const pref = chargerById(S.pref) || CHARGERS[0], acKw = pref.type === 'ac' ? Math.min(11, pref.kw || 11) : null;
  const sessionKwh = (S.target - S.low) / 100 * S.battery, weeksPer = sessionKwh / wk;
  const hrsWk = acKw ? wk / acKw : null, costWk = (pref.fee || 0) + wk * pref.price / 100;
  const rob = chargerById('robroyston'), robCost = wk * rob.price / 100, robMin = wk / 45 * 60;
  return `<p><b>${S.weeklyMiles} mi/week</b> at ${eff} mi/kWh${isWinter() ? ' (winter)' : ''} ≈ <b>${wk.toFixed(1)} kWh</b> (${pctWk.toFixed(0)}% of battery) per week.</p>
    <ul>
      <li><b>Monday:</b> park at ${esc(pref.name)} on the way into the studio and top up ~${wk.toFixed(0)} kWh${acKw ? ` (≈${hrsWk.toFixed(1)} h at ${acKw} kW)` : ''}. Cost ≈ ${gbp(costWk)}.</li>
      ${acKw && hrsWk > 3 ? `<li>Max stay at Crown Point is unconfirmed (3h vs 12h). If it's 3h, move the car after 3h (~${(3 * acKw).toFixed(0)} kWh) and top up the rest Thursday.</li>` : ''}
      <li><b>Backup:</b> Robroyston Station P&amp;R rapid after PureGym — ${rob.price}p/kWh, ≈${gbp(robCost)} and ~${robMin.toFixed(0)} min for the same energy.</li>
      <li>Keep between ${S.low}% and ${S.target}%. A ${S.low}→${S.target}% session adds ${sessionKwh.toFixed(0)} kWh ≈ ${(weeksPer * 7).toFixed(0)} days of driving.</li>
      <li>Avoid 65–92p rapids (PoGo, Osprey, InstaVolt) unless you’re stuck.</li>
    </ul>
    <p class="small muted">${esc(window.EV3_CPS_NOTE)}</p>`;
}
function renderPlan() {
  const est = estimateSoc(), nx = nextChargeDay(est);
  const pct = est ? Math.round(est.pct) : null, S = state.settings;
  $('#gaugeFill').style.width = (pct ?? 0) + '%';
  $('#gaugeFill').className = 'gauge-fill' + (pct != null && pct <= S.low ? ' low' : pct != null && pct <= S.low + 15 ? ' mid' : '');
  $('#gaugeText').textContent = pct != null ? pct + '%' : '–%';
  $('#socDetail').textContent = est ? `Estimated from ${est.base.src}: ${Math.round(est.base.pct)}% ${est.days < 1 ? 'today' : est.days.toFixed(1) + ' days ago'}, minus ~${est.miles.toFixed(0)} mi at ${est.eff} mi/kWh.` : 'No data yet.';
  $('#nextCharge').textContent = nx.text;
  $('#planText').innerHTML = weeklyPlanHtml();
}
let bannerDismissed = false;
function renderBanner() {
  const est = estimateSoc(), nx = nextChargeDay(est), pill = $('#socPill'), b = $('#dueBanner');
  pill.textContent = est ? Math.round(est.pct) + '%' : '–%'; pill.classList.toggle('low', !!nx.due);
  const hide = () => { b.classList.add('hidden'); document.body.classList.remove('has-banner'); if (map) setTimeout(() => map.invalidateSize(), 50); };
  if (bannerDismissed || !est || !(nx.due || nx.soon)) { hide(); return; }
  document.body.classList.add('has-banner'); if (map) setTimeout(() => map.invalidateSize(), 50);
  b.className = 'banner' + (nx.due ? '' : ' soon');
  b.innerHTML = `${ico(nx.due ? 'plug-zap' : 'alarm-clock')}<span>${nx.due ? 'Due to charge' : 'Charge soon'} · ~${Math.round(est.pct)}%</span><button id="bannerPlan">Plan</button><button id="bannerX" aria-label="Dismiss">${ico('x', '', 2.25)}</button>`;
  $('#bannerPlan').onclick = () => showTab('plan'); $('#bannerX').onclick = () => { bannerDismissed = true; hide(); };
}
$('#manualForm').addEventListener('submit', e => { e.preventDefault(); const p = parseFloat($('#mPct').value); if (isNaN(p)) return;
  const o = parseFloat($('#mOdo').value); state.manual = { pct: p, t: Date.now(), odo: isNaN(o) ? null : o }; save(); $('#manualForm').reset(); bannerDismissed = false; renderAll(); toast('Battery % updated'); });

// ---------- calendar (.ics) ----------
function icsText() {
  const S = state.settings, [hh, mm] = (S.time || '08:30').split(':').map(Number), pref = chargerById(S.pref) || CHARGERS[0];
  const d = new Date(); d.setHours(0, 0, 0, 0); const add = (1 - d.getDay() + 7) % 7 || 7; d.setDate(d.getDate() + add);
  const p2 = n => String(n).padStart(2, '0'), ymd = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const endH = hh + 1;
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//EV3 Charging PWA//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE', 'TZID:Europe/London',
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0000', 'TZOFFSETTO:+0100', 'TZNAME:BST', 'DTSTART:19700329T010000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0000', 'TZNAME:GMT', 'DTSTART:19701025T020000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE', 'BEGIN:VEVENT', 'UID:ev3-weekly-charge@podcaststudioglasgow', 'DTSTAMP:' + stamp,
    `DTSTART;TZID=Europe/London:${ymd}T${p2(hh)}${p2(mm)}00`, `DTEND;TZID=Europe/London:${ymd}T${p2(endH)}${p2(mm)}00`,
    'RRULE:FREQ=WEEKLY;BYDAY=MO', 'SUMMARY:🔌 Charge the EV3',
    `LOCATION:${pref.name.replace(/,/g, '\\,')}\\, ${pref.addr.replace(/,/g, '\\,')}`,
    `DESCRIPTION:Weekly top-up at ${pref.name.replace(/,/g, '\\,')} (${pref.price}p/kWh). Check max stay. Open the EV3 app to log the charge.`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Charge the EV3', 'TRIGGER:-PT0M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
function download(name, text, type) { const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); }
$('#icsBtn').addEventListener('click', () => { download('ev3-weekly-charge.ics', icsText(), 'text/calendar'); toast('Calendar file created – open it to add'); });

// ---------- settings / backup ----------
const SMAP = { sBattery: 'battery', sEff: 'eff', sWinterEff: 'winterEff', sSeason: 'season', sMiles: 'weeklyMiles', sLow: 'low', sTarget: 'target', sPref: 'pref', sTime: 'time', sNav: 'nav' };
function fillSettings() { Object.entries(SMAP).forEach(([id, k]) => $('#' + id).value = state.settings[k]); }
$('#settingsForm').addEventListener('submit', e => { e.preventDefault();
  Object.entries(SMAP).forEach(([id, k]) => { const el = $('#' + id); state.settings[k] = el.type === 'number' ? parseFloat(el.value) : el.value; });
  save(); renderAll(); toast('Settings saved'); });
$('#exportBtn').addEventListener('click', async () => {
  const text = JSON.stringify({ app: 'ev3-charging', version: 1, exported: new Date().toISOString(), ...state }, null, 2), name = `ev3-backup-${todayISO()}.json`;
  try { const f = new File([text], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [f] }) && /iPhone|iPad|Android/.test(navigator.userAgent)) { await navigator.share({ files: [f], title: 'EV3 backup' }); return; } } catch (err) { if (err.name === 'AbortError') return; }
  download(name, text, 'application/json'); toast('Backup exported');
});
$('#importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const d = JSON.parse(await f.text()); if (!d || !Array.isArray(d.logs)) throw new Error('No logs array');
    if (!confirm(`Replace current data with backup (${d.logs.length} charges)?`)) return;
    state = { settings: { ...DEFAULTS, ...(d.settings || {}) }, logs: d.logs, manual: d.manual || null }; save(); fillSettings(); renderAll(); toast('Backup imported ✓');
  } catch (err) { toast('Import failed: ' + err.message); } finally { e.target.value = ''; }
});
$('#resetBtn').addEventListener('click', () => { if (!confirm('Erase all charges and settings on this device?')) return; localStorage.removeItem(KEY); state = load(); fillSettings(); renderAll(); toast('Erased'); });

// ---------- boot ----------
function renderAll() { renderChargers(); renderHistory(); renderBanner(); if ($('#tab-stats').classList.contains('active')) renderStats(); renderPlan(); }
$('#cpsNote').innerHTML = ico('triangle-alert', 'ic-inline') + esc(window.EV3_CPS_NOTE); $('#priceNote').textContent = window.EV3_PRICE_NOTE + ' Pins geocoded via OpenStreetMap / postcodes.io.';
$$('i[data-ic]').forEach(el => { el.outerHTML = ico(el.dataset.ic); });
fillChargerSelect(); fillSettings();
$('#sNav').addEventListener('change', e => { state.settings.nav = e.target.value; save(); renderChargers(); if (map) map.closePopup(); toast('Navigation app: ' + e.target.selectedOptions[0].text); }); resetLogForm(); initMap(); renderAll();
const start = location.hash.slice(1); if (TITLES[start]) showTab(start);
setInterval(renderBanner, 5 * 60e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderBanner(); renderPlan(); } });
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
window.EV3 = { get state() { return state; }, get map() { return map; }, get nearbyLayer() { return nearbyLayer; }, estimateSoc, icsText, appleUrl, googleUrl, searchNearby };
})();
