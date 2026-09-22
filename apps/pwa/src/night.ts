import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type NativeFix = {
  lat: number;
  lon: number;
  /** Meters per second, or -1 when the fix has no speed. */
  speed: number;
  /** Meters, or -1 when the fix has no accuracy. */
  accuracy: number;
  time: number;
};

interface HuntNightPlugin {
  start(): Promise<{ ok: boolean }>;
  stop(): Promise<void>;
  beep(): Promise<void>;
  speak(options: { text: string }): Promise<void>;
  addListener(eventName: "fix", listener: (fix: NativeFix) => void): Promise<PluginListenerHandle>;
}

const HuntNight = registerPlugin<HuntNightPlugin>("HuntNight");
let fixes: PluginListenerHandle | null = null;

export function nativeShell(): boolean {
  return Capacitor.isNativePlatform();
}

/** Foreground night: screen-off GPS, a tick, and a notification. False on the web, or if permission was refused. */
export async function startNight(onFix: (fix: NativeFix) => void): Promise<boolean> {
  if (!nativeShell()) return false;
  try {
    const result = await HuntNight.start();
    if (!result?.ok) return false;
    fixes = await HuntNight.addListener("fix", onFix);
    return true;
  } catch {
    return false;
  }
}

export async function stopNight(): Promise<void> {
  if (!nativeShell()) return;
  try {
    await fixes?.remove();
  } catch {
    /* listener already gone */
  }
  fixes = null;
  try {
    await HuntNight.stop();
  } catch {
    /* service already stopped */
  }
}

export function nativeBeep(): void {
  if (!nativeShell()) return;
  void HuntNight.beep();
}

export function nativeSpeak(text: string): void {
  if (!nativeShell()) return;
  void HuntNight.speak({ text });
}
