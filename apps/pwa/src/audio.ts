export type HuntAudio = {
  startBeeps: (intervalMs: () => number) => void;
  stopBeeps: () => void;
  speak: (text: string) => void;
};

export function createAudio(): HuntAudio {
  let ctx: AudioContext | null = null;
  let timer: number | null = null;

  function ensure() {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }

  function beep() {
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
    startBeeps(intervalMs) {
      stop();
      const loop = () => {
        beep();
        timer = window.setTimeout(loop, intervalMs());
      };
      loop();
    },
    stopBeeps() {
      stop();
    },
    speak(text) {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      window.speechSynthesis.speak(u);
    },
  };

  function stop() {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  }
}
