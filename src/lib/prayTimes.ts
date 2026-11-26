/**
 * Perhitungan waktu salat (algoritma praytimes.org, disederhanakan)
 * dengan parameter Kemenag RI: Subuh 20°, Isya 18°, Ashar mazhab Syafi'i,
 * ihtiyat +2 menit, Imsak = Subuh − 10 menit.
 */

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const dsin = (d: number) => Math.sin(rad(d));
const dcos = (d: number) => Math.cos(rad(d));
const dtan = (d: number) => Math.tan(rad(d));
const darcsin = (x: number) => deg(Math.asin(x));
const darccos = (x: number) => deg(Math.acos(x));
const darctan2 = (y: number, x: number) => deg(Math.atan2(y, x));
const darccot = (x: number) => deg(Math.atan(1 / x));
const fix = (a: number, b: number) => {
  a = a - b * Math.floor(a / b);
  return a < 0 ? a + b : a;
};

function julian(y: number, m: number, d: number) {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

function sunPosition(jd: number) {
  const D = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * D, 360);
  const q = fix(280.459 + 0.98564736 * D, 360);
  const L = fix(q + 1.915 * dsin(g) + 0.02 * dsin(2 * g), 360);
  const e = 23.439 - 0.00000036 * D;
  const RA = darctan2(dcos(e) * dsin(L), dcos(L)) / 15;
  const eqt = q / 15 - fix(RA, 24);
  const decl = darcsin(dsin(e) * dsin(L));
  return { decl, eqt };
}

export interface Location {
  name: string;
  lat: number;
  lng: number;
  /** offset zona waktu dalam jam, mis. 7 untuk WIB */
  tz: number;
  /** ID kab/kota di API myQuran (data Kemenag). Kosong = selalu hitung lokal. */
  myquranId?: string;
}

export interface YMD {
  y: number;
  m: number; // 1-12
  d: number;
}

export type PrayerKey = 'imsak' | 'subuh' | 'terbit' | 'dzuhur' | 'ashar' | 'maghrib' | 'isya';

export interface PrayerTime {
  key: PrayerKey;
  name: string;
  /** apakah termasuk salat wajib (target countdown) */
  isPrayer: boolean;
  time: Date;
  /** koreksi manual (menit) yang sudah diterapkan ke `time` */
  correction: number;
}

export const PRAYER_KEYS: PrayerKey[] = ['imsak', 'subuh', 'terbit', 'dzuhur', 'ashar', 'maghrib', 'isya'];

const BASE_INFO: Record<PrayerKey, { name: string; isPrayer: boolean }> = {
  imsak: { name: 'Imsak', isPrayer: false },
  subuh: { name: 'Subuh', isPrayer: true },
  terbit: { name: 'Terbit', isPrayer: false },
  dzuhur: { name: 'Dzuhur', isPrayer: true },
  ashar: { name: 'Ashar', isPrayer: true },
  maghrib: { name: 'Maghrib', isPrayer: true },
  isya: { name: 'Isya', isPrayer: true },
};

/** Susun daftar waktu dari Date per key (nama Dzuhur → Jumatan di hari Jumat). */
export function buildSchedule(day: YMD, times: Record<PrayerKey, Date>): PrayerTime[] {
  const friday = isFriday(day);
  return PRAYER_KEYS.map((key) => ({
    key,
    name: key === 'dzuhur' && friday ? 'Jumatan' : BASE_INFO[key].name,
    isPrayer: BASE_INFO[key].isPrayer,
    time: times[key],
    correction: 0,
  }));
}

/** "HH:MM" waktu lokal zona `tz` pada tanggal `day` → Date absolut. */
export function clockToDate({ y, m, d }: YMD, tz: number, clock: string) {
  const [hh, mm] = clock.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - tz * 3600_000 + (hh * 60 + mm) * 60_000);
}

const FAJR_ANGLE = 20;
const ISHA_ANGLE = 18;
const IHTIYAT_MIN = 2;

/** Hitung waktu (jam desimal, waktu lokal zona `tz`) untuk satu hari. */
function computeHours({ y, m, d }: YMD, { lat, lng, tz }: Location) {
  const jDate = julian(y, m, d) - lng / (15 * 24);

  const midDay = (t: number) => fix(12 - sunPosition(jDate + t / 24).eqt, 24);
  const sunAngleTime = (angle: number, t: number, ccw = false) => {
    const { decl } = sunPosition(jDate + t / 24);
    const noon = midDay(t);
    const T = darccos((-dsin(angle) - dsin(decl) * dsin(lat)) / (dcos(decl) * dcos(lat))) / 15;
    return noon + (ccw ? -T : T);
  };
  const asrTime = (factor: number, t: number) => {
    const { decl } = sunPosition(jDate + t / 24);
    const angle = -darccot(factor + dtan(Math.abs(lat - decl)));
    return sunAngleTime(angle, t);
  };

  // tebakan awal (jam), lalu iterasi agar posisi matahari lebih akurat
  let t = { fajr: 5, sunrise: 6, dhuhr: 12, asr: 13, sunset: 18, isha: 18 };
  for (let i = 0; i < 2; i++) {
    t = {
      fajr: sunAngleTime(FAJR_ANGLE, t.fajr, true),
      sunrise: sunAngleTime(0.833, t.sunrise, true),
      dhuhr: midDay(t.dhuhr),
      asr: asrTime(1, t.asr),
      sunset: sunAngleTime(0.833, t.sunset),
      isha: sunAngleTime(ISHA_ANGLE, t.isha),
    };
  }
  const adj = tz - lng / 15;
  return {
    fajr: t.fajr + adj,
    sunrise: t.sunrise + adj,
    dhuhr: t.dhuhr + adj,
    asr: t.asr + adj,
    sunset: t.sunset + adj,
    isha: t.isha + adj,
  };
}

/** Jam desimal lokal → Date absolut (dibulatkan ke menit). */
function toDate({ y, m, d }: YMD, tz: number, hours: number, offsetMin: number, roundUp: boolean) {
  const dayStart = Date.UTC(y, m - 1, d) - tz * 3600_000;
  const minutes = hours * 60 + offsetMin;
  const rounded = roundUp ? Math.ceil(minutes) : Math.floor(minutes);
  return new Date(dayStart + rounded * 60_000);
}

export function isFriday({ y, m, d }: YMD) {
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 5;
}

/** Jadwal hasil perhitungan astronomis lokal (offline). */
export function computeSchedule(day: YMD, loc: Location): PrayerTime[] {
  const h = computeHours(day, loc);
  const subuh = toDate(day, loc.tz, h.fajr, IHTIYAT_MIN, true);
  return buildSchedule(day, {
    imsak: new Date(subuh.getTime() - 10 * 60_000),
    subuh,
    terbit: toDate(day, loc.tz, h.sunrise, -IHTIYAT_MIN, false),
    dzuhur: toDate(day, loc.tz, h.dhuhr, IHTIYAT_MIN, true),
    ashar: toDate(day, loc.tz, h.asr, IHTIYAT_MIN, true),
    maghrib: toDate(day, loc.tz, h.sunset, IHTIYAT_MIN, true),
    isya: toDate(day, loc.tz, h.isha, IHTIYAT_MIN, true),
  });
}

/** Tanggal kalender di zona `tz` untuk waktu absolut `ms`. */
export function ymdInTz(ms: number, tz: number): YMD {
  const s = new Date(ms + tz * 3600_000);
  return { y: s.getUTCFullYear(), m: s.getUTCMonth() + 1, d: s.getUTCDate() };
}

export function addDays({ y, m, d }: YMD, n: number): YMD {
  const s = new Date(Date.UTC(y, m - 1, d + n));
  return { y: s.getUTCFullYear(), m: s.getUTCMonth() + 1, d: s.getUTCDate() };
}

export function formatClock(date: Date, tz: number) {
  const s = new Date(date.getTime() + tz * 3600_000);
  return `${String(s.getUTCHours()).padStart(2, '0')}:${String(s.getUTCMinutes()).padStart(2, '0')}`;
}

export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

export const tzLabel = (tz: number) =>
  tz === 7 ? 'WIB' : tz === 8 ? 'WITA' : tz === 9 ? 'WIT' : `UTC${tz >= 0 ? '+' : ''}${tz}`;
