export type ProtocolId = "surge90";

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
  surge90: {
    id: "surge90",
    name: "Surge / 90s",
    blurb: "Six 90-second surges per hour at +20% pace.",
    alertsPerHour: 6,
    chaseDurationSec: 90,
    paceIncreasePct: 20,
    randomizeTiming: true,
  },
};

export const DEFAULT_SETTINGS: HuntSettings = {
  protocolId: "surge90",
  alertsPerHour: PROTOCOLS.surge90.alertsPerHour,
  chaseDurationSec: PROTOCOLS.surge90.chaseDurationSec,
  paceIncreasePct: PROTOCOLS.surge90.paceIncreasePct,
  randomizeTiming: PROTOCOLS.surge90.randomizeTiming,
  voiceEnabled: true,
  beepsEnabled: false,
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

export const SETTINGS_STORAGE_KEY = "they-run-settings-v2";
export const RECAP_STORAGE_KEY = "they-run-recap-v2";
