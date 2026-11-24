# AWS setup — Unilorin Nav

**Status: deployed** to the project's region **eu-north-1 (Stockholm)** on the Free plan.

| Piece | AWS service | Name / address |
|---|---|---|
| Website | AWS Amplify Hosting, connected to GitHub (`Ultraviolet01/Unilorin-Nav`, branch `main`) | **https://main.d3dk1xzoo5ual9.amplifyapp.com** — app "Unilorin Nav", id `d3dk1xzoo5ual9` |
| Pins API | API Gateway HTTP API → Lambda → DynamoDB | `https://i9h6rn4lwh.execute-api.eu-north-1.amazonaws.com/pois` |
| Pins database | DynamoDB (on-demand) | table from stack output `TableName` (30 pins) |
| "Amazon Map" view | Amazon Location Service (HERE Explore style) + key restricted to map tiles, this map, this site | map `unilorin-nav-map`, key `unilorin-nav-web-key` |
| Everything above except the website | one CloudFormation stack | `unilorin-nav` (`infra/template.yaml`) |

Not used: S3 (photos are served by Amplify from `public/photos`), Cognito (no logins).
The Map (OpenStreetMap), Dark and Satellite views do not use AWS; "Amazon Map" is the AWS-powered view and is offered only on builds that have the Amazon Location settings.

## Publishing changes (automatic)
Every push to the **`main`** branch on GitHub makes Amplify build (`amplify.yml`) and publish the site (about 2–3 minutes).
Other branches do not deploy. The four settings the build needs are stored in Amplify (*Hosting → Environment variables*):
`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_AWS_REGION`, `NEXT_PUBLIC_LOCATION_MAP_NAME`, `NEXT_PUBLIC_LOCATION_API_KEY`.
The app is a **static export**, so its Amplify platform must stay on *Web* (static) — the server-rendered "Next.js (SSR)" mode fails with
`Can't find required-server-files.json`.

## What protects it
- **API:** CORS allows only the website's address; rate limit 25 req/s (burst 50); the Lambda can only `Scan` its own table. No login — the data is public and read-only.
- **Map key:** can only fetch tiles of *this* map, and only when the request comes from the website (or `localhost:3000` for development). It is visible in the site's JavaScript — that is normal for map keys; the restrictions are the protection.
- Admin work is done with an IAM user (`Ultra`) with MFA — never the root user.

## If the website's address changes
(new branch, custom domain, new Amplify app) the API and the map key must be told, or the site loses its pins and Amazon map:
```bash
aws cloudformation deploy --stack-name unilorin-nav --template-file infra/template.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides AllowedOrigin=https://<new-site> AllowedReferer=https://<new-site>/*
```
(`ForceUpdate: true` in the template is what lets AWS change the allowed site of a key that was used recently.)

## Update the pins
Edit `data/pois.json` (or merge a field export), then load it:
```bash
TABLE_NAME=<TableName output> AWS_REGION=eu-north-1 AWS_PROFILE=unilorin npm run import-pois
```
The API caches for 5 minutes. If the table is empty or unreachable the app falls back to the bundled pins.

## Cost
Free plan with $100 credits. At this traffic everything is inside the free tier or pennies per month. Keep the billing alert on (AWS Settings → Billing).

## Remove everything
```bash
aws cloudformation delete-stack --stack-name unilorin-nav --region eu-north-1     # table, Lambda, API, map, key
aws amplify delete-app --app-id d3dk1xzoo5ual9 --region eu-north-1               # the website
```
