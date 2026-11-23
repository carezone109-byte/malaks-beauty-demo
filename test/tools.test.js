process.env.DATA_DIR = require('os').tmpdir();
const assert = require('assert');
const store = require('../store');
store.init(); store.reset();
const t = store.tools;
const seed = store.getBookings();
assert.strictEqual(seed.length, 3);
const d1 = seed[0].date;
// conflict at 11:00 (both staff busy)
let r = t.check_availability({ date: d1, time: '11:00', service: 'haircut' });
assert.strictEqual(r.available, false); assert.ok(r.nearestSameDay.length);
console.log('conflict ->', r.reason, 'alternatives', r.nearestSameDay);
// free slot books
r = t.check_availability({ date: d1, time: r.nearestSameDay[0], service: 'Haircut' }); assert.ok(r.available);
const b = t.create_booking({ name: 'Test', phone: '+961 3 000 111', service: 'haircut', date: d1, time: '16:00' }); assert.ok(b.ok);
// booking directly into the taken slot is refused
assert.ok(t.create_booking({ name: 'X Y', phone: '03111222', service: 'haircut', date: d1, time: '11:00' }).error);
// Sunday is open now; before opening time is refused
let d = d1; while (store.dayKey(d) !== 'sun') d = store.addDays(d, 1);
assert.strictEqual(t.check_availability({ date: d, time: '09:00', service: 'russianmanicure' }).reason, 'outside_hours');
// outside hours / end of day overrun (keratin 150min at 17:30)
assert.strictEqual(t.check_availability({ date: d1, time: '18:00', service: 'keratin' }).reason, 'outside_hours');
// bridal not bookable
assert.strictEqual(t.check_availability({ date: d1, time: '12:00', service: 'ombre' }).reason, 'service_by_request');
// Arabic service name resolves
assert.ok(t.check_availability({ date: d1, time: '17:00', service: 'مانيكير روسي' }).available);
// cancel by phone (different formatting)
assert.ok(t.cancel_booking({ phone: '03 000 111', date: d1 }).ok);
assert.strictEqual(t.cancel_booking({ phone: '03 000 111', date: d1 }).ok, false);
console.log('all tool tests passed');
