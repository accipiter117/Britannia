// ui/audio.js
// Owns sound: everything is synthesised with Web Audio (no files). Ambient wind, rain and
// birdsong by season; generative lyre-like music whose mood follows the campaign (peace,
// tension, war, crisis); short effects for building, recruiting, marching, battle and the
// turning season. Starts muted; the speaker button turns it on (browsers need a tap first).

const PREF = "caledonia.sound";
let ctx = null, master = null, musicBus = null, ambBus = null;
let enabled = false;
let mood = "peace", season = "Spring";
let wind = null, rain = null, musicTimer = null, birdTimer = null, nextNote = 0, step = 0;

// D dorian / A aeolian style scales (Hz), low drone note per mood
const MOODS = {
  peace:   { scale: [293.7, 329.6, 392.0, 440.0, 523.3, 587.3], drone: 73.4, gap: 0.95, drums: 0, vol: 0.18 },
  tension: { scale: [220.0, 261.6, 293.7, 329.6, 349.2, 440.0], drone: 55.0, gap: 1.35, drums: 0, vol: 0.16 },
  war:     { scale: [293.7, 349.2, 392.0, 440.0, 466.2, 587.3], drone: 73.4, gap: 0.55, drums: 1, vol: 0.2 },
  crisis:  { scale: [220.0, 233.1, 293.7, 311.1, 349.2], drone: 51.9, gap: 1.6, drums: 0, vol: 0.14 },
};

export function soundOn() {
  return enabled;
}

export function initAudio() {
  let pref = null;
  try { pref = localStorage.getItem(PREF); } catch { /* storage blocked */ }
  if (pref === "on") {
    // browsers only allow sound after a gesture: start on the first tap
    const start = () => { enable(true); window.removeEventListener("pointerdown", start); };
    window.addEventListener("pointerdown", start);
  }
}

export function toggleSound() {
  enable(!enabled);
  try { localStorage.setItem(PREF, enabled ? "on" : "off"); } catch { /* storage blocked */ }
  return enabled;
}

function enable(on) {
  if (on && !ctx) build();
  if (!ctx) return;
  enabled = on;
  if (on) ctx.resume();
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.4);
  if (on) startLoops(); else stopLoops();
}

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = MOODS.peace.vol; musicBus.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = 1; ambBus.connect(master);
  wind = noiseLayer(500, "bandpass", 0.6);
  rain = noiseLayer(2500, "highpass", 0.3);
  applySeason();
}

function noiseBuffer() {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function noiseLayer(freq, type, q) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer(); src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = 0;
  // slow gusts: an LFO sweeping the filter
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07 + Math.random() * 0.05;
  const depth = ctx.createGain(); depth.gain.value = freq * 0.5;
  lfo.connect(depth).connect(f.frequency); lfo.start();
  src.connect(f).connect(g).connect(ambBus); src.start();
  return g;
}

// ---------- scene ----------

// scene: { season: "Spring"..., mood: "peace" | "tension" | "war" | "crisis" }
export function setScene({ season: nextSeason, mood: next }) {
  if (next !== mood) {
    mood = next;
    if (ctx) musicBus.gain.setTargetAtTime(MOODS[mood].vol, ctx.currentTime, 1.5);
  }
  if (nextSeason !== season) { season = nextSeason; applySeason(); }
}

function applySeason() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const w = { Spring: 0.035, Summer: 0.02, Autumn: 0.06, Winter: 0.1 }[season];
  const r = { Spring: 0.01, Summer: 0, Autumn: 0.025, Winter: 0.02 }[season];
  wind.gain.setTargetAtTime(w, t, 2);
  rain.gain.setTargetAtTime(r, t, 2);
}

// ---------- music ----------

function startLoops() {
  if (musicTimer) return;
  nextNote = ctx.currentTime + 0.3;
  musicTimer = setInterval(scheduleMusic, 200);
  birdTimer = setInterval(() => {
    if ((season === "Spring" || season === "Summer") && Math.random() < 0.35) chirp();
  }, 1800);
}

function stopLoops() {
  clearInterval(musicTimer); clearInterval(birdTimer);
  musicTimer = birdTimer = null;
}

function scheduleMusic() {
  const m = MOODS[mood];
  while (nextNote < ctx.currentTime + 0.8) {
    // a slow random walk over the scale, resting now and then
    step = Math.max(0, Math.min(m.scale.length - 1, step + Math.round((Math.random() - 0.5) * 3)));
    if (Math.random() > 0.18) pluck(m.scale[step] * (Math.random() < 0.15 ? 0.5 : 1), nextNote, musicBus);
    if (Math.random() < 0.12) pluck(m.scale[(step + 2) % m.scale.length], nextNote + m.gap / 2, musicBus, 0.5);
    if (step === 0 || Math.random() < 0.08) drone(m.drone, nextNote, m.gap * 6);
    if (m.drums) drum(nextNote, Math.random() < 0.5 ? 1 : 0.6);
    nextNote += m.gap * (0.8 + Math.random() * 0.5);
  }
}

function pluck(freq, t, out, vol = 1) {
  const o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = freq;
  const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = freq * 2.01;
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(freq * 6, t); f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 1.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + 2.2);
  const g2 = ctx.createGain(); g2.gain.value = 0.15;
  o.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(out);
  o.start(t); o2.start(t); o.stop(t + 2.3); o2.stop(t + 2.3);
}

function drone(freq, t, len) {
  const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = freq;
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 220;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + len * 0.3); g.gain.linearRampToValueAtTime(0, t + len);
  o.connect(f).connect(g).connect(musicBus); o.start(t); o.stop(t + len + 0.1);
}

function drum(t, vol) {
  const o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.25);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.9 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  o.connect(g).connect(musicBus); o.start(t); o.stop(t + 0.45);
}

function chirp() {
  const t = ctx.currentTime;
  for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
    const s = t + i * 0.11, base = 2600 + Math.random() * 1400;
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * 1.4, s + 0.06);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.02, s + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.08);
    o.connect(g).connect(ambBus); o.start(s); o.stop(s + 0.1);
  }
}

// ---------- effects ----------

function burst(t, freq, type, len, vol) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer();
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 2;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + len + 0.05);
}

function tone(t, freq, type, len, vol, slideTo = null) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + len);
  const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = Math.max(600, freq * 4);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.08, len / 4)); g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + len + 0.05);
}

export function sfx(name) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime + 0.02;
  switch (name) {
    case "build": burst(t, 900, "bandpass", 0.09, 0.5); burst(t + 0.16, 700, "bandpass", 0.09, 0.45); break;
    case "recruit": tone(t, 146.8, "sawtooth", 0.9, 0.25); tone(t + 0.25, 220, "sawtooth", 0.9, 0.18); break;
    case "march": for (let i = 0; i < 3; i++) tone(t + i * 0.22, 90, "sine", 0.25, 0.45, 50); break;
    case "clash": burst(t, 3200, "highpass", 0.12, 0.25); tone(t, 880 + Math.random() * 300, "square", 0.15, 0.04); break;
    case "battle": burst(t, 2500, "highpass", 0.3, 0.35); tone(t, 110, "sawtooth", 1.2, 0.3); tone(t + 0.3, 164.8, "sawtooth", 1.2, 0.25); break;
    case "season": tone(t, 659.3, "sine", 2.2, 0.18); tone(t, 988, "sine", 1.6, 0.07); tone(t + 0.4, 523.3, "sine", 2.2, 0.12); break;
    case "alert": tone(t, 110, "sawtooth", 0.6, 0.3); tone(t + 0.7, 110, "sawtooth", 0.9, 0.3); break;
    case "victory": [293.7, 370, 440, 587.3].forEach((f, i) => pluck(f, t + i * 0.15, master, 0.8)); break;
    case "defeat": [440, 349.2, 293.7, 220].forEach((f, i) => pluck(f, t + i * 0.25, master, 0.7)); break;
    default: break;
  }
}
