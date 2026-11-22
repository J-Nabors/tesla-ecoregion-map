import json, re, os, collections
B='/workspace/eco-build/'; OUT='/workspace/ecoregion-map/data/'
os.makedirs(OUT+'l4',exist_ok=True)
D=json.load(open(B+'desc_raw.json')); A=json.load(open(B+'adjacency.json'))
L4,L3,L4d,L3d=D['L4'],D['L3'],D['L4desc'],D['L3desc']
S3='https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/'
urls={}
for u in open('/workspace/eco-src/desclinks.txt').read().split()+[S3+'ca/CA_eco_PosterText_Final_Feb2016.docx']:
    parts=u.split('/'); key=parts[-2]+'__'+os.path.splitext(parts[-1])[0]; urls[key]=u
def srcurl(src):
    if src.startswith('Eco_Level_III'): return S3+'us/Eco_Level_III_descriptions.doc'
    if src=='ak_eco.pdf': return S3+'ak/ak_eco.pdf'
    return urls.get(os.path.splitext(src)[0], 'https://www.epa.gov/eco-research/level-iii-and-iv-ecoregions-state')
def srclabel(src):
    if src.startswith('Eco_Level_III'): return 'EPA, Primary Distinguishing Characteristics of Level III Ecoregions of the Continental U.S. (2013)'
    if src=='ak_eco.pdf': return 'EPA/USGS Ecoregions of Alaska map text'
    s=os.path.splitext(src)[0].split('__')[-1]
    st=src.split('__')[0].upper() if '__' in src else ''
    kind='draft description' if 'DRAFT' in src else ('description document' if re.search('desc|PosterText|report|TXeco',src) else 'ecoregion poster text')
    names={'REG3':'EPA Region 3 (PA/MD/DE/VA/WV)','MA':'New England','MAP':'Mississippi Alluvial Plain','KS':'Nebraska & Kansas','ND':'North & South Dakota','MO':'Iowa & Missouri','OH':'Ohio & Indiana','AL':'Alabama/Georgia','NC':'North & South Carolina' if 'ncsc' in src else 'North Carolina'}
    return f"EPA {names.get(st,st)} {kind}".replace('  ',' ')
SOIL=['Mollisols','Alfisols','Ultisols','Inceptisols','Entisols','Aridisols','Spodosols','Histosols','Vertisols','Andisols','Gelisols']
TEMP=['cryic','frigid','mesic','thermic','hyperthermic']; MOIST=['udic','ustic','xeric','aridic','aquic']
GEO=['limestone','dolomite','sandstone','shale','siltstone','conglomerate','chalk','marl','coal','granite','granitic','gneiss','schist','quartzite','slate','basalt','volcanic','lava','tuff','metamorphic','glacial till','till','outwash','moraine','loess','alluvium','alluvial','lacustrine','eolian sand','dunes','karst','gypsum','evaporite','serpentine','clay','sand','gravel','peat','marine sediments','coastal plain']
VEG=['ponderosa pine','lodgepole pine','Douglas-fir','western hemlock','Sitka spruce','redwood','subalpine fir','Engelmann spruce','spruce','fir','aspen','pinyon','juniper','sagebrush','saltbush','shadscale','greasewood','creosotebush','mesquite','chaparral','blue oak','oak woodland','oak savanna','oak-hickory','northern hardwood','beech','maple','basswood','hemlock','white pine','red pine','jack pine','longleaf pine','loblolly','shortleaf pine','slash pine','baldcypress','tupelo','bottomland hardwood','tallgrass','mixed grass','shortgrass','bluestem','grama','buffalograss','wheatgrass','bunchgrass','prairie','savanna','tundra','alpine','marsh','swamp','wetland','mangrove','palmetto','cactus','yucca','post oak','blackjack oak','live oak','cottonwood','willow']
USE=['cropland','corn','soybeans','wheat','cotton','rice','sugarcane','alfalfa','hay','pasture','rangeland','grazing','livestock','dairy','poultry','irrigation','orchard','vineyard','timber','logging','forestry','pine plantation','urban','suburban','residential','mining','coal mining','oil','natural gas','recreation','tourism','wildlife habitat','military']
PHYS=['mountains','foothills','hills','plateau','tablelands','mesas','buttes','canyons','escarpment','ridges','valleys','plains','floodplains','terraces','basins','playas','dunes','moraines','drumlins','lakes','wetlands','bogs','barrier islands','badlands','glaciated','unglaciated','volcanic cones','bajadas','alluvial fans']
def has(t,w):
    if w=='irrigation': return re.search(r'\birrigat',t,re.I) is not None
    return re.search(r'\b'+re.escape(w).replace('\\-','[-–]')+r'(s|es)?\b',t,re.I) is not None
def terms(t,lst):
    out=[w for w in lst if has(t,w)]
    # drop generic terms contained in more specific ones present
    return [w for w in out if not any(w!=o and w.lower() in o.lower() for o in out)]
def nums(t,unit,ctx):
    vals=[]
    for s in re.split(r'(?<=[.;])\s+',t):
        if not re.search(ctx,s,re.I): continue
        for m in re.finditer(r'(\d{1,2},\d{3}|\d{1,5})\s*(?:to|-|–|and)\s*(\d{1,2},\d{3}|\d{1,5})\s*'+unit,s):
            a,b=int(m.group(1).replace(',','')),int(m.group(2).replace(',',''))
            if a<=b: vals.append((a,b))
    if not vals: return None
    return (min(v[0] for v in vals),max(v[1] for v in vals))
def profile(t):
    return dict(soil=terms(t,SOIL),temp=terms(t,TEMP),moist=terms(t,MOIST),geo=terms(t,GEO),veg=terms(t,VEG),use=terms(t,USE),phys=terms(t,PHYS),
                elev=nums(t,r'(?:feet|ft)','elevation|elevations|feet high|peaks|range'),precip=nums(t,r'inches','precipitation|rainfall|rain|snow'))
def mentions(text, code, name):
    out=[]
    for s in re.split(r'(?<=[.!?])\s+(?=[A-Z(])',text):
        if re.search(r'(\(|Ecoregions? |\b)'+re.escape(code)+r'\b(?!\.\d)',s) and (re.search(r'\('+re.escape(code)+r'\)',s) or re.search(r'Ecoregions? (\w+, )*'+re.escape(code)+r'\b',s) or (re.search(r'[a-z]',code) and re.search(r'\b'+re.escape(code)+r'\b',s))) or (len(name)>6 and name.lower() in s.lower()):
            s=s.strip()
            if 20<len(s)<600: out.append(s)
    return out[:3]
def fmt_range(r,u): return f"{r[0]:,}–{r[1]:,} {u}"
def contrast(a,b,ta,tb,na,nb):
    pa,pb=profile(ta),profile(tb); bl=[]
    if pa['elev'] and pb['elev']:
        ma,mb=sum(pa['elev'])/2,sum(pb['elev'])/2
        word='Higher' if ma>mb*1.15 else ('Lower' if ma<mb/1.15 else 'Similar')
        bl.append(f"{word} elevation: {fmt_range(pa['elev'],'ft')} here vs {fmt_range(pb['elev'],'ft')} there")
    if pa['precip'] and pb['precip']:
        ma,mb=sum(pa['precip'])/2,sum(pb['precip'])/2
        word='Wetter' if ma>mb*1.1 else ('Drier' if ma<mb/1.1 else 'Similar precipitation')
        bl.append(f"{word}: {fmt_range(pa['precip'],'in/yr')} here vs {fmt_range(pb['precip'],'in/yr')} there")
    labels=[('phys','Landforms'),('geo','Geology'),('soil','Soils'),('temp','Soil temperature'),('moist','Soil moisture'),('veg','Vegetation'),('use','Land use')]
    for k,lab in labels:
        A_,B_=set(pa[k]),set(pb[k])
        oa=[w for w in pa[k] if w not in B_]; ob=[w for w in pb[k] if w not in A_]
        if not A_ or not B_: continue  # need both described to contrast fairly
        if oa or ob:
            parts=[]
            if oa: parts.append('only here: '+', '.join(oa[:5]))
            if ob: parts.append('only there: '+', '.join(ob[:5]))
            bl.append(f"{lab} — "+'; '.join(parts))
    return bl
def entry(level, code):
    if level==4:
        m=L4[code]; d=L4d.get(code)
        e=dict(code=code,name=m['name'],level=4,l3=m['l3'],l3name=L3[m['l3']]['name'],na2=m['na2'],na2name=m['na2name'].title(),na1=m['na1'],na1name=m['na1name'].title())
    else:
        m=L3[code]; d=L3d.get(code)
        e=dict(code=code,name=m['name'],level=3,na3=m['na3'],na2=m['na2'],na2name=m['na2name'].title(),na1=m['na1'],na1name=m['na1name'].title(),alaska=m.get('alaska',False))
    if d:
        e['desc']=d['text']; e['src']=srclabel(d['src']); e['srcurl']=srcurl(d['src'])
    else:
        e['desc']=None
        e['srcurl']='https://www.epa.gov/eco-research/level-iii-and-iv-ecoregions-state' if level==4 else 'https://www.epa.gov/eco-research/level-iii-and-iv-ecoregions-continental-united-states'
    return e
def build(level):
    meta=L4 if level==4 else L3; desc=L4d if level==4 else L3d; adj=A['l4' if level==4 else 'l3']
    res={}
    for code in meta:
        e=entry(level,code); ta=e['desc'] or ''
        nbs=[]
        for nb,length in sorted(adj.get(code,{}).items(),key=lambda x:-x[1]):
            if nb not in meta: continue
            nbname=meta[nb]['name']; tb=(desc.get(nb) or {}).get('text','')
            item=dict(code=nb,name=nbname,km=length)
            if level==4 and meta[nb]['l3']!=meta[code]['l3']: item['otherL3']=meta[nb]['l3']
            q=[('here',s) for s in mentions(ta,nb,nbname)]+[('there',s) for s in mentions(tb,code,meta[code]['name'])]
            item['epa']=[{'from':w,'text':s} for w,s in q][:4]
            item['cmp']=contrast(code,nb,ta,tb,meta[code]['name'],nbname) if ta and tb else []
            item['hasDesc']=bool(tb)
            nbs.append(item)
        e['neighbors']=nbs
        res[code]=e
    return res
l3=build(3); l4=build(4)
json.dump(l3,open(OUT+'l3.json','w'),separators=(',',':'),ensure_ascii=False)
by=collections.defaultdict(dict)
for c,e in l4.items(): by[e['l3']][c]=e
for k,v in by.items(): json.dump(v,open(OUT+f'l4/{k}.json','w'),separators=(',',':'),ensure_ascii=False)
idx=[dict(c=c,n=e['name'],l=3,a=e.get('alaska',False)) for c,e in l3.items()]+[dict(c=c,n=e['name'],l=4,p=e['l3']) for c,e in l4.items()]
json.dump(idx,open(OUT+'index.json','w'),separators=(',',':'),ensure_ascii=False)
# label centroids for jump-to
lab={}
for lv in (3,4):
    for f in json.load(open(B+f'labels_l{lv}.json'))['features']:
        p=f['properties']
        if p['rank']==0: lab[f"{lv}:{p['code']}"]=[round(x,4) for x in f['geometry']['coordinates']]
json.dump(lab,open(OUT+'centers.json','w'),separators=(',',':'))
stats=dict(l3_total=len(l3),l3_desc=sum(1 for e in l3.values() if e['desc']),l4_total=len(l4),l4_desc=sum(1 for e in l4.values() if e['desc']),
 l4_pairs=sum(len(e['neighbors']) for e in l4.values()), l4_pairs_cmp=sum(1 for e in l4.values() for n in e['neighbors'] if n['cmp'] or n['epa']),
 l4_pairs_epa=sum(1 for e in l4.values() for n in e['neighbors'] if n['epa']),
 l3_pairs=sum(len(e['neighbors']) for e in l3.values()), l3_pairs_cmp=sum(1 for e in l3.values() for n in e['neighbors'] if n['cmp'] or n['epa']))
json.dump(stats,open(OUT+'stats.json','w'),indent=1); print(stats)
