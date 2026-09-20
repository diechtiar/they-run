# THEY RUN

Interval work as a chase. Phone PWA. No radar.

- `packages/hunt-engine` — protocols, `tick()`, GPS filters. No UI.
- `apps/pwa` — one screen: SCANNING / CHASE / CLEAR, a clock, a fill bar.

Solo hunt only. Multiplayer is parked (see later). Indoor cheat (hold to sprint) is off by default.

## Run

```bash
npm install
npm test
npm run dev
```

Open the printed URL on a phone. Allow location. **Start** for a real session (first chase at the protocol mean, e.g. ~10 min on VO2max). **Demo** fires one chase now.

Success: a 4×4 outdoors that *feels* like 4×4.

## Stack

Vite + TypeScript PWA. Engine is a workspace package so a later API or Capacitor app can reuse it. No accounts. Recap is `localStorage`.
