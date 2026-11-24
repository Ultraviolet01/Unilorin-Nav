# AWS setup — Unilorin Navigator

## What is running on AWS today
**Nothing yet.** The app currently runs entirely from files bundled in the repo (pins, footprints, paths, basemap). The AWS pieces
below are written and checked but **not deployed** — deploying needs your AWS account.

| AWS service | Role | Status |
|---|---|---|
| **AWS Amplify Hosting** | Hosts the website (static files) + HTTPS (needed for GPS) | Ready: `amplify.yml`, static export. **You connect the repo (Step 1).** |
| **DynamoDB** | Stores the pins | Template ready (`infra/template.yaml`). Not created. |
| **Lambda** | `GET /pois` reads DynamoDB (`lambda/getPOIs`) | Code + template ready. Not deployed. |
| **API Gateway (HTTP API)** | Public URL for the Lambda | Template ready. Not deployed. |
| **Amazon Location Service** | The "Map" view tiles/styles (HERE/Esri) | Template ready (map + restricted API key). The app already switches to it when the env vars are set. Not created. |
| Amazon S3 | Photo storage | **Not used.** Photos live in `public/photos` and are served by Amplify. Add S3 later only if photos must be uploaded by users. |
| Amazon Cognito | Logins / user submissions | **Not used.** |

Until you deploy, the app falls back to the bundled data automatically, so nothing breaks if a piece is missing.

## Before you start (5 min)
- Use an IAM Identity Center user or an IAM user with admin rights — **not the root account** — and turn on MFA.
- Create a **budget alert** (Billing → Budgets → e.g. $5/month). Everything here is pay-per-use and tiny at this scale.
- Use **one region for everything: `eu-north-1` (Stockholm)** — it is your project's region and the code defaults to it. Don't create Lambda, API Gateway, DynamoDB or the map in another region.
- Not every service exists in every region. Before deploying, check that **Amazon Location Service** (and the map style you pick) is offered in `eu-north-1`; if it isn't, the app keeps using its built-in OpenStreetMap map, so nothing breaks.

## Step 1 — Host the site on Amplify (≈10 min, console only)
1. AWS Console → **AWS Amplify → Create new app → Host web app → GitHub**, authorise, choose `Ultraviolet01/Unilorin-Nav`
   and the branch you want to publish.
2. Amplify detects `amplify.yml` (build: `npm ci && npm run build`, output folder `out`). Accept the defaults and **Save and deploy**.
3. When it finishes you get `https://<branch>.<id>.amplifyapp.com` — HTTPS, so GPS and the offline service worker work.
   Open `/field/` on a phone to use the field collector.

## Step 2 — Backend: pins API + map (≈15 min)
Install the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) and sign in (`aws configure sso`), then from the repo root:
```bash
sam build --template infra/template.yaml
sam deploy --guided --template infra/template.yaml --stack-name unilorin-nav
```
Answer the prompts (give `AllowedOrigin` your Amplify URL and `AllowedReferer` like `https://main.xxxx.amplifyapp.com/*`).
It creates the table, Lambda, API, map and a restricted map key, and prints **Outputs**.

Load the pins and get the map key:
```bash
TABLE_NAME=<TableName output> AWS_REGION=<region> npm run import-pois
aws location describe-key --key-name <MapApiKeyName output> --query Key --output text
```

## Step 3 — Point the site at it
In Amplify → **Hosting → Environment variables** add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | the **ApiUrl** output |
| `NEXT_PUBLIC_AWS_REGION` | your region |
| `NEXT_PUBLIC_LOCATION_MAP_NAME` | the **MapName** output |
| `NEXT_PUBLIC_LOCATION_API_KEY` | the key from Step 2 |

Redeploy. The "Map" view now uses Amazon Location and the pins come from DynamoDB (Satellite/Dark stay as they are).
`NEXT_PUBLIC_*` values are visible in the browser — that is why the key is restricted to your site and to map tiles only.

## Updating data later
Edit `data/pois.json` (or run the field-collector merge), then `npm run import-pois` to refresh DynamoDB. Amplify rebuilds on every push.

## Cost
At student-hackathon traffic all of this is inside the free tier or pennies per month (Amplify build minutes/hosting, DynamoDB
on-demand, Lambda, HTTP API, Amazon Location map tiles). Keep the budget alert on.
