export type ProtocolId = "vo2max" | "norwegian" | "walker" | "sprint";

export type HuntSettings = {
  protocolId: ProtocolId;
  alertsPerHour: number;
  chaseDurationSec: number;
  paceIncreasePct: number;
  randomizeTiming: boolean;
  voiceEnabled: boolean;
  beepsEnabled: boolean;
  hapticsEnabled: boolean;
  /** Indoor: treat as in-zone while held. Off by default. */
  cheatEnabled: boolean;
};

export type ProtocolPreset = {
  id: ProtocolId;
  name: string;
  blurb: string;
  alertsPerHour: number;
  chaseDurationSec: number;
  paceIncreasePct: number;
  randomizeTiming: boolean;
};

export const PROTOCOLS: Record<ProtocolId, ProtocolPreset> = {
  vo2max: {
    id: "vo2max",
    name: "VO2max",
    blurb: "Six 90-second surges per hour at +20% pace.",
    alertsPerHour: 6,
    chaseDurationSec: 90,
    paceIncreasePct: 20,
    randomizeTiming: true,
  },
  norwegian: {
    id: "norwegian",
    name: "4 × 4",
    blurb: "Four 4-minute efforts per hour at +25% pace.",
    alertsPerHour: 4,
    chaseDurationSec: 240,
    paceIncreasePct: 25,
    randomizeTiming: false,
  },
  walker: {
    id: "walker",
    name: "Walk",
    blurb: "Five 3-minute brisk bouts per hour at +15% pace.",
    alertsPerHour: 5,
    chaseDurationSec: 180,
    paceIncreasePct: 15,
    randomizeTiming: false,
  },
  sprint: {
    id: "sprint",
    name: "Sprint",
    blurb: "Eight 30-second bursts per hour at +35% pace.",
    alertsPerHour: 8,
    chaseDurationSec: 30,
    paceIncreasePct: 35,
    randomizeTiming: true,
  },
};

export const DEFAULT_SETTINGS: HuntSettings = {
  protocolId: "vo2max",
  alertsPerHour: PROTOCOLS.vo2max.alertsPerHour,
  chaseDurationSec: PROTOCOLS.vo2max.chaseDurationSec,
  paceIncreasePct: PROTOCOLS.vo2max.paceIncreasePct,
  randomizeTiming: PROTOCOLS.vo2max.randomizeTiming,
  voiceEnabled: true,
  beepsEnabled: true,
  hapticsEnabled: true,
  cheatEnabled: false,
};

export function settingsFromProtocol(id: ProtocolId): HuntSettings {
  const p = PROTOCOLS[id];
  return {
    ...DEFAULT_SETTINGS,
    protocolId: id,
    alertsPerHour: p.alertsPerHour,
    chaseDurationSec: p.chaseDurationSec,
    paceIncreasePct: p.paceIncreasePct,
    randomizeTiming: p.randomizeTiming,
  };
}

export const SETTINGS_STORAGE_KEY = "they-run-settings-v1";
export const RECAP_STORAGE_KEY = "they-run-recap-v1";
