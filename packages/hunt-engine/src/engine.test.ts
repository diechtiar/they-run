import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SETTINGS,
  PROTOCOLS,
  ZONE_FRACTION,
  createIdleState,
  nextAlertDelayMs,
  startDemo,
  startSession,
  tick,
} from "./index.ts";

const rng = () => 0.5;

describe("nextAlertDelayMs", () => {
  it("uses the protocol mean, not an 18s preview", () => {
    const vo2 = { ...DEFAULT_SETTINGS, randomizeTiming: false };
    const delay = nextAlertDelayMs(vo2, { rng });
    const mean = 3_600_000 / PROTOCOLS.vo2max.alertsPerHour;
    assert.ok(delay >= mean - 1);
    assert.ok(delay !== 18_000);
  });
});

describe("session", () => {
  it("starts scanning with first alert at the mean", () => {
    const settings = { ...DEFAULT_SETTINGS, randomizeTiming: false };
    const s = startSession(0, settings, rng);
    assert.equal(s.phase, "scanning");
    assert.equal(s.nextAlertAt, nextAlertDelayMs(settings, { rng }));
  });

  it("demo enters chase immediately", () => {
    const s = startDemo(0, DEFAULT_SETTINGS);
    assert.equal(s.phase, "chase");
    assert.equal(s.demo, true);
    assert.equal(s.alertsFired, 1);
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

describe("chase outcome", () => {
  const chaseMs = DEFAULT_SETTINGS.chaseDurationSec * 1000;

  function runChase(speedRatio: number, cheat = false) {
    let s = startDemo(0, { ...DEFAULT_SETTINGS, cheatEnabled: cheat });
    const step = 50;
    let events: string[] = [];
    for (let t = step; t <= chaseMs; t += step) {
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

  it("CLEARs when time-in-zone is at least 70%", () => {
    const { s, events } = runChase(1.2);
    assert.equal(s.phase, "recovering");
    assert.ok(events.includes("clear"));
    assert.equal(s.evaded, 1);
    assert.equal(s.closeCalls, 0);
    assert.ok(s.zoneMs / chaseMs >= ZONE_FRACTION);
  });

  it("CLOSE if standing still (no GPS cheat)", () => {
    const { s, events } = runChase(0);
    assert.ok(events.includes("close"));
    assert.equal(s.evaded, 0);
    assert.equal(s.closeCalls, 1);
  });

  it("cheat counts as in-zone", () => {
    const { s, events } = runChase(0, true);
    assert.ok(events.includes("clear"));
    assert.equal(s.evaded, 1);
  });
});
