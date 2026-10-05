// simulation/random.js
// Owns seeded randomness so a campaign replays identically from a save. The seed lives in state.

export function rand(state) {
  // mulberry32
  let t = (state.seed = ((state.seed ?? 0x9e3779b9) + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function chance(state, p) {
  return rand(state) < p;
}

export function pickOne(state, list) {
  return list[Math.floor(rand(state) * list.length)];
}

// Stateless generator for things like battlefield terrain.
export function seeded(seed) {
  let s = seed | 0;
  return () => {
    let t = (s = (s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h | 0;
}
