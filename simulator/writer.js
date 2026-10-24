// Turns generated events into HL7 batch files (one per facility per window)
// and appends one row per message to the CSV index.

const fs = require('fs');
const path = require('path');
const { buildMessage, wrapBatch } = require('./hl7');
const { isoLocal, fileStamp, csvCell } = require('./util');

const CSV_HEADER = [
  'batch_file', 'facility', 'control_id', 'message_type', 'event_time', 'mrn',
  'visit_number', 'patient_class', 'hospital_service', 'injected_fault', 'hl7'
];

function toRecord(cfg, ev) {
  return {
    facility: ev.visit.facility,
    controlId: ev.controlId,
    event: ev.event,
    time: ev.time instanceof Date ? ev.time.getTime() : ev.time,
    mrn: ev.patient.mrn,
    visitNumber: ev.visit.visitNumber,
    patientClass: ev.visit.patientClass,
    service: ev.visit.service,
    fault: ev.fault || '',
    segments: buildMessage(cfg, { ...ev, time: new Date(ev.time) })
  };
}

// windows: sorted array of window start times (ms); end is the overall end.
// Late arrivals move to the next window; if there is none, they are deferred.
function assign(records, windows) {
  const buckets = windows.map(() => []);
  const deferred = [];
  const indexOf = (time) => {
    let i = 0;
    while (i + 1 < windows.length && windows[i + 1] <= time) i++;
    return i;
  };
  for (const r of records) {
    const i = indexOf(r.time);
    if (r.fault === 'late_arrival') {
      if (i + 1 < windows.length) buckets[i + 1].push(r); else deferred.push(r);
    } else {
      buckets[i].push(r);
      if (r.fault === 'duplicate') buckets[i].push(r);
    }
  }
  return { buckets, deferred };
}

function ensureDirs(cfg) {
  for (const d of [cfg.outputDir, cfg.outboxDir, cfg.sentDir]) fs.mkdirSync(d, { recursive: true });
}

function writeBatches(cfg, buckets, windows, stampTimes) {
  ensureDirs(cfg);
  const newCsv = !fs.existsSync(cfg.csvFile);
  const csvRows = newCsv ? [CSV_HEADER.join(',')] : [];
  const files = [];

  buckets.forEach((records, wi) => {
    const byFacility = {};
    for (const r of records) (byFacility[r.facility] = byFacility[r.facility] || []).push(r);

    for (const [facility, recs] of Object.entries(byFacility)) {
      const stamp = new Date(stampTimes[wi]);
      const fileName = `${facility}_${fileStamp(stamp, cfg.tzOffset)}.hl7`;
      const target = path.join(cfg.outboxDir, fileName);
      if (fs.existsSync(target) || fs.existsSync(path.join(cfg.sentDir, fileName))) {
        throw new Error(`Batch file already exists: ${fileName}`);
      }

      const env = cfg.batchEnvelope ? wrapBatch(cfg, facility, fileName, stamp, recs) : null;

      // Segments end with CR. Each message also ends with LF so the file is readable.
      let body = '';
      for (const r of recs) body += r.segments.join('\r') + '\r\n';
      if (env) body = env.head.join('\r') + '\r\n' + body + env.tail.join('\r') + '\r\n';

      // Write under a temporary name, then rename, so a half-written file is never picked up.
      const tmp = `${target}.part`;
      fs.writeFileSync(tmp, body);
      fs.renameSync(tmp, target);
      files.push({ fileName, messages: recs.length });

      for (const r of recs) {
        csvRows.push([
          fileName, r.facility, r.controlId, `ADT^${r.event}`, isoLocal(new Date(r.time), cfg.tzOffset),
          r.mrn, r.visitNumber, r.patientClass, r.service, r.fault, r.segments.join('\\r')
        ].map(csvCell).join(','));
      }
    }
  });

  if (csvRows.length) fs.appendFileSync(cfg.csvFile, csvRows.join('\n') + '\n');
  return files;
}

module.exports = { toRecord, assign, writeBatches };
