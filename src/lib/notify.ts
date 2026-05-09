// Tiny notification beep using WebAudio (no asset needed)
let ctx: AudioContext | null = null;

export function playBeep() {
  if (typeof window === "undefined") return;
  try {
    const enabled = localStorage.getItem("th_sound") !== "off";
    if (!enabled) return;
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.0001;
    o.connect(g).connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.start(t);
    o.stop(t + 0.26);
  } catch {
    /* ignore */
  }
}

export function getSoundEnabled() {
  if (typeof window === "undefined") return true;
  return localStorage.getItem("th_sound") !== "off";
}
export function setSoundEnabled(v: boolean) {
  try {
    localStorage.setItem("th_sound", v ? "on" : "off");
  } catch {
    /* ignore */
  }
}
