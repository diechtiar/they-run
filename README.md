# THEY RUN

A chase on the phone. Interval work if you keep going. No map, no sweep.

- `packages/hunt-engine` — one preset (Surge / 90s), `tick()`, GPS filters.
- `apps/pwa` — SCANNING / CHASE / CLEAR / GOT YOU, a clock, a fill bar.

**Demo** — chase in ~20s (couch).  
**Start** — first chase in 3 minutes; only if the street is safe. **Skip** voids a chase (not CLEAR, not GOT YOU). Later gaps follow six 90s surges per hour at +20%.

Beeps are opt-in (they fight other audio). Voice is three words: Chase, Clear, Got you. Indoor hold-to-sprint is off by default. Official rule: CLEAR if you spent ≥70% of the surge at target. No Android wrap this week.

## Run

```bash
npm install
npm test
npm run dev
```

HTTPS: https://diechtiar.github.io/they-run/  
Phone: open that URL, **Add to Home Screen**. The service worker caches the shell on first visit. GPS still needs the screen on.

Local: `npm run build` then serve `apps/pwa/dist` (not `file://`). Dev does not register the worker. Pages builds set `GITHUB_PAGES=1` so asset URLs are `/they-run/`.

## Stack

Vite + TypeScript PWA. Engine is a workspace package. No accounts. Recap is `localStorage`.
This is a website you can install. It is not an App Store binary yet.
