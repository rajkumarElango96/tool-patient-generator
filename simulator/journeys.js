// Patient journeys with memory between runs.
// A visit is admitted (A01), may be updated (A08) and is later discharged (A03).
// Visits still open at the end of a run are kept in state.json and carried forward.

const fs = require('fs');
const seed = require('./seed-india');
const { hl7Date, HOUR, DAY } = require('./util');

const FAULTS = [
  ['missing_visit_number', 30], // validator should quarantine
  ['missing_pv1', 20],          // validator should quarantine
  ['missing_mrn', 15],          // validator should quarantine
  ['duplicate', 20],            // same message sent twice: tests idempotency
  ['late_arrival', 15]          // sent in a later batch: tests "newest wins"
];

function emptyState() {
  return {
    version: 1,
    clock: null,                       // end of the last generated window (ISO)
    counters: { message: 0, visit: 0, mrn: 0 },
    patients: {},                      // mrn -> patient
    openVisits: [],                    // visits not yet discharged
    deferred: []                       // late-arriving messages waiting for the next batch
  };
}

function loadState(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : emptyState();
}

function saveState(file, state) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

function ageOn(dob, at) {
  const y = Number(dob.slice(0, 4)), m = Number(dob.slice(4, 6)) - 1, d = Number(dob.slice(6, 8));
  const t = new Date(at);
  let age = t.getUTCFullYear() - y;
  if (t.getUTCMonth() < m || (t.getUTCMonth() === m && t.getUTCDate() < d)) age--;
  return age;
}

function makeJourneys(cfg, state, t) {
  const pad = (n, w) => String(n).padStart(w, '0');
  const nextMrn = () => `MRN${pad(++state.counters.mrn, 6)}`;
  const nextVisit = () => `V${pad(++state.counters.visit, 7)}`;
  const nextControlId = () => `${cfg.sendingApp.replace(/[^A-Z0-9]/gi, '')}${pad(++state.counters.message, 9)}`;

  function newAddress() {
    const place = t.pick(seed.places);
    return {
      line: `${t.int(1, 250)} ${t.pick(seed.streets)}`,
      city: place.city, state: place.state, pin: `${place.pin}${t.digits(3)}`
    };
  }

  function newPatient(facility, at, { sex, minAge, maxAge }) {
    sex = sex || (t.chance(0.5) ? 'M' : 'F');
    const age = t.int(minAge, maxAge);
    const born = new Date(at - age * 365.25 * DAY - t.int(0, 364) * DAY);
    const p = {
      mrn: nextMrn(),
      facility,
      abha: `${t.digits(2)}-${t.digits(4)}-${t.digits(4)}-${t.digits(4)}`,
      given: t.pick(sex === 'M' ? seed.givenMale : seed.givenFemale),
      family: t.pick(seed.familyNames),
      sex,
      dob: hl7Date(born, cfg.tzOffset),
      address: newAddress(),
      phone: `+91${t.pick(['9', '8', '7'])}${t.digits(9)}`
    };
    state.patients[p.mrn] = p;
    return p;
  }

  function chooseService(patientClass) {
    if (patientClass === 'E') return { code: 'EMR', wards: ['ER'] };
    return t.pick(seed.services);
  }

  function fitsService(service, p, at) {
    const age = ageOn(p.dob, at);
    if (service.code === 'PED') return age < 16;
    if (service.code === 'OBS') return p.sex === 'F' && age >= 18 && age <= 45;
    return age >= 16;
  }

  function demographicsFor(service) {
    if (service.code === 'PED') return { minAge: 0, maxAge: 15 };
    if (service.code === 'OBS') return { sex: 'F', minAge: 18, maxAge: 42 };
    return { minAge: 16, maxAge: 88 };
  }

  // Create a visit and plan its future events (updates and discharge).
  function admit(at) {
    const facility = t.pick(cfg.facilities);
    const patientClass = t.weighted([['I', 55], ['E', 30], ['O', 15]]);
    const service = chooseService(patientClass);

    // About 1 in 10 admissions is a returning patient at the same facility.
    const busy = new Set(state.openVisits.map(v => v.mrn));
    const returning = Object.values(state.patients)
      .filter(p => p.facility === facility && !busy.has(p.mrn) && fitsService(service, p, at));
    const patient = returning.length && t.chance(0.1)
      ? t.pick(returning)
      : newPatient(facility, at, demographicsFor(service));

    const stay = patientClass === 'I' ? t.int(24, 144) * HOUR
      : patientClass === 'E' ? t.int(2, 12) * HOUR
      : t.int(1, 4) * HOUR;
    const discharge = at + stay;

    const visit = {
      visitNumber: nextVisit(),
      mrn: patient.mrn,
      facility,
      patientClass,
      service: service.code,
      ward: t.pick(service.wards),
      room: patientClass === 'O' ? 'OPD' : `R${t.int(1, 40)}`,
      bed: patientClass === 'O' ? '' : `B${t.int(1, 6)}`,
      doctor: t.pick(seed.doctors),
      admitTime: at,
      plan: []
    };

    const updates = patientClass === 'I' ? t.int(0, 2) : patientClass === 'E' ? t.int(0, 1) : 0;
    for (let i = 0; i < updates; i++) {
      visit.plan.push({
        type: 'A08',
        time: at + Math.floor((stay * (i + 1)) / (updates + 1)),
        change: t.pick(['transfer', 'doctor', 'phone', 'address'])
      });
    }
    visit.plan.push({ type: 'A03', time: discharge });
    state.openVisits.push(visit);
    return { type: 'A01', time: at, visit };
  }

  function applyChange(visit, change) {
    const p = state.patients[visit.mrn];
    if (change === 'transfer') { visit.room = `R${t.int(1, 40)}`; visit.bed = `B${t.int(1, 6)}`; }
    if (change === 'doctor') visit.doctor = t.pick(seed.doctors.filter(d => d[0] !== visit.doctor[0]));
    if (change === 'phone') p.phone = `+91${t.pick(['9', '8', '7'])}${t.digits(9)}`;
    if (change === 'address') p.address = newAddress();
  }

  function pickFault() {
    return t.chance(cfg.faultRate) ? t.weighted(FAULTS) : null;
  }

  // Generate every event in [from, to), in time order, applying state changes as they happen.
  // Returns snapshots ready to be turned into HL7.
  function generate(from, to) {
    const events = [];

    // Admissions: a Poisson process at the configured daily rate.
    const ratePerMs = cfg.admissionsPerDay / DAY;
    let at = from;
    for (;;) {
      at += Math.max(1000, Math.round(-Math.log(1 - t.u()) / ratePerMs));
      if (at >= to) break;
      events.push({ kind: 'admit', time: at });
    }

    // Planned events of visits already open from earlier runs.
    for (const v of state.openVisits) {
      for (const e of v.plan) if (e.time >= from && e.time < to) events.push({ kind: 'planned', time: e.time, visit: v, step: e });
    }

    events.sort((a, b) => a.time - b.time);
    const out = [];

    // Admissions create new planned events that may also fall inside this window,
    // so process with a queue that stays sorted by time.
    const queue = events;
    while (queue.length) {
      const e = queue.shift();
      let ev;
      if (e.kind === 'admit') {
        ev = admit(e.time);
        for (const step of ev.visit.plan) {
          if (step.time < to) {
            const item = { kind: 'planned', time: step.time, visit: ev.visit, step };
            const i = queue.findIndex(q => q.time > item.time);
            if (i === -1) queue.push(item); else queue.splice(i, 0, item);
          }
        }
      } else {
        const { visit, step } = e;
        if (step.type === 'A08') applyChange(visit, step.change);
        visit.plan = visit.plan.filter(s => s !== step);
        if (step.type === 'A03') state.openVisits = state.openVisits.filter(v => v !== visit);
        ev = { type: step.type, time: step.time, visit };
      }

      // Snapshot the patient and visit as they are at this moment.
      out.push({
        event: ev.type,
        time: new Date(ev.time),
        controlId: nextControlId(),
        patient: JSON.parse(JSON.stringify(state.patients[ev.visit.mrn])),
        visit: JSON.parse(JSON.stringify(ev.visit)),
        fault: pickFault()
      });
    }
    return out;
  }

  return { generate };
}

module.exports = { loadState, saveState, emptyState, makeJourneys };
