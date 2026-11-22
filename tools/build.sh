#!/usr/bin/env bash
# Rebuild tiles + JSON data from EPA sources. Requires: python3 (pyshp, shapely, pyproj), mapshaper, tippecanoe, pdftotext (poppler), libreoffice.
# Paths below match how the site was first built; adjust SRC/BUILD as needed.
set -euo pipefail
SRC=/workspace/eco-src; BUILD=/workspace/eco-build; SITE=$(cd "$(dirname "$0")/.." && pwd)
S3=https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions
mkdir -p $SRC/desc $SRC/rawm $SRC/gj $BUILD && cd $SRC
for f in us/us_eco_l3.zip us/us_eco_l4.zip us/Eco_Level_III_descriptions.doc ak/ak_eco_l3.zip; do curl -sSLO $S3/$f; done
unzip -oq us_eco_l3.zip -d us_eco_l3; unzip -oq us_eco_l4.zip -d us_eco_l4; unzip -oq ak_eco_l3.zip -d ak_eco_l3
cp $SITE/tools/epa_description_sources.txt desclinks.txt
while read -r u; do f=$(echo "$u" | awk -F/ '{print $(NF-1)"__"$NF}'); curl -sSL -o "desc/$f" "$u"; done < desclinks.txt
curl -sSL -o desc/ca__CA_eco_PosterText_Final_Feb2016.docx $S3/ca/CA_eco_PosterText_Final_Feb2016.docx
for f in desc/*.pdf; do pdftotext -raw -enc UTF-8 "$f" "rawm/$(basename "$f" .pdf).txt" || true; done
soffice --headless --convert-to txt:Text --outdir rawm Eco_Level_III_descriptions.doc desc/*.doc desc/*.docx >/dev/null
mapshaper us_eco_l4/us_eco_l4_no_st.shp -simplify 20% keep-shapes planar -clean -o gj/l4_albers_simpl.json format=geojson
mapshaper us_eco_l3/us_eco_l3.shp -simplify 20% keep-shapes planar -clean -o gj/l3_albers_simpl.json format=geojson
mapshaper ak_eco_l3/ak_eco_l3.shp -simplify 20% keep-shapes planar -clean -o gj/l3ak_albers_simpl.json format=geojson
mapshaper us_eco_l4/us_eco_l4_no_st.shp -proj wgs84 -each 'c4=US_L4CODE,n4=US_L4NAME,c3=US_L3CODE,n3=US_L3NAME' -filter-fields c4,n4,c3,n3 -o gj/l4.json format=geojson precision=0.00001
mapshaper us_eco_l3/us_eco_l3.shp -proj wgs84 -each 'c3=US_L3CODE,n3=US_L3NAME' -filter-fields c3,n3 -o gj/l3_conus.json format=geojson precision=0.00001
mapshaper ak_eco_l3/ak_eco_l3.shp -proj wgs84 -each 'c3=US_L3CODE,n3=US_L3NAME' -filter-fields c3,n3 -o gj/l3_ak.json format=geojson precision=0.00001
python3 -c "import json;a=json.load(open('gj/l3_conus.json'));b=json.load(open('gj/l3_ak.json'));a['features']+=b['features'];json.dump(a,open('gj/l3_all.json','w'))"
cd $BUILD && cp $SITE/tools/*.py . && python3 adjacency.py && python3 labels.py && python3 descriptions.py && python3 build_data.py
cd $SRC/gj && tippecanoe -o $SITE/tiles/ecoregions.pmtiles --force -Z0 -z11 \
  -L'{"file":"l3_all.json","layer":"l3"}' -L'{"file":"l4.json","layer":"l4","minzoom":4}' \
  -L"{\"file\":\"$BUILD/labels_l3.json\",\"layer\":\"l3lab\"}" -L"{\"file\":\"$BUILD/labels_l4.json\",\"layer\":\"l4lab\",\"minzoom\":5}" \
  --detect-shared-borders --simplification=4 --no-tile-size-limit --no-feature-limit -r1
