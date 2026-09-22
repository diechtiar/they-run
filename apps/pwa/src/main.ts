import {
  DEFAULT_SETTINGS,
  RECAP_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  acceptSample,
  CHASER_OF_TARGET,
  beepIntervalMs,
  chaseDurationMs,
  createIdleState,
  deriveSpeed,
  emaBaseline,
  parseRecap,
  recapAfterChase,
  recapAfterStop,
  skipChase,
  startDemo,
  startSession,
  stopSession,
  tick,
  type EngineState,
  type GeoStatus,
  type HuntRecap,
  type HuntSettings,
  type SpeedSample,
} from "@they-run/hunt-engine";
import { createAudio } from "./audio.ts";

const root = document.querySelector("#app")!;
const audio = createAudio();

function el<T extends HTMLElement>(name: string): T {
  const node = root.querySelector(`[data-el="${name}"]`);
  if (!node) throw new Error(`missing [data-el=${name}]`);
  return node as T;
}

const ui = {
  word: el<HTMLElement>("word"),
  clock: el<HTMLElement>("clock"),
  bar: el<HTMLElement>("bar"),
  barFill: el<HTMLElement>("barFill"),
  gps: el<HTMLElement>("gps"),
  safety: el<HTMLElement>("safety"),
  hold: el<HTMLElement>("hold"),
  recap: el<HTMLElement>("recap"),
  recapLast: el<HTMLElement>("recapLast"),
  recapSession: el<HTMLElement>("recapSession"),
  start: root.querySelector("[data-act=start]") as HTMLButtonElement,
  demo: root.querySelector("[data-act=demo]") as HTMLButtonElement,
  stop: root.querySelector("[data-act=stop]") as HTMLButtonElement,
  skip: root.querySelector("[data-act=skip]") as HTMLButtonElement,
  cheat: root.querySelector("[data-cheat]") as HTMLInputElement,
  beeps: root.querySelector("[data-beeps]") as HTMLInputElement,
};

function setText(node: HTMLElement, value: string) {
  if (node.textContent !== value) node.textContent = value;
}

function setHidden(node: HTMLElement, hidden: boolean) {
  if (node.hidden !== hidden) node.hidden = hidden;
}

function loadSettings(): HuntSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    parsed.protocolId = "surge90";
    return parsed;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: HuntSettings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s));
}

function loadRecap(): HuntRecap | null {
  try {
    const raw = localStorage.getItem(RECAP_STORAGE_KEY);
    return raw ? parseRecap(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function saveRecap(r: HuntRecap) {
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
let lastOutcome: "clear" | "caught" | "skip" | null = null;
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
  if (lastOutcome === "caught") return { text: "GOT YOU", cls: "chase" };
  return { text: "IDLE", cls: "" };
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
  const theyVisible = inChase || state.phase === "recovering";
  const bar = theyVisible ? Math.round(Math.min(1, Math.max(0, state.proximity)) * 100) : 0;
  const zone = inChase
    ? state.speedRatio >= CHASER_OF_TARGET
      ? " · pulling away"
      : " · they're closing"
    : "";
  const live = state.phase !== "idle";
  const wordClass = w.cls ? `word ${w.cls}` : "word";
  if (ui.word.className !== wordClass) ui.word.className = wordClass;
  setText(ui.word, w.text);
  setText(ui.clock, `${clock}${zone}`);
  ui.bar.classList.toggle("chase", theyVisible);
  const width = `${bar}%`;
  if (ui.barFill.style.width !== width) ui.barFill.style.width = width;
  setText(
    ui.gps,
    `${kmh} km/h · GPS ${geo}${baseline > 0 ? ` · base ${(baseline * 3.6).toFixed(1)} km/h` : ""}`,
  );
  setHidden(ui.start, live);
  setHidden(ui.demo, live);
  setHidden(ui.stop, !live);
  setHidden(ui.skip, !inChase);
  setHidden(ui.safety, live);
  setHidden(ui.hold, !(settings.cheatEnabled && inChase));
  if (ui.cheat.checked !== settings.cheatEnabled) ui.cheat.checked = settings.cheatEnabled;
  if (ui.beeps.checked !== settings.beepsEnabled) ui.beeps.checked = settings.beepsEnabled;

  const last = recap?.last
    ? recap.last.outcome === "clear"
      ? `Last surge: CLEAR · ${recap.last.zonePct}% in zone`
      : `Last surge: GOT YOU · ${recap.last.zonePct}% in zone`
    : "";
  const session = recap
    ? `${recap.alerts} chase${recap.alerts === 1 ? "" : "s"} · ${recap.evaded} clear · ${recap.caught} got you${recap.ms ? ` · ${fmt(recap.ms)}` : ""}`
    : "";
  const showRecap =
    !!recap &&
    state.phase !== "chase" &&
    !(!last && recap.alerts === 0 && recap.evaded === 0 && recap.caught === 0);
  setHidden(ui.recap, !showRecap);
  setHidden(ui.recapLast, !last);
  setText(ui.recapLast, last);
  setText(ui.recapSession, session);
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
  try {
    wake = (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    wake = null;
  }
  startGeo();
  running = true;
  paint();
  requestAnimationFrame(frame);
}

function skip() {
  const r = skipChase(state, Date.now(), settings);
  state = r.state;
  audio.stopBeeps();
  if (r.events.includes("skip")) lastOutcome = "skip";
  if (state.phase === "idle") {
    running = false;
    stopGeo();
    void wake?.release();
    wake = null;
  }
  paint();
}

function end() {
  running = false;
  if (state.phase !== "idle" && state.evaded + state.caught > 0) {
    recap = recapAfterStop(recap, state, Date.now());
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

function frame(_t: number) {
  if (!running) return;
  const now = Date.now();
  if (state.phase === "scanning" && accepted) {
    baseline = emaBaseline(baseline, accepted.mps);
  }
  const { state: next, events } = tick(state, now, {
    settings,
    currentMps: accepted?.mps ?? null,
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
    if (e === "clear" || e === "caught") {
      lastOutcome = e;
      recap = recapAfterChase(state, now, e, chaseDurationMs(settings));
      saveRecap(recap);
      audio.stopBeeps();
      if (settings.voiceEnabled) audio.speak(e === "clear" ? "Clear" : "Got you");
    }
  }
  paint();
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

ui.start.addEventListener("click", () => void begin(false));
ui.demo.addEventListener("click", () => void begin(true));
ui.stop.addEventListener("click", end);
ui.skip.addEventListener("click", skip);
ui.cheat.addEventListener("change", () => {
  settings = { ...settings, cheatEnabled: ui.cheat.checked };
  saveSettings(settings);
  paint();
});
ui.beeps.addEventListener("change", () => {
  settings = { ...settings, beepsEnabled: ui.beeps.checked };
  saveSettings(settings);
  if (!settings.beepsEnabled) audio.stopBeeps();
  paint();
});

paint();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
}
