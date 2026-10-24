// The hospital's outbound sender: uploads finished batch files from the outbox
// to the GCP landing bucket, then moves them to sent/.
//
// Security model: the credentials used here should only be able to CREATE objects
// in the landing bucket (roles/storage.objectCreator). No read, no delete, nothing else.
// Uploads use ifGenerationMatch: 0, so an object is never overwritten; a file that is
// already in the bucket counts as sent. That keeps re-runs safe.

const fs = require('fs');
const path = require('path');

function pending(cfg) {
  if (!fs.existsSync(cfg.outboxDir)) return [];
  return fs.readdirSync(cfg.outboxDir).filter(f => f.endsWith('.hl7')).sort();
}

function checkConfig(cfg) {
  const missing = [];
  if (!cfg.gcp.bucket) missing.push('GCP_LANDING_BUCKET');
  if (!cfg.gcp.projectId) missing.push('GCP_PROJECT_ID');
  return missing;
}

async function uploadAll(cfg, { dryRun = false, log = console.log } = {}) {
  const files = pending(cfg);
  const dest = (f) => `gs://${cfg.gcp.bucket || '<bucket>'}/${cfg.gcp.prefix}${f}`;

  if (!files.length) { log('Outbox is empty, nothing to send.'); return { sent: 0 }; }

  if (dryRun) {
    files.forEach(f => log(`[dry run] ${f} -> ${dest(f)}`));
    return { sent: 0, wouldSend: files.length };
  }

  const missing = checkConfig(cfg);
  if (missing.length) throw new Error(`GCP is not configured. Set ${missing.join(', ')} (see .env.example).`);

  let Storage;
  try { ({ Storage } = require('@google-cloud/storage')); }
  catch { throw new Error('Missing dependency. Run: npm install'); }

  // Uses GOOGLE_APPLICATION_CREDENTIALS if set, otherwise Application Default Credentials
  // (gcloud auth application-default login).
  const storage = new Storage({ projectId: cfg.gcp.projectId });
  const bucket = storage.bucket(cfg.gcp.bucket);
  let sent = 0;

  for (const f of files) {
    const local = path.join(cfg.outboxDir, f);
    try {
      await bucket.upload(local, {
        destination: `${cfg.gcp.prefix}${f}`,
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: 'x-application/hl7-v2+er7', metadata: { source: cfg.sendingApp } }
      });
      log(`sent ${f} -> ${dest(f)}`);
    } catch (err) {
      if (err.code === 412) log(`already in bucket, marking sent: ${f}`);
      else throw new Error(`Upload failed for ${f}: ${err.message}`);
    }
    fs.renameSync(local, path.join(cfg.sentDir, f));
    sent++;
  }
  return { sent };
}

module.exports = { uploadAll, pending };
