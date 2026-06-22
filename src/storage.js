// Persistence for the whole app state.
//
// We use IndexedDB rather than localStorage because the state object embeds
// extracted document text (PDFs, notes, materials), which blows past
// localStorage's ~5MB ceiling quickly. IndexedDB gives us hundreds of MB and
// stores the structured object without a JSON round-trip per save.
//
// Saves are debounced and async. Load is async too, so the app renders a
// default state first and hydrates once IndexedDB resolves (see App.jsx).

const LEGACY_KEY = "peer-app-state-v1";
const DB_NAME = "peer-app";
const DB_VERSION = 1;
const STORE = "state";
const STATE_ID = "app-state";
const SAVE_DEBOUNCE_MS = 400;

let dbPromise = null;
let saveErrorHandler = null;
let saveTimer = null;
let pendingState = null;

export function setSaveErrorHandler(fn) {
  saveErrorHandler = typeof fn === "function" ? fn : null;
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open the local database."));
  });
  return dbPromise;
}

function idbGet(key) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => reject(request.error);
      }),
  );
}

function idbSet(key, value) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("The save was aborted (storage may be full)."));
      }),
  );
}

function migrateFromLocalStorage() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// Reads persisted state. Falls back to a legacy localStorage payload (and
// migrates it into IndexedDB) the first time around. Returns null when there
// is nothing stored yet. Never throws — a storage failure just means "no data".
export async function loadState() {
  try {
    const fromIdb = await idbGet(STATE_ID);
    if (fromIdb) return fromIdb;

    const legacy = migrateFromLocalStorage();
    if (legacy) {
      try {
        await idbSet(STATE_ID, legacy);
        localStorage.removeItem(LEGACY_KEY);
      } catch {
        // If migration write fails, still return the legacy data so the user
        // sees their content; we'll try migrating again on the next save.
      }
      return legacy;
    }
    return null;
  } catch {
    // IndexedDB unavailable (e.g. some private modes). Fall back to legacy read.
    return migrateFromLocalStorage();
  }
}

// Debounced, async save. Reports failures through the registered error handler
// instead of swallowing them, so the UI can warn the user before data is lost.
export function saveState(state) {
  pendingState = state;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    const snapshot = pendingState;
    saveTimer = null;
    pendingState = null;
    idbSet(STATE_ID, snapshot).catch((error) => {
      if (saveErrorHandler) saveErrorHandler(error);
    });
  }, SAVE_DEBOUNCE_MS);
}

// Wipes persisted state from both backends. Used by the boot error recovery.
export async function clearState() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    pendingState = null;
  }
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
  try {
    const db = await openDb();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(STATE_ID);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {
    // ignore
  }
}
