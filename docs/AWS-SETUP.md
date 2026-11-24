# AWS setup — Unilorin Navigator

**Status: deployed** to the project's region **eu-north-1 (Stockholm)** on the Free plan.

| Piece | AWS service | Name / address |
|---|---|---|
| Website | AWS Amplify Hosting (manual deployment of the static export) | https://main.d1mrgjwajo268n.amplifyapp.com — app `d1mrgjwajo268n`, branch `main` |
| Pins API | API Gateway HTTP API → Lambda → DynamoDB | `https://i9h6rn4lwh.execute-api.eu-north-1.amazonaws.com/pois` |
| Pins database | DynamoDB (on-demand) | table from stack output `TableName` (30 pins) |
| "Map" view | Amazon Location Service (HERE Explore style) + key restricted to map tiles, this map, this site | map `unilorin-nav-map`, key `unilorin-nav-web-key` |
| Everything above except the website | one CloudFormation stack | `unilorin-nav` (`infra/template.yaml`) |

Not used: S3 (photos are served by Amplify from `public/photos`), Cognito (no logins).
The Satellite and Dark views, and the offline basemap, do not use AWS.

## What protects it
- **API:** CORS allows only the website's address; rate limit 25 req/s (burst 50); the Lambda can only `Scan` its own table. No login — the data is public and read-only.
- **Map key:** can only fetch tiles of *this* map, and only when the request comes from the website (or `localhost:3000` for development). It is visible in the site's JavaScript — that is normal for map keys; the restrictions are the protection.
- Admin work is done with an IAM user (`Ultra`) with MFA — never the root user.

## Update the website
After changing the code or data, from the repo root (needs the AWS CLI signed in: `aws login --profile unilorin`):
```bash
AWS_PROFILE=unilorin APP_ID=d1mrgjwajo268n ./scripts/deploy-site.sh
```
It reads the API address, map name and key from AWS, builds the site, uploads it and publishes it.
**Better later:** in the Amplify console connect the GitHub repo so every push deploys automatically (the app then uses `amplify.yml`, and you set the four `NEXT_PUBLIC_*` values under *Environment variables*). If the site address changes (new branch or custom domain), update the stack so CORS and the map key follow it:
```bash
aws cloudformation deploy --stack-name unilorin-nav --template-file infra/template.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides AllowedOrigin=https://<new-site> AllowedReferer=https://<new-site>/*
```

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
aws amplify delete-app --app-id d1mrgjwajo268n --region eu-north-1               # the website
```
