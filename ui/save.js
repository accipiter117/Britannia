// ui/save.js
// Owns localStorage save slots. Wrapped in try/catch: private browsing can block storage.

import { dateLabel, deserialise, serialise } from "../simulation/campaign.js";

const KEY = "britannia.save.v1";

export function saveGame(state) {
  try {
    localStorage.setItem(KEY, serialise(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? deserialise(raw) : null;
  } catch {
    return null;
  }
}

export function saveLabel() {
  const s = loadGame();
  return s ? dateLabel(s) : null;
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
