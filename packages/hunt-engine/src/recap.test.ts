import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_SETTINGS,
  DEMO_FIRST_MS,
  ZONE_FRACTION,
  chaseDurationMs,
  parseRecap,
  recapAfterChase,
  recapAfterStop,
  startDemo,
  tick,
} from "./index.ts";

const rng = () => 0.5;

describe("recap", () => {
  const durationMs = chaseDurationMs(DEFAULT_SETTINGS);

  function finishDemo(speedRatio: number) {
    let s = startDemo(0, DEFAULT_SETTINGS);
    s = tick(s, DEMO_FIRST_MS, {
      settings: DEFAULT_SETTINGS,
      speedRatio,
      rng,
    }).state;
    const step = 50;
    let events: string[] = [];
    for (let t = DEMO_FIRST_MS + step; t <= DEMO_FIRST_MS + durationMs; t += step) {
      const r = tick(s, t, { settings: DEFAULT_SETTINGS, speedRatio, rng });
      s = r.state;
      events = events.concat(r.events);
      if (r.events.includes("caught") || r.events.includes("clear")) break;
    }
    return { s, events };
  }

  it("CLEAR recap uses protocol duration for zone %", () => {
    const { s, events } = finishDemo(1.2);
    assert.ok(events.includes("clear"));
    const recap = recapAfterChase(s, DEMO_FIRST_MS + durationMs, "clear", durationMs);
    assert.equal(recap.last?.outcome, "clear");
    assert.ok((recap.last?.zonePct ?? 0) >= ZONE_FRACTION * 100);
    assert.equal(recap.evaded, 1);
    assert.equal(recap.caught, 0);
    assert.equal(recap.alerts, 1);
  });

  it("GOT YOU recap keeps a low zone %", () => {
    const { s, events } = finishDemo(0);
    assert.ok(events.includes("caught"));
    const recap = recapAfterChase(s, DEMO_FIRST_MS + durationMs, "caught", durationMs);
    assert.equal(recap.last?.outcome, "caught");
    assert.ok((recap.last?.zonePct ?? 100) < ZONE_FRACTION * 100);
    assert.equal(recap.caught, 1);
  });

  it("Stop after a surge keeps last and extends session ms", () => {
    const { s } = finishDemo(1.2);
    const mid = recapAfterChase(s, 80_000, "clear", durationMs);
    const stopped = recapAfterStop(mid, { ...s, sessionStartedAt: 0 }, 120_000);
    assert.equal(stopped.last?.outcome, "clear");
    assert.equal(stopped.ms, 120_000);
    assert.equal(stopped.evaded, 1);
  });

  it("Stop with no official surge does not keep a previous last", () => {
    const prev = recapAfterChase(
      { ...finishDemo(1.2).s, sessionStartedAt: 0 },
      90_000,
      "clear",
      durationMs,
    );
    const idleish = {
      ...finishDemo(0).s,
      evaded: 0,
      caught: 0,
      alertsFired: 0,
      sessionStartedAt: 200_000,
    };
    const stopped = recapAfterStop(prev, idleish, 210_000);
    assert.equal(stopped.last, null);
    assert.equal(stopped.alerts, 0);
  });

  it("parseRecap reads v2 blobs without last", () => {
    const parsed = parseRecap({
      at: 1,
      alerts: 3,
      evaded: 2,
      caught: 1,
      ms: 4000,
    });
    assert.equal(parsed?.last, null);
    assert.equal(parsed?.alerts, 3);
  });
});
