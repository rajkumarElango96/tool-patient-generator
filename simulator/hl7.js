// Builds HL7 v2.5 ADT messages (A01 admit, A08 update, A03 discharge).
// Segments are separated by carriage returns, as the standard requires.

const { hl7Ts, hl7Date } = require('./util');

const STRUCTURE = { A01: 'ADT_A01', A08: 'ADT_A01', A03: 'ADT_A03' };

function msh(cfg, facility, event, controlId, time) {
  return [
    'MSH', '^~\\&', cfg.sendingApp, facility, cfg.receivingApp, cfg.receivingFacility,
    hl7Ts(time, cfg.tzOffset), '', `ADT^${event}^${STRUCTURE[event]}`, controlId, 'P', '2.5'
  ].join('|');
}

function evn(cfg, event, time) {
  return ['EVN', event, hl7Ts(time, cfg.tzOffset)].join('|');
}

function pid(cfg, patient, { omitMrn = false } = {}) {
  const a = patient.address;
  const ids = [
    omitMrn ? '' : `${patient.mrn}^^^${patient.facility}^MR`,
    `${patient.abha}^^^ABDM^ABHA`
  ].filter(Boolean).join('~');
  return [
    'PID', '1', '', ids, '', `${patient.family}^${patient.given}`, '',
    patient.dob, patient.sex, '', '',
    `${a.line}^^${a.city}^${a.state}^${a.pin}^IN`, '', patient.phone
  ].join('|');
}

function pv1(cfg, visit, event, time, { omitVisitNumber = false } = {}) {
  const f = new Array(46).fill('');
  f[0] = 'PV1';
  f[1] = '1';
  f[2] = visit.patientClass;                                        // PV1-2  I / E / O
  f[3] = `${visit.ward}^${visit.room}^${visit.bed}^${visit.facility}`; // PV1-3  point of care
  f[7] = visit.doctor.join('^');                                    // PV1-7  attending doctor
  f[10] = visit.service;                                            // PV1-10 hospital service
  f[19] = omitVisitNumber ? '' : visit.visitNumber;                 // PV1-19 visit number
  f[44] = hl7Ts(new Date(visit.admitTime), cfg.tzOffset);           // PV1-44 admit time
  if (event === 'A03') {
    f[36] = '01';                                                   // PV1-36 discharged home
    f[45] = hl7Ts(time, cfg.tzOffset);                              // PV1-45 discharge time
  }
  return f.join('|');
}

// Returns the message as an array of segments.
// `fault` deliberately breaks the message for data-quality testing.
function buildMessage(cfg, { event, controlId, time, patient, visit, fault }) {
  const segs = [
    msh(cfg, visit.facility, event, controlId, time),
    evn(cfg, event, time),
    pid(cfg, patient, { omitMrn: fault === 'missing_mrn' })
  ];
  if (fault !== 'missing_pv1') {
    segs.push(pv1(cfg, visit, event, time, { omitVisitNumber: fault === 'missing_visit_number' }));
  }
  return segs;
}

// Optional HL7 batch envelope (FHS/BHS ... BTS/FTS) with a message count.
function wrapBatch(cfg, facility, fileName, time, messages) {
  const ts = hl7Ts(time, cfg.tzOffset);
  const head = [
    ['FHS', '^~\\&', cfg.sendingApp, facility, cfg.receivingApp, cfg.receivingFacility, ts, '', fileName].join('|'),
    ['BHS', '^~\\&', cfg.sendingApp, facility, cfg.receivingApp, cfg.receivingFacility, ts].join('|')
  ];
  const tail = [`BTS|${messages.length}`, 'FTS|1'];
  return { head, tail };
}

module.exports = { buildMessage, wrapBatch, hl7Date, STRUCTURE };
