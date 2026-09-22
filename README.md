# THEY RUN

A chase on the phone. Interval work if you keep going. No map, no sweep.

- `packages/hunt-engine` — one preset (Surge / 90s), `tick()`, GPS filters.
- `apps/pwa` — SCANNING / CHASE / CLEAR / GOT YOU, a clock, a fill bar.

**Demo** — chase in ~20s (couch).  
**Start** — first chase in 3 minutes; only if the street is safe. **Skip** voids a chase (not CLEAR, not GOT YOU). Later gaps follow six 90s surges per hour at +20%.

Beeps are opt-in. Voice is three words: Chase, Clear, Got you. On Android those sounds mix with a player and stay silent during a call. Indoor hold-to-sprint is off by default. The fill bar is the gap to a runner already at stride. Full = GOT YOU. Faster than them opens meters; a stop spends the gap in about eleven seconds.

The browser needs the screen on. The Android app keeps the night running with the screen off, from Start until Stop, and shows “A night is in progress”.

```bash
npm run android:sync
# then open android/ in Android Studio, or:
cd android && ./gradlew assembleDebug
```

The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`. Location stays on the phone. A Play listing is not part of this build.

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

Vite + TypeScript PWA. Engine is a workspace package. No accounts. Recap is `localStorage`: last surge (CLEAR / GOT YOU and % in zone) plus session totals, written when the surge ends.
This is a website you can install. It is not an App Store binary yet.
