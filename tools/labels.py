import json, collections
from shapely.geometry import shape, mapping
from shapely.ops import polylabel
SRC='/workspace/eco-src/gj/'
out={}
for fn,key,name,lvl in [('l4.json','c4','n4',4),('l3_conus.json','c3','n3',3),('l3_ak.json','c3','n3',3)]:
    d=json.load(open(SRC+fn)); parts=collections.defaultdict(list)
    for f in d['features']:
        if not f['geometry']: continue
        g=shape(f['geometry']).buffer(0)
        for p in (g.geoms if g.geom_type=='MultiPolygon' else [g]):
            parts[f['properties'][key]].append((p.area,p,f['properties']))
    feats=[]
    for code,lst in parts.items():
        lst.sort(key=lambda t:-t[0]); big=lst[0][0]
        for k,(a,p,props) in enumerate(lst[:4]):
            if k>0 and a<big*0.35: break
            pt=polylabel(p, tolerance=0.01)
            feats.append({'type':'Feature','geometry':mapping(pt),'properties':{'code':code,'name':props[name],'lvl':lvl,'area':round(a,4),'rank':k}})
    out.setdefault(lvl,[]).extend(feats)
for lvl,f in out.items():
    json.dump({'type':'FeatureCollection','features':f},open(f'/workspace/eco-build/labels_l{lvl}.json','w'))
    print(lvl,len(f))
