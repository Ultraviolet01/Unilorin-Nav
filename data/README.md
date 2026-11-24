# Data

- `pois.json` — all pins. Entries with `"verified": false` are placeholders; replace them with real coordinates
  (Google Maps long-press → copy). Columns mirror the team Google Sheet:
  `name | category | lat | lng | description | photo_filename | campus`.
- `routes.json` — hand-traced footpaths. Each Feature is a `LineString` with properties
  `{ "from": "<poi id>", "to": "<poi id>", "label": "Shortcut via Sciences", "kind": "shortcut|main|shaded", "walkMinutes": 5 }`.
  Coordinates are `[lng, lat]`.
