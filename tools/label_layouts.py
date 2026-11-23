"""Weighted label fitting. For every label point in labels_l3.json / labels_l4.json, try several layouts of
"code / name" -- 1 to 4 name lines, abbreviated names, code only -- at each zoom 3..13 and keep the one whose
box covers the most of the polygon part (sampled points inside the part), with small penalties for extra lines
and abbreviations. Very elongated parts whose long axis is within +-30 degrees of horizontal also try a label
rotated along that axis. Writes, per point:
  v0..vN  name variants with explicit line breaks ('' = code only)
  lz      one character per zoom 3..13 picking the variant to use at that zoom
  rot     rotation in degrees (0 for most labels)
Text metrics mirror the MapLibre style in js/app.js (sizes, font scales, letter spacing)."""
import json, math, collections, sys
import numpy as np
import shapely
from shapely.geometry import shape
SRC = '/workspace/eco-src/gj/'; BUILD = '/workspace/eco-build/'
Z0, Z1 = 3, 13
EARTH = 40075016.686; MPP0 = EARTH / 512
def merc(x, y): return x * 20037508.34 / 180, math.log(math.tan(math.radians(90 + max(-85, min(85, y))) / 2)) * 6378137
def interp(z, stops):
    if z <= stops[0][0]: return stops[0][1]
    for (z1, v1), (z2, v2) in zip(stops, stops[1:]):
        if z <= z2: return v1 + (v2 - v1) * (z - z1) / (z2 - z1)
    return stops[-1][1]
STYLE = {  # base size stops, code scale, name scale, avg char width (em) for the name, line height
    3: dict(size=[(3, 12), (5, 15), (8, 19), (12, 21)], code=1.2, name=0.82, cw=0.70, ls=0.08, upper=True),
    4: dict(size=[(7, 12), (10, 14.5), (13, 16.5)], code=1.0, name=0.86, cw=0.56, ls=0.0, upper=False)}
ABBR = [('Mountains', 'Mtns'), ('Mountain', 'Mtn'), ('Northern', 'N.'), ('Southern', 'S.'), ('Eastern', 'E.'), ('Western', 'W.'),
        ('Northeastern', 'NE'), ('Northwestern', 'NW'), ('Southeastern', 'SE'), ('Southwestern', 'SW'), ('Central', 'Cent.'),
        ('Foothills', 'Fthls'), ('Lowlands', 'Lowl.'), ('Uplands', 'Upl.'), ('Highlands', 'Highl.'), ('Escarpment', 'Escarp.'),
        ('Transition', 'Trans.'), ('Forested', 'For.'), ('Valleys', 'Vlys'), ('Valley', 'Vly'), ('Ridges', 'Rdgs'), ('Islands', 'Isls'),
        ('River', 'R.'), ('Coastal', 'Coast.'), (' and ', ' & ')]
def abbreviate(name):
    out = name
    for a, b in ABBR: out = out.replace(a, b)
    return out if out != name else None
def wrap(words, k):
    """balanced split of words into k lines, minimising the longest line"""
    n = len(words)
    if k >= n: return [w for w in words]
    best = None
    def rec(i, k, acc):
        nonlocal best
        if k == 1:
            lines = acc + [' '.join(words[i:])]
            m = max(len(l) for l in lines)
            if best is None or m < best[0]: best = (m, lines)
            return
        for j in range(i + 1, n - k + 2): rec(j, k - 1, acc + [' '.join(words[i:j])])
    rec(0, k, [])
    return best[1]
def variants(name):
    out = []
    for nm, pen in [(name, 0.0), (abbreviate(name), 0.10)]:
        if not nm: continue
        words = nm.split()
        for k in range(1, min(4, len(words)) + 1):
            out.append(('\n'.join(wrap(words, k)), k, pen + 0.07 * (k - 1)))
    out.append(('', 0, 0.45))  # code only, last resort
    seen, uniq = set(), []
    for v in out:
        if v[0] not in seen: seen.add(v[0]); uniq.append(v)
    return uniq
def box_px(text, k, code, lvl, z):
    st = STYLE[lvl]; s = interp(z, st['size'])
    lines = text.split('\n') if text else []
    name_w = max((len(l) for l in lines), default=0) * s * st['name'] * (st['cw'] + st['ls'])
    code_w = len(code) * s * st['code'] * 0.62
    w = max(name_w, code_w) + 4; h = s * 1.1 * (st['code'] + st['name'] * len(lines)) + 4
    return w, h
GX, GY = 9, 5
U = np.linspace(-0.45, 0.45, GX); V = np.linspace(-0.45, 0.45, GY); UU, VV = np.meshgrid(U, V); UU = UU.ravel(); VV = VV.ravel()  # inset 0.45: halo/padding may cross the line
def shape_pen(w, h, ar, k):
    """Shape match: long (horizontal) parts get long labels, tall parts get stacked labels.
    Horizontal parts (ar >= 1.6): extra lines cost 2.5x and only a box *taller* than the part is penalised.
    Tall parts (ar <= 0.8): a single line of a multi-word name costs 0.1 and only a box *wider* is penalised."""
    box = w / h
    if ar >= 1.6: return 0.105 * (k - 1) + min(0.3, 0.1 * max(0.0, math.log(ar / box)))
    if ar <= 0.8: return min(0.3, 0.1 * max(0.0, math.log(box / ar)))
    return min(0.3, 0.1 * abs(math.log(box / ar)))
def score(part, X, Y, w_m, h_m, rot):
    c, s_ = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    dx = UU * w_m; dy = VV * h_m
    xs = X + dx * c - dy * s_; ys = Y + dx * s_ + dy * c   # rot is counter-clockwise in mercator (y up)
    return shapely.contains_xy(part, xs, ys).mean()
def main():
    for lvl, files, key, name in [(3, ['l3_conus.json', 'l3_ak.json'], 'c3', 'n3'), (4, ['l4.json'], 'c4', 'n4')]:
        parts = collections.defaultdict(list)
        for fn in files:
            for f in json.load(open(SRC + fn))['features']:
                if not f.get('geometry'): continue
                g = shapely.transform(shape(f['geometry']).buffer(0), lambda a: np.array([merc(x, y) for x, y in a]))
                for p in (g.geoms if g.geom_type == 'MultiPolygon' else [g]):
                    if not p.is_empty: shapely.prepare(p); parts[f['properties'][key]].append(p)
        path = f'{BUILD}labels_l{lvl}.json'; d = json.load(open(path)); n_rot = n_abbr = n_code = 0
        for f in d['features']:
            pr = f['properties']; code = pr['code']; X, Y = merc(*f['geometry']['coordinates'])
            cand = [p for p in parts.get(code, []) if shapely.contains_xy(p, X, Y)] or parts.get(code, [])
            if not cand: continue
            part = min(cand, key=lambda p: p.distance(shapely.Point(X, Y)))
            # principal axis from the minimum rotated rectangle
            rect = shapely.minimum_rotated_rectangle(part); xy = np.array(rect.exterior.coords)[:4]
            e1, e2 = xy[1] - xy[0], xy[2] - xy[1]
            L, S_ = (e1, e2) if np.hypot(*e1) >= np.hypot(*e2) else (e2, e1)
            aspect = np.hypot(*L) / max(1, np.hypot(*S_))
            ang = math.degrees(math.atan2(L[1], L[0]))
            ang = (ang + 90) % 180 - 90
            ca, sa = abs(math.cos(math.radians(ang))), abs(math.sin(math.radians(ang)))
            lL, lS = np.hypot(*L), np.hypot(*S_)
            ar_screen = min(8, max(0.25, (lL * ca + lS * sa) / max(1, lL * sa + lS * ca)))
            ar_axis = min(8, max(0.25, aspect))
            pr_dbg = (round(ar_screen, 2), round(ang, 1))
            rots = [0.0] + ([ang] if aspect > 3.5 and 8 < abs(ang) <= 30 else [])
            vs = variants(pr['name']); vs_upper = STYLE[lvl]['upper']
            chosen, best_rot_votes = [], collections.Counter()
            for z in range(Z0, Z1 + 1):
                mpp = MPP0 / 2 ** z; best = None
                for i, (txt, k, pen) in enumerate(vs):
                    w, h = box_px(txt.upper() if vs_upper else txt, k, code, lvl, z)
                    for r in rots:
                        if r and k > 1: continue     # only single-line labels are rotated
                        sc = score(part, X, Y, w * mpp, h * mpp, r) - pen - (0.02 if r else 0) - shape_pen(w, h, ar_axis if r else ar_screen, k) - (0.1 if (k == 1 and (ar_axis if r else ar_screen) <= 0.8 and ' ' in txt) else 0)
                        if best is None or sc > best[0] + 1e-9: best = (sc, i, r)
                chosen.append(best[1]); best_rot_votes[best[2]] += 1
            used = sorted(set(chosen)); remap = {v: j for j, v in enumerate(used)}
            for j, v in enumerate(used): pr['v%d' % j] = vs[v][0]
            pr['lz'] = ''.join(str(remap[c]) for c in chosen)
            rot = best_rot_votes.most_common(1)[0][0]
            # text-rotate is clockwise on screen; mercator angle is counter-clockwise
            pr['rot'] = round(-rot, 1) if rot else 0
            n_rot += bool(rot); n_abbr += any(vs[c][2] >= 0.10 and vs[c][0] for c in chosen); n_code += any(vs[c][0] == '' for c in chosen)
        json.dump(d, open(path, 'w'))
        print(lvl, len(d['features']), 'labels;', n_rot, 'rotated;', n_abbr, 'use an abbreviation at some zoom;', n_code, 'code-only at some zoom')
main()
