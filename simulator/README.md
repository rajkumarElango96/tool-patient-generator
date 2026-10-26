# Hospital EHR simulator

Plays a legacy hospital EHR that sends HL7v2 ADT batch files to a regional hub on GCP.
It runs **outside** GCP on purpose: the hospital is an external system, and data crosses
a boundary into the cloud, as it would in real life. All data is synthetic.

## What it produces

- **Patient journeys with memory.** Each visit is admitted (`A01`), may be updated (`A08`:
  bed transfer, doctor change, new phone or address) and is later discharged (`A03`).
  Visits still open at the end of a run are kept in `output/state.json` and continue next run.
- **Two facilities** (`SYNH-CHN`, `SYNH-BLR`), one batch file per facility per window,
  named `<facility>_<YYYYMMDDTHHMMSS>.hl7`. Files are written as `.part` and renamed when
  complete, so a half-written file is never picked up.
- **Indian synthetic data:** consistent city, state and PIN; MRN plus ABHA-style identifiers.
- **Deliberate faults** (default 3% of messages), recorded in the CSV `injected_fault` column:

  | Fault | What it tests |
  |---|---|
  | `missing_visit_number` | PV1-19 empty: validator should quarantine |
  | `missing_pv1` | no PV1 segment: validator should quarantine |
  | `missing_mrn` | PID-3 has only the ABHA ID: validator should quarantine |
  | `duplicate` | same message twice: loader and FHIR writes must be idempotent |
  | `late_arrival` | message sent in the next batch: "newest MSH-7 wins" |

- **`output/messages.csv`:** one row per message, for inspection. The `hl7` column holds the
  raw message with segment breaks written as the two characters `\r`.

## Commands

```
npm run sim:backfill        # past 7 days + today, one file per facility per day
npm run sim:tick            # one batch: last run -> now
npm run sim:live            # a batch every 15 min (uploads too if SIM_UPLOAD_ENABLED=true)
npm run sim:upload:dry      # show what would be sent
npm run sim:upload          # send outbox files to the landing bucket, move them to sent/
npm run sim:status
```

Start over with `node simulator/cli.js backfill --days 7 --reset`. Settings live in `.env`
(copy `.env.example`).

## Sending to GCP

1. Run `infra/gcp/setup.sh` once (bucket + write-only `hospital-sender` account).
2. `gcloud auth application-default login --impersonate-service-account=hospital-sender@<project>.iam.gserviceaccount.com`
3. Set `GCP_PROJECT_ID` and `GCP_LANDING_BUCKET` in `.env`, then `npm run sim:upload`.

The sender can only create objects (`roles/storage.objectCreator`). Uploads use
`ifGenerationMatch: 0`, so nothing is ever overwritten and re-sending a file is harmless.

## Files

| File | Role |
|---|---|
| `cli.js` | commands |
| `config.js` | settings from env / `.env` |
| `seed-india.js` | names, places, doctors, services |
| `journeys.js` | visit state machine and fault injection |
| `hl7.js` | HL7 v2.5 message and batch-envelope builder |
| `writer.js` | batch files and CSV index |
| `upload.js` | sender to the GCP landing bucket |
