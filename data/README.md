# Data

- `pois.json` — all pins. Entries with `"verified": false` are placeholders; replace them with real coordinates
  (Google Maps long-press → copy). Columns mirror the team Google Sheet:
  `name | category | lat | lng | description | photo_filename | campus`.
- `routes.json` — hand-traced footpaths. Each Feature is a `LineString` with properties
  `{ "from": "<poi id>", "to": "<poi id>", "label": "Shortcut via Sciences", "kind": "shortcut|main|shaded", "walkMinutes": 5 }`.
  Coordinates are `[lng, lat]`.

## Collecting data (team workflow)

**Pins**
1. Copy `field-sheet-template.csv` into a shared Google Sheet. Fill `name`, `category`, `lat`, `lng`, `description`,
   `photo_filename`, `campus` (`main` | `mini` | `uith`). You can paste Google Maps' `8.4821, 4.6703` straight into
   the `lat` cell and leave `lng` empty.
2. Categories: `faculty hostel eatery atm gate health admin cbt uith lecture sports worship market`.
3. Put photos in `public/photos/` using the filenames from the sheet (keep them small, ~100 KB, for slow connections).
4. File → Download → CSV, then:
   ```bash
   npm run sheet-to-pois -- ~/Downloads/sheet.csv
   ```
   Every row is checked (category, campus, duplicates, coordinates inside Ilorin so swapped lat/lng is caught).
   If anything is wrong it lists the rows and writes nothing.

**Footpaths**
1. In Google My Maps (satellite), draw each footpath as a line and name it
   `main-gate > library | Shortcut via Sciences | shortcut` — `<from id> > <to id> | <label> | <main|shortcut|shaded>`.
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
