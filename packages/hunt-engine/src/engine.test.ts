import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SETTINGS,
  DEMO_FIRST_MS,
  PROTOCOLS,
  START_FIRST_GAP_MS,
  ZONE_FRACTION,
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
    }
    return { s, events };
  }

  it("CLEAR when time-in-zone is at least 70%", () => {
    const { s, events } = runChase(1.2);
    assert.equal(s.phase, "recovering");
    assert.ok(events.includes("clear"));
    assert.equal(s.evaded, 1);
    assert.equal(s.caught, 0);
    assert.ok(s.zoneMs / chaseMs >= ZONE_FRACTION);
  });

  it("GOT YOU (caught) if standing still", () => {
    const { s, events } = runChase(0);
    assert.ok(events.includes("caught"));
    assert.equal(s.evaded, 0);
    assert.equal(s.caught, 1);
  });

  it("cheat counts as in-zone", () => {
    const { s, events } = runChase(0, true);
    assert.ok(events.includes("clear"));
    assert.equal(s.evaded, 1);
  });
});
