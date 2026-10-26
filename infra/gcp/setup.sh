#!/usr/bin/env bash
# One-time GCP setup for the HL7v2 -> FHIR PoC. Safe to re-run.
#
# Creates:
#   1. the landing bucket (private, versioned)
#   2. hospital-sender : the external EHR's identity, can ONLY add files to the landing bucket
#   3. hl7-pipeline    : the single identity every pipeline component runs as
#
# Usage (Cloud Shell or any machine with gcloud):
#   PROJECT_ID=hl7-fhir-pipeline REGION=asia-south1 BUCKET=<landing-bucket> bash infra/gcp/setup.sh
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
: "${REGION:=asia-south1}"
: "${BUCKET:=${PROJECT_ID}-landing}"
SENDER="hospital-sender@${PROJECT_ID}.iam.gserviceaccount.com"
PIPELINE="hl7-pipeline@${PROJECT_ID}.iam.gserviceaccount.com"
ME="$(gcloud config get-value account 2>/dev/null)"

step() { echo; echo "== $*"; }

step "Project $PROJECT_ID, region $REGION, bucket gs://$BUCKET, you: $ME"
gcloud config set project "$PROJECT_ID" >/dev/null

step "Enabling APIs"
gcloud services enable storage.googleapis.com bigquery.googleapis.com \
  healthcare.googleapis.com iamcredentials.googleapis.com

step "Landing bucket"
if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention
else
  echo "exists"
fi
# The landing zone is the replay source: keep every version, never lose a file.
gcloud storage buckets update "gs://$BUCKET" --versioning --public-access-prevention >/dev/null

make_sa() {  # name, display name
  if ! gcloud iam service-accounts describe "$1@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1; then
    gcloud iam service-accounts create "$1" --display-name="$2"
  else
    echo "$1 exists"
  fi
}

step "hospital-sender (external EHR): create objects in the landing bucket only"
make_sa hospital-sender "Hospital EHR outbound sender (write-only)"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SENDER" --role="roles/storage.objectCreator" >/dev/null
# Lets your laptop act as the sender without a key file.
gcloud iam service-accounts add-iam-policy-binding "$SENDER" \
  --member="user:$ME" --role="roles/iam.serviceAccountTokenCreator" >/dev/null

step "hl7-pipeline (all pipeline components)"
make_sa hl7-pipeline "HL7 to FHIR pipeline"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$PIPELINE" --role="roles/storage.objectViewer" >/dev/null
for role in roles/bigquery.dataEditor roles/bigquery.jobUser \
            roles/healthcare.fhirResourceEditor roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$PIPELINE" --role="$role" --condition=None >/dev/null
  echo "granted $role"
done
gcloud iam service-accounts add-iam-policy-binding "$PIPELINE" \
  --member="user:$ME" --role="roles/iam.serviceAccountTokenCreator" >/dev/null

step "Check"
gcloud storage buckets describe "gs://$BUCKET" --format="value(name,location,versioning_enabled)"
gcloud storage buckets get-iam-policy "gs://$BUCKET" --format="table(bindings.role,bindings.members)" | grep -E "objectCreator|objectViewer" || true

cat <<MSG

Done.
  Landing bucket : gs://$BUCKET  ($REGION, private, versioned)
  Sender         : $SENDER  (objectCreator on the bucket only)
  Pipeline       : $PIPELINE

On your Mac, in the simulator's .env:
  GCP_PROJECT_ID=$PROJECT_ID
  GCP_LANDING_BUCKET=$BUCKET
Then:
  gcloud auth application-default login --impersonate-service-account=$SENDER
  npm run sim:upload:dry && npm run sim:upload
MSG
