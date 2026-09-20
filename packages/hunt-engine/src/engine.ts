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
  proximity: number;
  speedRatio: number;
  zoneMs: number;
  chaseMs: number;
  alertsFired: number;
  evaded: number;
  closeCalls: number;
};

export type EngineEvent = "detect" | "clear" | "close";

export type TickInput = {
  settings: HuntSettings;
  /** 0 when no usable GPS sample. */
  speedRatio: number;
  /** Indoor cheat: count as in-zone. */
  cheat?: boolean;
  rng?: () => number;
};

export const RECOVER_MS = 4_200;
export const MIN_RECOVERY_AFTER_CHASE_MS = 40_000;
/** First live chase: short enough to feel on a phone, then the protocol mean. */
export const FIRST_CHASE_MS = 20_000;
/** Fraction of the surge that must be at or above target to CLEAR. */
export const ZONE_FRACTION = 0.7;

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
    zoneMs: 0,
    chaseMs: 0,
    alertsFired: 0,
    evaded: 0,
    closeCalls: 0,
  };
}

export function beepIntervalMs(proximity: number) {
  const p = clamp(proximity, 0, 1);
  const eased = p ** 1.35;
  return 1120 - eased * 1020;
}

/** After the first chase: protocol mean (VO2max ≈ 10 min), never shorter than recovery. */
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
): EngineState {
  const duration = Math.max(15, settings.chaseDurationSec) * 1000;
  return {
    ...state,
    phase: "chase",
    demo,
    nextAlertAt: null,
    chaseStartedAt: now,
    chaseEndsAt: now + duration,
    recoverUntil: null,
    lastTickAt: now,
    proximity: 0.16,
    speedRatio: 0,
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
    nextAlertAt: now + FIRST_CHASE_MS,
  };
}

export function startDemo(
  now: number,
  settings: HuntSettings,
): EngineState {
  return enterChase(createIdleState(), now, settings, true);
}

export function stopSession(): EngineState {
  return createIdleState();
}

export function effectiveRatio(input: TickInput): number {
  if (input.cheat && input.settings.cheatEnabled) return Math.max(input.speedRatio, 1.2);
  return input.speedRatio;
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
  const ratio = effectiveRatio(input);
  let next: EngineState = { ...state, speedRatio: ratio, lastTickAt: now };

  if (next.phase === "scanning") {
    if (next.nextAlertAt != null && now >= next.nextAlertAt) {
      next = enterChase(next, now, input.settings, false);
      events.push("detect");
    }
    return { state: next, events };
  }

  if (next.phase === "chase") {
    const durationSec = Math.max(15, input.settings.chaseDurationSec);
    const approach = 0.82 / durationSec;
    let proximity = next.proximity;
    if (ratio >= 1) {
      proximity -= dt * 0.55 * Math.min(ratio, 1.7);
    } else {
      proximity += dt * approach * (1.2 - ratio * 0.7);
    }
    proximity = clamp(proximity, 0.06, 0.97);
    const dtMs = dt * 1000;
    next = {
      ...next,
      proximity,
      zoneMs: next.zoneMs + (ratio >= 1 ? dtMs : 0),
      chaseMs: next.chaseMs + dtMs,
    };

    if (next.chaseEndsAt != null && now >= next.chaseEndsAt) {
      const durationMs = Math.max(15, input.settings.chaseDurationSec) * 1000;
      const escaped = next.zoneMs / durationMs >= ZONE_FRACTION;
      next = {
        ...next,
        phase: "recovering",
        recoverUntil: now + RECOVER_MS,
        chaseStartedAt: null,
        chaseEndsAt: null,
        proximity: escaped ? 0.08 : 0.72,
        evaded: next.evaded + (escaped ? 1 : 0),
        closeCalls: next.closeCalls + (escaped ? 0 : 1),
      };
      events.push(escaped ? "clear" : "close");
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
