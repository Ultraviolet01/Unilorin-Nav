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
See **`docs/AWS-SETUP.md`** — the app is **deployed on AWS (eu-north-1), auto-published from the `main` branch**: Amplify (site), API Gateway + Lambda + DynamoDB (pins), Amazon Location (map). It has the addresses, how to redeploy, and how to remove everything. Summary:

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

- **Four views** (layers button or menu; the choice is remembered): **Map** — our detailed OpenStreetMap map (roads with
  names, building outlines, area/place labels, coloured POI dots; campus + UITH/Oja Oba area; works offline), **Dark** — the same
  map in a dark theme with a dark interface, **Satellite** (default; Esri World Imagery) and **Amazon Map** — Amazon Location
  Service (HERE data), shown only when `NEXT_PUBLIC_LOCATION_*` is set (it is on the deployed site). If the Amazon map fails to
  load, the app falls back to the standard map with a message and keeps the saved choice. Rebuild the OpenStreetMap extract with
  `node scripts/build-basemap.mjs`. Label fonts are bundled in `public/fonts` (Open Sans, Apache-2.0).
- Selecting a place highlights its real building footprint. Add `?paths` to the URL to overlay the traced walking network (dev only).
- Search ranks exact/prefix matches first, understands aliases, and looks across both campuses (see `data/README.md`).
- Deep links: `/#p=<pin-id>` opens a place, `/#uith` opens the UITH & Colleges tab. "Share" on a place copies/shares that link.

## Motion

All animation is plain CSS plus a few lines of code (no animation library, so the app stays small for slow connections).
One shared set of curves lives at the top of the motion section in `src/app/globals.css` (`--ease-out`, `--spring`, `--ease-in`).

- **Pins** pop in with a stagger when you open a campus or category, grow on hover/press, and the selected pin drops in with a bounce.
- **Place card / panel** slides in, **follows your finger** when dragged (with a rubber-band and flick detection), springs between peek and full, and slides away when closed. On desktop the panel slides in from the left.
- **Camera** glides with easing; long hops (campus ↔ UITH) arc and take longer.
- **Route line** draws itself from start to end; switching route options redraws it.
- **Small things:** menus/drawer/toast animate in *and out*, buttons and chips have springy press feedback, the search pill lifts on focus, the "you are here" dot pulses, switching map view dips instead of cutting, and Android phones give a tiny haptic tick on taps.
- **Reduced motion:** if the phone's "reduce motion" setting is on, animations collapse to ~0 ms and the camera/route jump instantly.
