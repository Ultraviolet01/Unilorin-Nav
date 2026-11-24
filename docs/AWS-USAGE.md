# AWS used by Unilorin Navigator, and the evidence

This page answers two questions for reviewers: **which AWS services does the project use**, and **where is each one used in the code**. Every claim has two kinds of proof:

1. **In the code**: a file and line you can open.
2. **In AWS**: a live check made with read-only AWS API calls on **24 Nov 2026** (the account number is masked, and the map key's secret value was not read).

Line numbers are for commit `38b88ba` (later edits may move them by a few lines; the function and resource names stay the same). Everything runs in **eu-north-1 (Stockholm)**, the project's selected Region, on the AWS Free plan, under an IAM user (never the root user).

## 1. Summary

| # | AWS service | What it does for the app | Where in the code | Live proof (24 Nov 2026) |
|---|---|---|---|---|
| 1 | **AWS Amplify Hosting** | Hosts the website and rebuilds it on every push to `main` | `amplify.yml` (build + security headers) | App `Unilorin Nav`, platform `WEB`, branch `main`, auto-build on, repo `Ultraviolet01/Unilorin-Nav`, domain `d3dk1xzoo5ual9.amplifyapp.com` |
| 2 | **Amazon API Gateway** (HTTP API) | Public API: `GET /pois`, `POST /walks`, `POST /walks/forget`; CORS limited to the site; throttling | `infra/template.yaml:85` (`HttpApi`), `:104` `PoiRoute`, `:249` `WalkRoute`, `:256` `WalkForgetRoute`, `:111` `ApiStage` | API `i9h6rn4lwh`, protocol HTTP, 3 routes, CORS origin = the Amplify site, throttles: 25 requests/s (burst 50) by default, `/walks` 5/s (burst 10), `/walks/forget` 2/s (burst 4) |
| 3 | **AWS Lambda** (Node.js 24) | `PoiFunction` returns the pins; `WalkFunction` validates and stores opt-in walks | `infra/template.yaml:55` and `:67` (pins code), `:195` and `:207` (walks code); standalone copy `lambda/getPOIs/index.mjs` | Both functions `nodejs24.x`, 256 MB, 10 s timeout, handler `index.handler` |
| 4 | **Amazon DynamoDB** (on demand) | `PoiTable` stores the pins; `WalkTable` stores shared walks (auto-expire after 12 months) | `infra/template.yaml:23` (`PoiTable`), `:156` (`WalkTable`, TTL at `:170`); loaded by `scripts/import-pois.mjs`, read by `scripts/export-walks.mjs` | `PoiTable`: **36 items**, key `id`, pay-per-request. `WalkTable`: **0 items**, keys `owner` + `id`, TTL on `expires` **ENABLED** |
| 5 | **Amazon Location Service** | The "Amazon Map" view (HERE data) | `src/lib/mapStyle.ts:4-7` and `:65` (builds the tile style URL); `src/components/Navigator.tsx:9` and `:21` (offers the view); `infra/template.yaml:137` (`LocationMap`), `:144` (`LocationApiKey`) | Map `unilorin-nav-map` (style `VectorHereExplore`); key `unilorin-nav-web-key` allowed only `geo:GetMap*` on that one map, only from the live site and `localhost:3000` |
| 6 | **AWS CloudFormation** | One stack builds the whole backend, repeatably | `infra/template.yaml` (whole file, checked with `cfn-lint`) | Stack `unilorin-nav`: `UPDATE_COMPLETE`, **17 resources** |
| 7 | **AWS IAM** | Least-privilege roles for the two Lambda functions | `infra/template.yaml:34` (`PoiFunctionRole`: `dynamodb:Scan` on its table only), `:174` (`WalkFunctionRole`: `PutItem`, `DeleteItem`, `Query` on its table only) | Both roles exist in the stack (`CREATE_COMPLETE`) |

## 2. How a request travels, with the code at each step

**Pins (read):**
`Phone` calls `fetch(`${api}/pois`)` in `src/lib/pois.ts:27-30` (`loadPois`) → **API Gateway** `GET /pois` → **Lambda** `PoiFunction` (`infra/template.yaml:73`, a `Scan`) → **DynamoDB** `PoiTable`. If the API is empty or unreachable, `loadPois` falls back to the bundled `data/pois.json` (`src/lib/pois.ts:37`).

**Amazon Map (read):**
`getMapStyle("aws")` in `src/lib/mapStyle.ts:65` builds `https://maps.geo.<region>.amazonaws.com/maps/v0/maps/<map>/style-descriptor?key=...` → **Amazon Location Service** tiles. The key is restricted by the `LocationApiKey` resource (`infra/template.yaml:144-153`).

**Shared walks (write, opt-in, currently OFF in the app):**
`flushWalks` posts to `/walks` in `src/lib/walkshare.ts:52`, and `forgetWalks` to `/walks/forget` at `:64` → **API Gateway** (throttled, `infra/template.yaml:121`) → **Lambda** `WalkFunction` (`:215`, validation then `PutItem`/`DeleteItem`) → **DynamoDB** `WalkTable`. The sharing switch is `CAN_UPLOAD` at `src/lib/walkshare.ts:11`.

**Publishing the site:**
`git push` to `main` → **Amplify** runs `amplify.yml` (`npm ci`, `npm run build`, publishes `out/`) → live site. The four `NEXT_PUBLIC_*` settings are stored in Amplify, read at build time by `src/lib/mapStyle.ts:4-6`, `src/lib/pois.ts:27` and `src/lib/walkshare.ts:8`.

## 3. Live snapshot of the AWS project

Taken 24 Nov 2026 from AWS itself (read-only `Describe*`, `Get*` and a `Scan` count):

| Resource (CloudFormation logical id) | Type | State |
|---|---|---|
| `PoiTable` | DynamoDB table | CREATE_COMPLETE, 36 items |
| `WalkTable` | DynamoDB table | CREATE_COMPLETE, 0 items, TTL enabled |
| `PoiFunctionRole`, `WalkFunctionRole` | IAM roles | CREATE_COMPLETE |
| `PoiFunction`, `WalkFunction` | Lambda functions | CREATE_COMPLETE |
| `HttpApi`, `ApiStage` | API Gateway API and `$default` stage | UPDATE_COMPLETE |
| `PoiIntegration`, `WalkIntegration` | API Gateway integrations | CREATE_COMPLETE |
| `PoiRoute`, `WalkRoute`, `WalkForgetRoute` | API Gateway routes | CREATE_COMPLETE |
| `ApiInvokePermission`, `WalkInvokePermission` | Lambda invoke permissions | CREATE_COMPLETE |
| `LocationMap` | Amazon Location map | CREATE_COMPLETE |
| `LocationApiKey` | Amazon Location API key | UPDATE_COMPLETE |

Outside the stack: the **Amplify app** `Unilorin Nav` (id `d3dk1xzoo5ual9`), connected to the GitHub repo, branch `main`, with automatic builds.

## 4. How to check it yourself (read-only)

Use an IAM user with the `unilorin` profile in `eu-north-1`:

```bash
aws cloudformation describe-stack-resources --stack-name unilorin-nav --region eu-north-1
aws amplify get-app --app-id d3dk1xzoo5ual9 --region eu-north-1
aws apigatewayv2 get-routes --api-id i9h6rn4lwh --region eu-north-1
aws dynamodb scan --table-name <TableName output> --select COUNT --region eu-north-1
curl -s https://i9h6rn4lwh.execute-api.eu-north-1.amazonaws.com/pois | head -c 200
```

The last command returns the live pins straight from DynamoDB through the API.

## 5. Not used

S3, Cognito, CloudFront configured by us, Rekognition, Textract, App Runner and Lambda@Edge. Photos ship inside the site and there are no logins. Amazon Location **route calculation** is not used yet: directions run in the browser over our own traced network (`src/lib/graph.ts`, `src/lib/pois.ts`).

## 6. How AWS was operated while building

- AWS work was done with the **AWS MCP Server (Agent Toolkit for AWS)** from Claude Code, signed in as an **IAM user** with the `unilorin` profile, never the root user.
- Backend changes went through **CloudFormation change sets** (preview first, then execute); one failed update was recovered with `ContinueUpdateRollback` and fixed with a `DependsOn` (see `docs/AWS-SETUP.md`).
- Costs: all services are pay-per-use at tiny volumes; keep the billing alert on (AWS Settings, Billing).
