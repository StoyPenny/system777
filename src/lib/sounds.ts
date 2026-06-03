let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  startOffset: number,
  duration: number,
  type: OscillatorType = "square",
  vol = 0.25
) {
  const a = ac();
  if (!a) return;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.connect(gain);
  gain.connect(a.destination);
  osc.type = type;
  osc.frequency.value = freq;
  const t = a.currentTime + startOffset;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.start(t);
  osc.stop(t + duration + 0.01);
}

function noise(startOffset: number, duration: number, vol = 0.35, highpass = 2000) {
  const a = ac();
  if (!a) return;
  const frames = Math.floor(a.sampleRate * duration);
  const buf = a.createBuffer(1, frames, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = highpass;
  const gain = a.createGain();
  src.connect(filter);
  filter.connect(gain);
  gain.connect(a.destination);
  const t = a.currentTime + startOffset;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.start(t);
  src.stop(t + duration + 0.01);
}

// ── Public API ───────────────────────────────────────

export function playWin() {
  // Bright ascending jingle
  [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.1, 0.3, "square", 0.22));
}

export function playBigWin() {
  // Fuller fanfare — extra notes, held longer
  [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) =>
    tone(f, i * 0.08, 0.45, "square", 0.28)
  );
  // Harmony layer
  [659, 784, 1047, 1319].forEach((f, i) =>
    tone(f, 0.3 + i * 0.09, 0.4, "sine", 0.12)
  );
}

export function playLose() {
  // Descending wah-wah
  [392, 330, 262].forEach((f, i) => tone(f, i * 0.14, 0.28, "sawtooth", 0.18));
}

export function playCardFlip() {
  noise(0, 0.04, 0.3, 3000);
  tone(1200, 0, 0.04, "sine", 0.1);
}

export function playTick() {
  tone(900, 0, 0.04, "square", 0.12);
}

export function playChipClick() {
  tone(1400, 0, 0.05, "sine", 0.15);
  noise(0, 0.03, 0.15, 4000);
}

export function playSpinClick() {
  // The big spin button press
  tone(440, 0, 0.08, "square", 0.2);
  tone(550, 0.05, 0.08, "square", 0.15);
}
