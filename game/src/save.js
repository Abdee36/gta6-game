// Save and load for Solmarina via localStorage. Every call is guarded: a
// blocked or missing store simply means no save, never a crash.
const SAVE_KEY = 'solmarina-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

export function storeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // No store, nothing to clear.
  }
}

export function snapshotSave(game) {
  return {
    version: 1,
    money: Math.round(game.player.money),
    missionsDone: game.missions.done.slice(),
    stashesFound: game.pickups.filter((p) => p.taken).length,
    savedAt: game.time,
  };
}
