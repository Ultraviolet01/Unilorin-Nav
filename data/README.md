# Data

- `pois.json`, all pins. Entries with `"verified": false` are placeholders; replace them with real coordinates
  (Google Maps long-press → copy). Columns mirror the team Google Sheet:
  `name | category | lat | lng | description | photo_filename | campus`.
- `routes.json`, hand-traced footpaths. Each Feature is a `LineString` with properties
  `{ "from": "<poi id>", "to": "<poi id>", "label": "Shortcut via Sciences", "kind": "shortcut|main|shaded", "walkMinutes": 5 }`.
  Coordinates are `[lng, lat]`.

## Collecting data (team workflow)

**Pins**
1. Copy `field-sheet-template.csv` into a shared Google Sheet. Fill `name`, `category`, `lat`, `lng`, `description`,
   `photo_filename`, `campus` (`main` | `mini` | `uith`). You can paste Google Maps' `8.4821, 4.6703` straight into
   the `lat` cell and leave `lng` empty.
2. Categories: `faculty hostel eatery atm gate health admin cbt uith lecture sports worship market transport`.
3. Put photos in `public/photos/` using the filenames from the sheet (keep them small, ~100 KB, for slow connections).
4. File → Download → CSV, then:
   ```bash
   npm run sheet-to-pois -- ~/Downloads/sheet.csv
   ```
   Every row is checked (category, campus, duplicates, coordinates inside Ilorin so swapped lat/lng is caught).
   If anything is wrong it lists the rows and writes nothing.

**Footpaths**
1. In Google My Maps (satellite), draw each footpath as a line and name it
   `main-gate > library | Shortcut via Sciences | shortcut`, `<from id> > <to id> | <label> | <main|shortcut|shaded>`.
   Ids are the pin names in lowercase with dashes (see `pois.json`).
2. ⋮ → Export to KML/KMZ → untick "Export to a .KMZ" → download.
3. ```bash
   npm run kml-to-routes -- ~/Downloads/map.kml
   ```
   Walk time is computed from the line length at 80 m/min.

Then `npm run import-pois` pushes the pins to DynamoDB.

## Where the current pins come from

`pois.json` has 30 pins, every one sourced from OpenStreetMap (OSM) with its OSM id and last-edit date in the `source`
field. None is verified on the ground yet (`verified: false`). OSM only has a central cluster of the campus (mapped
mostly in 2022-23): Senate, library, SUB, market, clinics, lecture theatres, Arts, CIS, some Social/Management Sciences
department blocks, three hostels, the mosque and stadium, plus the UITH site. Run `npm run pull-osm` to see what has
been added or edited since.

`faculty-checklist.csv` is what is still missing: 14 of the 16 faculty-level units (13 faculties plus the 3 listed under
"Colleges" on unilorin.edu.ng/academics), the Postgraduate School, COMSIT, the CBT centre, the park, the main gate,
eateries, ATMs and the UITH entrance. Rows with `lat`/`lng` filled came from OSM. Fill the blanks, then run
`npm run sheet-to-pois`. (Note: it replaces `pois.json`, so keep the existing pins in your sheet too.)

Coordinates are © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright).

## Footprints and walking network (`buildings.json`, `paths.json`)

- `buildings.json`, 39 real building outlines for 29 pins, exported from OpenStreetMap (`npm run build-buildings`).
  They line up with the satellite image. Rendered as 3D-extruded footprints on the map.
- `paths.json`, a connected walking network of ~10.3 km (roads, footpaths/shortcuts, the covered walkway) covering the
  central campus plus the north (Atlantic Heights Hostel) and south (Mosque, roundabout, Stadium). 29 of the 30 pins are
  reachable; only UITH (about 15 km away, separate site) is not. Built by `npm run trace-central`.
  - Roads and footpaths were **traced by eye from Esri World Imagery** (zoom 18) and drawn back onto the imagery to check
    them; expect **roughly 5-10 m** error and some guessed short connectors into building entrances.
  - The covered walkway uses the OSM "Walkway" building outlines.
  - Needs ground-truthing: the link between the Stadium west road and the ring road ("unverified" in the script), every
    footpath connector into a building, and the road/footpath junctions. Nobody has walked these yet, on the field trip,
    walk the shortcuts and fix `scripts/trace-central.mjs` (pixel coordinates are easy to nudge) or send a My Maps KML.
  - Not covered: anything outside the traced area, and UITH.
- The app routes over this network (`src/lib/graph.ts`, Dijkstra) and offers "Shortest path" and "Mostly main roads"
  when they differ. Hand-made entries in `routes.json` take priority.

## Transport (UITH and the colleges)

Ilorin has many motor parks and **none has been confirmed** as the one for UITH or the Old/New College. What is known
(sources checked Nov 2026): the state recertified 12 private motor parks in July 2025 (names published, locations not);
the campus park moved in Oct 2025 to near the Gate and Fountain Roundabout; and a few Tanke-area stops/terminals exist in
OpenStreetMap (listed in `faculty-checklist.csv`, unverified). The app's travel notice (`transport.json`) says to ask
which park serves the destination until the field trip fills this in, update `transport.json` then.

## Cross-tab search (`elsewhere.json`)

Search looks across **both** tabs. A pin on the other tab appears with "· on <tab>", and choosing it switches tab and opens it
with a notice. For departments/places that have **no pin yet** but are known to be on the other site, add an entry:
`{ "terms": ["physiology"], "campus": "uith", "place": "the New College", "note": "..." }`. Typing a matching term on the
wrong tab prompts "it is at <place>", switches tab on Enter/tap and shows the cab-to-the-motor-park notice.
Currently seeded with Physiology (reported by the team) and the health-sciences colleges, **add more departments as the
field trip confirms which are at the Old/New College**; don't add one unless it's confirmed.

## Field collector (`/field` page)

Open `https://<your-site>/field` on a phone (GPS needs HTTPS, fine on Amplify and on localhost). It works offline once
loaded and keeps everything on the phone until exported.

1. Enter your name, then tap a place from the checklist (existing pins show as "re-check" and tell you how many metres
   the current pin is off). Stand at the entrance → **Use my GPS** (holds ~10 s and keeps the best reading; aim for under
   ±15 m, move to open sky if worse) → **take photo** → note → **Save**. "＋ Add a place" covers anything not on the list.
2. **Footpaths** tab: pick the start and end pins, press Start, walk the path, press Stop. Only existing pins can be
   start/end points.
3. **Export** tab: *Share all* sends `places.csv` + photos + `footpaths.kml` straight to WhatsApp; or use the download buttons.
4. Developer: 
   ```bash
   npm run sheet-to-pois -- places.csv data/pois.json --merge   # adds/updates pins, keeps the rest, marks them verified
   npm run kml-to-routes -- footpaths.kml                       # routes.json (hand-made routes win over the traced network)
   ```
   and put the photos in `public/photos/`. Several teammates can each export; run the merge once per file.

## Walked paths (GPS recordings)
Better than tracing from satellite: real walks.
1. In the app, set a route, tick **Save my walk to improve the map**, press **Start** and walk (or ride) it. The first time, a pop-up asks whether to **Share my walks** (uploads automatically, anonymously) or **Keep on my phone only**.
2. Get the walks: shared ones with `WALK_TABLE=<WalkTableName> AWS_PROFILE=unilorin node scripts/export-walks.mjs shared-walks.kml`; ones kept on a phone from the Field page (`/field`) **Export** (`footpaths.kml`). Shared walks are untrusted: look at them on a map first.
3. Merge it into the walking network (`--dry` first to preview):
   ```bash
   node scripts/walks-to-paths.mjs shared-walks.kml --dry
   node scripts/walks-to-paths.mjs shared-walks.kml
   ```
   Walks under 2 m apart are thinned, lines are simplified to 2.5 m, and each walk is joined to the existing network (shared vertices and new junctions within 6 m), so routes can pass through it. Paths marked `"walked": true` replace guesswork; delete the traced path they supersede from `data/paths.json`.
4. See `data/paths-to-verify.csv` for the traced paths to walk first.
