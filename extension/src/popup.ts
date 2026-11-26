import { CITIES, nearestCity } from '../../src/lib/cities';
import { addDays, formatClock, formatCountdown, PRAYER_KEYS, tzLabel, ymdInTz, type PrayerKey } from '../../src/lib/prayTimes';
import {
  apiLocationName,
  CORRECTION_LIMIT,
  emptyCorrections,
  ensureData,
  getSchedule,
  isLoading,
} from '../../src/lib/schedule';
import { currentSettings, loadAll, onCacheChanged, onSettingsChanged, REMINDER_OPTIONS, saveSettings, type Settings } from './core';
import { countdownState, fmtHijri, fmtMasehi, signed, ymdUtc } from './ui';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const GPS_MYQURAN_MAX_KM = 30;

let s: Settings;
let renderedKey = '';

/* ---------- render ---------- */

function renderStatic() {
  const today = countdownState(s).today;
  renderedKey = `${today.y}-${today.m}-${today.d}|${JSON.stringify(s.loc)}|${JSON.stringify(s.corr)}`;
  $('#lokasi').textContent = s.loc.name;
  $('#tanggal').textContent = `${fmtMasehi.format(ymdUtc(today))}${fmtHijri ? ` · ${fmtHijri.format(ymdUtc(today))}` : ''}`;

  const sched = getSchedule(today, s.loc, s.corr);
  const list = $('#list');
  list.innerHTML = '';
  for (const p of sched.times) {
    const li = document.createElement('li');
    li.dataset.key = p.key;
    li.className = `row${p.isPrayer ? '' : ' minor'}${p.name === 'Jumatan' ? ' jumat' : ''}`;
    li.innerHTML = '<span class="name"></span><span class="time"></span>';
    li.querySelector('.name')!.textContent = p.name;
    const t = li.querySelector('.time')!;
    t.textContent = formatClock(p.time, s.loc.tz);
    if (p.correction) {
      const b = document.createElement('small');
      b.className = 'corr-badge';
      b.textContent = signed(p.correction);
      t.prepend(b);
    }
    list.append(li);
  }

  const src = $('#sumber');
  src.className = `source ${sched.source}`;
  if (sched.source === 'myquran') {
    const nama = apiLocationName(s.loc, today);
    src.textContent = `Kemenag RI via myQuran${nama ? ` · ${nama}` : ''}`;
  } else if (isLoading()) {
    src.textContent = 'Memuat jadwal Kemenag…';
  } else {
    src.textContent = s.loc.myquranId ? 'Perhitungan lokal (myQuran gagal dimuat)' : 'Perhitungan lokal';
  }
}

function tick() {
  const st = countdownState(s);
  const key = `${st.today.y}-${st.today.m}-${st.today.d}|${JSON.stringify(s.loc)}|${JSON.stringify(s.corr)}`;
  if (key !== renderedKey) renderStatic();
  $('#cd-label').textContent = `Menuju ${st.next.name}`;
  $('#cd-time').textContent = formatCountdown(st.next.time.getTime() - st.now);
  $('#cd-at').textContent = `pukul ${formatClock(st.next.time, s.loc.tz)} ${tzLabel(s.loc.tz)}`;
  $('#cd-note').textContent = st.arrived ? `Waktu ${st.arrived.name} telah masuk` : '';
  $('#cd-bar').style.width = `${(st.progress * 100).toFixed(2)}%`;
  $('#countdown').classList.toggle('jumat', st.jumatan);
  const nd = ymdInTz(st.next.time.getTime(), s.loc.tz);
  const sameDay = nd.y === st.today.y && nd.m === st.today.m && nd.d === st.today.d;
  for (const li of document.querySelectorAll<HTMLElement>('#list .row')) {
    li.classList.toggle('next', sameDay && li.dataset.key === st.next.key);
  }
}

async function sync() {
  const today = countdownState(s).today;
  const p = ensureData(s.loc, Array.from({ length: 9 }, (_, i) => addDays(today, i - 1)));
  renderStatic();
  await p;
  renderStatic();
}

/* ---------- pengaturan ---------- */

const CORR_LABEL: Record<PrayerKey, string> = {
  imsak: 'Imsak', subuh: 'Subuh', terbit: 'Terbit', dzuhur: 'Dzuhur / Jumat', ashar: 'Ashar', maghrib: 'Maghrib', isya: 'Isya',
};

function renderSettings() {
  const sel = $<HTMLSelectElement>('#kota');
  const match = CITIES.find((c) => c.name === s.loc.name && c.lat === s.loc.lat);
  sel.value = match ? match.name : '';
  $<HTMLInputElement>('#notif').checked = s.notif;
  $<HTMLSelectElement>('#pengingat').value = String(s.reminderMin);
  $<HTMLSelectElement>('#pengingat').disabled = !s.notif;
  for (const k of PRAYER_KEYS) {
    const row = document.querySelector<HTMLElement>(`.corr-row[data-key="${k}"]`)!;
    const v = s.corr[k];
    row.querySelector('output')!.textContent = v ? `${signed(v)} mnt` : '0';
    row.classList.toggle('changed', v !== 0);
    row.querySelector<HTMLButtonElement>('[data-step="-1"]')!.disabled = v <= -CORRECTION_LIMIT;
    row.querySelector<HTMLButtonElement>('[data-step="1"]')!.disabled = v >= CORRECTION_LIMIT;
  }
  $<HTMLButtonElement>('#reset').disabled = PRAYER_KEYS.every((k) => s.corr[k] === 0);
}

async function apply(patch: Partial<Settings>) {
  s = { ...s, ...patch };
  await saveSettings(patch);
  renderSettings();
  tick();
  if (patch.loc) void sync();
}

function initSettings() {
  const sel = $<HTMLSelectElement>('#kota');
  sel.innerHTML = '<option value="" disabled>— Lokasi khusus —</option>' +
    CITIES.map((c) => `<option>${c.name}</option>`).join('');
  sel.addEventListener('change', () => {
    const c = CITIES.find((x) => x.name === sel.value);
    if (c) void apply({ loc: c });
  });

  const gps = $<HTMLButtonElement>('#gps');
  const msg = $('#gps-msg');
  gps.addEventListener('click', () => {
    gps.disabled = true;
    msg.textContent = 'Mencari lokasi…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        gps.disabled = false;
        const { latitude: lat, longitude: lng } = pos.coords;
        const { city, km } = nearestCity(lat, lng);
        const tz = -new Date().getTimezoneOffset() / 60;
        const useApi = km <= GPS_MYQURAN_MAX_KM && city.tz === tz;
        void apply({ loc: { name: `Lokasi saya (dekat ${city.name})`, lat, lng, tz, myquranId: useApi ? city.myquranId : undefined } });
        msg.textContent = useApi ? `Memakai jadwal Kemenag ${city.name} (±${Math.round(km)} km).` : 'Jadwal dihitung dari koordinat Anda.';
      },
      (err) => {
        gps.disabled = false;
        msg.textContent = err.code === err.PERMISSION_DENIED ? 'Izin lokasi ditolak.' : 'Gagal mendapatkan lokasi.';
      },
      { timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  });

  $<HTMLInputElement>('#notif').addEventListener('change', (e) => void apply({ notif: (e.target as HTMLInputElement).checked }));
  const rem = $<HTMLSelectElement>('#pengingat');
  rem.innerHTML = REMINDER_OPTIONS.map((m) => `<option value="${m}">${m ? `${m} menit sebelumnya` : 'Tidak ada'}</option>`).join('');
  rem.addEventListener('change', () => void apply({ reminderMin: Number(rem.value) }));

  const wrap = $('#corr');
  for (const k of PRAYER_KEYS) {
    const row = document.createElement('div');
    row.className = 'corr-row';
    row.dataset.key = k;
    row.innerHTML = `<span>${CORR_LABEL[k]}</span><div class="stepper"><button type="button" data-step="-1" aria-label="Kurangi 1 menit">−</button><output>0</output><button type="button" data-step="1" aria-label="Tambah 1 menit">+</button></div>`;
    wrap.append(row);
  }
  wrap.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-step]');
    if (!b) return;
    const k = b.closest<HTMLElement>('.corr-row')!.dataset.key as PrayerKey;
    const corr = { ...s.corr, [k]: Math.max(-CORRECTION_LIMIT, Math.min(CORRECTION_LIMIT, s.corr[k] + Number(b.dataset.step))) };
    void apply({ corr });
  });
  $('#reset').addEventListener('click', () => void apply({ corr: emptyCorrections() }));

  const showSettings = (on: boolean) => {
    $('#view-main').hidden = on;
    $('#view-settings').hidden = !on;
  };
  $('#btn-settings').addEventListener('click', () => showSettings(true));
  $('#btn-back').addEventListener('click', () => showSettings(false));
}

/* ---------- PiP ---------- */

async function openPip() {
  const url = chrome.runtime.getURL('pip.html');
  const [tab] = await chrome.tabs.query({ url });
  if (tab?.id !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true, state: 'normal' });
    await chrome.tabs.update(tab.id, { active: true });
  } else {
    await chrome.windows.create({ url, type: 'popup', width: 380, height: 300, focused: true });
  }
  window.close();
}

/* ---------- start ---------- */

(async () => {
  s = await loadAll();
  initSettings();
  renderSettings();
  tick();
  setInterval(tick, 1000);
  $('#btn-pip').addEventListener('click', () => void openPip());
  onSettingsChanged((n) => {
    s = n;
    renderSettings();
    tick();
  });
  onCacheChanged(() => {
    s = currentSettings();
    renderedKey = '';
    tick();
  });
  void sync();
})();
