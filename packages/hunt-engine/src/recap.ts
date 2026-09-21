import type { EngineState } from "./engine.ts";
import type { HuntSettings } from "./protocols.ts";

export type RecapOutcome = "clear" | "caught";

export type HuntRecapLast = {
  outcome: RecapOutcome;
  zoneMs: number;
  durationMs: number;
  /** 0–100. Same denominator as the official 70% rule (protocol duration). */
  zonePct: number;
};

export type HuntRecap = {
  at: number;
  last: HuntRecapLast | null;
  alerts: number;
  evaded: number;
  caught: number;
  ms: number;
};

export function chaseDurationMs(settings: HuntSettings): number {
  return Math.max(15, settings.chaseDurationSec) * 1000;
}

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function recapAfterChase(
  state: EngineState,
  now: number,
  outcome: RecapOutcome,
  durationMs: number,
): HuntRecap {
  const dur = Math.max(1, durationMs);
  return {
    at: now,
    last: {
      outcome,
      zoneMs: state.zoneMs,
      durationMs: dur,
      zonePct: clampPct((100 * state.zoneMs) / dur),
    },
    alerts: state.alertsFired,
    evaded: state.evaded,
    caught: state.caught,
    ms: state.sessionStartedAt != null ? Math.max(0, now - state.sessionStartedAt) : 0,
  };
}

/** Stop after at least one official surge. Keeps `last` from the chase snapshot. */
export function recapAfterStop(
  prev: HuntRecap | null,
  state: EngineState,
  now: number,
): HuntRecap {
  const hadOfficial = state.evaded + state.caught > 0;
  return {
    at: now,
    last: hadOfficial ? prev?.last ?? null : null,
    alerts: state.alertsFired,
    evaded: state.evaded,
    caught: state.caught,
    ms: state.sessionStartedAt != null ? Math.max(0, now - state.sessionStartedAt) : prev?.ms ?? 0,
  };
}

export function parseRecap(raw: unknown): HuntRecap | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const alerts = Number(o.alerts);
  const evaded = Number(o.evaded);
  const caught = Number(o.caught);
  const ms = Number(o.ms);
  const at = Number(o.at);
  if (![alerts, evaded, caught, ms, at].every((n) => Number.isFinite(n))) return null;
  let last: HuntRecapLast | null = null;
  if (o.last && typeof o.last === "object") {
    const l = o.last as Record<string, unknown>;
    const outcome = l.outcome === "clear" || l.outcome === "caught" ? l.outcome : null;
    const zoneMs = Number(l.zoneMs);
    const durationMs = Number(l.durationMs);
    const zonePct = Number(l.zonePct);
    if (outcome && [zoneMs, durationMs, zonePct].every((n) => Number.isFinite(n))) {
      last = { outcome, zoneMs, durationMs, zonePct: clampPct(zonePct) };
    }
  }
  return { at, last, alerts, evaded, caught, ms };
}
