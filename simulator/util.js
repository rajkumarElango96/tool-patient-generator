// Small helpers: a seedable random generator, IST-aware timestamps and CSV quoting.

function makeRng(seed) {
  if (seed === '' || seed === undefined || seed === null) return Math.random;
  // mulberry32: tiny, fast and reproducible for a given seed
  let a = 0;
  for (const ch of String(seed)) a = (a * 31 + ch.charCodeAt(0)) >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tools(rng) {
  const int = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const chance = (p) => rng() < p;
  const weighted = (pairs) => {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let r = rng() * total;
    for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
    return pairs[pairs.length - 1][0];
  };
  const digits = (n) => Array.from({ length: n }, () => int(0, 9)).join('');
  const u = () => rng();
  return { u, int, pick, chance, weighted, digits };
}

// '+0530' -> 330 minutes
function offsetMinutes(tz) {
  const m = String(tz).match(/^([+-])(\d{2})(\d{2})$/);
  if (!m) throw new Error(`Bad timezone offset: ${tz}`);
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
}

// Wall-clock parts of an instant in the given offset
function parts(date, tz) {
  const d = new Date(date.getTime() + offsetMinutes(tz) * 60000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return {
    Y: p(d.getUTCFullYear(), 4), M: p(d.getUTCMonth() + 1), D: p(d.getUTCDate()),
    h: p(d.getUTCHours()), m: p(d.getUTCMinutes()), s: p(d.getUTCSeconds())
  };
}

// HL7 timestamp: YYYYMMDDHHMMSS+0530
function hl7Ts(date, tz) {
  const x = parts(date, tz);
  return `${x.Y}${x.M}${x.D}${x.h}${x.m}${x.s}${tz}`;
}

function hl7Date(date, tz) {
  const x = parts(date, tz);
  return `${x.Y}${x.M}${x.D}`;
}

// ISO 8601 with offset, for the CSV index
function isoLocal(date, tz) {
  const x = parts(date, tz);
  return `${x.Y}-${x.M}-${x.D}T${x.h}:${x.m}:${x.s}${tz.slice(0, 3)}:${tz.slice(3)}`;
}

// Compact stamp for file names: 20261024T150000
function fileStamp(date, tz) {
  const x = parts(date, tz);
  return `${x.Y}${x.M}${x.D}T${x.h}${x.m}${x.s}`;
}

// Start of the local (offset) day containing `date`
function startOfLocalDay(date, tz) {
  const off = offsetMinutes(tz) * 60000;
  const local = new Date(date.getTime() + off);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - off);
}

function csvCell(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HOUR = 3600000;
const DAY = 24 * HOUR;

module.exports = { makeRng, tools, hl7Ts, hl7Date, isoLocal, fileStamp, startOfLocalDay, csvCell, HOUR, DAY };
