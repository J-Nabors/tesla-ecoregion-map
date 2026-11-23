"""Label points for every polygon part (pole of inaccessibility), each with the zoom at which that part
is big enough on screen to hold a label (minz). Writes labels_l3.json / labels_l4.json for tippecanoe.
rank 0 = largest part of a region (always labeled at the layer's normal zooms)."""
import json, math, collections
from shapely.geometry import shape, Point
from shapely.ops import polylabel
from shapely.affinity import scale
from shapely.ops import transform
from shapely.prepared import prep
SRC = '/workspace/eco-src/gj/'
LABEL_PX = 110          # inscribed-circle diameter on screen needed before a part gets its own label
EARTH = 40075016.686
def minzoom_for(r_m, lat):
    if r_m <= 0: return 99
    return math.log2(LABEL_PX * EARTH * math.cos(math.radians(lat)) / (512 * 2 * r_m))
REPEAT_PX = 950        # repeated labels inside very large parts are at least this far apart on screen
MPP0 = EARTH / 512     # web-mercator metres per pixel at z0
def merc(x, y): return x * 20037508.34 / 180, math.log(math.tan(math.radians(90 + y) / 2)) * 6378137
def unmerc(X, Y): return X * 180 / 20037508.34, math.degrees(2 * math.atan(math.exp(Y / 6378137))) - 90
def repeats(p, z0, z1, main_xy):
    """Extra label points on a nested grid inside big parts; a point first appears at the zoom where the
    grid spacing reaches REPEAT_PX, so on screen repeats stay ~950-1900 px apart."""
    m = transform(lambda x, y, z=None: merc(x, y), p)
    minx, miny, maxx, maxy = m.bounds
    pts, taken = [], [merc(*main_xy)]
    for z in range(z0, z1 + 1):
        S = REPEAT_PX * MPP0 / 2 ** z
        if max(maxx - minx, maxy - miny) < S: continue
        inner = m.buffer(-90 * MPP0 / 2 ** z)       # keep labels ~90px inside the edge
        if inner.is_empty: continue
        pin = prep(inner)
        for i in range(math.floor(minx / S), math.ceil(maxx / S) + 1):
            for j in range(math.floor(miny / S), math.ceil(maxy / S) + 1):
                X, Y = (i + .5) * S, (j + .5) * S
                if any(abs(X - a) < S * .75 and abs(Y - b) < S * .75 for a, b in taken): continue
                if not pin.contains(Point(X, Y)): continue
                taken.append((X, Y)); pts.append((unmerc(X, Y), z))
    return pts
out = {}
for fn, key, name, lvl, rz in [('l4.json', 'c4', 'n4', 4, 9), ('l3_conus.json', 'c3', 'n3', 3, 7), ('l3_ak.json', 'c3', 'n3', 3, 7)]:
    d = json.load(open(SRC + fn)); parts = collections.defaultdict(list)
    for f in d['features']:
        if not f.get('geometry'): continue
        g = shape(f['geometry']).buffer(0)
        for p in (g.geoms if g.geom_type == 'MultiPolygon' else [g]):
            if p.is_empty: continue
            parts[f['properties'][key]].append((p, f['properties']))
    feats = []
    for code, lst in parts.items():
        res = []
        for p, props in lst:
            lat0 = p.centroid.y; k = math.cos(math.radians(lat0))
            q = scale(p, xfact=k, yfact=1, origin=(0, 0))      # local equal-distance-ish degrees
            try: pt = polylabel(q, tolerance=0.002)
            except Exception: pt = q.representative_point()
            r_deg = q.exterior.distance(pt)
            for h in q.interiors: r_deg = min(r_deg, h.distance(pt))
            r_m = r_deg * 111320
            lon, lat = round(pt.x / k, 5), round(pt.y, 5)
            if not p.contains(Point(lon, lat)):        # never a point outside its own part: point-on-surface fallback
                rp = p.representative_point(); lon, lat = rp.x, rp.y
            res.append((r_m, lon, lat, props, p))
        res.sort(key=lambda t: -t[0])
        for i, (r_m, lon, lat, props, p) in enumerate(res):
            mz = minzoom_for(r_m, lat)
            if i > 0 and mz > 14: continue          # tiny fragment: never labeled on its own
            for (rx, ry), z in repeats(p, max(rz, math.ceil(mz)), 11, (lon, lat)):
                feats.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(rx, 5), round(ry, 5)]},
                              'tippecanoe': {'minzoom': z}, 'properties': {'code': code, 'name': props[name], 'lvl': lvl, 'rank': 90, 'minz': z, 'r': 0}})
            feats.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [round(lon, 5), round(lat, 5)]},
                          'tippecanoe': {'minzoom': 0 if i == 0 else max(0, min(11, math.floor(mz)))},
                          'properties': {'code': code, 'name': props[name], 'lvl': lvl, 'rank': i,
                                         'minz': 0 if i == 0 else round(max(mz, 0), 2), 'r': round(r_m)}})
    out.setdefault(lvl, []).extend(feats)
for lvl, f in out.items():
    json.dump({'type': 'FeatureCollection', 'features': f}, open(f'/workspace/eco-build/labels_l{lvl}.json', 'w'))
    print(lvl, len(f), 'parts labeled;', sum(1 for x in f if 0 < x['properties']['rank'] < 90), 'secondary parts;', sum(1 for x in f if x['properties']['rank'] == 90), 'repeats')
