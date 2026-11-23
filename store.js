// Bookings storage + availability logic + the 4 agent tools.
const fs = require('fs');
const path = require('path');

const SALON_PATH = path.join(__dirname, 'salon.json');
const BOOKINGS_PATH = path.join(process.env.DATA_DIR || __dirname, 'bookings.json');
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const loadSalon = () => JSON.parse(fs.readFileSync(SALON_PATH, 'utf8')); // re-read each call: edits apply live

// ---------- date helpers ----------
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00Z'));
const isTime = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const dayKey = (date) => DAYS[new Date(date + 'T12:00:00Z').getUTCDay()];
const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function nowBeirut() {
  const tz = loadSalon().timezone;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).reduce((a, p) => (a[p.type] = p.value, a), {});
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
const hoursFor = (salon, date) => salon.hours[dayKey(date)] || null;

function findService(salon, q) {
  if (!q) return null;
  const s = String(q).trim().toLowerCase();
  return salon.services.find((x) => x.id === s)
    || salon.services.find((x) => Object.values(x.name).some((n) => n.toLowerCase() === s))
    || salon.services.find((x) => Object.values(x.name).some((n) => n.toLowerCase().includes(s) || s.includes(n.toLowerCase())))
    || null;
}

// ---------- persistence ----------
let bookings = [];
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(bookings));
const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const save = () => fs.writeFileSync(BOOKINGS_PATH, JSON.stringify(bookings, null, 2));
const sortBookings = () => bookings.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

function nextOpenDay(salon, from, skip = 0) {
  let d = from, n = 0;
  for (let i = 0; i < 30; i++) {
    d = addDays(from, i);
    if (hoursFor(salon, d) && n++ >= skip) return d;
  }
  return from;
}

function seedData() {
  const salon = loadSalon();
  const today = nowBeirut().date;
  const d1 = nextOpenDay(salon, addDays(today, 1), 0);
  const d2 = nextOpenDay(salon, addDays(d1, 1), 0);
  const mk = (i, name, phone, service, date, time) => ({ id: `seed${i}`, name, phone, service, date, time, createdAt: new Date().toISOString(), source: 'seed' });
  // Two bookings at 11:00 on d1 => both staff busy => demonstrates a conflict.
  return [
    mk(1, 'Rana Khoury', '+961 3 123 456', 'Hair Cut', d1, '11:00'),
    mk(2, 'Maya Haddad', '+961 70 987 654', 'Blowout', d1, '11:00'),
    mk(3, 'Nadine Saab', '+961 71 555 222', 'Keratin', d2, '14:00'),
  ];
}

function init() {
  try { bookings = JSON.parse(fs.readFileSync(BOOKINGS_PATH, 'utf8')); } catch { bookings = seedData(); save(); }
}
function reset() { bookings = seedData(); save(); emit(); return bookings; }
const getBookings = () => sortBookings() && bookings;

// ---------- availability ----------
// Normalise Lebanese numbers so +961 3 123 456, 00961 3123456 and 03 123 456 all match.
const phoneKey = (p) => String(p || '').replace(/\D/g, '').replace(/^(00)?961/, '').replace(/^0+/, '');

function occupancy(salon, date) {
  const map = {};
  for (const b of bookings.filter((x) => x.date === date)) {
    const svc = findService(salon, b.service);
    const slots = Math.max(1, Math.ceil((svc?.duration || salon.slotMinutes) / salon.slotMinutes));
    for (let i = 0; i < slots; i++) { const k = toMin(b.time) + i * salon.slotMinutes; map[k] = (map[k] || 0) + 1; }
  }
  return map;
}

function isFree(salon, svc, date, time, occ = occupancy(salon, date)) {
  const h = hoursFor(salon, date);
  if (!h) return { ok: false, reason: 'closed' };
  const start = toMin(time), need = Math.ceil(svc.duration / salon.slotMinutes);
  if (start < toMin(h[0]) || start + need * salon.slotMinutes > toMin(h[1])) return { ok: false, reason: 'outside_hours' };
  if ((start - toMin(h[0])) % salon.slotMinutes !== 0) return { ok: false, reason: 'not_on_slot' };
  const now = nowBeirut();
  if (date < now.date || (date === now.date && time <= now.time)) return { ok: false, reason: 'in_the_past' };
  for (let i = 0; i < need; i++) if ((occ[start + i * salon.slotMinutes] || 0) >= salon.staff) return { ok: false, reason: 'fully_booked' };
  return { ok: true };
}

function freeStarts(salon, svc, date) {
  const h = hoursFor(salon, date); if (!h) return [];
  const occ = occupancy(salon, date), out = [];
  for (let t = toMin(h[0]); t < toMin(h[1]); t += salon.slotMinutes) if (isFree(salon, svc, date, fromMin(t), occ).ok) out.push(fromMin(t));
  return out;
}

// ---------- tools ----------
function get_services() {
  const s = loadSalon();
  return {
    salon: s.name, location: s.location, currency: s.currency, hours: s.hours, slotMinutes: s.slotMinutes,
    phone: s.phone, mapLink: s.mapLink, hoursConfirmed: s.hoursConfirmed, knownGaps: s.knownGaps,
    services: s.services.map((x) => ({ id: x.id, name: x.name, category: x.category, price: x.price, priceTo: x.priceTo, priceFrom: x.priceFrom, note: x.note, durationMinutes: x.duration || null, bookableOnline: x.bookable })),
    upsells: s.upsells, offers: s.offers,
  };
}

function check_availability({ date, time, service }) {
  const salon = loadSalon();
  if (!isDate(date)) return { error: 'date must be YYYY-MM-DD' };
  if (!isTime(time)) return { error: 'time must be HH:MM (24h)' };
  const svc = findService(salon, service);
  if (!svc) return { error: `unknown service "${service}". Call get_services.` };
  if (!svc.bookable) return { available: false, reason: 'service_by_request', note: 'This service is arranged with the team directly; no online booking.' };
  const r = isFree(salon, svc, date, time);
  if (r.ok) return { available: true, weekday: dayKey(date), date, time, service: svc.name.en };
  const res = { available: false, reason: r.reason, date, time, service: svc.name.en };
  if (r.reason === 'closed') res.note = 'Salon is closed that day.';
  const want = toMin(time);
  if (r.reason !== 'closed') {
    res.nearestSameDay = freeStarts(salon, svc, date).sort((a, b) => Math.abs(toMin(a) - want) - Math.abs(toMin(b) - want)).slice(0, 3).sort();
  }
  if (!res.nearestSameDay?.length) {
    res.nextDays = [];
    for (let i = 1; i <= 14 && res.nextDays.length < 2; i++) {
      const d = addDays(date, i), f = freeStarts(salon, svc, d);
      if (f.length) res.nextDays.push({ date: d, weekday: dayKey(d), slots: f.sort((a, b) => Math.abs(toMin(a) - want) - Math.abs(toMin(b) - want)).slice(0, 3).sort() });
    }
  }
  return res;
}

function create_booking({ name, phone, service, date, time }) {
  const salon = loadSalon();
  if (!name || String(name).trim().length < 2) return { error: 'name required' };
  if (phoneKey(phone).length < 7) return { error: 'valid phone number required' };
  const svc = findService(salon, service);
  if (!svc) return { error: `unknown service "${service}"` };
  if (!svc.bookable) return { error: 'service_by_request: not bookable online' };
  if (!isDate(date) || !isTime(time)) return { error: 'bad date/time format' };
  const r = isFree(salon, svc, date, time);
  if (!r.ok) return { error: `slot not available (${r.reason}). Call check_availability for alternatives.` };
  const b = { id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: String(name).trim(), phone: String(phone).trim(), service: svc.name.en, date, time, createdAt: new Date().toISOString(), source: 'agent' };
  bookings.push(b); sortBookings(); save(); emit();
  return { ok: true, booking: b, weekday: dayKey(date), priceUSD: svc.price, priceTo: svc.priceTo, priceFrom: svc.priceFrom };
}

function cancel_booking({ phone, date }) {
  if (phoneKey(phone).length < 7) return { error: 'valid phone number required' };
  if (!isDate(date)) return { error: 'date must be YYYY-MM-DD' };
  const hit = bookings.filter((b) => phoneKey(b.phone) === phoneKey(phone) && b.date === date);
  if (!hit.length) {
    const other = bookings.filter((b) => phoneKey(b.phone) === phoneKey(phone)).map(({ service, date, time }) => ({ service, date, time }));
    return { ok: false, error: 'no booking found for that phone on that date', otherBookingsForThisPhone: other };
  }
  bookings = bookings.filter((b) => !hit.includes(b)); save(); emit();
  return { ok: true, cancelled: hit.map(({ service, date, time, name }) => ({ name, service, date, time })) };
}

const tools = { get_services, check_availability, create_booking, cancel_booking };

module.exports = { init, reset, getBookings, onChange, tools, loadSalon, nowBeirut, addDays, dayKey };
