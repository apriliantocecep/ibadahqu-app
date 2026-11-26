/**
 * Sumber jadwal: API myQuran (data Kemenag RI) dengan fallback perhitungan lokal,
 * plus koreksi manual per waktu.
 */
import {
  addDays,
  buildSchedule,
  clockToDate,
  computeSchedule,
  PRAYER_KEYS,
  ymdInTz,
  type Location,
  type PrayerKey,
  type PrayerTime,
  type YMD,
} from './prayTimes';

export type Source = 'myquran' | 'lokal';
export type Corrections = Record<PrayerKey, number>;

export interface DaySchedule {
  day: YMD;
  source: Source;
  times: PrayerTime[];
}

type ApiDay = Record<PrayerKey, string>;
interface MonthData {
  lokasi: string;
  days: Record<string, ApiDay>; // "YYYY-MM-DD" → waktu
}

const API = 'https://api.myquran.com/v2/sholat/jadwal';
const STORE_PREFIX = 'jadwal-ibadah:myquran:';
const RETRY_AFTER_MS = 5 * 60_000;
const CLOCK_RE = /^\d{2}:\d{2}$/;

export const CORRECTION_LIMIT = 30;
export const emptyCorrections = (): Corrections =>
  Object.fromEntries(PRAYER_KEYS.map((k) => [k, 0])) as Corrections;

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: YMD) => `${d.y}-${pad(d.m)}-${pad(d.d)}`;
const monthKey = (id: string, y: number, m: number) => `${id}:${y}-${pad(m)}`;

const memory = new Map<string, MonthData>();
const inflight = new Map<string, Promise<boolean>>();
const failedAt = new Map<string, number>();

/* ---------- cache (default localStorage; extension memakai chrome.storage) ---------- */

export interface CacheBackend {
  read(key: string): MonthData | null;
  write(key: string, data: MonthData): void;
}

export type { MonthData };

/** Bulan (0-based, y*12+m) paling lama yang masih disimpan: bulan lalu. */
export function isStaleMonthKey(key: string) {
  const m = key.match(/:(\d{4})-(\d{2})$/);
  if (!m) return false;
  const now = new Date();
  return Number(m[1]) * 12 + Number(m[2]) - 1 < now.getFullYear() * 12 + now.getMonth() - 1;
}

const localStorageBackend: CacheBackend = {
  read(key) {
    try {
      const raw = localStorage.getItem(STORE_PREFIX + key);
      return raw ? (JSON.parse(raw) as MonthData) : null;
    } catch {
      return null;
    }
  },
  write(key, data) {
    try {
      localStorage.setItem(STORE_PREFIX + key, JSON.stringify(data));
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(STORE_PREFIX) && isStaleMonthKey(k)) localStorage.removeItem(k);
      }
    } catch {}
  },
};

let backend: CacheBackend = localStorageBackend;

/** Ganti tempat penyimpanan cache (mis. chrome.storage di extension). */
export function configureCache(b: CacheBackend) {
  backend = b;
  memory.clear();
}

/** Lupakan data di memori untuk key tertentu (dipanggil saat storage berubah dari konteks lain). */
export function invalidateCache(key?: string) {
  if (key) memory.delete(key);
  else memory.clear();
}

const readStore = (key: string) => backend.read(key);
const writeStore = (key: string, data: MonthData) => backend.write(key, data);

function getMonth(id: string, y: number, m: number): MonthData | null {
  const key = monthKey(id, y, m);
  let data = memory.get(key) ?? null;
  if (!data) {
    data = readStore(key);
    if (data) memory.set(key, data);
  }
  return data;
}

/* ---------- fetch ---------- */

async function fetchMonth(id: string, y: number, m: number): Promise<boolean> {
  const key = monthKey(id, y, m);
  try {
    const res = await fetch(`${API}/${id}/${y}/${pad(m)}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json?.status || !Array.isArray(json?.data?.jadwal)) throw new Error('Format respons tidak dikenal');
    const days: Record<string, ApiDay> = {};
    for (const row of json.data.jadwal) {
      if (typeof row?.date !== 'string') continue;
      if (!PRAYER_KEYS.every((k) => typeof row[k] === 'string' && CLOCK_RE.test(row[k]))) continue;
      days[row.date] = Object.fromEntries(PRAYER_KEYS.map((k) => [k, row[k]])) as ApiDay;
    }
    if (!Object.keys(days).length) throw new Error('Data kosong');
    const data: MonthData = { lokasi: String(json.data.lokasi ?? ''), days };
    memory.set(key, data);
    writeStore(key, data);
    failedAt.delete(key);
    return true;
  } catch (e) {
    console.warn('[myQuran] gagal memuat', key, e);
    failedAt.set(key, Date.now());
    return false;
  }
}

/**
 * Pastikan data bulan-bulan yang mencakup `days` tersedia.
 * Resolve `true` bila ada data baru yang berhasil dimuat.
 */
export async function ensureData(loc: Location, days: YMD[], force = false): Promise<boolean> {
  const id = loc.myquranId;
  if (!id) return false;
  const months = [...new Set(days.map((d) => `${d.y}-${d.m}`))].map((s) => s.split('-').map(Number));
  const jobs = months.map(([y, m]) => {
    const key = monthKey(id, y, m);
    if (getMonth(id, y, m)) return Promise.resolve(false);
    if (!force && Date.now() - (failedAt.get(key) ?? 0) < RETRY_AFTER_MS) return Promise.resolve(false);
    let p = inflight.get(key);
    if (!p) {
      p = fetchMonth(id, y, m).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    return p;
  });
  const results = await Promise.all(jobs);
  return results.some(Boolean);
}

export function isLoading() {
  return inflight.size > 0;
}

/** Nama lokasi versi Kemenag (mis. "KOTA JAKARTA"), bila sudah dimuat. */
export function apiLocationName(loc: Location, day: YMD) {
  return loc.myquranId ? (getMonth(loc.myquranId, day.y, day.m)?.lokasi ?? null) : null;
}

/* ---------- jadwal ---------- */

export function getSchedule(day: YMD, loc: Location, corr: Corrections): DaySchedule {
  const api = loc.myquranId ? getMonth(loc.myquranId, day.y, day.m)?.days[isoDay(day)] : undefined;
  const base = api
    ? buildSchedule(
        day,
        Object.fromEntries(PRAYER_KEYS.map((k) => [k, clockToDate(day, loc.tz, api[k])])) as Record<PrayerKey, Date>,
      )
    : computeSchedule(day, loc);
  const times = base.map((p) => {
    const c = corr[p.key] ?? 0;
    return c ? { ...p, correction: c, time: new Date(p.time.getTime() + c * 60_000) } : p;
  });
  return { day, source: api ? 'myquran' : 'lokal', times };
}

/** Salat wajib berikutnya setelah `now` (bisa Subuh besok). */
export function getNextPrayer(now: number, loc: Location, corr: Corrections) {
  const today = ymdInTz(now, loc.tz);
  for (let i = 0; i < 2; i++) {
    const next = getSchedule(addDays(today, i), loc, corr).times.find((p) => p.isPrayer && p.time.getTime() > now);
    if (next) return next;
  }
  throw new Error('Tidak dapat menentukan waktu salat berikutnya');
}

/** Salat wajib terakhir yang sudah masuk waktunya. */
export function getPrevPrayer(now: number, loc: Location, corr: Corrections) {
  const today = ymdInTz(now, loc.tz);
  for (let i = 0; i > -2; i--) {
    const prev = getSchedule(addDays(today, i), loc, corr)
      .times.filter((p) => p.isPrayer && p.time.getTime() <= now)
      .pop();
    if (prev) return prev;
  }
  throw new Error('Tidak dapat menentukan waktu salat sebelumnya');
}
