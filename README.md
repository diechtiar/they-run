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

Open the printed URL on a phone. Allow location. **Start**: first chase in ~20s so you feel it; after that, six 90s surges per hour at +20% (a VO2max dose if you keep walking). **Demo** is one chase right now (couch).

HTTPS build (GitHub Pages): https://diechtiar.github.io/they-run/  
Phone: open that URL, **Add to Home Screen**. The service worker caches the shell on first visit; the laptop is not required after that. GPS still needs the screen on.

Local: `npm run build` then serve `apps/pwa/dist` (not `file://`). Dev (`npm run dev`) does not register the worker. Pages builds set `GITHUB_PAGES=1` so asset URLs are `/they-run/`.

Success: you get chased, you speed up, and repeating that would be interval work.

## Stack

Vite + TypeScript PWA. Engine is a workspace package so a later API or Capacitor
app can reuse it. No accounts. Recap is `localStorage`.

This is a **website you can install on the phone** (Add to Home Screen). It is
not an App Store binary yet. That is enough for a walk with the screen on.
When iOS kills GPS with the screen off, wrap this same app in Capacitor — same
engine, same UI, native location. You are not late; that is the usual order.
