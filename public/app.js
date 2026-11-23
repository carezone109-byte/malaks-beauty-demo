const $ = (s) => document.querySelector(s);
const msgs = $('#msgs'), input = $('#input'), form = $('#form'), quick = $('#quick'), sendBtn = $('#send');
const AR = /[؀-ۿ]/;
let sessionId = crypto.randomUUID();
let busy = false;

let SALON = { name: "Malak's Beauty Club" };
const welcome = () => `Welcome to ${SALON.name} ✨ How can I help you today?\nأهلاً فيكِ بـ ${SALON.name} ✨ كيف فيني ساعدك؟`;
const QUICK = {
  en: [['Book an appointment', 'I would like to book an appointment'], ['Prices', 'What are your prices?'], ['Opening hours', 'What are your opening hours?']],
  ar: [['احجزي موعد', 'بدي إحجز موعد'], ['الأسعار', 'شو أسعاركم؟'], ['ساعات الدوام', 'شو ساعات الدوام؟']],
};

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const md = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const scroll = () => (msgs.scrollTop = msgs.scrollHeight);

function addMsg(text, who) {
  const d = document.createElement('div');
  d.className = `msg ${who}` + (AR.test(text) ? ' rtl' : '');
  d.innerHTML = md(text);
  msgs.appendChild(d); scroll(); return d;
}
function setQuick(lang) {
  quick.innerHTML = '';
  QUICK[lang].forEach(([label, text]) => {
    const b = document.createElement('button'); b.textContent = label; b.type = 'button';
    b.onclick = () => send(text); quick.appendChild(b);
  });
}
function typing(on) {
  const ex = $('#typing'); if (ex) ex.remove();
  if (!on) return;
  const d = document.createElement('div'); d.id = 'typing'; d.className = 'msg bot typing'; d.innerHTML = '<i></i><i></i><i></i>';
  msgs.appendChild(d); scroll();
}
const fmtDate = (iso, rtl) => new Date(iso + 'T12:00:00Z').toLocaleDateString(rtl ? 'ar-LB' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

function priceText(ev, rtl) {
  if (ev.price == null) return '';
  const from = ev.priceFrom ? (rtl ? 'من ' : 'from ') : '';
  return `${from}$${ev.price}` + (ev.priceTo ? ` – $${ev.priceTo}` : '');
}

function addCard(ev, rtl) {
  const d = document.createElement('div');
  if (ev.type === 'booking_created') {
    const b = ev.booking;
    const L = rtl ? ['تأكيد الحجز ✓', 'الخدمة', 'التاريخ', 'الوقت', 'الاسم', 'الهاتف', 'السعر'] : ['Booking confirmed ✓', 'Service', 'Date', 'Time', 'Name', 'Phone', 'Price'];
    const price = ev.price == null ? '' : `<dt>${L[6]}</dt><dd>${priceText(ev, rtl)}</dd>`;
    d.className = 'card' + (rtl ? ' rtl' : '');
    d.innerHTML = `<h4>${L[0]}</h4><dl><dt>${L[1]}</dt><dd>${esc(b.service)}</dd><dt>${L[2]}</dt><dd>${fmtDate(b.date, rtl)}</dd><dt>${L[3]}</dt><dd>${b.time}</dd><dt>${L[4]}</dt><dd>${esc(b.name)}</dd><dt>${L[5]}</dt><dd dir="ltr" style="text-align:${rtl ? 'right' : 'left'}">${esc(b.phone)}</dd>${price}</dl>`;
  } else if (ev.type === 'booking_cancelled') {
    d.className = 'card cancel' + (rtl ? ' rtl' : '');
    d.innerHTML = `<h4>${rtl ? 'تم إلغاء الحجز' : 'Booking cancelled'}</h4><dl>` + ev.cancelled.map((c) => `<dt>${esc(c.service)}</dt><dd>${fmtDate(c.date, rtl)} · ${c.time}</dd>`).join('') + '</dl>';
  } else return;
  msgs.appendChild(d); scroll();
}

async function send(text) {
  text = (text || '').trim();
  if (!text || busy) return;
  busy = true; sendBtn.disabled = true; input.value = '';
  addMsg(text, 'me');
  const lang = AR.test(text) ? 'ar' : 'en'; setQuick(lang);
  typing(true);
  const t0 = Date.now();
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, message: text }) });
    const data = await r.json();
    await new Promise((ok) => setTimeout(ok, Math.max(0, 700 - (Date.now() - t0)))); // natural pacing
    typing(false);
    addMsg(data.reply || 'Sorry, something went wrong.', 'bot');
    const rtl = AR.test(data.reply || '');
    (data.events || []).forEach((e) => addCard(e, rtl));
    if (rtl) setQuick('ar');
  } catch {
    typing(false); addMsg('Connection problem, please try again.', 'bot');
  }
  busy = false; sendBtn.disabled = false; input.focus();
}

function startChat() {
  msgs.innerHTML = ''; sessionId = crypto.randomUUID();
  welcome().split('\n').forEach((l) => addMsg(l, 'bot')); setQuick('en');
}
form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
$('#newChat').onclick = () => { fetch('/api/chat/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) }); startChat(); };

// ---- tabs ----
document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === t.dataset.tab));
}));

// ---- dashboard (live via SSE) ----
let known = null;
function render(list) {
  const fresh = new Set();
  if (known) list.forEach((b) => { if (!known.has(b.id)) fresh.add(b.id); });
  known = new Set(list.map((b) => b.id));
  $('#count').textContent = list.length;
  $('#empty').hidden = list.length > 0;
  $('#rows').innerHTML = list.map((b) => `<tr class="${fresh.has(b.id) ? 'new' : ''}">
    <td data-l="Name">${esc(b.name)}</td><td data-l="Phone" dir="ltr">${esc(b.phone)}</td><td data-l="Service">${esc(b.service)}</td>
    <td data-l="Date">${fmtDate(b.date)}</td><td data-l="Time">${b.time}</td>
    <td data-l="Source"><span class="tag ${b.source === 'agent' ? 'agent' : ''}">${b.source === 'agent' ? 'AI assistant' : 'sample'}</span></td></tr>`).join('');
}
const es = new EventSource('/api/events');
es.onmessage = (e) => render(JSON.parse(e.data));

$('#resetDemo').onclick = async () => {
  if (!confirm('Clear all bookings and restore the 3 sample bookings?')) return;
  await fetch('/api/reset', { method: 'POST' }); startChat();
};

fetch('/api/salon').then((r) => r.json()).then((s) => {
  SALON = s; document.title = s.name + ' · AI Assistant';
  document.querySelectorAll('.brand-name').forEach((e) => (e.textContent = s.name));
  document.querySelectorAll('.brand-mark').forEach((e) => (e.textContent = s.name[0]));
  document.querySelector('.brand small').textContent = (s.location || '') + ' · AI assistant demo';
}).catch(() => {}).finally(startChat);
