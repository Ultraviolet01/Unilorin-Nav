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
