#!/usr/bin/env bash
# Builds the static site with the AWS settings and publishes it to Amplify (manual deployment).
# Needs: AWS CLI signed in (e.g. `aws login --profile unilorin`), node/npm, zip.
# Usage: AWS_PROFILE=unilorin APP_ID=<amplify app id> ./scripts/deploy-site.sh
set -euo pipefail
REGION="${AWS_REGION:-eu-north-1}"; STACK="${STACK:-unilorin-nav}"; APP_ID="${APP_ID:?set APP_ID (see docs/AWS-SETUP.md)}"; BRANCH="${BRANCH:-main}"
P=(); [ -n "${AWS_PROFILE:-}" ] && P=(--profile "$AWS_PROFILE")
aws_() { aws "$@" --region "$REGION" "${P[@]}"; }
out() { aws_ cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }

API_URL="$(out ApiUrl)"; MAP_NAME="$(out MapName)"; KEY_NAME="$(out MapApiKeyName)"
API_KEY="$(aws_ location describe-key --key-name "$KEY_NAME" --query Key --output text)"

echo "Building…"
NEXT_PUBLIC_API_URL="$API_URL" NEXT_PUBLIC_AWS_REGION="$REGION" NEXT_PUBLIC_LOCATION_MAP_NAME="$MAP_NAME" NEXT_PUBLIC_LOCATION_API_KEY="$API_KEY" npm run build
rm -f site.zip && (cd out && zip -qr ../site.zip .)

echo "Uploading…"
read -r JOB URL < <(aws_ amplify create-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --query '[jobId,zipUploadUrl]' --output text)
curl -fsS -X PUT -T site.zip "$URL" > /dev/null
aws_ amplify start-deployment --app-id "$APP_ID" --branch-name "$BRANCH" --job-id "$JOB" --query 'jobSummary.status' --output text
rm -f site.zip
echo "Published: https://$BRANCH.$(aws_ amplify get-app --app-id "$APP_ID" --query app.defaultDomain --output text)"
