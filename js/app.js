/* Ecoregion Map - touch-first MapLibre app (no build step). */
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const BASE_URL = new URL('.', location.href).href;
const OSM_ATTR = '(c) <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>';
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';

/* ---------- Base maps ---------- */
/* has: map content a base already draws, so the matching overlay toggle is disabled on it.
   Audited from the tiles at z9-z13: OSM, OpenRailwayMap (grey OSM), Esri Topo, OpenTopoMap and USGS Topo all draw
   roads, city/town names and county boundaries; satellite, elevation and shaded relief draw none of them. */
const ALL = { roads: true, cities: true, counties: true };
const BASES = [
  { id: 'sat', name: 'Satellite', sub: 'Esri World Imagery', tiles: [ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}'], max: 19,
    attr: 'Imagery (c) <a href="https://www.esri.com">Esri</a>, Maxar, Earthstar Geographics, USDA, USGS, and the GIS User Community' },
  { id: 'osm', has: ALL, name: 'OpenStreetMap', sub: 'Standard street map', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], max: 19, attr: OSM_ATTR },
  { id: 'rail', has: ALL, name: 'OpenRailwayMap', sub: 'Railways on a grey OpenStreetMap', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], max: 19, attr: OSM_ATTR, grey: true, forceORM: true },
  { id: 'topo', has: ALL, name: 'Esri World Topo', sub: 'Topographic map', tiles: [ESRI + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}'], max: 19,
    attr: 'Tiles (c) Esri - Esri, HERE, Garmin, USGS, NGA, EPA, USDA, NPS' },
  { id: 'otm', has: ALL, name: 'OpenTopoMap', sub: 'Contours and relief (OSM + SRTM)', tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'], max: 17,
    attr: 'Map data: ' + OSM_ATTR + ', SRTM | Style: (c) <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)' },
  { id: 'usgs', has: ALL, name: 'USGS Topo', sub: 'The National Map (public domain)', tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'], max: 16,
    attr: '<a href="https://www.usgs.gov/programs/national-geospatial-program/national-map">USGS The National Map</a>' },
  { id: 'elev', name: 'Elevation', sub: 'Color-tinted elevation with hillshade (AWS Terrain Tiles)', dem: true },
  { id: 'relief', name: 'Shaded relief', sub: 'Esri World Shaded Relief (terrain only)', tiles: [ESRI + 'World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}'], max: 13,
    attr: 'Tiles (c) Esri - Source: Esri' },
];

/* ---------- State (persisted in URL hash) ---------- */
const S = { base: 'sat', cities: false, counties: false, roads: false, l3: true, l4: true, lab: true, o3: 30, o4: 30, orm: false, hs: false, nlcd: false, onlcd: 55, tap: false, sel: null, ui: (function () { try { return localStorage.getItem('ecoUiScale') || 'auto'; } catch (e) { return 'auto'; } })() };
let initialView = null;
/* Display size: Auto = the detected device profile's default; the fixed steps override it. */
const UI_STEPS = { xs: 0.7, s: 0.8, m: 0.9, l: 1.0, xl: 1.15 };
const DEV = window.DEVICE || { type: 'desktop', how: 'default', model: '', defScale: 0.9 };
function uiScale() {
  let k = UI_STEPS[S.ui] || DEV.defScale;
  const vv = window.visualViewport;
  if (vv && vv.scale > 1.01) k = k / vv.scale; // page pinch-zoomed by the browser: keep controls the same physical size
  return Math.round(k * 1000) / 1000;
}
function updateUiDebug() {
  const el = document.getElementById('uiDebug'); if (!el) return;
  const vv = window.visualViewport, k = uiScale();
  const vw = vv ? Math.round(vv.width) : innerWidth, vh = vv ? Math.round(vv.height) : innerHeight;
  el.textContent = `device: ${DEV.type}${DEV.model ? ' | ' + DEV.model : ''} (${DEV.how})\n` +
    `viewport ${vw}x${vh} | screen ${screen.width}x${screen.height} | DPR ${+(window.devicePixelRatio || 1).toFixed(2)}${vv && Math.abs(vv.scale - 1) > 0.01 ? ' | zoom ' + vv.scale.toFixed(2) : ''}\n` +
    `ui-scale ${k} (${S.ui === 'auto' || !UI_STEPS[S.ui] ? 'auto' : S.ui.toUpperCase()}) | text ${+(16 * k).toFixed(1)}px`;
}
function applyUiSize() {
  if (S.ui !== 'auto' && !UI_STEPS[S.ui]) S.ui = 'auto';
  document.documentElement.style.setProperty('--ui-scale', uiScale());
  try { localStorage.setItem('ecoUiScale', S.ui); } catch (e) {}
  updateUiDebug();
}
addEventListener('resize', () => { applyUiSize(); });
if (window.visualViewport) visualViewport.addEventListener('resize', () => { applyUiSize(); });
(function readHash() {
  const h = location.hash.replace(/^#/, ''); if (!h) return;
  const p = new URLSearchParams(h);
  const m = (p.get('map') || '').split('/').map(Number);
  if (m.length === 3 && m.every(isFinite)) initialView = { zoom: m[0], center: [m[2], m[1]] };
  if (p.has('base') && BASES.some(b => b.id === p.get('base'))) S.base = p.get('base');
  // old combo bases (v3) become plain satellite plus the matching overlays
  if (p.get('base') === 'satlab') { S.base = 'sat'; S.cities = true; }
  if (p.get('base') === 'satroads') { S.base = 'sat'; S.cities = true; S.roads = true; }
  for (const k of ['l3', 'l4', 'lab', 'orm', 'hs', 'nlcd', 'tap', 'cities', 'counties', 'roads']) if (p.has(k)) S[k] = p.get(k) === '1';
  for (const k of ['o3', 'o4', 'onlcd']) if (p.has(k)) S[k] = Math.max(0, Math.min(100, +p.get(k) || 0));
  if (p.has('sel')) S.sel = p.get('sel');
  if (S.l4) S.l3 = true;
  if (/^(auto|xs|s|m|l|xl)$/.test(p.get('ui') || '')) S.ui = p.get('ui');
})();
function writeHash() {
  if (!map) return;
  const c = map.getCenter();
  const p = new URLSearchParams();
  p.set('map', `${map.getZoom().toFixed(2)}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}`);
  p.set('base', S.base);
  for (const k of ['l3', 'l4', 'lab', 'orm', 'hs', 'nlcd', 'tap', 'cities', 'counties', 'roads']) p.set(k, S[k] ? '1' : '0');
  for (const k of ['o3', 'o4', 'onlcd']) p.set(k, S[k]);
  if (S.sel) p.set('sel', S.sel);
  p.set('ui', S.ui);
  history.replaceState(null, '', '#' + p.toString().replace(/%2F/g, '/').replace(/%3A/g, ':'));
}

/* Icons are inline SVG strokes (currentColor) - no font or Unicode glyph dependency (the Tesla browser lacks many symbols). */
const ICON_PATH = { x: 'M6 6l12 12M18 6L6 18', down: 'M6 9l6 6 6-6', up: 'M6 15l6-6 6 6', right: 'M9 6l6 6-6 6', left: 'M15 6l-6 6 6 6',
  pin: 'M12 21s-6.5-6.1-6.5-11a6.5 6.5 0 0 1 13 0c0 4.9-6.5 11-6.5 11ZM12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z' };
const icon = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICON_PATH[n]}"/></svg>`;

/* ---------- Colors ---------- */
function hsl2hex(h, s, l) {
  s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
const l3Hue = c => (parseInt(c, 10) * 137.508) % 360;
function l3Color(c) { return hsl2hex(l3Hue(c), 70, 52); }
/* Label code colors: the region's own fill hue, lifted to a brighter, more saturated variant so it reads
   against the dark label halo on satellite, OSM and topo bases. Names stay neutral (white). */
function labelCodeColor(lv, c) {
  if (lv === 3) return hsl2hex(l3Hue(c), 88, 70);
  const m = /^(\d+)([a-z]+)$/.exec(c); if (!m) return '#ffd23f';
  let idx = 0; for (const ch of m[2]) idx = idx * 26 + (ch.charCodeAt(0) - 96);
  const h = (l3Hue(m[1]) + ((idx * 23) % 40) - 20 + 360) % 360;
  return hsl2hex(h, 85, 64 + ((idx * 7) % 5) * 2.5);
}
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

/* Elevation color ramp (metres -> color), also drawn as the legend */
const ELEV_RAMP = [[-100, '#7fa7cf'], [0, '#6ea567'], [200, '#8fbc6a'], [500, '#c7d68a'], [900, '#eadb9c'], [1400, '#d9b071'],
  [2000, '#b98352'], [2700, '#946b55'], [3400, '#b3a39a'], [4200, '#ffffff']];

(function elevLegend() {
  const lo = -100, hi = 4300, stops = ELEV_RAMP.map(([m, c]) => `${c} ${((m - lo) / (hi - lo) * 100).toFixed(1)}%`);
  $('elevBar').style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
  // tick positions for 0, 4000, 8000, 12000 ft
  [0, 4000, 8000, 12000].forEach((ft, i) => { const el = document.querySelectorAll('#elevLegend .elticks span')[i]; if (el) el.style.left = ((ft * 0.3048 - lo) / (hi - lo) * 100) + '%'; });
})();

/* ---------- Map ---------- */
const protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);
const PM = new URL('tiles/ecoregions.pmtiles', BASE_URL).href;
const PMLAB = new URL('tiles/labels.pmtiles', BASE_URL).href; // one label point per polygon part (tools/labels.py)

/* Weighted label fitting (tools/label_layouts.py): each label point carries name variants v0..vN (explicit
   line breaks, '' = code only) and lz, one digit per zoom 3..13 naming the variant whose box best fits inside
   its polygon part at that zoom. rot = rotation along very elongated parts (single-line labels only). */
const LZ0 = 3, LZ1 = 13;
function fittedLabel(codeFmt, nameFmt, upper) {
  const at = z => {
    const m = ['match', ['slice', ['coalesce', ['get', 'lz'], ''], z - LZ0, z - LZ0 + 1]];
    for (let i = 1; i <= 6; i++) m.push(String(i), ['coalesce', ['get', 'v' + i], ['get', 'v0'], ['get', 'name']]);
    m.push(['coalesce', ['get', 'v0'], ['get', 'name']]);
    const nm = upper ? ['upcase', m] : m;
    return ['let', 'nm', nm, ['case', ['==', ['var', 'nm'], ''], ['format', ['get', 'code'], codeFmt],
      ['format', ['get', 'code'], codeFmt, '\n', {}, ['var', 'nm'], nameFmt]]];
  };
  const e = ['step', ['zoom'], at(LZ0)];
  for (let z = LZ0 + 1; z <= LZ1; z++) e.push(z, at(z));
  return e;
}
function buildStyle() {
  const sources = {
    eco: { type: 'vector', url: 'pmtiles://' + PM, attribution: 'Ecoregions: <a href="https://www.epa.gov/eco-research/ecoregions">U.S. EPA</a>' },
    lab: { type: 'vector', url: 'pmtiles://' + PMLAB },
    // roads and city names: OpenFreeMap vector tiles (OpenMapTiles schema), filtered and styled thin
    ofm: { type: 'vector', url: 'https://tiles.openfreemap.org/planet',
      attribution: 'Roads &amp; places: <a href="https://openfreemap.org">OpenFreeMap</a> (c) <a href="https://www.openmaptiles.org/">OpenMapTiles</a>, data ' + OSM_ATTR },
    // counties: U.S. Census Bureau cartographic boundary file (cb_2023_us_county_5m), tiles/counties.pmtiles
    cnty: { type: 'vector', url: 'pmtiles://' + new URL('tiles/counties.pmtiles', BASE_URL).href, attribution: 'Counties: U.S. Census Bureau' },
    orm: { type: 'raster', tiles: ['https://tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
      attribution: 'Railways: <a href="https://www.openrailwaymap.org/">OpenRailwayMap</a> (<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA 2.0</a>), data ' + OSM_ATTR },
    hillshade: { type: 'raster', tiles: [ESRI + 'Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 16, attribution: 'Hillshade (c) Esri' },
    nlcd: { type: 'raster', tileSize: 256, attribution: 'Land cover: <a href="https://www.mrlc.gov/">MRLC NLCD 2021</a>',
      tiles: ['https://www.mrlc.gov/geoserver/mrlc_display/wms?service=WMS&version=1.1.1&request=GetMap&layers=NLCD_2021_Land_Cover_L48&styles=&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}'] },
  };
  const layers = [{ id: 'bg', type: 'background', paint: { 'background-color': '#0b0f14' } }];
  // Elevation base: Terrarium-encoded DEM tiles, colored by elevation (hypsometric tint) with a soft hillshade
  sources.dem = { type: 'raster-dem', encoding: 'terrarium', tileSize: 256, maxzoom: 12,
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    attribution: 'Elevation: <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a> (Mapzen; USGS 3DEP, SRTM, GMTED2010, ETOPO1)' };
  for (const b of BASES) {
    if (b.dem) {
      layers.push({ id: 'elev-relief', type: 'color-relief', source: 'dem', layout: { visibility: 'none' },
        paint: { 'color-relief-color': ['interpolate', ['linear'], ['elevation'], ...ELEV_RAMP.flat()] } },
        { id: 'elev-shade', type: 'hillshade', source: 'dem', layout: { visibility: 'none' },
          paint: { 'hillshade-exaggeration': 0.4, 'hillshade-shadow-color': '#2b2118', 'hillshade-highlight-color': '#ffffff', 'hillshade-accent-color': '#2b2118' } });
      continue;
    }
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
      paint: { 'line-color': '#000000', 'line-opacity': 0.6, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 8, 5.5, 12, 7.7] } }, // L3 boundaries: +10% vs v2
    { id: 'l3-line', type: 'line', source: 'eco', 'source-layer': 'l3',
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.88, 8, 2.64, 12, 3.85] } },
    { id: 'orm', type: 'raster', source: 'orm', layout: { visibility: 'none' } },
    { id: 'majorroads', type: 'line', source: 'ofm', 'source-layer': 'transportation', layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      filter: ['all', ['!=', ['get', 'ramp'], 1], ['!=', ['get', 'brunnel'], 'tunnel'],
        ['any', ['match', ['get', 'class'], ['motorway', 'trunk'], true, false], ['all', ['==', ['get', 'class'], 'primary'], ['>=', ['zoom'], 7]]]],
      paint: { 'line-color': ['match', ['get', 'class'], 'motorway', '#ffd9a0', 'trunk', '#ffe8bf', '#f2f2f2'],
        'line-opacity': ['match', ['get', 'class'], 'primary', 0.45, 0.6],
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, ['match', ['get', 'class'], 'primary', 0.4, 0.5], 10, ['match', ['get', 'class'], 'primary', 0.7, 0.9], 14, ['match', ['get', 'class'], 'primary', 0.9, 1.1]] } },
    { id: 'county-line', type: 'line', source: 'cnty', 'source-layer': 'county', minzoom: 5, layout: { visibility: 'none', 'line-join': 'round' },
      paint: { 'line-color': '#efe6ff', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.25, 9, 0.5], 'line-dasharray': [4, 2],
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 10, 0.8, 14, 1.1] } },
    { id: 'sel-line', type: 'line', source: 'eco', 'source-layer': 'l4', filter: ['==', 'c4', '__none__'],
      paint: { 'line-color': '#ffd23f', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 3, 10, 6] } },
    { id: 'sel3-line', type: 'line', source: 'eco', 'source-layer': 'l3', filter: ['==', 'c3', '__none__'],
      paint: { 'line-color': '#ffd23f', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3, 10, 6] } },
    { id: 'county-label', type: 'symbol', source: 'cnty', 'source-layer': 'countylab', minzoom: 8, layout: { visibility: 'none',
        'text-field': ['get', 'name'], 'text-font': ['Open Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 10.5, 12, 12.5],
        'text-letter-spacing': 0.04, 'text-padding': 6, 'text-max-width': 7 },
      paint: { 'text-color': 'rgba(239,230,255,.78)', 'text-halo-color': 'rgba(0,0,0,.7)', 'text-halo-width': 1.2 } },
    { id: 'city-label', type: 'symbol', source: 'ofm', 'source-layer': 'place', layout: { visibility: 'none',
        'text-field': ['coalesce', ['get', 'name:en'], ['get', 'name']], 'text-font': ['Open Sans Semibold'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, ['match', ['get', 'class'], 'city', 11, 9], 10, ['match', ['get', 'class'], 'city', 14, 'town', 12, 11]],
        'symbol-sort-key': ['get', 'rank'], 'text-padding': 5, 'text-max-width': 8 },
      filter: ['any', ['all', ['==', ['get', 'class'], 'city'], ['<=', ['coalesce', ['get', 'rank'], 10], ['interpolate', ['linear'], ['zoom'], 4, 3, 7, 8, 9, 20]]],
        ['all', ['==', ['get', 'class'], 'town'], ['>=', ['zoom'], 8]], ['all', ['==', ['get', 'class'], 'village'], ['>=', ['zoom'], 11]]],
      paint: { 'text-color': 'rgba(255,255,255,.88)', 'text-halo-color': 'rgba(0,0,0,.75)', 'text-halo-width': 1.3 } },
    // Labels: code on its own line (bold, colored) above the name. L3 = larger, caps, letter-spaced, blue code;
    // L4 = smaller, title case, yellow code. Names wrap at ~12-14 characters. One point per polygon part
    // (pole of inaccessibility, tools/labels.py); parts appear only once big enough on screen (minz).
    { id: 'l4-label', type: 'symbol', source: 'lab', 'source-layer': 'l4lab', minzoom: 7,
      filter: ['>=', ['zoom'], ['get', 'minz']],
      layout: { 'text-field': fittedLabel({ 'font-scale': 1.0, 'text-font': ['literal', ['Open Sans Bold']], 'text-color': '#ffd23f' },
          { 'font-scale': 0.86, 'text-font': ['literal', ['Open Sans Semibold']], 'text-color': '#fffaf0' }, false),
        'text-rotate': ['coalesce', ['get', 'rot'], 0],
        'text-font': ['Open Sans Semibold'], 'text-line-height': 1.1,
        'text-size': ['interpolate', ['linear'], ['zoom'], 7, 12, 10, 14.5, 13, 16.5], 'text-max-width': 40,
        'symbol-sort-key': ['-', 0, ['get', 'r']], 'text-padding': 3,
        'text-variable-anchor': ['center', 'top', 'bottom'], 'text-radial-offset': 0.25 },
      paint: { 'text-halo-color': 'rgba(0,0,0,.9)', 'text-halo-width': 1.9, 'text-halo-blur': 0.3 } },
    { id: 'l3-label', type: 'symbol', source: 'lab', 'source-layer': 'l3lab', minzoom: 3, maxzoom: 8.5,
      // largest part of each region from z3; other parts once they are big enough on screen (minz), never before z4.5
      filter: ['any', ['==', ['get', 'rank'], 0], ['>=', ['zoom'], ['max', 4.5, ['get', 'minz']]]],
      layout: { 'text-field': fittedLabel({ 'font-scale': 1.2, 'text-font': ['literal', ['Open Sans Bold']], 'text-color': '#9ad0ff' },
          { 'font-scale': 0.82, 'text-font': ['literal', ['Open Sans Semibold']], 'text-color': '#ffffff' }, true),
        'text-rotate': ['coalesce', ['get', 'rot'], 0],
        'text-font': ['Open Sans Semibold'], 'text-letter-spacing': 0.08, 'text-line-height': 1.1,
        'text-size': ['interpolate', ['linear'], ['zoom'],
          3, ['interpolate', ['linear'], ['get', 'r'], 15000, 9, 60000, 10.5, 150000, 12],
          5, ['interpolate', ['linear'], ['get', 'r'], 15000, 11, 60000, 13, 150000, 15],
          8, 19, 12, 21], 'text-max-width': 40,
        'symbol-sort-key': ['-', 0, ['get', 'r']], 'text-padding': 4,
        'text-variable-anchor': ['center', 'top', 'bottom'], 'text-radial-offset': 0.25 },
      paint: { 'text-halo-color': 'rgba(0,0,0,.9)', 'text-halo-width': 2.0, 'text-halo-blur': 0.3 } },
    { id: 'me-acc', type: 'fill', source: 'me', filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': '#1a73e8', 'fill-opacity': 0.14 } },
    { id: 'me-acc-line', type: 'line', source: 'me', filter: ['==', '$type', 'Polygon'], paint: { 'line-color': '#4f95f0', 'line-width': 1.5, 'line-opacity': 0.8 } },
    { id: 'me-halo', type: 'circle', source: 'me', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 20, 'circle-color': '#1a73e8', 'circle-opacity': 0.25 } },
    { id: 'me-dot', type: 'circle', source: 'me', filter: ['==', '$type', 'Point'], paint: { 'circle-radius': 9, 'circle-color': '#1a73e8', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } },
  );
  sources.me = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
  sources.forced = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
  for (const lv of [3, 4]) {
    const base = layers.find(l => l.id === 'l' + lv + '-label');
    const before = layers.findIndex(l => l.id === 'me-acc');
    layers.splice(before, 0, { id: 'l' + lv + '-forced', type: 'symbol', source: 'forced', filter: ['==', ['get', 'lvl'], lv],
      layout: { ...base.layout, 'text-allow-overlap': true, 'text-ignore-placement': true, 'symbol-sort-key': undefined,
        'text-size': lv === 3 ? 19 : 15 }, paint: base.paint });
    delete layers[before].layout['symbol-sort-key'];
  }
  // Step-down fallbacks (see updateFallbackLabels): regions in view that lost their tile label to a collision
  // get a smaller, abbreviated or code-only label here; any still blocked get a code-only label that may overlap.
  sources.fallback = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } };
  const under = layers.findIndex(l => l.id === 'l4-label');
  const fbPaint = { 'text-halo-color': 'rgba(0,0,0,.9)', 'text-halo-width': 1.7, 'text-halo-blur': 0.3 };
  const fbLayers = [];
  for (const lv of [3, 4]) {
    const cf = lv === 3 ? { 'font-scale': 1.1, 'text-font': ['literal', ['Open Sans Bold']], 'text-color': '#9ad0ff' } : { 'font-scale': 1.0, 'text-font': ['literal', ['Open Sans Bold']], 'text-color': '#ffd23f' };
    const nf = { 'font-scale': lv === 3 ? 0.8 : 0.86, 'text-font': ['literal', ['Open Sans Semibold']], 'text-color': lv === 3 ? '#ffffff' : '#fffaf0' };
    fbLayers.push({ id: 'l' + lv + '-must', type: 'symbol', source: 'fallback', filter: ['all', ['==', ['get', 'lvl'], lv], ['==', ['get', 'must'], 1]],
      layout: { 'text-field': ['format', ['get', 'code'], cf], 'text-font': ['Open Sans Bold'], 'text-size': lv === 3 ? 10.5 : 10,
        'text-allow-overlap': true, 'text-ignore-placement': true }, paint: fbPaint });
    fbLayers.push({ id: 'l' + lv + '-fb', type: 'symbol', source: 'fallback', filter: ['all', ['==', ['get', 'lvl'], lv], ['!=', ['get', 'must'], 1]],
      layout: { 'text-field': ['case', ['==', ['get', 'v0'], ''], ['format', ['get', 'code'], cf],
          ['format', ['get', 'code'], cf, '\n', {}, lv === 3 ? ['upcase', ['get', 'v0']] : ['get', 'v0'], nf]],
        'text-font': ['Open Sans Semibold'], 'text-size': lv === 3 ? 11 : 11, 'text-line-height': 1.05, 'text-letter-spacing': lv === 3 ? 0.05 : 0,
        'text-max-width': 40, 'text-padding': 1, 'symbol-sort-key': ['get', 'sk'],
        'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.3 }, paint: fbPaint });
  }
  layers.splice(under, 0, ...fbLayers);
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
  // color each label's code with its polygon's (legibility-boosted) symbology color
  const k3 = ['match', ['get', 'code']], k4 = ['match', ['get', 'code']];
  for (const e of INDEX) (e.l === 3 ? k3 : k4).push(e.c, labelCodeColor(e.l, e.c));
  k3.push('#9ad0ff'); k4.push('#ffd23f');
  const recolor = v => Array.isArray(v) ? v.map(recolor) : (v && typeof v === 'object') ?
    Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === 'text-color' && x === '#9ad0ff' ? k3 : k === 'text-color' && x === '#ffd23f' ? k4 : recolor(x)])) : v;
  for (const id of ['l3-label', 'l4-label', 'l3-forced', 'l4-forced', 'l3-fb', 'l4-fb', 'l3-must', 'l4-must']) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'text-field', recolor(map.getLayoutProperty(id, 'text-field')));
  }
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

/* ---------- Forced labels for regions that dominate the view ----------
   Tile labels can be missing when one region fills the screen (its label points are off screen or lose
   a collision). After each move/zoom (debounced) a 20x12 grid of points over the visible map is sampled;
   any Level III region (and Level IV region, when Level IV is on) covering more than 30% (but not all) of the view gets a
   label drawn at the sampled point nearest the centroid of its samples, regardless of collisions. */
const FORCE_SHARE = 0.30, GRID_X = 20, GRID_Y = 12;
function visibleBox() {
  // the part of the map not covered by the info panel (left side on Tesla/desktop/tablet, bottom sheet on phones)
  const c = map.getCanvas(); let x0 = 0, w = c.clientWidth, h = c.clientHeight;
  if (!$('panel').hidden && !(panelAway && !isSheet())) {
    const r = $('panel').getBoundingClientRect(), cr = c.getBoundingClientRect();
    if (DEV.type === 'phone') h = Math.max(50, r.top - cr.top);
    else { x0 = Math.min(w - 50, Math.max(0, r.right - cr.left + 12)); w = w - x0; }
  }
  return { x0, w, h };
}
function dominantRegions(hitLayer, prop, nameProp, box) {
  const counts = new Map();
  for (let i = 0; i < GRID_X; i++) for (let j = 0; j < GRID_Y; j++) {
    const x = box.x0 + (i + 0.5) * box.w / GRID_X, y = (j + 0.5) * box.h / GRID_Y;
    const f = map.queryRenderedFeatures([x, y], { layers: [hitLayer] })[0];
    if (!f || !f.properties[prop]) continue;
    const k = f.properties[prop];
    if (!counts.has(k)) counts.set(k, { code: k, name: f.properties[nameProp], pts: [] });
    counts.get(k).pts.push([x, y]);
  }
  const out = [];
  for (const r of counts.values()) {
    const share = r.pts.length / (GRID_X * GRID_Y);
    // forced only between 30% and 100%: a region filling the whole view (every sample) gets no forced label
    if (share <= FORCE_SHARE || r.pts.length >= GRID_X * GRID_Y) continue;
    const cx = r.pts.reduce((a, p) => a + p[0], 0) / r.pts.length, cy = r.pts.reduce((a, p) => a + p[1], 0) / r.pts.length;
    // candidate anchors: the region's own sample points (each one hit this region), nearest the centroid first
    const cands = r.pts.slice().sort((a, b) => ((a[0] - cx) ** 2 + (a[1] - cy) ** 2) - ((b[0] - cx) ** 2 + (b[1] - cy) ** 2));
    const best = cands[0];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of r.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    out.push({ code: r.code, name: r.name, share, pt: best, cands, w: x1 - x0 + box.w / GRID_X, h: y1 - y0 + box.h / GRID_Y });
  }
  return out;
}
/* Forced labels use the same weighted fitting as the tile labels (tools/label_layouts.py), scored against
   the sampled extent of the region on screen: wide regions get long single lines, tall ones stacked lines. */
const ABBR = [['Mountains', 'Mtns'], ['Mountain', 'Mtn'], ['Northern', 'N.'], ['Southern', 'S.'], ['Eastern', 'E.'], ['Western', 'W.'],
  ['Central', 'Cent.'], ['Foothills', 'Fthls'], ['Lowlands', 'Lowl.'], ['Uplands', 'Upl.'], ['Highlands', 'Highl.'], ['Escarpment', 'Escarp.'],
  ['Transition', 'Trans.'], ['Forested', 'For.'], ['Valleys', 'Vlys'], ['Valley', 'Vly'], ['Ridges', 'Rdgs'], ['Islands', 'Isls'], ['River', 'R.'],
  ['Coastal', 'Coast.'], [' and ', ' & ']];
function wrapWords(words, k) {
  if (k >= words.length) return words.slice();
  let best = null;
  const rec = (i, k, acc) => {
    if (k === 1) { const lines = acc.concat(words.slice(i).join(' ')); const m = Math.max(...lines.map(l => l.length)); if (!best || m < best[0]) best = [m, lines]; return; }
    for (let j = i + 1; j <= words.length - k + 1; j++) rec(j, k - 1, acc.concat(words.slice(i, j).join(' ')));
  };
  rec(0, k, []); return best[1];
}
function fitForced(name, code, lvl, w, h) {
  const size = lvl === 3 ? 19 : 15, ns = lvl === 3 ? 0.82 : 0.86, cs = lvl === 3 ? 1.2 : 1.0, cw = lvl === 3 ? 0.78 : 0.56;
  let ab = name; for (const [a, b] of ABBR) ab = ab.split(a).join(b);
  const cands = [];
  for (const [nm, pen] of [[name, 0], [ab !== name ? ab : null, 0.1]]) {
    if (!nm) continue; const words = nm.split(' ');
    for (let k = 1; k <= Math.min(4, words.length); k++) cands.push([wrapWords(words, k).join('\n'), pen + 0.035 * (k - 1)]);
  }
  cands.push(['', 0.3]);
  let best = null;
  for (const [t, pen] of cands) {
    const lines = t ? t.split('\n') : [];
    const bw = Math.max(code.length * size * cs * 0.62, Math.max(0, ...lines.map(l => l.length)) * size * ns * cw) + 4;
    const bh = size * 1.1 * (cs + ns * lines.length) + 4;
    const sc = Math.min(1, 0.85 * w / bw) * Math.min(1, 0.85 * h / bh) - pen;
    if (!best || sc > best[0]) best = [sc, t];
  }
  return best[1];
}
function insideRegion(p, hitLayer, prop, code) {
  return map.queryRenderedFeatures(p, { layers: [hitLayer] }).some(f => f.properties[prop] === code);
}
let forceTimer = null; const BASE_FILTERS = {};
function updateForcedLabels() {
  const src = map.getSource('forced'); if (!src) return;
  const feats = [], dbg = [];
  if (S.lab) {
    const box = visibleBox();
    const lv = [];
    if (S.l3) lv.push([3, 'l3-hit', 'c3', 'n3']);
    if (S.l4 && map.getZoom() >= 5.5) lv.push([4, 'l4-hit', 'c4', 'n4']);
    const placed = [];
    for (const [level, hit, prop, nm] of lv) {
      for (const r of dominantRegions(hit, prop, nm, box)) {
        // keep an L3 and an L4 forced label apart by picking another of the region's own sample points
        // (never shifting a point off its polygon); every anchor is re-checked to lie inside its region
        const clash = p => placed.some(q => Math.abs(q[0] - p[0]) < 160 && Math.abs(q[1] - p[1]) < 60);
        const pt = r.cands.find(p => !clash(p) && insideRegion(p, hit, prop, r.code)) || r.cands.find(p => insideRegion(p, hit, prop, r.code));
        if (!pt) { dbg.push(`${level}:${r.code} skipped (no inside anchor)`); continue; }
        const [x, y] = pt;
        placed.push([x, y]);
        const ll = map.unproject([x, y]);
        feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] }, properties: { code: r.code, name: r.name, lvl: level, v0: fitForced(r.name, r.code, level, r.w, r.h) } });
        dbg.push(`${level}:${r.code} ${(r.share * 100).toFixed(0)}%`);
      }
    }
  }
  src.setData({ type: 'FeatureCollection', features: feats });
  // a forced label replaces that region's tile labels while it dominates the view (no duplicates)
  for (const lv of [3, 4]) {
    const id = 'l' + lv + '-label', codes = feats.filter(f => f.properties.lvl === lv).map(f => f.properties.code);
    if (!BASE_FILTERS[id]) BASE_FILTERS[id] = map.getFilter(id);
    map.setFilter(id, codes.length ? ['all', BASE_FILTERS[id], ['!', ['in', ['get', 'code'], ['literal', codes]]]] : BASE_FILTERS[id]);
  }
  window.__forced = dbg;
  // the fallback passes run on the following idles, once the main labels have been re-placed
  fbPass = 1; fbForced = new Set(feats.map(f => f.properties.lvl + ':' + f.properties.code));
}
/* ---------- Every region in view gets at least one label ----------
   Pass 1 (after the main labels are placed): find regions visible in the view with no placed tile label or
   forced label, and give each a step-down label (smaller text, abbreviated or code-only name, flexible
   anchor) at an anchor that is inside the region: one of its own tile label points (pole of inaccessibility)
   in view, else a grid sample that hit it. Pass 2 (next idle): any whose step-down label also collided is
   drawn code-only and allowed to overlap. Regions covering the whole view are left unlabeled (rule: 100%). */
let fbPass = 0, fbForced = new Set(), fbFeats = [];
const LABEL_SAMPLE = 24;
function labelsInView(layer, box) {
  if (!map.getLayer(layer) || map.getLayoutProperty(layer, 'visibility') === 'none') return new Set();
  return new Set(map.queryRenderedFeatures([[box.x0, 0], [box.x0 + box.w, box.h]], { layers: [layer] }).map(f => f.properties.code));
}
function fbLevels() {
  const z = map.getZoom(), out = [];
  if (!S.lab) return out;
  if (S.l3 && z >= 3 && z < (S.l4 ? 8.5 : 24)) out.push([3, 'l3-hit', 'c3', 'n3', 'l3lab']);
  if (S.l4 && z >= 7) out.push([4, 'l4-hit', 'c4', 'n4', 'l4lab']);
  return out;
}
function fineAnchor(code, hit, prop, box) {
  // bounding box of the region's rendered geometry within the view, sampled on a fine grid (<= ~600 queries)
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const f of map.queryRenderedFeatures([[box.x0, 0], [box.x0 + box.w, box.h]], { layers: [hit] })) {
    if (f.properties[prop] !== code) continue;
    const walk = a => { if (typeof a[0] === 'number') { const p = map.project(a); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } else a.forEach(walk); };
    walk(f.geometry.coordinates);
  }
  x0 = Math.max(x0, box.x0 + 2); y0 = Math.max(y0, 2); x1 = Math.min(x1, box.x0 + box.w - 2); y1 = Math.min(y1, box.h - 2);
  if (!(x1 > x0 && y1 > y0)) return null;
  const step = Math.max(4, Math.sqrt((x1 - x0) * (y1 - y0) / 600)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let best = null, bd = Infinity;
  for (let x = x0 + step / 2; x < x1; x += step) for (let y = y0 + step / 2; y < y1; y += step) {
    const d = (x - cx) ** 2 + (y - cy) ** 2; if (d >= bd) continue;
    if (insideRegion([x, y], hit, prop, code)) { best = [x, y]; bd = d; }
  }
  return best;
}
function updateFallbackLabels(box) {
  const src = map.getSource('fallback'); if (!src) return;
  box = box || visibleBox();
  const feats = [], stats = {};
  for (const [lv, hit, prop, nm, sl] of fbLevels()) {
    // regions in view (any rendered part), plus grid samples for anchors and the 100% rule
    const inView = new Map();
    for (const f of map.queryRenderedFeatures([[box.x0, 0], [box.x0 + box.w, box.h]], { layers: [hit] })) {
      const c = f.properties[prop]; if (c && !inView.has(c)) inView.set(c, { name: f.properties[nm], pts: [] });
    }
    let total = 0;
    for (let i = 0; i < LABEL_SAMPLE; i++) for (let j = 0; j < Math.round(LABEL_SAMPLE * box.h / box.w); j++) {
      const x = box.x0 + (i + 0.5) * box.w / LABEL_SAMPLE, y = (j + 0.5) * box.w / LABEL_SAMPLE; total++;
      const f = map.queryRenderedFeatures([x, y], { layers: [hit] })[0];
      if (f && inView.has(f.properties[prop])) inView.get(f.properties[prop]).pts.push([x, y]);
    }
    const placed = labelsInView('l' + lv + '-label', box);
    // tile label points of each region that are in view (inside their polygon by construction, tools/check_labels.py)
    const tilePts = new Map();
    for (const f of map.querySourceFeatures('lab', { sourceLayer: sl })) {
      const c = f.properties.code; if (!inView.has(c) || f.geometry.type !== 'Point') continue;
      const p = map.project(f.geometry.coordinates);
      if (p.x < box.x0 + 8 || p.y < 8 || p.x > box.x0 + box.w - 8 || p.y > box.h - 8) continue;
      const pr = (f.properties.rank === 0 ? 1e9 : 0) + (f.properties.r || 0);
      const cur = tilePts.get(c); if (!cur || pr > cur.pr) tilePts.set(c, { pr, xy: [p.x, p.y], r: f.properties.r || 0 });
    }
    let missing = 0, full = 0, noAnchor = 0, fb = 0;
    for (const [c, r] of inView) {
      if (placed.has(c) || fbForced.has(lv + ':' + c)) continue;
      if (r.pts.length >= total && inView.size === 1) { full++; continue; }  // fills the whole view: no label
      missing++;
      let xy = tilePts.get(c) && tilePts.get(c).xy;
      if (!xy && r.pts.length) {
        const cx = r.pts.reduce((a, p) => a + p[0], 0) / r.pts.length, cy = r.pts.reduce((a, p) => a + p[1], 0) / r.pts.length;
        xy = r.pts.slice().sort((a, b) => ((a[0] - cx) ** 2 + (a[1] - cy) ** 2) - ((b[0] - cx) ** 2 + (b[1] - cy) ** 2))[0];
      }
      if (!xy) xy = fineAnchor(c, hit, prop, box);   // slivers / edge pieces: finer search inside the rendered part
      if (!xy || !insideRegion(xy, hit, prop, c)) { noAnchor++; continue; }
      const area = r.pts.length;
      let ab = r.name; for (const [a, b] of ABBR) ab = ab.split(a).join(b);
      const ext = r.pts.length ? (() => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of r.pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); } return [x1 - x0 + box.w / LABEL_SAMPLE, y1 - y0 + box.w / LABEL_SAMPLE]; })() : [30, 20];
      const ll = map.unproject(xy);
      feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
        properties: { code: c, name: r.name, lvl: lv, must: 0, sk: -area, v0: ext[0] > 90 ? fitForced(ab, c, lv, ext[0] * 0.6, ext[1] * 0.6) : '' } });
      fb++;
    }
    stats['L' + lv] = { inView: inView.size, tileLabeled: [...inView.keys()].filter(c => placed.has(c)).length, forced: [...inView.keys()].filter(c => fbForced.has(lv + ':' + c)).length, fallback: fb, fullView: full, noAnchor };
  }
  fbFeats = feats; src.setData({ type: 'FeatureCollection', features: feats });
  window.__labelStats = stats;
}
map.on('idle', () => {
  if (fbPass === 1) { fbPass = 2; updateFallbackLabels(); return; }
  // pass 2: step-down labels that still collided become code-only labels allowed to overlap
  if (fbPass !== 2) return; fbPass = 0;
  const src = map.getSource('fallback'); if (!src || !fbFeats.length) { window.__labelDone = (window.__labelDone || 0) + 1; return; }
  const box = visibleBox();
  const ok = { 3: labelsInView('l3-fb', box), 4: labelsInView('l4-fb', box) };
  let must = 0;
  for (const f of fbFeats) if (!ok[f.properties.lvl].has(f.properties.code)) { f.properties.must = 1; must++; }
  if (must) src.setData({ type: 'FeatureCollection', features: fbFeats });
  if (window.__labelStats) for (const k in window.__labelStats) window.__labelStats[k].mustOverlap = fbFeats.filter(f => 'L' + f.properties.lvl === k && f.properties.must === 1).length;
  window.__labelDone = (window.__labelDone || 0) + 1;
});
function scheduleForced() { clearTimeout(forceTimer); forceTimer = setTimeout(updateForcedLabels, 180); }
map.on('moveend', scheduleForced);
map.on('idle', () => { if (!window.__forcedOnce) { window.__forcedOnce = true; updateForcedLabels(); } });
map.on('sourcedata', (e) => { if (e.sourceId === 'eco' && e.isSourceLoaded && !map.isMoving()) scheduleForced(); });
map.on('movestart', () => { clearTimeout(forceTimer); });
window.__updateForced = updateForcedLabels;
map.on('error', (e) => { if (e && e.error) console.warn('map error', e.error.message || e.error); });

function vis(id, on) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); }
function applyLayers() {
  const base = BASES.find(b => b.id === S.base) || BASES[0];
  for (const b of BASES) vis('base-' + b.id, b.id === base.id);
  const has = base.has || {};
  vis('majorroads', S.roads && !has.roads);
  vis('city-label', S.cities && !has.cities);
  vis('county-line', S.counties && !has.counties); vis('county-label', S.counties && !has.counties);
  syncOverlayToggles();
  vis('elev-relief', !!base.dem); vis('elev-shade', !!base.dem);
  $('elevLegend').hidden = !base.dem;
  vis('orm', S.orm || !!base.forceORM);
  vis('hillshade', S.hs);
  vis('nlcd', S.nlcd);
  map.setPaintProperty('nlcd', 'raster-opacity', S.onlcd / 100);
  vis('l3-fill', S.l3); vis('l3-line', S.l3); vis('l3-casing', S.l3);
  vis('l4-fill', S.l4); vis('l4-line', S.l4);
  vis('l3-label', S.l3 && S.lab); vis('l4-label', S.l4 && S.lab); vis('l3-forced', S.l3 && S.lab); vis('l4-forced', S.l4 && S.lab);
  for (const id of ['l3-fb', 'l3-must']) vis(id, S.l3 && S.lab); for (const id of ['l4-fb', 'l4-must']) vis(id, S.l4 && S.lab);
  // when L4 is off, keep L3 fill at all zooms; otherwise hand over to L4 when zoomed in
  map.setLayerZoomRange('l3-fill', 0, S.l4 ? 5.5 : 24);
  map.setLayerZoomRange('l3-label', 3, S.l4 ? 8.5 : 24); // L4 off: Level III labels stay on at every zoom
  map.setPaintProperty('l3-fill', 'fill-opacity', S.o3 / 100);
  map.setPaintProperty('l4-fill', 'fill-opacity', S.o4 / 100);
  writeHash();
  scheduleForced();
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
  // hierarchy: Level IV requires Level III
  $('tL3').onchange = () => { S.l3 = $('tL3').checked; if (!S.l3 && S.l4) { S.l4 = false; toast('Level IV turned off too: it sits inside Level III.'); } syncDrawer(); applyLayers(); };
  $('tL4').onchange = () => { S.l4 = $('tL4').checked; if (S.l4 && !S.l3) S.l3 = true; syncDrawer(); applyLayers(); }; bindT('tLab', 'lab'); bindT('tCities', 'cities'); bindT('tCounties', 'counties'); bindT('tRoads', 'roads'); bindT('tORM', 'orm'); bindT('tHS', 'hs'); bindT('tNLCD', 'nlcd');
  const bindO = (id, key) => { $(id).oninput = () => { S[key] = +$(id).value; $(id + 'v').textContent = S[key] + '%'; applyLayers(); }; };
  bindO('oL3', 'o3'); bindO('oL4', 'o4'); bindO('oNLCD', 'onlcd');
  $('uiSize').querySelectorAll('button').forEach(b => b.onclick = () => { S.ui = b.dataset.s; applyUiSize(); syncDrawer(); writeHash(); setTimeout(() => map.resize(), 50); });
  syncDrawer();
}
function syncOverlayToggles() {
  const base = BASES.find(b => b.id === S.base) || BASES[0], has = base.has || {};
  for (const [id, k] of [['tCities', 'cities'], ['tCounties', 'counties'], ['tRoads', 'roads']]) {
    const el = $(id); if (!el) continue;
    const inc = !!has[k];
    el.disabled = inc; el.checked = inc ? true : S[k];   // shown as on-but-greyed: the base map already draws it
    el.closest('.row').classList.toggle('included', inc);
  }
}
function syncDrawer() {
  for (const el of $('baseList').children) el.setAttribute('aria-checked', el.dataset.id === S.base);
  $('uiSize').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === S.ui));
  $('tL3').checked = S.l3; $('tL4').checked = S.l4; $('tLab').checked = S.lab; $('tORM').checked = S.orm; $('tHS').checked = S.hs; $('tNLCD').checked = S.nlcd;
  for (const [id, k] of [['oL3', 'o3'], ['oL4', 'o4'], ['oNLCD', 'onlcd']]) { $(id).value = S[k]; $(id + 'v').textContent = S[k] + '%'; }
}
$('btnLayers').onclick = () => { $('drawer').hidden = !$('drawer').hidden; sheetState(); };
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => {
  $(b.dataset.close).hidden = true; sheetState();
  if (b.dataset.close === 'panel') { clearSelection(); }
});
/* ---------- Info panel: slide-away (desktop/Tesla/tablet) and bottom-sheet states (phone) ----------
   Sliding the panel away keeps the region selected and highlighted; the map controls, forced labels and
   fly-to padding use the freed space. The state is kept when another region is picked. */
let panelAway = false, sheetPos = 'half';
const isSheet = () => DEV.type === 'phone';
function setAway(a) {
  panelAway = !!a;
  document.body.classList.toggle('panel-away', panelAway);
  $('panelTab').setAttribute('aria-label', panelAway ? 'Show region details' : 'Slide details away');
  $('panelTab').setAttribute('aria-expanded', !panelAway);
  setTimeout(scheduleForced, 230);
}
function setSheet(pos) {
  sheetPos = pos; const p = $('panel');
  p.dataset.sheet = pos; p.style.height = '';
  $('panelCollapse').innerHTML = icon(pos === 'peek' ? 'up' : 'down');
  $('panelCollapse').setAttribute('aria-label', pos === 'peek' ? 'Expand panel' : 'Shrink panel');
  setTimeout(scheduleForced, 230);
}
function applyPanelState() {
  if (isSheet()) { setSheet(sheetPos); document.body.classList.remove('panel-away'); }
  else setAway(panelAway);
}
$('panelCollapse').onclick = () => {
  if (isSheet()) setSheet(sheetPos === 'peek' ? 'half' : 'peek'); else setAway(true);
};
if (!isSheet()) { $('panelCollapse').innerHTML = icon('left'); $('panelCollapse').setAttribute('aria-label', 'Slide details away'); }
$('panelTab').onclick = () => setAway(!panelAway);
// swipe the panel toward the edge to slide it away; swipe the tab back to bring it in
(function swipes() {
  let sx = 0, sy = 0, st = 0, on = false, startH = 0, dragging = false;
  const panel = $('panel'), head = panel.querySelector('header');
  panel.addEventListener('pointerdown', ev => { if (isSheet()) return; sx = ev.clientX; sy = ev.clientY; on = true; });
  panel.addEventListener('pointerup', ev => {
    if (!on || isSheet()) return; on = false;
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (dx < -60 && Math.abs(dx) > 1.5 * Math.abs(dy)) setAway(true);  // swipe toward the left edge
  });
  $('panelTab').addEventListener('pointerdown', ev => { sx = ev.clientX; st = 1; });
  $('panelTab').addEventListener('pointerup', ev => { if (st && ev.clientX - sx > 30 && panelAway) { setAway(false); ev.preventDefault(); } st = 0; });
  // phone bottom sheet: drag the header between peek, half and full
  head.addEventListener('pointerdown', ev => {
    if (!isSheet() || ev.target.closest('button')) return;
    dragging = true; sy = ev.clientY; startH = panel.getBoundingClientRect().height;
    panel.classList.add('dragging'); head.setPointerCapture(ev.pointerId);
  });
  head.addEventListener('pointermove', ev => {
    if (!dragging) return;
    panel.style.height = Math.max(56, Math.min(innerHeight - 40, startH - (ev.clientY - sy))) + 'px';
  });
  const endDrag = ev => {
    if (!dragging) return; dragging = false; panel.classList.remove('dragging');
    const dy = ev.clientY - sy;
    if (Math.abs(dy) < 8) { setSheet(sheetPos === 'peek' ? 'half' : 'peek'); return; }
    const h = panel.getBoundingClientRect().height, H = innerHeight;
    const targets = { peek: 64, half: Math.min(H * 0.58, 576), full: H - 72 };
    let best = 'half', bd = Infinity;
    for (const [k, v] of Object.entries(targets)) { const d = Math.abs(v - h); if (d < bd) { bd = d; best = k; } }
    setSheet(best);
  };
  head.addEventListener('pointerup', endDrag); head.addEventListener('pointercancel', endDrag);
})();
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
  toast(S.tap ? 'Tap info is ON - tap any region to learn about it.' : 'Tap info is OFF - tapping the map just pans.');
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
  if (open) renderPanel(e);
  if (fly) {
    const c = CENTERS[key];
    if (c) {
      stopFollow();
      const r = open && !(panelAway && DEV.type !== 'phone') ? $('panel').getBoundingClientRect() : null, sheet = DEV.type === 'phone';
      const pad = { left: r && !sheet ? r.right : 0, top: 0, right: 0, bottom: r && sheet ? r.height : 0 };  // info panel is on the left
      map.flyTo({ center: c, zoom: lv === '4' ? Math.min(Math.max(map.getZoom(), 8), 10) : 6, padding: pad, duration: 1200 });
    }
  }
  writeHash();
}
const TYPO = { '\u2013': '-', '\u2014': ' - ', '\u2018': "'", '\u2019': "'", '\u201c': '"', '\u201d': '"', '\u2026': '...', '\u00b7': '|', '\u00a0': ' ' };
const esc = s => String(s == null ? '' : s).replace(/[\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u00b7\u00a0]/g, c => TYPO[c]).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function sheetState() { document.body.classList.toggle('panel-open', !$('panel').hidden); document.body.classList.toggle('drawer-open', !$('drawer').hidden); }
function renderPanel(e) {
  const isL4 = e.level === 4;
  $('panelTitle').innerHTML = `<div class="plevel">EPA Level ${isL4 ? 'IV' : 'III'} ecoregion${e.alaska ? ' | Alaska' : ''}</div>
    <div class="ptitle"><span class="chip ${isL4 ? '' : 'l3'}">${esc(e.code)}</span><span class="nm">${esc(e.name)}</span></div>`;
  let h = '<div class="hier">';
  if (isL4) h += `<div class="h"><span class="k">Level III</span><button class="linkbtn" data-key="3:${esc(e.l3)}">${esc(e.l3)} ${esc(e.l3name)} ${icon('right')}</button></div>`;
  if (!isL4 && e.na3) h += `<div class="h"><span class="k">N. Am. III</span><span>${esc(e.na3)}</span></div>`;
  h += `<div class="h"><span class="k">Level II</span><span>${esc(e.na2)} ${esc(e.na2name)}</span></div>`;
  h += `<div class="h"><span class="k">Level I</span><span>${esc(e.na1)} ${esc(e.na1name)}</span></div></div>`;
  h += '<h3>What characterizes it</h3>';
  if (e.desc) {
    h += `<div class="desc">${esc(e.desc)}</div><div class="src">Source: <a href="${esc(e.srcurl)}" target="_blank" rel="noopener">${esc(e.src)}</a> (U.S. EPA)</div>`;
  } else {
    h += `<div class="missing">No official EPA description text was available to this map for this ecoregion. See the <a href="${esc(e.srcurl)}" target="_blank" rel="noopener">EPA ecoregion maps and posters</a> for this state.</div>`;
  }
  h += `<h3>How it differs from its neighbors (${e.neighbors.length})</h3>`;
  if (!e.neighbors.length) h += '<p>No adjacent ecoregions at this level.</p>';
  for (const n of e.neighbors) {
    const nkey = (isL4 ? '4:' : '3:') + n.code;
    h += `<div class="nb"><button class="nbhead" data-key="${nkey}"><span class="chip ${isL4 ? '' : 'l3'}">${esc(n.code)}</span><span class="nm">${esc(n.name)}${n.otherL3 ? `<span class="tag">in L3 ${esc(n.otherL3)}</span>` : ''}</span><span class="nbgo">Go ${icon('right')}</span></button><div class="nbbody">`;
    if (n.epa && n.epa.length) {
      for (const q of n.epa) h += `<div class="q"><span class="who">EPA, describing ${q.from === 'here' ? esc(e.code) + ' (this region)' : esc(n.code) + ' (neighbor)'}</span>${esc(q.text)}</div>`;
    }
    if (n.cmp && n.cmp.length) {
      h += `<div class="kw">Compared with ${esc(n.code)} ${esc(n.name)} - from keywords in each EPA description</div><ul>`;
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
  $('panel').hidden = false; sheetState(); applyPanelState();
  $('panelTab').querySelector('.tc').textContent = e.code;
  $('panelBody').querySelectorAll('[data-key]').forEach(b => b.onclick = () => selectKey(b.dataset.key, { fly: true, open: true }));
}

/* ---------- Geolocation ---------- */
let watchId = null, following = false, lastPos = null, firstFix = true, lastLookup = null;
function setLocateUI(state) {
  const b = $('btnLocate'); b.classList.remove('busy', 'active', 'follow');
  if (state) b.classList.add(state);
  $('locateLabel').textContent = state === 'follow' ? 'Following' : state === 'active' ? 'Re-center' : state === 'busy' ? 'Locating...' : 'Locate';
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
    toast('Location found' + (accuracy ? ` (+/-${accuracy < 1000 ? Math.round(accuracy * 3.281) + ' ft' : (accuracy / 1609).toFixed(1) + ' mi'})` : '') + '.');
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
    toast(wasFirst ? 'Still looking for GPS... (timed out, retrying)' : 'GPS signal weak - waiting for a better fix.');
  } else {
    toast('Location unavailable right now - still trying.');
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
  $('whereL4').textContent = c4 ? `${c4} | ${n4}` : `${c3} | ${n3}`;
  $('whereL3').textContent = c4 ? `Level III: ${c3} | ${n3}` : 'Level III (no Level IV mapped here)';
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
  let html = hits.map(e => `<button class="res" data-key="${e.l}:${e.c}"><span class="chip ${e.l === 3 ? 'l3' : ''}">${esc(e.c)}</span><span>${esc(e.n)}<div class="sub">Level ${e.l === 3 ? 'III' : 'IV'} ecoregion${e.p ? ' in ' + esc(e.p) : ''}${e.a ? ' | Alaska' : ''}</div></span></button>`).join('');
  if (withPlaces) html += '<div class="res sub" id="placeLoading">Searching places...</div>';
  else html += `<button class="res" id="placeBtn"><span class="chip l3">${icon('pin')}</span><span>Search places for "${esc(q)}"<div class="sub">Press Go or tap here</div></span></button>`;
  box.innerHTML = html; box.hidden = false;
  box.querySelectorAll('[data-key]').forEach(b => b.onclick = () => { box.hidden = true; $('q').blur(); selectKey(b.dataset.key, { fly: true, open: true }); });
  const pb = $('placeBtn'); if (pb) pb.onclick = () => runSearch(true);
  if (withPlaces) {
    try {
      const u = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=us&q=' + encodeURIComponent(q);
      const j = await fetch(u, { headers: { 'Accept-Language': 'en' } }).then(r => r.json());
      const el = $('placeLoading'); if (!el) return;
      el.outerHTML = j.length ? j.map((p, i) => `<button class="res" data-place="${i}"><span class="chip l3">${icon('pin')}</span><span>${esc(p.display_name.split(',').slice(0, 2).join(','))}<div class="sub">${esc(p.display_name.split(',').slice(2, 5).join(','))}</div></span></button>`).join('')
        : '<div class="res sub">No places found.</div>';
      box.querySelectorAll('[data-place]').forEach(b => b.onclick = () => {
        const p = j[+b.dataset.place]; box.hidden = true; $('q').blur(); stopFollow();
        if (p.boundingbox) { const bb = p.boundingbox.map(Number); map.fitBounds([[bb[2], bb[0]], [bb[3], bb[1]]], { maxZoom: 12, padding: 80, duration: 1200 }); }
        else map.flyTo({ center: [+p.lon, +p.lat], zoom: 11 });
      });
    } catch (e) { const el = $('placeLoading'); if (el) el.textContent = 'Place search unavailable (offline?).'; }
  }
}

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
