# Unilorin Navigator

Campus + UITH navigation PWA for University of Ilorin students (AWS SBG Pitch-A-Thon).

**Stack:** Next.js · MapLibre GL · Amazon Location Service · DynamoDB · Lambda · API Gateway · S3 · Amplify.

## Run
```bash
npm install
cp .env.example .env.local   # optional: add Amazon Location map name + API key
npm run dev
```
Without AWS keys the map falls back to free Esri satellite tiles and pins come from `data/pois.json`.

## Data
See `data/README.md`. Seed pins are **placeholders** (`verified: false`) until real coordinates are collected.

## AWS
- `lambda/getPOIs` — Scan DynamoDB table `UnilorinPOIs` (partition key `id`), behind API Gateway `GET /pois`.
- `npm run import-pois` — bulk-load `data/pois.json` into DynamoDB.
- Set `NEXT_PUBLIC_API_URL` to the API Gateway invoke URL.

## Offline
`public/sw.js` caches the app shell, pins and photos; map tiles are cached as they are viewed.
Directions: hand-made routes in `data/routes.json` first, then routes over the traced walking network (`data/paths.json`), then a straight-line estimate
(Amazon Location route calculation is the next step).

## Interface (Google-Maps-style)

The UI follows the familiar Google Maps patterns so students need no learning curve:
floating search pill with a menu button, category chips (with a campus switcher chip), layers button, "my location" button,
a draggable bottom sheet for place details on phones (a left side panel on desktop), a directions card with walking route
cards, a snackbar for messages, and a coloured-icon POI pin set with a red selected pin. Everything is original code/styling —
no Google branding, logos or assets are used. Icons are Material Icons (Apache-2.0).

- **Default view:** satellite (Esri World Imagery). **Map view:** Amazon Location when `NEXT_PUBLIC_LOCATION_*` is set,
  otherwise a clean vector map drawn from the bundled OpenStreetMap extract (`public/basemap.json`, offline-friendly).
  Rebuild it with `node scripts/build-basemap.mjs`.
- Selecting a place highlights its real building footprint. Add `?paths` to the URL to overlay the traced walking network (dev only).
- Search ranks exact/prefix matches first, understands aliases, and looks across both campuses (see `data/README.md`).
- Deep links: `/#p=<pin-id>` opens a place, `/#uith` opens the UITH & Colleges tab. "Share" on a place copies/shares that link.
