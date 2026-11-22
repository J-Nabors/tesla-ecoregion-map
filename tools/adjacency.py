import json, collections
from shapely.geometry import shape
from shapely.ops import unary_union
from shapely import STRtree
from pyproj import Transformer
SRC='/workspace/eco-src/gj/'
def load(fn, key):
    d=json.load(open(SRC+fn)); g=collections.defaultdict(list)
    for f in d['features']:
        if f['geometry']: g[f['properties'][key]].append(shape(f['geometry']).buffer(0))
    return {k:unary_union(v) for k,v in g.items()}
def adj(geoms, tol=60, minlen=500):
    codes=list(geoms); gl=[geoms[c] for c in codes]; tree=STRtree(gl)
    out=collections.defaultdict(dict)
    buf={c:geoms[c].buffer(tol) for c in codes}
    for i,c in enumerate(codes):
        for j in tree.query(buf[c]):
            d=codes[j]
            if d==c or d in out[c]: continue
            inter=buf[c].intersection(geoms[d].boundary)
            L=inter.length
            if L>=minlen:
                out[c][d]=round(L/1000,1); out[d][c]=round(L/1000,1)
    return out
res={}
l4=load('l4_albers_simpl.json','US_L4CODE'); print('l4',len(l4))
res['l4']=adj(l4)
l3=load('l3_albers_simpl.json','US_L3CODE'); l3ak=load('l3ak_albers_simpl.json','US_L3CODE')
res['l3']=adj(l3); res['l3'].update(adj(l3ak))
json.dump(res,open('/workspace/eco-build/adjacency.json','w'))
print('done', sum(len(v) for v in res['l4'].values()), sum(len(v) for v in res['l3'].values()))
