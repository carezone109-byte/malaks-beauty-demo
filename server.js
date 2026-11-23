require('dotenv').config();
const express = require('express');
const path = require('path');
const store = require('./store');
const agent = require('./agent');

store.init();
const app = express();
app.use(express.json({ limit: '50kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Tiny in-memory rate limit to protect the API key on a public demo URL.
const hits = new Map();
function limit(req, res, next) {
  const k = req.ip, now = Date.now();
  const arr = (hits.get(k) || []).filter((t) => now - t < 60e3);
  if (arr.length >= 20) return res.status(429).json({ reply: 'Too many messages, please wait a moment 🌸' });
  arr.push(now); hits.set(k, arr); next();
}

// Optional access code (env ACCESS_CODE). When set, every API call except health/salon/gate needs it.
const crypto = require('crypto');
const ACCESS_CODE = process.env.ACCESS_CODE || '';
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const bad = new Map();
function tooManyTries(ip) { const now = Date.now(), a = (bad.get(ip) || []).filter((t) => now - t < 600e3); bad.set(ip, a); return a.length >= 10; }
app.get('/api/gate', (req, res) => res.json({ required: !!ACCESS_CODE }));
app.post('/api/gate', (req, res) => {
  if (!ACCESS_CODE) return res.json({ ok: true });
  if (tooManyTries(req.ip)) return res.status(429).json({ ok: false });
  if (same(req.body?.code || '', ACCESS_CODE)) return res.json({ ok: true });
  bad.get(req.ip).push(Date.now()); res.status(401).json({ ok: false });
});
app.use('/api', (req, res, next) => {
  if (!ACCESS_CODE || ['/health', '/salon', '/gate'].includes(req.path)) return next();
  const code = req.get('x-access-code') || req.query.code || '';
  if (same(code, ACCESS_CODE)) return next();
  res.status(401).json({ error: 'access code required', reply: 'Access code required.' });
});

app.post('/api/chat', limit, async (req, res) => {
  const { sessionId, message } = req.body || {};
  if (!sessionId || typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'sessionId and message required' });
  res.json(await agent.chat(String(sessionId).slice(0, 64), message.trim().slice(0, 1000)));
});
app.post('/api/chat/reset', (req, res) => { agent.clear(String(req.body?.sessionId || '')); res.json({ ok: true }); });

app.get('/api/bookings', (req, res) => res.json(store.getBookings()));
app.post('/api/reset', (req, res) => { store.reset(); res.json({ ok: true, bookings: store.getBookings() }); });
app.get('/api/salon', (req, res) => { const s = store.loadSalon(); res.json({ name: s.name, location: s.location, phone: s.phone }); });
app.get('/api/health', (req, res) => res.json({ ok: true, llm: agent.configured, model: agent.MODEL }));

// Live updates for the owner dashboard (Server-Sent Events)
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (b) => res.write(`data: ${JSON.stringify(b)}\n\n`);
  send(store.getBookings());
  const off = store.onChange(send);
  const ping = setInterval(() => res.write(': ping\n\n'), 25e3);
  req.on('close', () => { off(); clearInterval(ping); });
});

const PORT = process.env.PORT || 3300;
app.listen(PORT, () => console.log(`Mezher Beauty demo on http://localhost:${PORT}  (LLM ${agent.configured ? 'ready: ' + agent.provider + ' ' + agent.MODEL : 'NOT configured - set GEMINI_API_KEY'})`));
