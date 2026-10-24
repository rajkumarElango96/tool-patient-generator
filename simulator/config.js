// All settings in one place. Values come from environment variables,
// optionally loaded from a .env file in the project root (see .env.example).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadDotEnv();

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const num = (k, d) => Number(env(k, d));
const bool = (k, d) => String(env(k, d)).toLowerCase() === 'true';

const outputDir = path.resolve(ROOT, env('SIM_OUTPUT_DIR', 'output'));

module.exports = {
  root: ROOT,

  // Who the "hospital" is
  sendingApp: env('SIM_SENDING_APP', 'SYN-EHR'),
  facilities: env('SIM_FACILITIES', 'SYNH-CHN,SYNH-BLR').split(',').map(s => s.trim()),
  receivingApp: env('SIM_RECEIVING_APP', 'HUB'),
  receivingFacility: env('SIM_RECEIVING_FACILITY', 'HUB'),
  tzOffset: env('SIM_TZ_OFFSET', '+0530'),

  // How much data
  admissionsPerDay: num('SIM_ADMISSIONS_PER_DAY', 12),
  faultRate: num('SIM_FAULT_RATE', 0.03),
  batchEnvelope: bool('SIM_BATCH_ENVELOPE', false),
  seed: env('SIM_SEED', ''),

  // Where files go
  outputDir,
  outboxDir: path.join(outputDir, 'outbox'),
  sentDir: path.join(outputDir, 'sent'),
  csvFile: path.join(outputDir, 'messages.csv'),
  stateFile: path.join(outputDir, 'state.json'),

  // GCP landing bucket (hospital side only ever writes here)
  gcp: {
    projectId: env('GCP_PROJECT_ID', ''),
    bucket: env('GCP_LANDING_BUCKET', ''),
    prefix: env('GCP_LANDING_PREFIX', 'incoming/'),
    keyFile: env('GOOGLE_APPLICATION_CREDENTIALS', ''),
    uploadEnabled: bool('SIM_UPLOAD_ENABLED', false)
  }
};
