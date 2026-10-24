#!/usr/bin/env bash
# One-time setup of the hospital -> hub boundary on GCP:
#   1. the landing bucket (versioned, uniform access, no public access)
#   2. a "hospital-sender" service account that can ONLY create objects in it
#   3. permission for you to impersonate that account from your laptop
#
# Usage: PROJECT_ID=... REGION=asia-south1 BUCKET=... ./infra/gcp/setup-landing.sh
# Safe to re-run: each step skips what already exists.
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
: "${REGION:=asia-south1}"
: "${BUCKET:=${PROJECT_ID}-landing}"
SA_NAME="hospital-sender"
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
ME="$(gcloud config get-value account 2>/dev/null)"

echo "Project: $PROJECT_ID  Region: $REGION  Bucket: gs://$BUCKET  Sender: $SA"
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable storage.googleapis.com iamcredentials.googleapis.com

# 1. Landing bucket
if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention
fi
# Keep every version: the landing zone is the replay source and must never lose a file.
gcloud storage buckets update "gs://$BUCKET" --versioning

# 2. Write-only sender account
if ! gcloud iam service-accounts describe "$SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --display-name="Hospital EHR outbound sender"
fi
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SA" --role="roles/storage.objectCreator" >/dev/null

# 3. Let you act as the sender from your laptop, without a key file
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member="user:$ME" --role="roles/iam.serviceAccountTokenCreator" >/dev/null

cat <<MSG

Done. On your laptop:
  gcloud auth application-default login --impersonate-service-account=$SA
Then in .env:
  GCP_PROJECT_ID=$PROJECT_ID
  GCP_LANDING_BUCKET=$BUCKET
Test with: npm run sim:upload:dry   then   npm run sim:upload
MSG
