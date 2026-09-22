import { targetSpeedMps } from "./gps.ts";
import type { HuntSettings } from "./protocols.ts";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export type HuntPhase = "idle" | "scanning" | "chase" | "recovering";

export type EngineState = {
  phase: HuntPhase;
  demo: boolean;
  sessionStartedAt: number | null;
  nextAlertAt: number | null;
  chaseStartedAt: number | null;
  chaseEndsAt: number | null;
  recoverUntil: number | null;
  lastTickAt: number | null;
  /** How much of the opening gap the runner has eaten: 0 far, 1 contact. */
  proximity: number;
  speedRatio: number;
  /** Frozen at detect. Null when not in chase. */
  targetMps: number | null;
  zoneMs: number;
  chaseMs: number;
  alertsFired: number;
  evaded: number;
  caught: number;
};

export type EngineEvent = "detect" | "clear" | "caught" | "skip";

export type TickInput = {
  settings: HuntSettings;
  /** Tests may pass a ratio directly. Otherwise derived from currentMps / frozen target. */
  speedRatio?: number;
  currentMps?: number | null;
  cheat?: boolean;
  rng?: () => number;
};

export const RECOVER_MS = 4_200;
export const MIN_RECOVERY_AFTER_CHASE_MS = 40_000;
/** Demo only: short fuse so you feel a chase on the couch. */
export const DEMO_FIRST_MS = 20_000;
/** Live Start: first gap is a different product from Demo. */
export const START_FIRST_GAP_MS = 180_000;
export const ZONE_FRACTION = 0.7;
/** Bar at chase start — they are already on the approach. */
export const CHASE_START_PROXIMITY = 0.22;
/**
 * The runner holds this fraction of the frozen target.
 * Matching the target means you are faster than them, so the gap opens.
 */
export const CHASER_OF_TARGET = 0.82;
/**
 * Easy-run floor. A walking baseline must not turn the chaser into a shuffle.
 * About 9.7 km/h. Faster users still get baseline + protocol %.
 */
export const MIN_RUNNER_MPS = 2.7;
/** Standing still, the opening gap is gone in this many seconds. */
export const STOP_CATCH_SEC = 11;

export function createIdleState(): EngineState {
  return {
    phase: "idle",
    demo: false,
    sessionStartedAt: null,
    nextAlertAt: null,
    chaseStartedAt: null,
    chaseEndsAt: null,
    recoverUntil: null,
    lastTickAt: null,
    proximity: 0,
    speedRatio: 0,
    targetMps: null,
    zoneMs: 0,
    chaseMs: 0,
    alertsFired: 0,
    evaded: 0,
    caught: 0,
  };
}

export function beepIntervalMs(proximity: number) {
  const p = clamp(proximity, 0, 1);
  const eased = p ** 1.35;
  return 1120 - eased * 1020;
}

/** After the first chase: protocol mean, never shorter than recovery. */
export function nextAlertDelayMs(
  settings: HuntSettings,
  opts: { rng: () => number },
) {
  const mean = 3_600_000 / Math.max(1, settings.alertsPerHour);
  const minGap = settings.chaseDurationSec * 1000 + MIN_RECOVERY_AFTER_CHASE_MS;
  const jitter = settings.randomizeTiming ? 0.6 + opts.rng() * 0.8 : 1;
  return Math.max(minGap, mean * jitter);
}

function enterChase(
  state: EngineState,
  now: number,
  settings: HuntSettings,
  demo: boolean,
  currentMps: number | null,
): EngineState {
  const duration = Math.max(15, settings.chaseDurationSec) * 1000;
  const protocol = targetSpeedMps(currentMps ?? 0, settings.paceIncreasePct);
  const target = Math.max(protocol, MIN_RUNNER_MPS);
  return {
    ...state,
    phase: "chase",
    demo,
    nextAlertAt: null,
    chaseStartedAt: now,
    chaseEndsAt: now + duration,
    recoverUntil: null,
    lastTickAt: now,
    proximity: CHASE_START_PROXIMITY,
    speedRatio: 0,
    targetMps: target,
    zoneMs: 0,
    chaseMs: 0,
    alertsFired: state.alertsFired + 1,
  };
}

export function startSession(
  now: number,
  settings: HuntSettings,
  rng: () => number = Math.random,
): EngineState {
  return {
    ...createIdleState(),
    phase: "scanning",
    demo: false,
    sessionStartedAt: now,
    lastTickAt: now,
    nextAlertAt: now + START_FIRST_GAP_MS,
  };
}

export function startDemo(now: number, settings: HuntSettings): EngineState {
  return {
    ...createIdleState(),
    phase: "scanning",
    demo: true,
    sessionStartedAt: now,
    lastTickAt: now,
    nextAlertAt: now + DEMO_FIRST_MS,
  };
}

export function stopSession(): EngineState {
  return createIdleState();
}

/** Void the current chase. Does not count as CLEAR or GOT YOU. */
export function skipChase(
  state: EngineState,
  now: number,
  settings: HuntSettings,
  rng: () => number = Math.random,
): { state: EngineState; events: EngineEvent[] } {
  if (state.phase !== "chase") return { state, events: [] };
  if (state.demo) {
    return { state: createIdleState(), events: ["skip"] };
  }
  return {
    state: {
      ...state,
      phase: "scanning",
      chaseStartedAt: null,
      chaseEndsAt: null,
      recoverUntil: null,
      proximity: 0,
      speedRatio: 0,
      targetMps: null,
      zoneMs: 0,
      chaseMs: 0,
      alertsFired: Math.max(0, state.alertsFired - 1),
      nextAlertAt: now + nextAlertDelayMs(settings, { rng }),
      lastTickAt: now,
    },
    events: ["skip"],
  };
}

/** GPS when the phone has it; tests drive the same meters with a ratio. */
function youSpeedMps(input: TickInput, target: number, ratio: number): number {
  if (input.speedRatio != null) return Math.max(0, target * ratio);
  const gps = input.currentMps;
  if (gps == null) return Math.max(0, target * ratio);
  if (input.cheat && input.settings.cheatEnabled) return Math.max(gps, target * 1.2);
  return Math.max(0, gps);
}

export function effectiveRatio(input: TickInput, targetMps: number | null): number {
  let ratio = input.speedRatio;
  if (ratio == null) {
    const target = targetMps ?? 0;
    const cur = input.currentMps;
    ratio = !cur || target <= 0 ? 0 : cur / target;
  }
  if (input.cheat && input.settings.cheatEnabled) return Math.max(ratio, 1.2);
  return ratio;
}

export function tick(
  state: EngineState,
  now: number,
  input: TickInput,
): { state: EngineState; events: EngineEvent[] } {
  if (state.phase === "idle") return { state, events: [] };

  const rng = input.rng ?? Math.random;
  const events: EngineEvent[] = [];
  const rawDt = state.lastTickAt == null ? 0.05 : (now - state.lastTickAt) / 1000;
  const dt = clamp(rawDt, 0, 0.25);

  if (state.phase === "scanning") {
    if (state.nextAlertAt != null && now >= state.nextAlertAt) {
      const next = enterChase(state, now, input.settings, state.demo, input.currentMps ?? null);
      return { state: { ...next, lastTickAt: now }, events: ["detect"] };
    }
    return { state: { ...state, lastTickAt: now }, events };
  }

  const ratio = effectiveRatio(input, state.targetMps);
  let next: EngineState = { ...state, speedRatio: ratio, lastTickAt: now };

  if (next.phase === "chase") {
    const target = next.targetMps ?? MIN_RUNNER_MPS;
    const chaser = target * CHASER_OF_TARGET;
    const you = youSpeedMps(input, target, ratio);
    const far = (chaser * STOP_CATCH_SEC) / (1 - CHASE_START_PROXIMITY);
    let gap = (1 - next.proximity) * far;
    gap = clamp(gap + (you - chaser) * dt, 0, far);
    const proximity = far > 0 ? clamp(1 - gap / far, 0, 1) : 1;
    const dtMs = dt * 1000;
    next = {
      ...next,
      proximity,
      zoneMs: next.zoneMs + (ratio >= 1 ? dtMs : 0),
      chaseMs: next.chaseMs + dtMs,
    };

    const reached = next.proximity >= 1;
    const timedOut = next.chaseEndsAt != null && now >= next.chaseEndsAt;
    if (reached || timedOut) {
      const caught = reached;
      next = {
        ...next,
        phase: "recovering",
        recoverUntil: now + RECOVER_MS,
        chaseStartedAt: null,
        chaseEndsAt: null,
        targetMps: null,
        proximity: caught ? 1 : next.proximity,
        evaded: next.evaded + (caught ? 0 : 1),
        caught: next.caught + (caught ? 1 : 0),
      };
      events.push(caught ? "caught" : "clear");
    }
    return { state: next, events };
  }

  if (next.phase === "recovering") {
    if (next.recoverUntil != null && now >= next.recoverUntil) {
      if (next.demo) {
        return { state: createIdleState(), events };
      }
      next = {
        ...next,
        phase: "scanning",
        demo: false,
        recoverUntil: null,
        proximity: 0,
        nextAlertAt: now + nextAlertDelayMs(input.settings, { rng }),
      };
    }
    return { state: next, events };
  }

  return { state: next, events };
}
