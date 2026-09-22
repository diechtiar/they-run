export type HuntAudio = {
  beep: () => void;
  speak: (text: string) => void;
};

type NativeAudio = {
  beep: () => void;
  speak: (text: string) => void;
};

let native: NativeAudio | null = null;

/** Android plays through a mixer that does not take audio focus. The browser keeps Web Audio. */
export function setNativeAudio(next: NativeAudio | null) {
  native = next;
}

export function createAudio(): HuntAudio {
  let ctx: AudioContext | null = null;

  function ensure() {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function webBeep() {
    const c = ensure();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.value = 880;
    g.gain.value = 0.04;
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.07);
  }

  return {
    beep() {
      if (native) {
        native.beep();
        return;
      }
      webBeep();
    },
    speak(text) {
      if (native) {
        native.speak(text);
        return;
      }
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    },
  };
}
