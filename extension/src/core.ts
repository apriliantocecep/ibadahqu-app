/** State bersama extension: pengaturan + cache myQuran di chrome.storage.local. */
import { CITIES, DEFAULT_CITY } from '../../src/lib/cities';
import { PRAYER_KEYS, type Location } from '../../src/lib/prayTimes';
import {
  configureCache,
  CORRECTION_LIMIT,
  emptyCorrections,
  invalidateCache,
  isStaleMonthKey,
  type Corrections,
  type MonthData,
} from '../../src/lib/schedule';

export interface Settings {
  loc: Location;
  corr: Corrections;
  /** notifikasi saat masuk waktu salat */
  notif: boolean;
  /** pengingat X menit sebelum masuk waktu (0 = mati) */
  reminderMin: number;
}

export const REMINDER_OPTIONS = [0, 5, 10, 15, 30];

const CACHE_PREFIX = 'myquran:';
const KEYS = { loc: 'lokasi', corr: 'koreksi', notif: 'notif', reminder: 'pengingat' } as const;

let snapshot: Record<string, unknown> = {};
let hydrated = false;

function normalize(raw: Record<string, unknown>): Settings {
  const l = raw[KEYS.loc] as Location | undefined;
  let loc = DEFAULT_CITY;
  if (typeof l?.lat === 'number' && typeof l?.lng === 'number' && typeof l?.tz === 'number') {
    loc = CITIES.find((c) => c.name === l.name && c.lat === l.lat) ?? l;
  }
  const corr = emptyCorrections();
  const savedCorr = (raw[KEYS.corr] ?? {}) as Partial<Corrections>;
  for (const k of PRAYER_KEYS) {
    const v = Number(savedCorr[k]);
    if (Number.isFinite(v)) corr[k] = Math.max(-CORRECTION_LIMIT, Math.min(CORRECTION_LIMIT, Math.round(v)));
  }
  const rem = Number(raw[KEYS.reminder]);
  return {
    loc,
    corr,
    notif: raw[KEYS.notif] !== false,
    reminderMin: REMINDER_OPTIONS.includes(rem) ? rem : 0,
  };
}

/** Muat semua dari storage dan pasang cache myQuran ke chrome.storage. */
export async function loadAll(): Promise<Settings> {
  snapshot = await chrome.storage.local.get(null);
  if (!hydrated) {
    hydrated = true;
    configureCache({
      read: (key) => (snapshot[CACHE_PREFIX + key] as MonthData | undefined) ?? null,
      write: (key, data) => {
        snapshot[CACHE_PREFIX + key] = data;
        const stale = Object.keys(snapshot).filter((k) => k.startsWith(CACHE_PREFIX) && isStaleMonthKey(k));
        for (const k of stale) delete snapshot[k];
        void chrome.storage.local.set({ [CACHE_PREFIX + key]: data });
        if (stale.length) void chrome.storage.local.remove(stale);
      },
    });
    // jaga snapshot tetap sinkron dengan konteks lain (popup ↔ service worker ↔ jendela PiP)
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      for (const [k, { newValue }] of Object.entries(changes)) {
        if (newValue === undefined) delete snapshot[k];
        else snapshot[k] = newValue;
        if (k.startsWith(CACHE_PREFIX)) invalidateCache(k.slice(CACHE_PREFIX.length));
      }
    });
  }
  return normalize(snapshot);
}

export function currentSettings(): Settings {
  return normalize(snapshot);
}

export async function saveSettings(patch: Partial<Settings>) {
  const out: Record<string, unknown> = {};
  if (patch.loc) out[KEYS.loc] = patch.loc;
  if (patch.corr) out[KEYS.corr] = patch.corr;
  if (patch.notif !== undefined) out[KEYS.notif] = patch.notif;
  if (patch.reminderMin !== undefined) out[KEYS.reminder] = patch.reminderMin;
  Object.assign(snapshot, out);
  await chrome.storage.local.set(out);
}

/** Dengarkan perubahan pengaturan (bukan cache). Pengaturan dibaca ulang dari storage. */
export function onSettingsChanged(fn: (s: Settings) => void) {
  const watched = new Set<string>(Object.values(KEYS));
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === 'local' && Object.keys(changes).some((k) => watched.has(k))) fn(await loadAll());
  });
}

/** Ada data myQuran baru dari konteks lain. */
export function onCacheChanged(fn: () => void) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(changes).some((k) => k.startsWith(CACHE_PREFIX))) fn();
  });
}
