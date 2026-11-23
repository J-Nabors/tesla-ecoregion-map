"""Build check: every label anchor in labels_l3.json / labels_l4.json must lie inside a polygon part of the
region it names (EPA source geometry). Exits 1 and lists offenders if any point is outside.
--fix moves offenders to the part's point-on-surface (shapely representative_point) first, then re-checks."""
import json, sys, collections
from shapely.geometry import shape, Point
from shapely.prepared import prep
SRC = '/workspace/eco-src/gj/'; BUILD = '/workspace/eco-build/'
fix = '--fix' in sys.argv; bad_total = 0
for lvl, files, key in [(3, ['l3_conus.json', 'l3_ak.json'], 'c3'), (4, ['l4.json'], 'c4')]:
    parts = collections.defaultdict(list)
    for fn in files:
        for f in json.load(open(SRC + fn))['features']:
            if not f.get('geometry'): continue
            g = shape(f['geometry']).buffer(0)
            for p in (g.geoms if g.geom_type == 'MultiPolygon' else [g]):
                if not p.is_empty: parts[f['properties'][key]].append((p, prep(p)))
    path = f'{BUILD}labels_l{lvl}.json'; d = json.load(open(path)); bad = []; fixed = 0
    for f in d['features']:
        code = f['properties']['code']; pt = Point(f['geometry']['coordinates'])
        if any(pp.contains(pt) for _, pp in parts.get(code, [])): continue
        if fix and parts.get(code):
            p = min((p for p, _ in parts[code]), key=lambda p: p.distance(pt))
            rp = p.representative_point(); f['geometry']['coordinates'] = [rp.x, rp.y]; fixed += 1
            if p.contains(rp): continue
        bad.append((code, f['properties'].get('rank'), f['geometry']['coordinates']))
    if fixed: json.dump(d, open(path, 'w'))
    print(f'L{lvl}: {len(d["features"])} label points, {fixed} moved to point-on-surface, {len(bad)} outside their polygon')
    for b in bad[:20]: print('  OUTSIDE', b)
    bad_total += len(bad)
sys.exit(1 if bad_total else 0)
