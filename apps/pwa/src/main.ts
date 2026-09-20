import {
  DEFAULT_SETTINGS,
  PROTOCOLS,
  RECAP_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  acceptSample,
  beepIntervalMs,
  createIdleState,
  deriveSpeed,
  emaBaseline,
  settingsFromProtocol,
  speedRatio,
  startDemo,
  startSession,
  stopSession,
  targetSpeedMps,
  tick,
  type EngineState,
  type GeoStatus,
  type HuntSettings,
  type ProtocolId,
  type SpeedSample,
} from "@they-run/hunt-engine";
import { createAudio } from "./audio.ts";

const root = document.querySelector("#app")!;
const audio = createAudio();

function loadSettings(): HuntSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: HuntSettings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s));
}

type Recap = { at: number; alerts: number; evaded: number; close: number; ms: number };

function loadRecap(): Recap | null {
  try {
    const raw = localStorage.getItem(RECAP_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Recap) : null;
  } catch {
    return null;
  }
}

function saveRecap(r: Recap) {
  localStorage.setItem(RECAP_STORAGE_KEY, JSON.stringify(r));
}

let settings = loadSettings();
let state: EngineState = createIdleState();
let recap = loadRecap();
let geo: GeoStatus = "idle";
let accepted: SpeedSample | null = null;
let baseline = 0;
let cheatHeld = false;
let wake: WakeLockSentinel | null = null;
let watchId: number | null = null;
let lastOutcome: "clear" | "close" | null = null;
let lastPaint = 0;
let running = false;

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function word(): { text: string; cls: string } {
  if (state.phase === "idle") return { text: "IDLE", cls: "" };
  if (state.phase === "scanning") return { text: "SCANNING", cls: "" };
  if (state.phase === "chase") {
    const holding = cheatHeld && settings.cheatEnabled;
    return { text: holding ? "HOLDING" : "CHASE", cls: "chase" };
  }
  if (lastOutcome === "clear") return { text: "CLEAR", cls: "clear" };
  if (lastOutcome === "close") return { text: "CLOSE", cls: "chase" };
  return { text: "CLEAR", cls: "" };
}

function paint() {
  const now = Date.now();
  const w = word();
  const clock =
    state.phase === "scanning" && state.nextAlertAt
      ? `next in ${fmt(state.nextAlertAt - now)}`
      : state.phase === "chase" && state.chaseEndsAt
        ? `${fmt(state.chaseEndsAt - now)} left`
        : "";
  const kmh = accepted ? accepted.kmh.toFixed(1) : "—";
  const inChase = state.phase === "chase";
  const bar = inChase ? Math.round(state.proximity * 100) : 0;
  const proto = Object.values(PROTOCOLS)
    .map(
      (p) =>
        `<button type="button" data-proto="${p.id}" class="${settings.protocolId === p.id ? "on" : ""}">${p.name}</button>`,
    )
    .join("");
  const zone = inChase ? (state.speedRatio >= 1 ? " · in zone" : " · SPEED UP") : "";

  root.innerHTML = `
    <h1>THEY RUN</h1>
    <p class="word ${w.cls}">${w.text}</p>
    <p class="clock">${clock}${zone}</p>
    <div class="bar ${inChase ? "chase" : ""}"><span style="width:${bar}%"></span></div>
    <p class="meta">${kmh} km/h · GPS ${geo}${baseline > 0 ? ` · base ${(baseline * 3.6).toFixed(1)} km/h` : ""}</p>
    <div class="protocols">${proto}</div>
    <div class="row">
      ${
        state.phase === "idle"
          ? `<button type="button" class="primary" data-act="start">Start</button>
             <button type="button" data-act="demo">Demo</button>`
          : `<button type="button" class="primary" data-act="stop">Stop</button>`
      }
    </div>
    <label><input type="checkbox" data-cheat ${settings.cheatEnabled ? "checked" : ""}/> Indoor cheat (hold to sprint)</label>
    ${settings.cheatEnabled && inChase ? `<p class="meta">Hold the screen to stay in zone.</p>` : ""}
    ${
      recap && state.phase === "idle"
        ? `<div class="recap meta">Last: ${recap.alerts} alerts · ${recap.evaded} clear · ${recap.close} close${recap.ms ? ` · ${fmt(recap.ms)}` : ""}</div>`
        : ""
    }
  `;

  root.querySelectorAll("[data-proto]").forEach((el) => {
    el.addEventListener("click", () => {
      if (state.phase !== "idle") return;
      settings = settingsFromProtocol((el as HTMLElement).dataset.proto as ProtocolId);
      saveSettings(settings);
      paint();
    });
  });
  root.querySelector("[data-act=start]")?.addEventListener("click", () => void begin(false));
  root.querySelector("[data-act=demo]")?.addEventListener("click", () => void begin(true));
  root.querySelector("[data-act=stop]")?.addEventListener("click", end);
  const cheat = root.querySelector("[data-cheat]") as HTMLInputElement | null;
  cheat?.addEventListener("change", () => {
    settings = { ...settings, cheatEnabled: !!cheat.checked };
    saveSettings(settings);
    paint();
  });
}

function startGeo() {
  if (!navigator.geolocation) {
    geo = "unavailable";
    return;
  }
  geo = "requesting";
  let lastFix: { lat: number; lon: number; at: number } | null = null;
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      geo = "active";
      const { sample: raw, last } = deriveSpeed(
        {
          timestamp: pos.timestamp,
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            speed: pos.coords.speed,
            accuracy: pos.coords.accuracy,
          },
        },
        lastFix,
      );
      lastFix = last;
      const ok = acceptSample(raw, accepted);
      if (ok) accepted = ok;
    },
    (err) => {
      geo = err.code === err.PERMISSION_DENIED ? "denied" : "unavailable";
    },
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 8000 },
  );
}

function stopGeo() {
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

async function begin(demo: boolean) {
  lastOutcome = null;
  baseline = 0;
  accepted = null;
  state = demo ? startDemo(Date.now(), settings) : startSession(Date.now(), settings);
  if (demo && settings.voiceEnabled) audio.speak("Chase");
  if (demo && settings.beepsEnabled) audio.startBeeps(() => beepIntervalMs(state.proximity));
  try {
    wake = (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    wake = null;
  }
  startGeo();
  running = true;
  lastPaint = 0;
  paint();
  requestAnimationFrame(frame);
}

function end() {
  running = false;
  if (state.phase !== "idle") {
    recap = {
      at: Date.now(),
      alerts: state.alertsFired,
      evaded: state.evaded,
      close: state.closeCalls,
      ms: state.sessionStartedAt ? Date.now() - state.sessionStartedAt : 0,
    };
    saveRecap(recap);
  }
  audio.stopBeeps();
  speechSynthesis.cancel();
  void wake?.release();
  wake = null;
  stopGeo();
  state = stopSession();
  paint();
}

function frame(t: number) {
  if (!running) return;
  const now = Date.now();
  const target = targetSpeedMps(baseline, settings.paceIncreasePct);
  if (state.phase === "scanning" && accepted) {
    baseline = emaBaseline(baseline, accepted.mps);
  }
  const { state: next, events } = tick(state, now, {
    settings,
    speedRatio: speedRatio(accepted?.mps ?? null, target),
    cheat: cheatHeld,
  });
  state = next;
  for (const e of events) {
    if (e === "detect") {
      lastOutcome = null;
      if (settings.voiceEnabled) audio.speak("Chase");
      if (settings.beepsEnabled) audio.startBeeps(() => beepIntervalMs(state.proximity));
      if (settings.hapticsEnabled) navigator.vibrate?.([40, 40, 80]);
    }
    if (e === "clear" || e === "close") {
      lastOutcome = e;
      audio.stopBeeps();
      if (settings.voiceEnabled) audio.speak(e === "clear" ? "Clear" : "Close");
    }
  }
  if (t - lastPaint > 250 || events.length) {
    lastPaint = t;
    paint();
  }
  requestAnimationFrame(frame);
}

window.addEventListener("pointerdown", () => {
  cheatHeld = true;
});
window.addEventListener("pointerup", () => {
  cheatHeld = false;
});
window.addEventListener("pointercancel", () => {
  cheatHeld = false;
});

paint();
