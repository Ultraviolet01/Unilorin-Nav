# Unilorin Navigator (Unilorin Nav)

A campus navigation app for University of Ilorin students, installable as a phone app (PWA). It covers the **Main Campus** and the **UITH & Colleges** (teaching hospital, Old and New College) as two separate tabs.

**Live:** https://main.d3dk1xzoo5ual9.amplifyapp.com (auto-published from the `main` branch)

> **Honest status.** The map works end to end, but the data is a first pass: the 36 pins are all `verified: false`, and the walking paths are traced from satellite images and the OpenStreetMap, not yet walked. A field trip with the built-in collector is the planned fix (see [Field work](#field-work)).

## What it does

- **Two campus tabs.** Search "physiology" on the Main Campus tab and the app tells you it is at the New College and switches tabs for you.
- **Four map views** (remembered): Map (our own OpenStreetMap map), Dark, Satellite (default) and Amazon Map.
- **Place cards** with the real building outline highlighted, share links (`/#p=<pin-id>`), and a "how to get to UITH and the colleges" cab and motor-park notice.
- **Directions**: Walking or Cab, with route cards, alternative routes and a route that draws itself.
- **Live navigation** (the **Start** button): your blue dot moves along the route, the map follows and turns with you, the line shrinks as you go, with distance, ETA, arrival, re-route when you leave the path, and Re-center.
- **Save my walk**: records your GPS walk on the phone so real paths can replace traced ones. Sharing it with the team is built but **switched off** (see [Privacy](#privacy)).
- **Field collector** (`/field`): works offline, captures GPS, photos and walked paths for the team.
- **Offline**: app shell, pins, photos and the street map work without a connection.

## Tech stack and where it is used

### App (browser)

| Technology | What it does here | Where |
|---|---|---|
| **Next.js 15** (App Router, static export) | Builds the whole site to plain files, no server code | `next.config.mjs` (`output: "export"`), `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/field/page.tsx` |
| **React 19 + TypeScript 5** | All UI and logic, strict types | `src/components/*`, `tsconfig.json` (`@/` means `src/`) |
| **MapLibre GL JS 4** | The map: vector/raster styles, markers, route and building layers, camera | `src/components/Navigator.tsx` (`new maplibregl.Map`, `addOverlays`, `setRouteData`, `fit`, `moveTo`) |
| **Plain CSS** (no UI or animation library) | Google-style interface, dark theme, motion | `src/app/globals.css`, `src/app/field.css` |
| **Material icons** (inline SVG paths, Apache-2.0) | All icons and the coloured pin set | `src/components/gm/icons.tsx` |
| **Service worker + Web App Manifest** | Installable PWA and offline use | `public/sw.js`, `public/manifest.json`, `src/components/RegisterSW.tsx` |
| **Browser APIs** | Geolocation (`watchPosition`), Wake Lock, Vibration, Web Share, `localStorage`, IndexedDB | `Navigator.tsx` (`toggleLocate`, `startNav`, `onNavFix`), `src/lib/fieldstore.ts` (`bestFix`, photos, tracks) |

### Map data

| Source | What it does here | Where |
|---|---|---|
| **OpenStreetMap** (ODbL) | Roads, names, buildings, labels: bundled so the map works offline | `scripts/pull-osm.mjs`, `scripts/build-basemap.mjs` produce `public/basemap.json`; drawn by `local()` in `src/lib/mapStyle.ts` |
| **Esri World Imagery** | Satellite view, and the imagery used to trace paths | `src/lib/mapStyle.ts` (`sat`), `scripts/trace-central.mjs` |
| **Amazon Location Service** (HERE data) | The "Amazon Map" view, shown only when configured | `src/lib/mapStyle.ts` (`getMapStyle("aws")`); created in `infra/template.yaml` (`LocationMap`, `LocationApiKey`) |
| **Open Sans** glyphs (Apache-2.0) | Map label fonts, bundled | `public/fonts/` |

### Our own logic (no routing or search service)

| Piece | What it does | Where |
|---|---|---|
| Walking network and routing | Dijkstra over traced roads and footpaths, with Walking and Cab modes | `src/lib/graph.ts` (`buildGraph`, `snap`, `shortest`), `src/lib/pois.ts` (`getRoutes`) |
| Live navigation maths | Snap a GPS point to the route, distance left, heading, ETA | `src/lib/nav.ts`; UI in `Navigator.tsx` (`startNav`, `onNavFix`, `reroute`, `arrive`) |
| Search | Ranked matching with aliases, across both campuses | `src/lib/pois.ts` (`searchPois`), `data/elsewhere.json` |
| Offline field data | GPS records, photos, walked tracks kept on the phone | `src/lib/fieldstore.ts`, `src/components/FieldCollector.tsx` |
| Walk recording and sharing | Record on the phone; opt-in upload with a consent pop-up (off) | `Navigator.tsx` (`onSaveToggle`, `flushWalk`), `src/lib/walkshare.ts` |

### Backend and hosting (AWS, Stockholm, `eu-north-1`)

| Service | What it does here | Where |
|---|---|---|
| **AWS Amplify Hosting** | Hosts the static site, builds on every push to `main` | `amplify.yml`; app `d3dk1xzoo5ual9` |
| **Amazon API Gateway** (HTTP API) | `GET /pois`, plus `POST /walks` and `POST /walks/forget`; CORS limited to the site, throttled | `infra/template.yaml` (`HttpApi`, routes, `ApiStage`); called from `src/lib/pois.ts` (`loadPois`) and `src/lib/walkshare.ts` |
| **AWS Lambda** (Node.js 24) | `PoiFunction` serves the pins, `WalkFunction` validates and stores shared walks | inline code in `infra/template.yaml`; `lambda/getPOIs/index.mjs` is a standalone copy of the pins function |
| **Amazon DynamoDB** (on demand) | `PoiTable` holds the pins, `WalkTable` holds shared walks (12-month automatic expiry) | `infra/template.yaml`; loaded by `scripts/import-pois.mjs`, read by `scripts/export-walks.mjs` |
| **AWS CloudFormation** | One stack, `unilorin-nav`, for everything except the website | `infra/template.yaml` (checked with `cfn-lint`) |
| **AWS IAM** | Least-privilege roles: the pins function can only `Scan` its table, the walks function only write its own | `infra/template.yaml` |

Not used: S3 and Cognito (there are no logins or file uploads to a bucket). Photos ship inside the site.

**Tooling:** Node scripts (`scripts/*.mjs`), one Python script for the field PDFs (`scripts/make-field-pdfs.py`), `cfn-lint`, and Playwright for browser testing during development (not part of the repo).

## How the pieces fit

```
Phone browser (PWA, installed from the site)
 |
 |  Static site: Next.js + React + MapLibre            hosted on AWS Amplify
 |   |- Map styles:  bundled OpenStreetMap map | Esri satellite | Amazon Location tiles
 |   |- Bundled data: data/pois.json, paths.json, buildings.json, transport.json
 |   |- Own routing (graph.ts) and live navigation (nav.ts), all in the browser
 |   |- Service worker: offline shell, pins, photos, map tiles seen so far
 |   |
 |   |-- GET  /pois  --> API Gateway --> Lambda --> DynamoDB (PoiTable)     falls back to bundled pins
 |   '-- POST /walks --> API Gateway --> Lambda --> DynamoDB (WalkTable)    OFF by default
 |
 '-- GPS walks and field data stay on the phone (localStorage / IndexedDB) until exported
```

## Project layout

```
src/app/            layout, home page (Navigator), /field page, global CSS
src/components/     Navigator.tsx (the app), FieldCollector.tsx, RegisterSW.tsx, gm/icons.tsx
src/lib/            pois.ts (data, search, routes), graph.ts (routing), nav.ts (live navigation),
                    mapStyle.ts (map styles), fieldstore.ts (offline storage), walkshare.ts (opt-in sharing), csv.ts
data/               pois, paths, buildings, routes, transport, elsewhere (JSON) + field checklists (CSV)
public/             sw.js, manifest.json, basemap.json (OSM extract), fonts/, icons/, photos/
infra/template.yaml the whole AWS backend (CloudFormation)
lambda/getPOIs/     standalone copy of the pins function
scripts/            data pipeline and field tools (see below)
docs/               AWS-SETUP.md (how to run it), AWS-USAGE.md (evidence), PRIVACY.md, field PDFs, screenshots
amplify.yml         build and headers for Amplify Hosting
CLAUDE.md           project instructions for the AI assistant used on this repo
```

## Run it

```bash
npm install
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:3000
```

Without any keys the app still works: the map falls back to free tiles and pins come from `data/pois.json`.

Settings are read **at build time** (the site is a static export). On the live site they live in Amplify (Hosting, Environment variables):

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | API Gateway address. Empty means use the bundled pins |
| `NEXT_PUBLIC_AWS_REGION` | Region for the Amazon map (`eu-north-1`) |
| `NEXT_PUBLIC_LOCATION_MAP_NAME` | Amazon Location map name |
| `NEXT_PUBLIC_LOCATION_API_KEY` | Amazon Location key (restricted to this map and this site) |
| `NEXT_PUBLIC_WALK_SHARING` | `on` enables opt-in walk sharing. **Leave unset** until the privacy review is done |

## Data

See `data/README.md`. Today: **36 pins** (32 Main Campus, 4 UITH & Colleges), **39 building outlines**, **51 traced path lines** (12 road, 38 footpath, 1 covered walkway). All pins are `verified: false` until confirmed on the ground. `data/paths-to-verify.csv` lists the paths to walk first.

Sources: pins from OpenStreetMap and Google Maps listings shared by the team; paths traced from Esri imagery plus OpenStreetMap roads; building outlines from OpenStreetMap. Directions use hand-made routes in `data/routes.json` first (none yet), then routes over the traced network, then a straight-line estimate.

## AWS

Everything is deployed and documented in **`docs/AWS-SETUP.md`** (addresses, how to redeploy, what protects it, how to remove it all). **`docs/AWS-USAGE.md`** is the evidence page: every AWS service we use, the exact code lines that use it, and a live snapshot of the resources taken from AWS itself. In short:

**AWS at a glance, with proof** (checked live on 24 Nov 2026 from the AWS project itself; full detail and line numbers in `docs/AWS-USAGE.md`):

| AWS service | Proof in the code | Proof in AWS |
|---|---|---|
| Amplify Hosting | `amplify.yml` | App `Unilorin Nav`, branch `main`, auto-build on |
| API Gateway (HTTP API) | `infra/template.yaml:85` | 3 routes, CORS limited to the site, throttled write routes |
| Lambda (Node.js 24) | `infra/template.yaml:55`, `:195` | 2 functions, 256 MB, 10 s |
| DynamoDB | `infra/template.yaml:23`, `:156` | Pins table: 36 items; walks table: 0 items, 12-month expiry on |
| Amazon Location | `src/lib/mapStyle.ts:4-7`, `:65` | Map `unilorin-nav-map`; key limited to reading that map from the live site |
| CloudFormation | `infra/template.yaml` | Stack `unilorin-nav`: `UPDATE_COMPLETE`, 17 resources |
| IAM | `infra/template.yaml:34`, `:174` | 2 least-privilege roles |

- Push to `main`: Amplify builds and publishes the site in about 2 to 3 minutes. Other branches do not deploy.
- Backend changes: edit `infra/template.yaml`, run `cfn-lint`, deploy through a CloudFormation change set.
- Update pins: edit `data/pois.json`, then `TABLE_NAME=<TableName> AWS_PROFILE=unilorin npm run import-pois`.

## Scripts

| Command | What it does |
|---|---|
| `npm run import-pois` | Load `data/pois.json` into DynamoDB |
| `npm run pull-osm` | Download OpenStreetMap data for the campus |
| `node scripts/build-basemap.mjs` | Rebuild `public/basemap.json` (the offline street map) |
| `npm run build-buildings` | Rebuild `data/buildings.json` |
| `npm run trace-central` | Rebuild the traced central-campus paths |
| `npm run sheet-to-pois` | Turn a filled field spreadsheet into pins (`--merge` to add) |
| `npm run kml-to-routes` | Turn hand-drawn KML routes between two pins into `data/routes.json` |
| `node scripts/walks-to-paths.mjs <kml> [--dry]` | Merge recorded GPS walks into the walking network |
| `node scripts/export-walks.mjs` | Download shared walks (when sharing is on) for review |
| `python3 scripts/make-field-pdfs.py` | Regenerate the field-trip PDFs in `docs/` |

## Field work

- `/field` is an offline collector: stand at a place, use GPS, take a photo, save; walk a path to record it. Export `places.csv`, photos and `footpaths.kml`.
- `docs/coordinates-to-confirm.pdf` and `docs/photo-checklist.pdf` list what to confirm and photograph.
- **Walked paths:** tick "Save my walk" and use **Start**; the walk is saved on the phone. Merge it with `scripts/walks-to-paths.mjs` (see `data/README.md`).

## Privacy

Location data is personal data. Recorded walks stay on the phone. An opt-in upload to the team exists (consent pop-up, random code instead of a name, first 40 m of each walk cut, 12-month expiry, delete-from-the-app), but it is **switched off** until the points in `docs/PRIVACY.md` are settled with the university or a lawyer.

## Credits and licences

- Map data: (c) OpenStreetMap contributors, ODbL. Satellite imagery: Esri World Imagery. Amazon map: Amazon Location Service with HERE data.
- Libraries: MapLibre GL JS (BSD-3-Clause), Next.js and React (MIT). Icons: Material Icons (Apache-2.0). Fonts: Open Sans (Apache-2.0).
- Built by ultraviolet01.

## Known limits

- Pins are unverified and paths are traced, not walked. Expect some wrong turns until the field trip is done.
- Amazon Location route calculation is the possible next step for road routing beyond the campus.
