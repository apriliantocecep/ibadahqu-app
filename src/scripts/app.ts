import {
  addDays,
  formatClock,
  formatCountdown,
  isFriday,
  PRAYER_KEYS,
  tzLabel,
  ymdInTz,
  type Location,
  type PrayerKey,
  type YMD,
} from '../lib/prayTimes';
import {
  apiLocationName,
  CORRECTION_LIMIT,
  emptyCorrections,
  ensureData,
  getNextPrayer,
  getPrevPrayer,
  getSchedule,
  isLoading,
  type Corrections,
} from '../lib/schedule';
import { CITIES, DEFAULT_CITY, nearestCity } from '../lib/cities';
import { initPip, isPipOpen, pipMode, togglePip, type PipData } from './pip';

const STORAGE_KEY = 'jadwal-ibadah:lokasi';
const SOUND_KEY = 'jadwal-ibadah:bunyi';
const CORR_KEY = 'jadwal-ibadah:koreksi';
/** Lama pesan "waktu X telah masuk" ditampilkan. */
const ARRIVED_WINDOW_MS = 15 * 60_000;
/** GPS memakai data Kemenag kota terdekat bila jaraknya ≤ nilai ini. */
const GPS_MYQURAN_MAX_KM = 30;
const WEEK = 7;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

/* ---------- penyimpanan ---------- */

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

function loadLocation(): Location {
  const l = readJSON<Location>(STORAGE_KEY);
  if (typeof l?.lat === 'number' && typeof l?.lng === 'number' && typeof l?.tz === 'number') {
    // lokasi lama (sebelum ada myQuran) → lengkapi ID dari daftar kota
    const city = CITIES.find((c) => c.name === l.name && c.lat === l.lat);
    return city ?? l;
  }
  return DEFAULT_CITY;
}

function loadCorrections(): Corrections {
  const c = emptyCorrections();
  const saved = readJSON<Partial<Corrections>>(CORR_KEY);
  for (const k of PRAYER_KEYS) {
    const v = Number(saved?.[k]);
    if (Number.isFinite(v)) c[k] = Math.max(-CORRECTION_LIMIT, Math.min(CORRECTION_LIMIT, Math.round(v)));
  }
  return c;
}

/* ---------- state ---------- */

let loc = loadLocation();
let corr = loadCorrections();
let soundOn = readJSON<boolean>(SOUND_KEY) === true;
let renderedDayKey = '';
/** null = belum pernah tick (jangan berbunyi saat halaman baru dibuka). */
let lastArrivedKey: string | null = null;

/* ---------- format tanggal ---------- */

const dayKey = (d: YMD) => `${d.y}-${d.m}-${d.d}`;
const ymdUtc = (d: YMD) => new Date(Date.UTC(d.y, d.m - 1, d.d));

const fmtMasehi = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});
const fmtHijri = (() => {
  try {
    return new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  } catch {
    return null;
  }
})();
const fmtShort = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/* ---------- data countdown (dipakai UI & PiP) ---------- */

function computeState(now = Date.now()) {
  const next = getNextPrayer(now, loc, corr);
  const prev = getPrevPrayer(now, loc, corr);
  const span = next.time.getTime() - prev.time.getTime();
  const progress = span > 0 ? Math.min(1, Math.max(0, (now - prev.time.getTime()) / span)) : 0;
  const arrived = now - prev.time.getTime() < ARRIVED_WINDOW_MS ? prev : null;
  return { now, next, prev, progress, arrived, jumatan: next.name === 'Jumatan' };
}

function pipData(): PipData {
  const s = computeState();
  return {
    label: `Menuju ${s.next.name}`,
    countdown: formatCountdown(s.next.time.getTime() - s.now),
    sub: `${formatClock(s.next.time, loc.tz)} ${tzLabel(loc.tz)} · ${loc.name}`,
    note: s.arrived ? `Waktu ${s.arrived.name} telah masuk` : '',
    progress: s.progress,
    friday: s.jumatan,
  };
}

/* ---------- sumber data ---------- */

const weekDays = (today: YMD) => Array.from({ length: WEEK + 1 }, (_, i) => addDays(today, i - 1));

/** Muat data myQuran untuk minggu ini; render ulang bila ada data baru. */
async function syncData(force = false) {
  const today = ymdInTz(Date.now(), loc.tz);
  const target = loc;
  const p = ensureData(loc, weekDays(today), force);
  renderSource(today);
  const changed = await p;
  if (target !== loc) return; // lokasi sudah diganti sementara menunggu
  if (changed) renderedDayKey = '';
  tick();
  renderSource(ymdInTz(Date.now(), loc.tz));
}

function renderSource(today: YMD) {
  const el = $('#sumber');
  const btn = $<HTMLButtonElement>('#btn-reload');
  const src = getSchedule(today, loc, corr).source;
  el.className = `source ${src}`;
  btn.hidden = !loc.myquranId || src === 'myquran';
  btn.disabled = isLoading();
  if (isLoading() && src !== 'myquran') {
    el.textContent = 'Memuat jadwal Kemenag dari myQuran…';
  } else if (src === 'myquran') {
    const nama = apiLocationName(loc, today);
    el.textContent = `Sumber: Kemenag RI via myQuran${nama ? ` · ${nama}` : ''}`;
  } else if (!loc.myquranId) {
    el.textContent = 'Sumber: perhitungan lokal (tidak ada data Kemenag untuk titik ini)';
  } else {
    el.textContent = 'Sumber: perhitungan lokal — gagal memuat myQuran (offline?)';
  }
}

/* ---------- render ---------- */

function renderDay(today: YMD) {
  renderedDayKey = dayKey(today);
  const friday = isFriday(today);
  $('#tgl-masehi').textContent = fmtMasehi.format(ymdUtc(today));
  $('#tgl-hijri').textContent = fmtHijri ? fmtHijri.format(ymdUtc(today)) : '';
  $('#lokasi-nama').textContent = loc.name;
  $('#lokasi-detail').textContent = `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)} · ${tzLabel(loc.tz)}`;
  $('#friday-banner').hidden = !friday;
  renderSource(today);

  // daftar hari ini
  const list = $('#jadwal-list');
  list.innerHTML = '';
  for (const p of getSchedule(today, loc, corr).times) {
    const li = document.createElement('li');
    li.dataset.key = p.key;
    li.className = `row${p.isPrayer ? '' : ' minor'}${p.name === 'Jumatan' ? ' jumat' : ''}`;
    li.innerHTML = `<span class="name"></span><span class="time"></span>`;
    li.querySelector('.name')!.textContent = p.name;
    const time = li.querySelector('.time')!;
    time.textContent = formatClock(p.time, loc.tz);
    if (p.correction) {
      const b = document.createElement('small');
      b.className = 'corr-badge';
      b.title = `Dikoreksi ${signed(p.correction)} menit`;
      b.textContent = signed(p.correction);
      time.prepend(b);
    }
    list.append(li);
  }

  // tabel 7 hari
  const tbody = $('#pekan-body');
  tbody.innerHTML = '';
  for (let i = 0; i < WEEK; i++) {
    const s = getSchedule(addDays(today, i), loc, corr);
    const tr = document.createElement('tr');
    if (i === 0) tr.className = 'today';
    if (isFriday(s.day)) tr.classList.add('friday');
    const label = fmtShort.format(ymdUtc(s.day)) + (s.source === 'lokal' && loc.myquranId ? ' *' : '');
    for (const c of [label, ...s.times.map((p) => formatClock(p.time, loc.tz))]) {
      const td = document.createElement('td');
      td.textContent = c;
      tr.append(td);
    }
    tbody.append(tr);
  }

  const sel = $<HTMLSelectElement>('#kota');
  const match = CITIES.find((c) => c.name === loc.name && c.lat === loc.lat);
  sel.value = match ? match.name : '';
}

function tick() {
  const s = computeState();
  const today = ymdInTz(s.now, loc.tz);
  if (dayKey(today) !== renderedDayKey) {
    renderDay(today);
    void syncData();
  }

  $('#cd-label').textContent = `Menuju ${s.next.name}`;
  $('#cd-time').textContent = formatCountdown(s.next.time.getTime() - s.now);
  $('#cd-at').textContent = `${s.next.name} pukul ${formatClock(s.next.time, loc.tz)} ${tzLabel(loc.tz)}`;
  $('#cd-note').textContent = s.arrived ? `Waktu ${s.arrived.name} telah masuk` : '';
  $('#cd-bar').style.width = `${(s.progress * 100).toFixed(2)}%`;
  $('#countdown').classList.toggle('jumat', s.jumatan);
  $('#clock').textContent =
    formatClock(new Date(s.now), loc.tz) + ':' + String(new Date(s.now).getUTCSeconds()).padStart(2, '0');

  for (const li of document.querySelectorAll<HTMLElement>('#jadwal-list .row')) {
    const isNext =
      dayKey(ymdInTz(s.next.time.getTime(), loc.tz)) === renderedDayKey && li.dataset.key === s.next.key;
    li.classList.toggle('next', isNext);
  }

  // bunyi saat masuk waktu
  const arrivedKey = s.arrived ? `${s.arrived.key}@${s.arrived.time.getTime()}` : '';
  if (lastArrivedKey !== null && arrivedKey && arrivedKey !== lastArrivedKey && soundOn) chime();
  lastArrivedKey = arrivedKey;

  document.title = `${formatCountdown(s.next.time.getTime() - s.now)} · ${s.next.name} — Jadwal Ibadah`;
}

/** Render ulang penuh (setelah lokasi/koreksi berubah). */
function refresh() {
  renderedDayKey = '';
  lastArrivedKey = null;
  tick();
}

/* ---------- bunyi ---------- */

let audioCtx: AudioContext | null = null;
function chime() {
  try {
    audioCtx ??= new AudioContext();
    const t0 = audioCtx.currentTime;
    [659.25, 523.25, 783.99].forEach((f, i) => {
      const o = audioCtx!.createOscillator();
      const g = audioCtx!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = t0 + i * 0.45;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      o.connect(g).connect(audioCtx!.destination);
      o.start(t);
      o.stop(t + 1.25);
    });
  } catch {}
}

/* ---------- lokasi ---------- */

function setLocation(l: Location) {
  loc = l;
  writeJSON(STORAGE_KEY, l);
  refresh();
}

function initLocationControls() {
  const sel = $<HTMLSelectElement>('#kota');
  sel.addEventListener('change', () => {
    const c = CITIES.find((x) => x.name === sel.value);
    if (c) setLocation(c);
  });

  $('#btn-reload').addEventListener('click', () => void syncData(true));
  window.addEventListener('online', () => void syncData(true));

  const btn = $<HTMLButtonElement>('#btn-gps');
  const msg = $('#gps-msg');
  btn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      msg.textContent = 'Browser tidak mendukung geolokasi.';
      return;
    }
    btn.disabled = true;
    msg.textContent = 'Mencari lokasi…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btn.disabled = false;
        const { latitude: lat, longitude: lng } = pos.coords;
        const { city, km } = nearestCity(lat, lng);
        const tz = -new Date().getTimezoneOffset() / 60;
        const useApi = km <= GPS_MYQURAN_MAX_KM && city.tz === tz;
        setLocation({
          name: `Lokasi saya (dekat ${city.name})`,
          lat,
          lng,
          tz,
          myquranId: useApi ? city.myquranId : undefined,
        });
        msg.textContent = useApi
          ? `Memakai jadwal Kemenag ${city.name} (±${Math.round(km)} km).`
          : `Kota terdaftar terdekat ±${Math.round(km)} km — jadwal dihitung dari koordinat Anda.`;
      },
      (err) => {
        btn.disabled = false;
        msg.textContent = err.code === err.PERMISSION_DENIED ? 'Izin lokasi ditolak.' : 'Gagal mendapatkan lokasi.';
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  });
}

/* ---------- koreksi ---------- */

const CORR_LABEL: Record<PrayerKey, string> = {
  imsak: 'Imsak',
  subuh: 'Subuh',
  terbit: 'Terbit',
  dzuhur: 'Dzuhur / Jumat',
  ashar: 'Ashar',
  maghrib: 'Maghrib',
  isya: 'Isya',
};

function initCorrections() {
  const wrap = $('#koreksi-list');
  const reset = $<HTMLButtonElement>('#btn-reset-koreksi');

  const update = () => {
    for (const k of PRAYER_KEYS) {
      const row = wrap.querySelector<HTMLElement>(`[data-key="${k}"]`)!;
      const v = corr[k];
      row.querySelector('output')!.textContent = v ? `${signed(v)} mnt` : '0';
      row.classList.toggle('changed', v !== 0);
      row.querySelector<HTMLButtonElement>('[data-step="-1"]')!.disabled = v <= -CORRECTION_LIMIT;
      row.querySelector<HTMLButtonElement>('[data-step="1"]')!.disabled = v >= CORRECTION_LIMIT;
    }
    reset.disabled = PRAYER_KEYS.every((k) => corr[k] === 0);
  };

  for (const k of PRAYER_KEYS) {
    const row = document.createElement('div');
    row.className = 'corr-row';
    row.dataset.key = k;
    row.innerHTML = `
      <span class="corr-name"></span>
      <div class="stepper">
        <button type="button" data-step="-1" aria-label="Kurangi 1 menit">−</button>
        <output aria-live="polite">0</output>
        <button type="button" data-step="1" aria-label="Tambah 1 menit">+</button>
      </div>`;
    row.querySelector('.corr-name')!.textContent = CORR_LABEL[k];
    wrap.append(row);
  }

  wrap.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-step]');
    if (!b) return;
    const k = b.closest<HTMLElement>('.corr-row')!.dataset.key as PrayerKey;
    corr[k] = Math.max(-CORRECTION_LIMIT, Math.min(CORRECTION_LIMIT, corr[k] + Number(b.dataset.step)));
    writeJSON(CORR_KEY, corr);
    update();
    refresh();
  });

  reset.addEventListener('click', () => {
    corr = emptyCorrections();
    writeJSON(CORR_KEY, corr);
    update();
    refresh();
  });

  update();
}

/* ---------- PiP & bunyi ---------- */

function initPipControls() {
  const btn = $<HTMLButtonElement>('#btn-pip');
  const hint = $('#pip-hint');
  const setLabel = (open: boolean) => {
    btn.querySelector('span')!.textContent = open ? 'Tutup Picture-in-Picture' : 'Buka Picture-in-Picture';
    btn.setAttribute('aria-pressed', String(open));
  };

  if (pipMode === 'none') {
    btn.disabled = true;
    hint.textContent = 'Browser ini belum mendukung Picture-in-Picture. Coba Chrome, Edge, atau Safari.';
  } else {
    hint.textContent =
      pipMode === 'document'
        ? 'Jendela mengambang tetap tampil di atas aplikasi lain.'
        : 'Countdown ditampilkan sebagai video mengambang.';
    initPip(pipData, setLabel);
    btn.addEventListener('click', async () => {
      try {
        await togglePip();
      } catch (e) {
        hint.textContent = e instanceof Error ? e.message : 'Gagal membuka Picture-in-Picture.';
      }
      setLabel(isPipOpen());
    });
  }

  const sound = $<HTMLInputElement>('#chk-bunyi');
  sound.checked = soundOn;
  sound.addEventListener('change', () => {
    soundOn = sound.checked;
    writeJSON(SOUND_KEY, soundOn);
    if (soundOn) chime(); // sekaligus "membuka" AudioContext lewat user gesture
  });
}

/* ---------- start ---------- */

initLocationControls();
initCorrections();
initPipControls();
tick();
// coba lagi berkala bila masih memakai perhitungan lokal
setInterval(() => void syncData(), 5 * 60_000);
// selaraskan ke awal detik
setTimeout(() => {
  tick();
  setInterval(tick, 1000);
}, 1000 - (Date.now() % 1000));
