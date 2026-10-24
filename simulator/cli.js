#!/usr/bin/env node
// Hospital EHR simulator: command-line entry point.
//
//   node simulator/cli.js backfill [--days 7] [--batch-minutes 1440] [--reset]
//   node simulator/cli.js tick                 one batch covering last run -> now
//   node simulator/cli.js live [--every 15]    tick now and every N minutes (Ctrl+C to stop)
//   node simulator/cli.js upload [--dry-run]   send outbox files to the GCP landing bucket
//   node simulator/cli.js status

const fs = require('fs');
const cfg = require('./config');
const { makeRng, tools, startOfLocalDay, isoLocal, DAY } = require('./util');
const { loadState, saveState, emptyState, makeJourneys } = require('./journeys');
const { toRecord, assign, writeBatches } = require('./writer');
const { uploadAll, pending } = require('./upload');

function args() {
  const [, , cmd, ...rest] = process.argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) continue;
    const key = rest[i].slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) opts[key] = true;
    else { opts[key] = next; i++; }
  }
  return { cmd, opts };
}

function fromDeferred(state) {
  const recs = state.deferred || [];
  state.deferred = [];
  return recs;
}

function run(state, from, to, windows, stampTimes) {
  const t = tools(makeRng(cfg.seed ? `${cfg.seed}:${from}` : ''));
  const journeys = makeJourneys(cfg, state, t);
  const events = journeys.generate(from, to);
  const records = events.map(ev => toRecord(cfg, ev));

  const late = fromDeferred(state);
  const { buckets, deferred } = assign(records, windows);
  buckets[0].unshift(...late);               // late messages from the last run go out first
  state.deferred = deferred;
  state.clock = new Date(to).toISOString();

  const files = writeBatches(cfg, buckets, windows, stampTimes);
  return { events: records.length, files };
}

function summary(result) {
  const msgs = result.files.reduce((s, f) => s + f.messages, 0);
  console.log(`Generated ${result.events} events, wrote ${msgs} messages in ${result.files.length} files.`);
}

function backfill(opts) {
  const days = Number(opts.days || 7);
  const batchMs = Number(opts['batch-minutes'] || 1440) * 60000;

  if (fs.existsSync(cfg.stateFile) && !opts.reset) {
    throw new Error('State already exists. Use "tick"/"live" to continue, or "backfill --reset" to start over.');
  }
  if (opts.reset) {
    for (const p of [cfg.stateFile, cfg.csvFile]) if (fs.existsSync(p)) fs.rmSync(p);
    for (const d of [cfg.outboxDir, cfg.sentDir]) if (fs.existsSync(d)) fs.rmSync(d, { recursive: true });
  }

  const now = Date.now();
  const from = startOfLocalDay(new Date(now), cfg.tzOffset).getTime() - days * DAY;
  const windows = [];
  for (let w = from; w < now; w += batchMs) windows.push(w);
  // Each batch is stamped with the end of its window, when the hospital would send it.
  const stamps = windows.map(w => Math.min(w + batchMs, now));

  const state = emptyState();
  const result = run(state, from, now, windows, stamps);
  saveState(cfg.stateFile, state);
  console.log(`Backfill ${isoLocal(new Date(from), cfg.tzOffset)} -> ${isoLocal(new Date(now), cfg.tzOffset)}`);
  summary(result);
  console.log(`Open visits carried forward: ${state.openVisits.length}`);
}

function tick() {
  const state = loadState(cfg.stateFile);
  const now = Date.now();
  const from = state.clock ? new Date(state.clock).getTime() : now - 15 * 60000;
  if (from >= now) { console.log('Nothing to do yet.'); return; }
  const result = run(state, from, now, [from], [now]);
  saveState(cfg.stateFile, state);
  console.log(`[${isoLocal(new Date(now), cfg.tzOffset)}] tick`);
  summary(result);
}

async function live(opts) {
  const every = Number(opts.every || 15);
  console.log(`Live mode: a batch every ${every} min. Upload ${cfg.gcp.uploadEnabled ? 'ON' : 'OFF'}. Ctrl+C to stop.`);
  const once = async () => {
    try {
      tick();
      if (cfg.gcp.uploadEnabled) await uploadAll(cfg);
    } catch (err) { console.error(`Tick failed: ${err.message}`); }
  };
  await once();
  setInterval(once, every * 60000);
}

function status() {
  const state = loadState(cfg.stateFile);
  console.log(JSON.stringify({
    clock: state.clock,
    patients: Object.keys(state.patients).length,
    openVisits: state.openVisits.length,
    deferredMessages: (state.deferred || []).length,
    counters: state.counters,
    outboxFiles: pending(cfg).length,
    uploadEnabled: cfg.gcp.uploadEnabled,
    bucket: cfg.gcp.bucket || '(not set)'
  }, null, 2));
}

(async () => {
  const { cmd, opts } = args();
  try {
    if (cmd === 'backfill') backfill(opts);
    else if (cmd === 'tick') tick();
    else if (cmd === 'live') await live(opts);
    else if (cmd === 'upload') await uploadAll(cfg, { dryRun: !!opts['dry-run'] });
    else if (cmd === 'status') status();
    else {
      console.log('Usage: node simulator/cli.js <backfill|tick|live|upload|status> [options]');
      process.exitCode = 1;
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  }
})();
