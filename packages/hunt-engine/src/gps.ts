export type GeoStatus = "idle" | "requesting" | "active" | "denied" | "unavailable";

export type SpeedSample = {
  mps: number;
  kmh: number;
  accuracy: number | null;
  at: number;
};

export const MAX_ACCURACY_M = 25;
export const MIN_SPEED_FOR_BASELINE_MPS = 0.5;
export const MAX_DV_MPS = 4;

function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Drop noisy or impossible samples. */
export function acceptSample(
  raw: SpeedSample,
  prev: SpeedSample | null,
): SpeedSample | null {
  if (raw.accuracy != null && raw.accuracy > MAX_ACCURACY_M) return null;
  if (raw.mps < 0 || Number.isNaN(raw.mps)) return null;
  if (prev && Math.abs(raw.mps - prev.mps) > MAX_DV_MPS) {
    const capped = prev.mps + Math.sign(raw.mps - prev.mps) * MAX_DV_MPS;
    return { ...raw, mps: Math.max(0, capped), kmh: Math.max(0, capped) * 3.6 };
  }
  return raw;
}

export function emaBaseline(prev: number, mps: number, alpha = 0.08): number {
  if (mps < MIN_SPEED_FOR_BASELINE_MPS) return prev;
  if (prev <= 0) return mps;
  return prev * (1 - alpha) + mps * alpha;
}

export function targetSpeedMps(baselineMps: number, paceIncreasePct: number): number {
  const floor = 0.7;
  const base = Math.max(baselineMps, floor);
  return base * (1 + paceIncreasePct / 100);
}

export function speedRatio(currentMps: number | null, targetMps: number): number {
  if (currentMps == null || currentMps < 0) return 0;
  if (targetMps <= 0) return 0;
  return currentMps / targetMps;
}

export function deriveSpeed(
  pos: {
    timestamp: number;
    coords: { latitude: number; longitude: number; speed: number | null; accuracy: number | null };
  },
  last: { lat: number; lon: number; at: number } | null,
): { sample: SpeedSample; last: { lat: number; lon: number; at: number } } {
  const at = pos.timestamp || Date.now();
  const lat = pos.coords.latitude;
  const lon = pos.coords.longitude;
  let mps = pos.coords.speed;
  if (mps == null || Number.isNaN(mps) || mps < 0) {
    if (last && at > last.at) {
      const meters = haversineMeters(last, { lat, lon });
      mps = meters / ((at - last.at) / 1000);
    } else {
      mps = 0;
    }
  }
  return {
    sample: { mps, kmh: mps * 3.6, accuracy: pos.coords.accuracy, at },
    last: { lat, lon, at },
  };
}
