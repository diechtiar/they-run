import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_ACCURACY_M,
  acceptSample,
  emaBaseline,
  speedRatio,
  targetSpeedMps,
} from "./gps.ts";

describe("acceptSample", () => {
  it("drops accuracy worse than the cap", () => {
    const raw = { mps: 2, kmh: 7.2, accuracy: MAX_ACCURACY_M + 1, at: 1 };
    assert.equal(acceptSample(raw, null), null);
  });

  it("caps Δv", () => {
    const prev = { mps: 1, kmh: 3.6, accuracy: 5, at: 1 };
    const raw = { mps: 20, kmh: 72, accuracy: 5, at: 2 };
    const out = acceptSample(raw, prev);
    assert.ok(out);
    assert.ok(out.mps < 20);
    assert.equal(out.mps, 5);
  });
});

describe("emaBaseline", () => {
  it("ignores sub-walk speeds", () => {
    assert.equal(emaBaseline(2, 0.1), 2);
  });
});

describe("speedRatio", () => {
  it("is 0 without a sample", () => {
    assert.equal(speedRatio(null, 3), 0);
  });

  it("is current / target", () => {
    const t = targetSpeedMps(2, 20);
    assert.ok(Math.abs(speedRatio(t, t) - 1) < 1e-9);
  });
});
