import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SETTINGS,
  DEMO_FIRST_MS,
  PROTOCOLS,
  START_FIRST_GAP_MS,
  createIdleState,
  nextAlertDelayMs,
  skipChase,
  startDemo,
  startSession,
  tick,
} from "./index.ts";

const rng = () => 0.5;

describe("nextAlertDelayMs", () => {
  it("later chases use the protocol mean", () => {
    const surge = { ...DEFAULT_SETTINGS, randomizeTiming: false };
    const delay = nextAlertDelayMs(surge, { rng });
    const mean = 3_600_000 / PROTOCOLS.surge90.alertsPerHour;
    assert.ok(delay >= mean - 1);
  });
});

describe("session", () => {
  it("Start waits a long first gap", () => {
    const s = startSession(0, DEFAULT_SETTINGS, rng);
    assert.equal(s.phase, "scanning");
    assert.equal(s.nextAlertAt, START_FIRST_GAP_MS);
    assert.equal(s.demo, false);
  });

  it("Demo waits the short fuse then chases", () => {
    let s = startDemo(0, DEFAULT_SETTINGS);
    assert.equal(s.phase, "scanning");
    assert.equal(s.nextAlertAt, DEMO_FIRST_MS);
    const r = tick(s, DEMO_FIRST_MS, {
      settings: DEFAULT_SETTINGS,
      currentMps: 2,
      rng,
    });
    assert.equal(r.state.phase, "chase");
    assert.deepEqual(r.events, ["detect"]);
    assert.ok((r.state.targetMps ?? 0) > 0);
  });

  it("does not tick idle", () => {
    const { events } = tick(createIdleState(), 999, {
      settings: DEFAULT_SETTINGS,
      speedRatio: 1,
      rng,
    });
    assert.deepEqual(events, []);
  });
});

describe("target freeze", () => {
  it("does not move the goal during the surge", () => {
    let s = startDemo(0, DEFAULT_SETTINGS);
    s = tick(s, DEMO_FIRST_MS, {
      settings: DEFAULT_SETTINGS,
      currentMps: 2,
      rng,
    }).state;
    const frozen = s.targetMps;
    assert.ok(frozen && frozen > 0);
    s = tick(s, DEMO_FIRST_MS + 50, {
      settings: DEFAULT_SETTINGS,
      currentMps: 8,
      rng,
    }).state;
    assert.equal(s.targetMps, frozen);
    assert.ok(Math.abs(s.speedRatio - 8 / frozen) < 1e-9);
  });
});

describe("skip", () => {
  it("voids a live chase without CLEAR or GOT YOU", () => {
    let s = startSession(0, DEFAULT_SETTINGS, rng);
    s = tick(s, START_FIRST_GAP_MS, {
      settings: DEFAULT_SETTINGS,
      currentMps: 2,
      rng,
    }).state;
    assert.equal(s.phase, "chase");
    const r = skipChase(s, START_FIRST_GAP_MS + 1000, DEFAULT_SETTINGS, rng);
    assert.deepEqual(r.events, ["skip"]);
    assert.equal(r.state.phase, "scanning");
    assert.equal(r.state.evaded, 0);
    assert.equal(r.state.caught, 0);
    assert.equal(r.state.alertsFired, 0);
  });
});

describe("chase outcome", () => {
  const chaseMs = DEFAULT_SETTINGS.chaseDurationSec * 1000;

  function runChase(speedRatio: number, cheat = false) {
    let s = startDemo(0, { ...DEFAULT_SETTINGS, cheatEnabled: cheat });
    s = tick(s, DEMO_FIRST_MS, {
      settings: { ...DEFAULT_SETTINGS, cheatEnabled: cheat },
      speedRatio,
      cheat,
      rng,
    }).state;
    const step = 50;
    let events: string[] = [];
    const t0 = DEMO_FIRST_MS;
    for (let t = t0 + step; t <= t0 + chaseMs; t += step) {
      const r = tick(s, t, {
        settings: { ...DEFAULT_SETTINGS, cheatEnabled: cheat },
        speedRatio,
        cheat,
        rng,
      });
      s = r.state;
      events = events.concat(r.events);
      if (r.events.includes("caught") || r.events.includes("clear")) break;
    }
    return { s, events };
  }

  it("CLEAR if you stay in zone for the surge (they never reach you)", () => {
    const { s, events } = runChase(1.2);
    assert.equal(s.phase, "recovering");
    assert.ok(events.includes("clear"));
    assert.equal(s.evaded, 1);
    assert.equal(s.caught, 0);
    assert.ok(s.proximity < 1);
  });

  it("GOT YOU when the bar fills (standing still)", () => {
    const { s, events } = runChase(0);
    assert.ok(events.includes("caught"));
    assert.equal(s.evaded, 0);
    assert.equal(s.caught, 1);
    assert.equal(s.proximity, 1);
    assert.ok(s.chaseMs < 16_000, `runner should arrive in seconds, took ${s.chaseMs}ms`);
    assert.ok(s.chaseMs > 8_000, `runner should cover a real gap, took ${s.chaseMs}ms`);
  });

  it("a short burst opens a gap, and stopping spends it", () => {
    let s = startDemo(0, DEFAULT_SETTINGS);
    s = tick(s, DEMO_FIRST_MS, {
      settings: DEFAULT_SETTINGS,
      currentMps: 1.4,
      rng,
    }).state;
    const openedAt = s.proximity;
    const step = 50;
    const burstMs = 3_000;
    for (let t = DEMO_FIRST_MS + step; t <= DEMO_FIRST_MS + burstMs; t += step) {
      s = tick(s, t, {
        settings: DEFAULT_SETTINGS,
        currentMps: 3.6,
        rng,
      }).state;
    }
    const afterBurst = s.proximity;
    assert.ok(afterBurst < openedAt - 0.05, "faster than the runner buys meters");
    let caughtAt: number | null = null;
    for (let t = DEMO_FIRST_MS + burstMs + step; t <= DEMO_FIRST_MS + chaseMs; t += step) {
      const r = tick(s, t, { settings: DEFAULT_SETTINGS, currentMps: 0, rng });
      s = r.state;
      if (r.events.includes("caught")) {
        caughtAt = t;
        break;
      }
    }
    assert.ok(caughtAt != null, "stopping lets the runner arrive");
    const stopMs = (caughtAt ?? 0) - (DEMO_FIRST_MS + burstMs);
    assert.ok(stopMs < 16_000, `stop should close the gap quickly, took ${stopMs}ms`);
  });

  it("in-zone fall-back is gradual, not instant", () => {
    let s = startDemo(0, DEFAULT_SETTINGS);
    s = tick(s, DEMO_FIRST_MS, {
      settings: DEFAULT_SETTINGS,
      speedRatio: 1.2,
      rng,
    }).state;
    const start = s.proximity;
    s = tick(s, DEMO_FIRST_MS + 1000, {
      settings: DEFAULT_SETTINGS,
      speedRatio: 1.2,
      rng,
    }).state;
    assert.ok(s.proximity < start, "they lose some ground");
    assert.ok(s.proximity > start - 0.12, "not emptied in one second");
    assert.equal(s.phase, "chase");
  });

  it("cheat counts as in-zone", () => {
    const { s, events } = runChase(0, true);
    assert.ok(events.includes("clear"));
    assert.equal(s.evaded, 1);
  });
});
