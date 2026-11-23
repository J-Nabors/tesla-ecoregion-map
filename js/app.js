/* Ecoregion Map — touch-first MapLibre app (no build step). */
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const BASE_URL = new URL('.', location.href).href;
const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';

/* ---------- Base maps ---------- */
const BASES = [
  { id: 'sat', name: 'Satellite', sub: 'Esri World Imagery', tiles: [ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}'], max: 19,
    attr: 'Imagery © <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics, USDA, USGS, and the GIS User Community' },
  { id: 'satlab', name: 'Satellite + labels', sub: 'Esri imagery with places and boundaries', tiles: [ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}'], max: 19,
    attr: 'Imagery © Esri, Maxar, Earthstar Geographics; Labels © Esri', extra: 'esrilabels' },
  { id: 'osm', name: 'OpenStreetMap', sub: 'Standard street map', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], max: 19, attr: OSM_ATTR },
  { id: 'rail', name: 'OpenRailwayMap', sub: 'Railways on a grey OpenStreetMap', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], max: 19, attr: OSM_ATTR, grey: true, forceORM: true },
  { id: 'topo', name: 'Esri World Topo', sub: 'Topographic map', tiles: [ESRI + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}'], max: 19,
    attr: 'Tiles © Esri — Esri, HERE, Garmin, USGS, NGA, EPA, USDA, NPS' },
  { id: 'otm', name: 'OpenTopoMap', sub: 'Contours and relief (OSM + SRTM)', tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'], max: 17,
    attr: 'Map data: ' + OSM_ATTR + ', SRTM | Style: © <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)' },
  { id: 'usgs', name: 'USGS Topo', sub: 'The National Map (public domain)', tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'], max: 16,
    attr: '<a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USGS The National Map</a>' },
  { id: 'relief', name: 'Shaded relief', sub: 'Esri World Shaded Relief (terrain only)', tiles: [ESRI + 'World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}'], max: 13,
    attr: 'Tiles © Esri — Source: Esri' },
  { id: 'dark', name: 'Dark grey', sub: 'Esri Dark Gray Canvas — ecoregion colors pop', tiles: [ESRI + 'Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'], max: 16,
    attr: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors' },
];

/* ---------- State (persisted in URL hash) ---------- */
const S = { base: 'sat', l3: true, l4: true, lab: true, o3: 30, o4: 30, orm: false, hs: false, nlcd: false, onlcd: 55, tap: false, sel: null, ui: +(localStorage.getItem('ecoUi') || 15) };
let initialView = null;
function applyUiSize() { document.documentElement.style.fontSize = S.ui + 'px'; try { localStorage.setItem('ecoUi', S.ui); } catch (e) {} }
(function readHash() {
  const h = location.hash.replace(/^#/, ''); if (!h) return;
  const p = new URLSearchParams(h);
  const m = (p.get('map') || '').split('/').map(Number);
  if (m.length === 3 && m.every(isFinite)) initialView = { zoom: m[0], center: [m[2], m[1]] };
  if (p.has('base') && BASES.some(b => b.id === p.get('base'))) S.base = p.get('base');
  for (const k of ['l3', 'l4', 'lab', 'orm', 'hs', 'nlcd', 'tap']) if (p.has(k)) S[k] = p.get(k) === '1';
  for (const k of ['o3', 'o4', 'onlcd']) if (p.has(k)) S[k] = Math.max(0, Math.min(100, +p.get(k) || 0));
  if (p.has('sel')) S.sel = p.get('sel');
  if ([13, 15, 17].includes(+p.get('ui'))) S.ui = +p.get('ui');
})();
function writeHash() {
  if (!map) return;
  const c = map.getCenter();
  const p = new URLSearchParams();
  p.set('map', `${map.getZoom().toFixed(2)}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`);
  p.set('base', S.base);
  for (const k of ['l3', 'l4', 'lab', 'orm', 'hs', 'nlcd', 'tap']) p.set(k, S[k] ? '1' : '0');
  for (const k of ['o3', 'o4', 'onlcd']) p.set(k, S[k]);
  if (S.sel) p.set('sel', S.sel);
  p.set('ui', S.ui);
  history.replaceState(null, '', '#' + p.toString().replace(/%2F/g, '/').replace(/%3A/g, ':'));
}

/* ---------- Colors ---------- */
function hsl2hex(h, s, l) {
  s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
const l3Hue = c => (parseInt(c, 10) * 137.508) % 360;
function l3Color(c) { return hsl2hex(l3Hue(c), 70, 52); }
function l4Color(c) {
  const m = /^(\d+)([a-z]+)$/.exec(c); if (!m) return '#888';
  let idx = 0; for (const ch of m[2]) idx = idx * 26 + (ch.charCodeAt(0) - 96);
  const h = (l3Hue(m[1]) + ((idx * 23) % 40) - 20 + 360) % 360;
  return hsl2hex(h, 60 + (idx % 3) * 10, 38 + ((idx * 7) % 5) * 7);
}

/* ---------- Data ---------- */
let INDEX = [], CENTERS = {}, L3DATA = null; const L4CACHE = {};
const dataReady = Promise.all([
  fetch('data/index.json').then(r => r.json()).then(j => INDEX = j),
  fetch('data/centers.json').then(r => r.json()).then(j => CENTERS = j),
]);
async function getL3() { if (!L3DATA) L3DATA = await fetch('data/l3.json').then(r => r.json()); return L3DATA; }
async function getL4(code) {
  const l3 = code.replace(/[a-z]+$/, '');
  if (!L4CACHE[l3]) L4CACHE[l3] = fetch(`data/l4/${l3}.json`).then(r => r.json());
  return (await L4CACHE[l3])[code];
}
async function getEntry(key) { const [lv, code] = key.split(':'); return lv === '3' ? (await getL3())[code] : getL4(code); }

/* ---------- Map ---------- */
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);
const PM = new URL('tiles/ecoregions.pmtiles', BASE_URL).href;

function buildStyle() {
  const sources = {
    eco: { type: 'vector', url: 'pmtiles://' + PM, attribution: 'Ecoregions: <a href="https://www.epa.gov/eco-research/ecoregions">U.S. EPA</a>' },
    esrilabels: { type: 'raster', tiles: [ESRI + 'Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 },
    orm: { type: 'raster', tiles: ['https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
      attribution: 'Railways: <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a> (<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA 2.0</a>), data ' + OSM_ATTR },
    hillshade: { type: 'raster', tiles: [ESRI + 'Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16, attribution: 'Hillshade © Esri' },
    nlcd: { type: 'raster', tileSize: 256, attribution: 'Land cover: <a href="https://www.mrlc.gov/">MRLC NLCD 2021</a>',
      tiles: ['https://www.mrlc.gov/geoserver/mrlc_display/wms?service=WMS&version=1.1.1&request=GetMap&layers=NLCD_2021_Land_Cover_L48&styles=&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}'] },
  };
  const layers = [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b0f14' } }];
  for (const b of BASES) {
    sources['base-' + b.id] = { type: 'raster', tiles: b.tiles, tileSize: 256, maxzoom: b.max, attribution: b.attr };
    layers.push({ id: 'base-' + b.id, type: 'raster', source: 'base-' + b.id, layout: { visibility: 'none' },
      paint: b.grey ? { 'raster-saturation': -1, 'raster-brightness-max': 0.75, 'raster-contrast': 0.1 } : {} });
  }
  layers.push(
    { id: 'hillshade', type: 'raster', source: 'hillshade', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.35 } },
    { id: 'nlcd', type: 'raster', source: 'nlcd', layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.55 } },
    // invisible hit layers: always queryable for location / taps
    { id: 'l3-hit', type: 'fill', source: 'eco', 'source-layer': 'l3', paint: { 'fill-opacity': 0 } },
    { id: 'l4-hit', type: 'fill', source: 'eco', 'source-layer': 'l4', paint: { 'fill-opacity': 0 } },
    { id: 'l3-fill', type: 'fill', source: 'eco', 'source-layer': 'l3', maxzoom: 7, paint: { 'fill-color': '#888', 'fill-opacity': 0.35 } },
    { id: 'l4-fill', type: 'fill', source: 'eco', 'source-layer': 'l4', minzoom: 5.5, paint: { 'fill-color': '#888', 'fill-opacity': 0.25 } },
    { id: 'sel-fill', type: 'fill', source: 'eco', 'source-layer': 'l4', filter: ['==', 'c4', '__none__'], paint: { 'fill-color': '#ffd23f', 'fill-opacity': 0.28 } },
    { id: 'sel3-fill', type: 'fill', source: 'eco', 'source-layer': 'l3', filter: ['==', 'c3', '__none__'], paint: { 'fill-color': '#ffd23f', 'fill-opacity': 0.22 } },
    { id: 'l4-line', type: 'line', source: 'eco', 'source-layer': 'l4', minzoom: 5.5,
      paint: { 'line-color': '#ffffff', 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 5.5, 0.4, 9, 1.2, 12, 2] } },
    { id: 'l3-casing', type: 'line', source: 'eco', 'source-layer': 'l3',
      paint: { 'line-color': '#000000', 'line-opacity': 0.6, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2, 8, 5, 12, 7] } },
    { id: 'l3-line', type: 'line', source: 'eco', 'source-layer': 'l3',
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 8, 2.4, 12, 3.5] } },
    { id: 'orm', type: 'raster', source: 'orm', layout: { visibility: 'none' } },
    { id: 'esrilabels', type: 'raster', source: 'esrilabels', layout: { visibility: 'none' } },
    { id: 'sel-line', type: 'line', source: 'eco', 'source-layer': 'l4', filter: ['==', 'c4', '__none__'],
      paint: { 'line-color': '#ffd23f', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3, 10, 6] } },
    { id: 'sel3-line', type: 'line', source: 'eco', 'source-layer': 'l3', filter: ['==', 'c3', '__none__'],
      paint: { 'line-color': '#ffd23f', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3, 10, 6] } },
    { id: 'l4-label', type: 'symbol', source: 'eco', 'source-layer': 'l4lab', minzoom: 7,
      layout: { 'text-field': ['concat', ['get', 'code'], '  ', ['get', 'name']], 'text-font': ['Open Sans Semibold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 7, 13, 10, 17, 13, 20], 'text-max-width': 9, 'symbol-sort-key': ['-', 0, ['get', 'area']], 'text-padding': 6 },
      paint: { 'text-color': '#fff6c8', 'text-halo-color': '#000', 'text-halo-width': 2 } },
    { id: 'l3-label', type: 'symbol', source: 'eco', 'source-layer': 'l3lab', minzoom: 3, maxzoom: 8.5,
      filter: ['any', ['==', ['get', 'rank'], 0], ['>=', ['zoom'], 5.5]],
      layout: { 'text-field': ['concat', ['get', 'code'], '  ', ['get', 'name']], 'text-font': ['Open Sans Semibold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 3, 12, 5, 16, 8, 21], 'text-max-width': 8, 'symbol-sort-key': ['-', 0, ['get', 'area']], 'text-padding': 4 },
      paint: { 'text-color': '#ffffff', 'text-halo-color': '#000', 'text-halo-width': 2.2 } },
    { id: 'me-acc', type: 'fill', source: 'me', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#ff3b3b', 'fill-opacity': 0.15 } },
    { id: 'me-acc-line', type: 'line', source: 'me', filter: ['==', '$type', 'Polygon'], paint: { 'line-color': '#ff3b3b', 'line-width': 2 } },
    { id: 'me-halo', type: 'circle', source: 'me', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 20, 'circle-color': '#ff3b3b', 'circle-opacity': 0.3 } },
    { id: 'me-dot', type: 'circle', source: 'me', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 10, 'circle-color': '#ff1f1f', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } },
  );
  sources.me = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
  return { version: 8, glyphs: BASE_URL + 'vendor/fonts/{fontstack}/{range}.pbf', sources, layers };
}

applyUiSize();
const USA = { center: [-98.5, 39.5], zoom: 3.6 };
const map = new maplibregl.Map({
  container: 'map', style: buildStyle(), center: (initialView || USA).center, zoom: (initialView || USA).zoom,
  maxZoom: 18, minZoom: 1.5, dragRotate: false, pitchWithRotate: false, touchPitch: false, attributionControl: false,
  fadeDuration: 150, clickTolerance: 6,
});
window.__map = map;
map.touchZoomRotate.disableRotation();
map.keyboard.disableRotation();
map.addControl(new maplibregl.AttributionControl({ compact: false }), 'bottom-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'imperial', maxWidth: 160 }), 'bottom-right');

map.on('load', () => {
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'geolocation' }).then(r => { if (r.state === 'granted' && watchId == null) startLocate(); }).catch(() => {});
  }
});
map.on('load', async () => {
  await dataReady;
  // color expressions built from the index
  const m3 = ['match', ['get', 'c3']], m4 = ['match', ['get', 'c4']];
  for (const e of INDEX) { if (e.l === 3) m3.push(e.c, l3Color(e.c)); else m4.push(e.c, l4Color(e.c)); }
  m3.push('#888'); m4.push('#888');
  map.setPaintProperty('l3-fill', 'fill-color', m3);
  map.setPaintProperty('l4-fill', 'fill-color', m4);
  applyLayers();
  buildDrawer();
  syncTap();
  if (S.sel) selectKey(S.sel, { fly: !initialView, open: true });
  writeHash();
  document.body.dataset.ready = '1';
});
map.on('moveend', writeHash);
map.on('error', (e) => { if (e && e.error) console.warn('map error', e.error.message || e.error); });

function vis(id, on) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); }
function applyLayers() {
  const base = BASES.find(b => b.id === S.base) || BASES[0];
  for (const b of BASES) vis('base-' + b.id, b.id === base.id);
  vis('esrilabels', base.extra === 'esrilabels');
  vis('orm', S.orm || !!base.forceORM);
  vis('hillshade', S.hs);
  vis('nlcd', S.nlcd);
  map.setPaintProperty('nlcd', 'raster-opacity', S.onlcd / 100);
  vis('l3-fill', S.l3); vis('l3-line', S.l3); vis('l3-casing', S.l3);
  vis('l4-fill', S.l4); vis('l4-line', S.l4);
  vis('l3-label', S.l3 && S.lab); vis('l4-label', S.l4 && S.lab);
  // when L4 is off, keep L3 fill at all zooms; otherwise hand over to L4 when zoomed in
  map.setLayerZoomRange('l3-fill', 0, S.l4 ? 5.5 : 24);
  map.setLayerZoomRange('l3-label', 3, S.l4 ? 8.5 : 24);
  map.setPaintProperty('l3-fill', 'fill-opacity', S.o3 / 100);
  map.setPaintProperty('l4-fill', 'fill-opacity', S.o4 / 100);
  writeHash();
}

/* ---------- Drawer ---------- */
function buildDrawer() {
  const list = $('baseList'); list.innerHTML = '';
  for (const b of BASES) {
    const el = document.createElement('button');
    el.setAttribute('role', 'radio'); el.dataset.id = b.id;
    el.textContent = b.name; el.title = b.sub;
    el.onclick = () => { S.base = b.id; applyLayers(); syncDrawer(); };
    list.appendChild(el);
  }
  const bindT = (id, key) => { $(id).onchange = () => { S[key] = $(id).checked; applyLayers(); }; };
  bindT('tL3', 'l3'); bindT('tL4', 'l4'); bindT('tLab', 'lab'); bindT('tORM', 'orm'); bindT('tHS', 'hs'); bindT('tNLCD', 'nlcd');
  const bindO = (id, key) => { $(id).oninput = () => { S[key] = +$(id).value; $(id + 'v').textContent = S[key] + '%'; applyLayers(); }; };
  bindO('oL3', 'o3'); bindO('oL4', 'o4'); bindO('oNLCD', 'onlcd');
  $('uiSize').querySelectorAll('button').forEach(b => b.onclick = () => { S.ui = +b.dataset.s; applyUiSize(); syncDrawer(); writeHash(); setTimeout(() => map.resize(), 50); });
  syncDrawer();
}
function syncDrawer() {
  for (const el of $('baseList').children) el.setAttribute('aria-checked', el.dataset.id === S.base);
  $('uiSize').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.s === S.ui));
  $('tL3').checked = S.l3; $('tL4').checked = S.l4; $('tLab').checked = S.lab; $('tORM').checked = S.orm; $('tHS').checked = S.hs; $('tNLCD').checked = S.nlcd;
  for (const [id, k] of [['oL3', 'o3'], ['oL4', 'o4'], ['oNLCD', 'onlcd']]) { $(id).value = S[k]; $(id + 'v').textContent = S[k] + '%'; }
}
$('btnLayers').onclick = () => { $('drawer').hidden = !$('drawer').hidden; sheetState(); };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => {
  $(b.dataset.close).hidden = true; sheetState();
  if (b.dataset.close === 'panel') { stopSpeech(); clearSelection(); }
});
$('aboutLink').onclick = (e) => { e.preventDefault(); showModal(ABOUT); };

/* ---------- Zoom / reset ---------- */
/* Zoom buttons: step to the next whole zoom level from the pending target, so repeated taps
   accumulate, and keep the location centered while following. */
let zoomTarget = null;
function zoomStep(d) {
  const base = zoomTarget != null ? zoomTarget : map.getZoom();
  let z = d > 0 ? Math.floor(base + 1e-6) + 1 : Math.ceil(base - 1e-6) - 1;
  z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), z));
  const opts = { zoom: z, duration: 300 };
  if (following && lastPos) opts.center = [lastPos.lng, lastPos.lat];
  map.easeTo(opts);
  zoomTarget = z; // set after easeTo: stopping the previous animation fires zoomend synchronously
}
map.on('zoomend', () => { zoomTarget = null; });
$('btnZoomIn').onclick = () => zoomStep(1);
$('btnZoomOut').onclick = () => zoomStep(-1);
$('btnNorth').onclick = () => { stopFollow(); map.flyTo({ ...USA, bearing: 0, duration: 900 }); };

/* ---------- Tap-for-info toggle ---------- */
function syncTap() {
  $('btnTap').setAttribute('aria-pressed', S.tap);
  $('tapState').textContent = S.tap ? 'ON' : 'OFF';
  map.getCanvas().style.cursor = S.tap ? 'pointer' : '';
}
$('btnTap').onclick = () => {
  S.tap = !S.tap; syncTap(); writeHash();
  toast(S.tap ? 'Tap info is ON — tap any region to learn about it.' : 'Tap info is OFF — tapping the map just pans.');
};
map.on('click', (e) => {
  if (!S.tap) return;
  const pad = 4, p = e.point, box = [[p.x - pad, p.y - pad], [p.x + pad, p.y + pad]];
  const useL4 = S.l4 && map.getZoom() >= 5.5 || !S.l3;
  let f = map.queryRenderedFeatures(box, { layers: [useL4 ? 'l4-hit' : 'l3-hit'] })[0];
  if (!f && useL4) f = map.queryRenderedFeatures(box, { layers: ['l3-hit'] })[0];
  if (!f) { toast('No EPA ecoregion here (outside the mapped area).'); return; }
  const key = f.properties.c4 && useL4 ? '4:' + f.properties.c4 : '3:' + f.properties.c3;
  selectKey(key, { fly: false, open: true });
});

/* ---------- Selection & panel ---------- */
function clearSelection() {
  S.sel = null;
  map.setFilter('sel-fill', ['==', 'c4', '__none__']); map.setFilter('sel-line', ['==', 'c4', '__none__']);
  map.setFilter('sel3-fill', ['==', 'c3', '__none__']); map.setFilter('sel3-line', ['==', 'c3', '__none__']);
  writeHash();
}
async function selectKey(key, { fly = true, open = true } = {}) {
  const [lv, code] = key.split(':');
  const e = await getEntry(key);
  if (!e) { toast('Ecoregion ' + code + ' not found'); return; }
  S.sel = key;
  if (lv === '4') {
    map.setFilter('sel-fill', ['==', 'c4', code]); map.setFilter('sel-line', ['==', 'c4', code]);
    map.setFilter('sel3-fill', ['==', 'c3', '__none__']); map.setFilter('sel3-line', ['==', 'c3', '__none__']);
  } else {
    map.setFilter('sel3-fill', ['==', 'c3', code]); map.setFilter('sel3-line', ['==', 'c3', code]);
    map.setFilter('sel-fill', ['==', 'c4', '__none__']); map.setFilter('sel-line', ['==', 'c4', '__none__']);
  }
  stopSpeech();
  if (open) renderPanel(e);
  if (fly) {
    const c = CENTERS[key];
    if (c) {
      stopFollow();
      const panelW = open ? $('panel').getBoundingClientRect().width : 0;
      map.flyTo({ center: c, zoom: lv === '4' ? Math.min(Math.max(map.getZoom(), 8), 10) : 6, padding: { left: 0, right: panelW, top: 0, bottom: 0 }, duration: 1200 });
    }
  }
  writeHash();
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function sheetState() { document.body.classList.toggle('panel-open', !$('panel').hidden); document.body.classList.toggle('drawer-open', !$('drawer').hidden); }
function renderPanel(e) {
  const isL4 = e.level === 4;
  $('panelTitle').innerHTML = `<div class="plevel">EPA Level ${isL4 ? 'IV' : 'III'} ecoregion${e.alaska ? ' · Alaska' : ''}</div>
    <div class="ptitle"><span class="chip ${isL4 ? '' : 'l3'}">${esc(e.code)}</span><span class="nm">${esc(e.name)}</span></div>`;
  let h = '<div class="hier">';
  if (isL4) h += `<div class="h"><span class="k">Level III</span><button class="linkbtn" data-key="3:${esc(e.l3)}">${esc(e.l3)} ${esc(e.l3name)} ›</button></div>`;
  if (!isL4 && e.na3) h += `<div class="h"><span class="k">N. Am. III</span><span>${esc(e.na3)}</span></div>`;
  h += `<div class="h"><span class="k">Level II</span><span>${esc(e.na2)} ${esc(e.na2name)}</span></div>`;
  h += `<div class="h"><span class="k">Level I</span><span>${esc(e.na1)} ${esc(e.na1name)}</span></div></div>`;
  h += '<h3>What characterizes it</h3>';
  if (TTS) {
    h += `<div class="speakrow"><button class="speak" id="speakDesc" data-mode="desc">${SPK_ICON}<span>Read aloud</span></button>`;
    if (e.neighbors.length) h += ` <button class="speak" id="speakNb" data-mode="nb">${SPK_ICON}<span>Read neighbor differences</span></button>`;
    h += '</div>';
  }
  if (e.desc) {
    h += `<div class="desc">${esc(e.desc)}</div><div class="src">Source: <a href="${esc(e.srcurl)}" target="_blank" rel="noopener">${esc(e.src)}</a> (U.S. EPA)</div>`;
  } else {
    h += `<div class="missing">No official EPA description text was available to this map for this ecoregion. See the <a href="${esc(e.srcurl)}" target="_blank" rel="noopener">EPA ecoregion maps and posters</a> for this state.</div>`;
  }
  h += `<h3>How it differs from its neighbors (${e.neighbors.length})</h3>`;
  if (!e.neighbors.length) h += '<p>No adjacent ecoregions at this level.</p>';
  for (const n of e.neighbors) {
    const nkey = (isL4 ? '4:' : '3:') + n.code;
    h += `<div class="nb"><button class="nbhead" data-key="${nkey}"><span class="chip ${isL4 ? '' : 'l3'}">${esc(n.code)}</span><span class="nm">${esc(n.name)}${n.otherL3 ? `<span class="tag">in L3 ${esc(n.otherL3)}</span>` : ''}</span><span class="nbgo">Go ›</span></button><div class="nbbody">`;
    if (n.epa && n.epa.length) {
      for (const q of n.epa) h += `<div class="q"><span class="who">EPA, describing ${q.from === 'here' ? esc(e.code) + ' (this region)' : esc(n.code) + ' (neighbor)'}</span>${esc(q.text)}</div>`;
    }
    if (n.cmp && n.cmp.length) {
      h += `<div class="kw">Compared with ${esc(n.code)} ${esc(n.name)} — from keywords in each EPA description</div><ul>`;
      for (const b of n.cmp) h += `<li>${esc(b)}</li>`;
      h += '</ul>';
    }
    if ((!n.epa || !n.epa.length) && (!n.cmp || !n.cmp.length)) {
      h += `<p class="src">${!e.desc || !n.hasDesc ? 'No comparison: an EPA description is missing for ' + (e.desc ? 'the neighbor' : 'this region') + '.' : 'EPA descriptions do not highlight a clear difference in landforms, geology, soils, vegetation or land use keywords.'}</p>`;
    }
    h += '</div></div>';
  }
  h += `<p class="note">Neighbors share a boundary at this level. Quotes are verbatim from EPA text; keyword bullets list terms that appear in one region's EPA description but not the other's, so check the full text for nuance.</p>`;
  $('panelBody').innerHTML = h;
  $('panelBody').scrollTop = 0;
  $('panel').hidden = false; sheetState();
  $('panelBody').querySelectorAll('[data-key]').forEach(b => b.onclick = () => selectKey(b.dataset.key, { fly: true, open: true }));
  $('panelBody').querySelectorAll('.speak').forEach(b => b.onclick = () => toggleSpeech(b, e));
}

/* ---------- Geolocation ---------- */
let watchId = null, following = false, lastPos = null, firstFix = true, lastLookup = null;
function setLocateUI(state) {
  const b = $('btnLocate'); b.classList.remove('busy', 'active', 'follow');
  if (state) b.classList.add(state);
  $('locateLabel').textContent = state === 'follow' ? 'Following' : state === 'active' ? 'Re-center' : state === 'busy' ? 'Locating…' : 'Locate';
}
function circlePoly(lng, lat, r) {
  const pts = [], R = 6378137, n = 64;
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * 2 * Math.PI, dx = r * Math.cos(t), dy = r * Math.sin(t);
    pts.push([lng + (dx / (R * Math.cos(lat * Math.PI / 180))) * 180 / Math.PI, lat + (dy / R) * 180 / Math.PI]);
  }
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [pts] }, properties: {} };
}
function onPos(pos) {
  const { longitude: lng, latitude: lat, accuracy } = pos.coords;
  lastPos = { lng, lat, accuracy };
  map.getSource('me').setData({ type: 'FeatureCollection', features: [circlePoly(lng, lat, Math.max(accuracy || 0, 5)),
    { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: {} }] });
  if (firstFix) {
    firstFix = false; following = true;
    toast('Location found' + (accuracy ? ` (±${accuracy < 1000 ? Math.round(accuracy * 3.281) + ' ft' : (accuracy / 1609).toFixed(1) + ' mi'})` : '') + '.');
    map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 9), duration: 1200 });
  } else if (following && !map.isMoving()) {
    map.easeTo({ center: [lng, lat], duration: 500 });
  }
  setLocateUI(following ? 'follow' : 'active');
  scheduleLookup();
}
function onPosErr(err) {
  const wasFirst = firstFix;
  if (err.code === 1) {
    stopLocate();
    showModal(`<h2>Location permission denied</h2><p>This map can't see your location because permission was blocked.</p>
      <ul><li>Reload the page and tap <b>Allow</b> when the browser asks.</li>
      <li>If it never asks, open the browser's site settings and allow location for this site.</li>
      <li>Location only works on a secure <b>https://</b> address.</li></ul>`);
  } else if (err.code === 3) {
    toast(wasFirst ? 'Still looking for GPS… (timed out, retrying)' : 'GPS signal weak — waiting for a better fix.');
  } else {
    toast('Location unavailable right now — still trying.');
  }
}
function startLocate() {
  if (!('geolocation' in navigator)) { showModal('<h2>No location support</h2><p>This browser does not provide location.</p>'); return; }
  if (!window.isSecureContext) { showModal('<h2>Needs a secure page</h2><p>Location only works when this map is opened over <b>https://</b>.</p>'); return; }
  firstFix = true; setLocateUI('busy');
  // quick coarse fix first (cached/network OK), then a continuous high-accuracy watch
  navigator.geolocation.getCurrentPosition((p) => { if (watchId != null && firstFix) onPos(p); }, () => {}, { enableHighAccuracy: false, maximumAge: 600000, timeout: 15000 });
  watchId = navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 });
}
function stopLocate() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null; following = false; lastPos = null; setLocateUI(null);
  map.getSource('me') && map.getSource('me').setData({ type: 'FeatureCollection', features: [] });
  $('whereami').hidden = true;
}
function stopFollow() { if (following) { following = false; if (watchId != null) setLocateUI('active'); } }
$('btnLocate').onclick = () => {
  if (watchId == null) return startLocate();
  if (!lastPos) return; // still acquiring
  if (!following) {
    following = true; setLocateUI('follow');
    map.flyTo({ center: [lastPos.lng, lastPos.lat], zoom: Math.max(map.getZoom(), 9), duration: 800 });
    toast('Following your location. Drag the map to stop following.');
  } else {
    stopLocate(); toast('Location off.');
  }
};
map.on('dragstart', (e) => { if (e.originalEvent) stopFollow(); });

/* which ecoregion am I in? local tile query first, EPA service as fallback */
let lookupTimer = null;
function scheduleLookup() { clearTimeout(lookupTimer); lookupTimer = setTimeout(lookupHere, 400); }
map.on('idle', () => { if (lastPos && $('whereami').hidden) scheduleLookup(); });
async function lookupHere() {
  if (!lastPos) return;
  const { lng, lat } = lastPos;
  let c4 = null, c3 = null;
  const pt = map.project([lng, lat]); const cv = map.getCanvas();
  if (pt.x >= 0 && pt.y >= 0 && pt.x <= cv.clientWidth && pt.y <= cv.clientHeight) {
    const f4 = map.queryRenderedFeatures(pt, { layers: ['l4-hit'] })[0];
    const f3 = map.queryRenderedFeatures(pt, { layers: ['l3-hit'] })[0];
    if (f4) { c4 = f4.properties.c4; c3 = f4.properties.c3; }
    else if (f3) c3 = f3.properties.c3;
  }
  if (!c4 && !c3) {
    const k = lng.toFixed(3) + ',' + lat.toFixed(3);
    if (lastLookup && lastLookup.k === k) { c4 = lastLookup.c4; c3 = lastLookup.c3; }
    else {
      try {
        const u = 'https://geodata.epa.gov/arcgis/rest/services/ORD/USEPA_Ecoregions_Level_III_and_IV/MapServer/7/query?f=json&returnGeometry=false&outFields=US_L4CODE,US_L3CODE&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&geometry=' + lng + ',' + lat;
        const j = await fetch(u).then(r => r.json());
        const a = j.features && j.features[0] && j.features[0].attributes;
        if (a) { c4 = a.US_L4CODE; c3 = a.US_L3CODE; }
        lastLookup = { k, c4, c3 };
      } catch (e) { /* offline */ }
    }
  }
  showWhere(c4, c3);
}
async function showWhere(c4, c3) {
  const w = $('whereami');
  if (!c4 && !c3) { w.hidden = false; $('whereL4').textContent = 'Outside mapped ecoregions'; $('whereL3').textContent = ''; w.onclick = null; return; }
  await dataReady;
  const n3 = (INDEX.find(e => e.l === 3 && e.c === c3) || {}).n || '';
  const n4 = c4 ? (INDEX.find(e => e.l === 4 && e.c === c4) || {}).n || '' : '';
  $('whereL4').textContent = c4 ? `${c4} · ${n4}` : `${c3} · ${n3}`;
  $('whereL3').textContent = c4 ? `Level III: ${c3} · ${n3}` : 'Level III (no Level IV mapped here)';
  w.hidden = false;
  w.onclick = () => selectKey(c4 ? '4:' + c4 : '3:' + c3, { fly: false, open: true });
}

/* ---------- Search ---------- */
let searchTimer = null;
$('q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(false), 150); });
$('searchform').addEventListener('submit', (e) => { e.preventDefault(); runSearch(true); });
$('q').addEventListener('focus', () => { if ($('q').value) runSearch(false); });
map.on('movestart', () => { $('results').hidden = true; });
function norm(s) { return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
async function runSearch(withPlaces) {
  const q = $('q').value.trim(); const box = $('results');
  if (!q) { box.hidden = true; return; }
  await dataReady;
  const nq = norm(q), cq = q.toLowerCase().replace(/\s+/g, '');
  const hits = INDEX.filter(e => e.c.toLowerCase() === cq || norm(e.n).includes(nq))
    .sort((a, b) => (a.c.toLowerCase() === cq ? -1 : 0) - (b.c.toLowerCase() === cq ? -1 : 0) || a.l - b.l).slice(0, 8);
  let html = hits.map(e => `<button class="res" data-key="${e.l}:${e.c}"><span class="chip ${e.l === 3 ? 'l3' : ''}">${esc(e.c)}</span><span>${esc(e.n)}<div class="sub">Level ${e.l === 3 ? 'III' : 'IV'} ecoregion${e.p ? ' in ' + esc(e.p) : ''}${e.a ? ' · Alaska' : ''}</div></span></button>`).join('');
  if (withPlaces) html += '<div class="res sub" id="placeLoading">Searching places…</div>';
  else html += `<button class="res" id="placeBtn"><span class="chip l3">📍</span><span>Search places for “${esc(q)}”<div class="sub">Press Go or tap here</div></span></button>`;
  box.innerHTML = html; box.hidden = false;
  box.querySelectorAll('[data-key]').forEach(b => b.onclick = () => { box.hidden = true; $('q').blur(); selectKey(b.dataset.key, { fly: true, open: true }); });
  const pb = $('placeBtn'); if (pb) pb.onclick = () => runSearch(true);
  if (withPlaces) {
    try {
      const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=us&q=' + encodeURIComponent(q);
      const j = await fetch(u, { headers: { 'Accept-Language': 'en' } }).then(r => r.json());
      const el = $('placeLoading'); if (!el) return;
      el.outerHTML = j.length ? j.map((p, i) => `<button class="res" data-place="${i}"><span class="chip l3">📍</span><span>${esc(p.display_name.split(',').slice(0, 2).join(','))}<div class="sub">${esc(p.display_name.split(',').slice(2, 5).join(','))}</div></span></button>`).join('')
        : '<div class="res sub">No places found.</div>';
      box.querySelectorAll('[data-place]').forEach(b => b.onclick = () => {
        const p = j[+b.dataset.place]; box.hidden = true; $('q').blur(); stopFollow();
        if (p.boundingbox) { const bb = p.boundingbox.map(Number); map.fitBounds([[bb[2], bb[0]], [bb[3], bb[1]]], { maxZoom: 12, padding: 80, duration: 1200 }); }
        else map.flyTo({ center: [+p.lon, +p.lat], zoom: 11 });
      });
    } catch (e) { const el = $('placeLoading'); if (el) el.textContent = 'Place search unavailable (offline?).'; }
  }
}

/* ---------- Read aloud (Web Speech API) ---------- */
const TTS = 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
const SPK_ICON = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3Zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4ZM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6Z"/></svg>';
let speechSession = 0, speakingBtn = null;
function spokenify(t) {
  return String(t).replace(/in\/yr/g, 'inches per year').replace(/(\d) ft\b/g, '$1 feet').replace(/–/g, ' to ').replace(/—/g, ', ').replace(/\[…\]/g, '').replace(/\s+/g, ' ').trim();
}
function chunks(text) {
  const out = []; let cur = '';
  for (const s of text.split(/(?<=[.!?;])\s+/)) {
    if ((cur + ' ' + s).length > 220 && cur) { out.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
  }
  if (cur) out.push(cur);
  return out;
}
function setSpeakBtn(b, on) {
  if (!b) return;
  b.classList.toggle('on', on);
  b.querySelector('span').textContent = on ? 'Stop' : (b.dataset.mode === 'nb' ? 'Read neighbor differences' : 'Read aloud');
}
function stopSpeech() {
  if (!TTS) return;
  speechSession++;
  window.speechSynthesis.cancel();
  setSpeakBtn(speakingBtn, false); speakingBtn = null;
}
function speechText(e, mode) {
  const lvl = e.level === 4 ? 'Level 4' : 'Level 3';
  if (mode === 'desc') {
    let t = `${e.name}. EPA ${lvl} ecoregion ${e.code}. `;
    t += e.desc ? e.desc : 'No EPA description is available for this ecoregion.';
    return t;
  }
  const parts = [`How ${e.name} differs from its neighbors.`];
  for (const n of e.neighbors) {
    let p = `Compared with ${n.code}, ${n.name}. `;
    for (const q of n.epa || []) p += q.text + ' ';
    for (const b of n.cmp || []) p += b.replace(/only here:/g, 'only in this region:').replace(/only there:/g, 'only in the neighbor:') + '. ';
    if ((!n.epa || !n.epa.length) && (!n.cmp || !n.cmp.length)) p += 'No comparison available. ';
    parts.push(p);
  }
  return parts.join(' ');
}
function pickVoice() {
  const vs = window.speechSynthesis.getVoices() || [];
  return vs.find(v => /^en[-_]US/i.test(v.lang) && v.localService) || vs.find(v => /^en[-_]US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang)) || null;
}
function toggleSpeech(btn, e) {
  if (speakingBtn === btn) { stopSpeech(); return; }
  stopSpeech();
  const session = ++speechSession; speakingBtn = btn; setSpeakBtn(btn, true);
  const list = chunks(spokenify(speechText(e, btn.dataset.mode)));
  const voice = pickVoice();
  let i = 0;
  const next = () => {
    if (session !== speechSession) return;
    if (i >= list.length) { setSpeakBtn(btn, false); speakingBtn = null; return; }
    const u = new SpeechSynthesisUtterance(list[i++]);
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : 'en-US'; u.rate = 1;
    u.onend = next;
    u.onerror = (ev) => { if (session === speechSession && ev.error !== 'interrupted' && ev.error !== 'canceled') { toast('Read aloud failed: ' + ev.error); stopSpeech(); } };
    window.speechSynthesis.speak(u);
  };
  next();
}
if (TTS) { window.speechSynthesis.getVoices(); window.addEventListener('pagehide', () => window.speechSynthesis.cancel()); }

/* ---------- Modal / toast ---------- */
function showModal(html) { $('modalBody').innerHTML = html; $('modal').hidden = false; }
$('modalOk').onclick = () => { $('modal').hidden = true; };
let toastTimer = null;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 3200); }
const ABOUT = `<h2>About this map</h2>
<p>Ecoregion boundaries are the U.S. EPA Level III and IV ecoregions (Level IV: conterminous U.S.; Alaska: Level III only), converted to vector tiles.</p>
<p>Descriptions are taken from EPA's Level III descriptions and the state Level IV ecoregion posters and description documents. Where EPA text was not available, the panel says so and links to EPA.</p>
<p>Neighbor comparisons quote EPA sentences that mention the neighbor, plus keywords found in one description but not the other.</p>
<p><a href="https://www.epa.gov/eco-research/ecoregions" target="_blank" rel="noopener">EPA Ecoregions</a></p>`;

/* keep panel from swallowing map gestures, and close search when tapping map */
map.on('touchstart', () => { $('results').hidden = true; });
})();
