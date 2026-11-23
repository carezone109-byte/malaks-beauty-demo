# Malak's Beauty Club — AI booking assistant (demo)

A chat agent for a beauty salon in Lebanon. Customers chat (Arabic / Lebanese / Arabizi / English / French), the agent answers from `salon.json`, recommends services, checks availability and books. The owner sees bookings appear live in a dashboard tab.

## Run locally
```
npm install
cp .env.example .env      # then put your key in ANTHROPIC_API_KEY=
npm start                 # http://localhost:3300
```
Optional env vars: `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `PORT` (default 3300).
`npm run test:tools` tests the availability/booking logic without needing an API key.

## Demo script (for the owner)
1. Click **Reset demo** (restores 3 sample bookings).
2. Chat: *"badde mawed blow dry bukra 11"* → tomorrow 11:00 is already full (two sample bookings), so the agent offers the nearest free slots.
3. Give name + phone → confirmation card appears in the chat.
4. Switch to **Owner dashboard** → the new booking is highlighted live.
5. Try *"cancel my booking"* with the phone number, or ask something unknown (e.g. parking) → "I'll pass it to the team".

## Editing the salon (`salon.json`)
Edited values apply immediately — no restart needed (the file is re-read on every message).
- `hours`: per weekday `["10:00","19:00"]`, or `null` for closed.
- `slotMinutes` and `staff`: slot size and how many clients can be served in parallel.
- `services[]`: `name` in en/ar/fr, `price`, `priceFrom` (shows "from"), `duration` in minutes (**assumed values, not from the price list** — used to block the right number of slots), `bookable:false` for "on request" items.
- `upsells`: which services the agent may suggest alongside another (service ids).
- `offers`: promotions the agent may mention. Currently empty (no offers were provided).
- `location`: currently just the city.

## How it works
- `agent.js` — Anthropic tool-calling loop (tools: `get_services`, `check_availability`, `create_booking`, `cancel_booking`); the API key stays on the server.
- `store.js` — bookings in `bookings.json`, slot/capacity logic, phone matching (`+961 3 123 456` = `03 123 456`).
- `public/` — chat UI + live dashboard (Server-Sent Events).
- Sessions and bookings are in memory/local file. Fine for a demo; for production use a real database and add authentication to the dashboard (it is public in this demo).

## Deploy on Render (free)
1. Push this folder to a GitHub repo (`.env` and `bookings.json` are git-ignored).
2. Render dashboard → **New → Blueprint** (uses `render.yaml`) or **New → Web Service**: runtime Node, build `npm install`, start `npm start`, plan Free.
3. Add environment variable `ANTHROPIC_API_KEY`.
4. Deploy, then open the `*.onrender.com` URL.

Notes: the free tier sleeps after ~15 min idle (first load takes ~30 s — open it before the meeting), and its disk is ephemeral so bookings reset on redeploy/restart; sample bookings are re-created automatically. The demo URL is public and spends your API credits, so share it only with the owner (there is a basic per-IP rate limit).
