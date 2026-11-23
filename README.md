# Ecoregion Map

A touch-first web map of the U.S. EPA **Level III and Level IV ecoregions**, built for a car's touchscreen browser (Tesla, used while parked) and any modern browser. It is a static site with no build step, ready for GitHub Pages.

## Features
- **Ecoregion overlays:** EPA Level III (conterminous U.S. and Alaska) and Level IV (conterminous U.S.). Each level has its own on/off switch and opacity slider. Level IV sits inside Level III, so turning Level IV on also turns Level III on, and turning Level III off also turns Level IV off. Level III boundaries are heavier than Level IV boundaries.
- **Labels:** the code sits on its own line above the name (or alone when space is short). Each code is drawn in a brighter, more saturated version of its polygon's fill color with a dark halo; names stay white, Level III in spaced capitals and Level IV in title case. Every polygon part gets a label point at its pole of inaccessibility, and `tools/check_labels.py` fails the build if any point is outside the part it names. **Weighted fitting** (`tools/label_layouts.py`): for every point and every zoom from 3 to 13 it tries the name on 1 to 4 lines, an abbreviated name (Mountains to Mtns, Northern to N., Valley to Vly, and so on; Plains and Plateau are kept) and the code alone. It scores the share of the label box that falls inside the polygon part, minus small penalties for abbreviating and for extra lines, plus a shape term. Horizontal parts get long one-line labels and tall parts get stacked labels, and very elongated parts within 30 degrees of horizontal can be rotated along their axis. The winning layout per zoom is stored in the tiles and picked by the style. **Stable placement:** forced and step-down labels are sticky. A label keeps its geographic anchor and layout across pans while it stays on screen and inside its region, and moves only when its text spills (less than 85% inside its own region or more than 10% over a neighbour) and a clearly better spot exists. Candidate spots (the region's own label points, interior screen samples, and five text anchors for step-down labels) are scored by the share of the text box inside the region minus a penalty for spilling into neighbours. Forced labels switch on above 30% of the view and off below 25% (hysteresis). Main tile labels use a fixed centred anchor. **At least one label per region:** after each move, any region visible on screen without a placed label gets a step-down label (smaller text, abbreviated or code-only, flexible anchor) at one of its own label points or a screen sample inside it. If that also collides, it gets a code-only label that may overlap. **Forced labels:** a region covering more than 30% but less than 100% of the view always gets a label sized to its on-screen extent, anchored on a sampled point inside it. A region filling the whole view gets none. With Level IV off, Level III labels stay on at every zoom; with both on, Level III labels show at lower zooms and Level IV labels take over from zoom 7.
- **Base maps:** Satellite (Esri World Imagery), OpenStreetMap, OpenRailwayMap (railways over a grey OSM), Esri World Topo, OpenTopoMap, USGS Topo (The National Map), Elevation (AWS Terrain Tiles colored by height with hillshade, plus a legend) and Esri Shaded Relief.
- **Reference overlays (drawn on top):** Place names and Highways (OpenFreeMap vector tiles; highways are motorway, trunk and primary only, as hairlines) and Counties (U.S. Census 2023 cartographic boundaries, dashed lines with subtle names from zoom 8). They are drawn above everything else, including ecoregion fills, borders, selection and ecoregion labels, with only the location dot higher. Place names win label collisions against ecoregion labels. The toggles work on every base map: a base's own roads and names sit underneath the ecoregion fills, so these copies on top stay readable. Choices are remembered.
- **Extra overlays:** OpenRailwayMap railways (on any base map), Esri hillshade and NLCD 2021 land cover (MRLC WMS, lower 48).
- **Locate button:** shows a red position dot and accuracy circle. It has a follow mode (dragging the map stops following) and shows a clear message when location permission is denied or the page isn't on https. A "You are in" card shows your current Level IV and Level III ecoregion. It comes from the vector tiles, with a fallback to EPA's ArcGIS service. Tap the card to open full details.
- **Tap info toggle:** off by default, so panning never pops up anything. When it is on, tapping a region highlights it and opens a side panel with:
  - the code and name, plus the Level III parent and the North American Level II and Level I classes
  - EPA's official description of the region
  - **how it differs from each neighbor**: verbatim EPA sentences that compare the two regions, plus keyword contrasts (landforms, geology, soils, soil temperature and moisture, vegetation, land use, and elevation or precipitation ranges when both descriptions state them). Tap a neighbor to fly to it.
- **Search:** ecoregion names and codes are searched instantly on the device. Places are searched through OSM Nominatim when you press Go.
- **URL hash:** the address remembers the view, base map, layers, opacity, tap mode and the selected region, so you can bookmark it.
- **Device profiles:** a small script in `index.html` sets `<html data-device=…>` before the first paint:
  - `tesla`: user agent contains `Tesla` or `QtCarBrowser`. Compact UI (default scale 0.8: about 33 px buttons, 12.8 px text, 384 px info panel at 1920 px wide). Newer Tesla software adds the model to the user agent (`TESLA_MODEL3`, `TESLA_MODELY`, `TESLA_MODELS`, `TESLA_MODELX`), which the debug line shows. Older software doesn't, so the screen size is used as a hint (1920×1200 means a Model 3 or Y screen, 2200×1300 a Model S or X screen).
  - `phone`: iPhone or Android phone. 44 px touch targets, 16 px text, and the info panel opens as a bottom sheet.
  - `tablet`: iPad (including iPadOS desktop mode) or Android tablet. 44 px targets, medium text.
  - `desktop`: everything else. Normal desktop sizing.
  - For testing, add `?device=tesla|phone|tablet|desktop` to the URL.
- **Display size:** Auto (the device profile's default), XS, S, M, L or XL. Every size comes from one CSS variable, `--ui-scale`. The choice is saved on the device and in the URL (`ui=auto|xs|s|m|l|xl`). The Display size section also shows a debug line with the detected device, viewport, screen, device pixel ratio and current scale.
- **Info panel (left) and Layers panel (right):** the region description panel sits on the left, about 384 px wide on a 1920 px Tesla screen, and the Layers panel opens on the right under the toolbar. Like the Google Maps sidebar, the info panel slides off the left edge when you tap the edge tab or the chevron button, or swipe it left. A small tab with the region code stays behind, and tapping it or swiping it right brings the panel back. The region stays selected and highlighted while the panel is away, the map controls and forced labels use the freed space, and the panel stays away when you pick another region. On phones the panel is a bottom sheet with a drag handle and three heights (peek, half, full).
- **Toolbar:** Layers, zoom in/out, Reset to USA and Locate sit in a compact row at the top right, beside the search box. The search box and the bottom-left controls shift right of the info panel while it is open. On phones the toolbar is a second row under the search box.
- **Icons:** every icon is an inline SVG stroke (currentColor), and the UI uses only ASCII text, so nothing depends on fonts or Unicode symbols. The Tesla browser was missing glyphs such as the close and collapse arrows.

## Data sources
| What | Source |
|---|---|
| Level IV polygons (CONUS) | EPA `us_eco_l4.zip` (no state boundaries), from https://www.epa.gov/eco-research/level-iii-and-iv-ecoregions-continental-united-states |
| Level III polygons (CONUS) | EPA `us_eco_l3.zip` |
| Level III polygons (Alaska) | EPA `ak_eco_l3.zip` (Alaska has no Level IV) |
| Level III descriptions | EPA, *Primary Distinguishing Characteristics of Level III Ecoregions of the Continental United States* (`Eco_Level_III_descriptions.doc`, 2013). It covers all 85 CONUS regions and the 20 Alaska regions; the *Ecoregions of Alaska* map text is kept as a fallback. |
| Level IV descriptions | EPA state and regional ecoregion posters and description documents linked from https://www.epa.gov/eco-research/level-iii-and-iv-ecoregions-state (listed in `tools/epa_description_sources.txt`) |
| "Where am I" fallback | EPA ArcGIS service `ORD/USEPA_Ecoregions_Level_III_and_IV/MapServer/7` |

The polygons were turned into a single PMTiles vector tileset (`tiles/ecoregions.pmtiles`, zoom 0–11, about 41 MB) with tippecanoe. The browser reads it with HTTP range requests, which GitHub Pages supports.

## How descriptions and neighbor contrasts were built
1. Each EPA PDF was converted to text with `pdftotext -raw`, and each DOC/DOCX with LibreOffice.
2. `tools/descriptions.py` finds each Level IV description in three ways: by code headings (`45a. …`), by paragraphs whose opening names a Level IV region from that state ("The Flint Hills ecoregion…"), and by "drop-cap" poster paragraphs. Candidates are scored, and summary-table rows, map labels and photo captions are rejected. When EPA text exists in more than one place, the clean description documents are preferred over poster text.
3. Adjacency comes from the official polygons (`tools/adjacency.py`). Two regions are neighbors when they share at least 500 m of boundary.
4. `tools/build_data.py` builds each neighbor comparison only from the two EPA texts:
   - **EPA statements:** sentences in either description that name the other region by code or name, quoted verbatim.
   - **Keyword contrasts:** landform, geology, soil, vegetation and land-use terms found in one description but not the other, plus higher/lower elevation and wetter/drier precipitation when both texts give numeric ranges.
   No text is invented. When a description is missing, the panel says so and links to EPA.

### Coverage
- Level III: **105 of 105** regions have EPA descriptions (85 CONUS + 20 Alaska), all from the EPA 2013 Level III document.
- Level IV: **900 of 967** regions have EPA descriptions (93%).
- Level IV adjacencies: 3,220 neighbor pairs. 92% of directed neighbor views have at least one contrast, and 30% include a verbatim EPA comparison sentence.
- Level IV regions **without** a description (EPA has no Level IV text for Washington or Florida, and a few others could not be cleanly extracted): 1c, 1e, 2a, 2b, 2c, 2d, 2e, 2f, 2g, 2h, 2i, 9a, 9f, 10a, 10b, 10d, 10m, 13ad, 13d, 13p, 14d, 15g, 15r, 15x, 17ai, 17p, 20g, 22g, 22o, 22q, 22z, 24h, 25h, 26h, 26k, 27c, 27d, 47e, 50h, 50t, 56a, 58d, 58k, 58v, 58x, 62c, 65o, 69c, 75b, 75c, 75d, 75l, 76a, 76b, 76c, 76d, 77a, 77b, 77c, 77d, 77e, 77f, 77g, 77h, 77i, 78c, 82f.

## Known limitations
- Text extracted from posters can include occasional stray fragments, for example a map label caught in a paragraph or a sentence cut off where a column breaks. Truncated text ends in "[…]". Each panel links to the original EPA document.
- Keyword contrasts only show which terms appear in each EPA text. They are not a complete ecological comparison.
- Level IV is only available for the conterminous U.S. Alaska shows Level III, and Hawaii is not covered by EPA ecoregions.
- Third-party tile services (Esri, OSM, OpenRailwayMap, OpenTopoMap, USGS, MRLC) have usage policies for light, non-commercial use. OpenRailwayMap needs the browser to send a normal Referer header, which it does by default.
- Geolocation needs https, which GitHub Pages provides.

## Development
Serve locally with any server that supports range requests, for example `npx http-server . -p 8765`. Python's `http.server` does not support range requests, so PMTiles won't load with it. `tools/build.sh` documents the full rebuild from EPA sources and needs pyshp, shapely, pyproj, mapshaper, tippecanoe, poppler and LibreOffice.

Libraries: MapLibre GL JS 5 (BSD-3) and PMTiles JS (BSD-3) are vendored in `vendor/`, along with Open Sans Semibold, Bold and Regular glyphs (OFL) from the MapLibre demo tiles and openmaptiles/fonts.

Label points live in `tiles/labels.pmtiles`, built by `tools/labels.py`.
