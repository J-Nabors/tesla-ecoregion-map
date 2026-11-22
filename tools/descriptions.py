import re, os, json, glob, collections, shapefile, unicodedata
SRC='/workspace/eco-src/'
R=shapefile.Reader(SRC+'us_eco_l4/us_eco_l4_no_st')
L4={}; L3={}
for r in R.records():
    d=r.as_dict()
    L4[d['US_L4CODE']]=dict(name=d['US_L4NAME'].strip(),l3=d['US_L3CODE'],l3name=d['US_L3NAME'],na2=d['NA_L2CODE'],na2name=d['NA_L2NAME'],na1=d['NA_L1CODE'],na1name=d['NA_L1NAME'],na3=d['NA_L3CODE'])
    L3[d['US_L3CODE']]=dict(name=d['US_L3NAME'].strip(),na2=d['NA_L2CODE'],na2name=d['NA_L2NAME'],na1=d['NA_L1CODE'],na1name=d['NA_L1NAME'],na3=d['NA_L3CODE'],na3name=d['NA_L3NAME'])
for r in shapefile.Reader(SRC+'ak_eco_l3/ak_eco_l3').records():
    d=r.as_dict()
    L3[d['US_L3CODE']]=dict(name=d['US_L3NAME'].strip(),na2=d['NA_L2CODE'],na2name=d['NA_L2NAME'],na1=d['NA_L1CODE'],na1name=d['NA_L1NAME'],na3=d['NA_L3CODE'],na3name=d['NA_L3NAME'],alaska=True)

def clean(t):
    t=unicodedata.normalize('NFKC',t)
    t=t.replace('\u00ad','').replace('\x0c','\n').replace('\u2019',"'").replace('\u2018',"'").replace('\u201c','"').replace('\u201d','"')
    return t
def norm(s):
    s=s.lower().replace('–','-').replace('—','-')
    s=re.sub(r'[^a-z0-9/]+',' ',s)
    return re.sub(r'\s+',' ',s).strip()
def sentences(p): return len(re.findall(r'[a-z\)][.;]\s+[A-Z(]',p))+ (1 if p.rstrip().endswith('.') else 0)

def paragraphs(text,names=()):
    lines=[l.rstrip() for l in clean(text).split('\n')]
    # dehyphenate
    out=[]; 
    lens=[len(l) for l in lines if len(l)>20]
    paras=[]; cur=[]
    def flush():
        if cur:
            p=' '.join(cur); p=re.sub(r'(\w)- (\w)',lambda m:m.group(1)+m.group(2) if m.group(2).islower() else m.group(1)+'-'+m.group(2),p)
            paras.append(re.sub(r'\s+',' ',p).strip())
        cur.clear()
    for i,l in enumerate(lines):
        s=l.strip()
        if not s: flush(); continue
        if re.match(r'^\d{1,3}[a-z]{0,2}\.\s+\S',s) and cur and not re.search(r'(Ecoregions?|and|or|of|to|the|in|with|than|\()\s*$',cur[-1],re.I): flush()
        if cur and re.search(r'[.!?]["\')]?$',cur[-1]):
            nxt=lines[i+1].strip() if i+1<len(lines) else ''
            h=' '+norm(s+' '+nxt)[:120]+' '
            if any(0<=h.find(' the '+nn+' ')<=75 for nn in names): flush()
        if cur and re.match(r'^(The |In \w+, the )',s):
            h=norm(s[:100])
            if any(h.startswith('the '+nn+' ') or (h.startswith('in ') and (' the '+nn+' ') in h[:70]) for nn in names): flush()
        if cur and len(cur[-1])<30 and len(s)>60 and not re.search(r'[-,]$',cur[-1]): flush()
        if cur and (re.search(r'[.!?]["\')]?$',cur[-1]) or len(cur[-1])<30) and s[:1].isupper():
            h=norm(s[:90])
            if any(0<=h.find(nn)<=45 for nn in names): flush()
        cur.append(s)
        # local typical width
        win=[len(x) for x in lines[max(0,i-6):i+7] if len(x)>20]
        w=sorted(win)[len(win)//2] if win else 80
        if re.search(r'[.!?]["\')]?$',s) and len(s)<0.85*w: flush()
    flush()
    return paras

codes_re=re.compile(r'\b(\d{1,3}[a-z]{1,2})\b')
def file_candidates(text):
    found=collections.Counter(c for c in codes_re.findall(text) if c in L4)
    return found
sources=sorted(glob.glob(SRC+'rawm/*.txt'))
cands=collections.defaultdict(list)
L3desc={}
def stype(fn):
    b=os.path.basename(fn)
    if 'desc' in b or 'PosterText' in b or 'report' in b or 'TXeco' in b or 'DRAFT' in b: return 'report'
    if 'back' in b or 'front' in b: return 'poster'
    return 'map'
for fn in sources:
    b=os.path.basename(fn)
    if b.startswith('Eco_Level_III') or b.startswith('ak__'): continue
    text=open(fn,errors='ignore').read()
    fc=file_candidates(text)
    pref=b.split('__')[0]
    for fn2 in sources:
        if os.path.basename(fn2).startswith(pref+'__') and fn2!=fn: fc.update(file_candidates(open(fn2,errors='ignore').read()))
    if not fc: continue
    byname=collections.defaultdict(list)
    for c in fc: byname[norm(L4[c]['name'])].append(c)
    names=sorted(byname,key=len,reverse=True)
    lines=clean(text).split('\n')
    heads=[]
    for i,l in enumerate(lines):
        m=re.match(r'^\s*(\d{1,3}[a-z]{0,2})\.?\s+([A-Za-z][^\t]{2,90}?)\s*$',l)
        if m and not re.search(r'\.{3,}|\s\d+$',l):
            c=m.group(1)
            def pm(a,b2):
                a=norm(a); b2=norm(b2); n=min(len(a),len(b2),14); return n>=6 and a[:n]==b2[:n]
            if (c in L4 and pm(L4[c]['name'],m.group(2))) or (c in L3 and norm(L3[c]['name'])[:10]==norm(m.group(2))[:10]):
                heads.append((i,c))
    for k,(i,c) in enumerate(heads):
        if c not in L4: continue
        j=heads[k+1][0] if k+1<len(heads) else min(len(lines),i+80)
        body=' '.join(x.strip() for x in lines[i+1:j] if x.strip())
        body=re.sub(r'(\w)- (\w)',lambda m:m.group(1)+m.group(2) if m.group(2).islower() else m.group(1)+'-'+m.group(2),body)
        body=re.sub(r'\s+',' ',body).strip()
        nb=norm(body[:700]); nm4=norm(L4[c]['name'])
        okref=(nm4 in nb) or re.search(r'\b'+c+r'\b',body[:700]) or nb.startswith('this ') or nb.startswith('the ')
        if re.search(r'INTRODUCTION|Literature Cited|Spatial frameworks',body[:400]): okref=False
        if okref and len(body)>=200 and sentences(body)>=2 and stype(fn)=='report':
            cands[c].append(dict(src=b,type=stype(fn),how='section',text=body))
    for p in paragraphs(text,names):
        if len(p)<250 or sentences(p)<2: continue
        code=None; how=None; body=p
        m=re.match(r'^(\d{1,3}[a-z]{1,2})\.?\s+(.*)$',p)
        if m and m.group(1) in L4:
            c=m.group(1); rest=norm(m.group(2)[:200]); nn=norm(L4[c]['name'])
            first=nn.split()[0]
            if nn in rest or first in rest[:120]:
                code=c; how='codeprefix'; body=m.group(2)
        if not code:
            head=norm(p[:220]); best=None
            for nn in names:
                i=head.find(nn)
                if i<0 or i>140: continue
                # skip referential mentions "Name (35c)"
                after=p[:400]
                if best is None or i<best[0] or (i==best[0] and len(nn)>len(best[1])): best=(i,nn)
            if best:
                cs=byname[best[1]]
                if len(cs)>1:
                    sc=[(sum(1 for x in codes_re.findall(p) if x[:-1]==c[:-1] or x.rstrip('abcdefghijklmnopqrstuvwxyz')==L4[c]['l3']) + (3 if re.search(r'\b'+L4[c]['l3']+r'\b',p) else 0) + (3 if norm(L4[c]['l3name'])[:14] in norm(p) else 0),c) for c in cs]
                    sc.sort(reverse=True)
                    if sc[0][0]==sc[1][0]: cs=[]
                    else: cs=[sc[0][1]]
                if cs:
                    # reject if the name is immediately followed by a code reference of a different region (referential)
                    c=cs[0]
                    raw=p[:300]
                    mm=re.search(re.escape(L4[c]['name'].split()[0]),raw)
                    ref=re.search(re.escape(L4[c]['name'])+r'\s*\((\d{1,3}[a-z]{1,2})\)',raw)
                    if not ref or ref.group(1)==c:
                        code=c; how='name'
            if not code:
                # drop-cap: paragraph starts with suffix of a name
                h=norm(p[:120])
                hits=[]
                for c in fc:
                    w=norm(L4[c]['name']).split()
                    for k in range(1,len(w)):
                        suf=' '.join(w[k:])
                        if len(w)-k>=1 and len(suf)>=8 and h.startswith(suf+' ') and re.match(r'(ecoregion|region|is|are|covers|contains|consists|comprises|includes|has|have|was|extends|occurs|forms|lies|encompasses|area)\b',h[len(suf)+1:]):
                            hits.append((len(suf),c,k)); break
                if hits:
                    hits.sort(reverse=True)
                    if len(hits)==1 or hits[0][0]>hits[1][0]:
                        c=hits[0][1]; k=hits[0][2]
                        code=c; how='dropcap'
                        nw=len(L4[c]['name'].split())-k
                        words=p.split(' ')
                        body='The '+L4[c]['name']+' '+' '.join(words[nw:])
        if code:
            pre=p[:max(0,norm(p).find(norm(L4[code]['name'])))] if how=='name' else ''
            if how=='name' and re.search(r'\b(\d{1,3}[a-z]{1,2})\b',pre[:200]) and re.search(r'boundar|between|than |from |\band (the )?$',pre,re.I): code=None
        if code and re.search(r'Photo:|Area \(sq|Level IV Ecoregion \d',body): code=None
        if code and how=='codeprefix' and stype(fn)!='report' and re.match(r'^\D{3,80}?\s\d{2,5}\s',body): code=None
        if code:
            cands[code].append(dict(src=b,type=stype(fn),how=how,text=body.strip()))

def score(c):
    t=c['text']; L=len(t)
    s=min(L,1800) - max(0,L-3500)*0.3
    s+= {'codeprefix':300,'name':150,'dropcap':100,'section':250}[c['how']]
    if 'PosterText' in c['src']: s+=400
    if c['type']=='poster' and c['how']=='codeprefix': s-=800
    if c['type'] in ('poster','map') and re.search(r'\b\d{2,5}\b',t[:90]) and not re.search(r'\b\d{2,5}\b.{0,12}(feet|inches|miles|percent|square)',t[:120]): s-=1000
    if 'DRAFT' in c['src']: s-=300
    if sentences(t)<L/400: s-=600
    if re.search(r'Photo:|Area \(sq|Physiography|Elevation / Local',t): s-=1500
    s+= sentences(t)*20
    # penalize table-ish text
    digits=sum(ch.isdigit() for ch in t)/max(1,L); s-= digits*4000
    if norm(L4_code_name(c)) not in norm(t[:300]): s-=200
    return s
def L4_code_name(c): return c.get('_name','')
def tidy(code,t):
    nm=L4[code]['name']
    t=re.sub(r'^'+re.escape(nm)+r'\s*(?=(The|This|In|Ecoregion|Most|A|An|It)\b)','',t)
    t=re.sub(r'(?:(?<=\s)|^)(?:[A-Za-z\.] ){3,}[A-Za-z]?(?=\s|$)',' ',t)
    sents=re.split(r'(?<=[.!?])\s+(?=[A-Z(])',t)
    sents=[x for x in sents if not re.search(r'Photo:|County boundary|State boundary|Albers|Level III ecoregion Level IV|projection|Standard parallels|Scale 1:',x)]
    t=' '.join(sents)
    t=re.sub(r'\s+',' ',t).strip()
    t=re.sub(r'(\s+\d{1,3}[a-z]{0,2})+\s*$','',t).strip()
    if t and not re.search(r'[.!?\])"…]$',t): t+=' […]'
    if len(t)>3200:
        cut=t[:3200]; k=cut.rfind('. ')
        t=cut[:k+1]+' […]'
    return t
best={}
for code,lst in cands.items():
    for c in lst: c['text']=tidy(code,c['text'])
    lst[:]=[c for c in lst if len(c['text'])>=200]
    if not lst: continue
    for c in lst: c['_name']=L4[code]['name']
    lst.sort(key=score,reverse=True)
    best[code]=lst[0]
print('L4 total',len(L4),'with desc',len(best))
missing=sorted(set(L4)-set(best),key=lambda c:(int(re.match(r'\d+',c).group()),c))
print('missing',len(missing),missing)

# L3 descriptions
t=clean(open(SRC+'rawm/Eco_Level_III_descriptions.txt').read())
for m in re.finditer(r'^(\d{1,3})\.\s+([A-Z][A-Z /\-\.,\']+)\n(.*?)(?=^\d{1,3}\.\s+[A-Z][A-Z]|\Z)',t,re.S|re.M):
    L3desc[m.group(1)]=dict(src='Eco_Level_III_descriptions.doc',text=re.sub(r'\s+',' ',m.group(3)).strip())
ak=clean(open(SRC+'rawm/ak__ak_eco.txt').read())
for m in re.finditer(r'^(1[0-2]\d)\.\s+([A-Z][A-Z \-]+)\n(.*?)(?=^1[0-2]\d\.\s+[A-Z]{3}|\Z)',ak,re.S|re.M):
    body=m.group(3)
    # dehyphenate & join
    body=re.sub(r'-\n(\w)',r'\1',body); body=re.sub(r'\s+',' ',body).strip()
    # cut at obvious end junk
    body=re.split(r'(?<=\.) (?=[A-Z][A-Z]{3,})',body)[0]
    body=re.sub(r'^(?:[A-Z][A-Z\-]+ )+(?=[A-Z][a-z])','',body)
    body=re.split(r'\s(?:Fairbanks|Anchorage|Juneau|Nome|Barrow) \.',body)[0]
    body=re.split(r'Level III Ecoregions of Alaska|Literature Cited|References|SOURCES|[A-Z][a-z]+, [A-Z]\.(?:[A-Z]\.)?,? ',body)[0]
    sents=re.split(r'(?<=[.!?])\s+',body)
    body=' '.join(x for x in sents if not re.search(r'(?:\b[A-Z] ){3,}',x)).strip()
    if m.group(1) not in L3desc or len(body)>len(L3desc[m.group(1)]['text']): L3desc[m.group(1)]=dict(src='ak_eco.pdf',text=body)
print('L3 total',len(L3),'with desc',len([c for c in L3 if c in L3desc]), 'missing',[c for c in L3 if c not in L3desc])
json.dump(dict(L4=L4,L3=L3,L4desc=best,L3desc=L3desc,cands={k:v[:3] for k,v in cands.items()}),open('/workspace/eco-build/desc_raw.json','w'),indent=0)
