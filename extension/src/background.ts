/**
 * Service worker: badge countdown di ikon, notifikasi masuk waktu & pengingat,
 * serta sinkron data myQuran.
 */
import { addDays, formatClock, tzLabel, ymdInTz } from '../../src/lib/prayTimes';
import { ensureData, getNextPrayer, getPrevPrayer } from '../../src/lib/schedule';
import { loadAll, onCacheChanged, onSettingsChanged, type Settings } from './core';

const ALARM_TICK = 'tick';
const ALARM_PRAYER = 'prayer';
const ALARM_REMINDER = 'reminder';
const ALARM_SYNC = 'sync';

function badgeText(ms: number) {
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return `${h}:${String(min % 60).padStart(2, '0')}`;
}

async function update(s?: Settings) {
  s ??= await loadAll();
  const now = Date.now();
  const next = getNextPrayer(now, s.loc, s.corr);
  const left = next.time.getTime() - now;
  const jumatan = next.name === 'Jumatan';

  await chrome.action.setBadgeText({ text: badgeText(left) });
  await chrome.action.setBadgeBackgroundColor({ color: jumatan ? '#b7860b' : '#0f7a5c' });
  await chrome.action.setBadgeTextColor?.({ color: '#ffffff' });
  await chrome.action.setTitle({
    title: `Menuju ${next.name} · ${formatClock(next.time, s.loc.tz)} ${tzLabel(s.loc.tz)} — ${s.loc.name}`,
  });

  // alarm tepat di waktu salat berikutnya (create dengan nama sama = menimpa)
  await chrome.alarms.create(ALARM_PRAYER, { when: next.time.getTime() });
  const remAt = next.time.getTime() - s.reminderMin * 60_000;
  if (s.reminderMin > 0 && remAt > now) await chrome.alarms.create(ALARM_REMINDER, { when: remAt });
  else await chrome.alarms.clear(ALARM_REMINDER);
}

async function sync(s?: Settings) {
  s ??= await loadAll();
  const today = ymdInTz(Date.now(), s.loc.tz);
  const days = Array.from({ length: 9 }, (_, i) => addDays(today, i - 1));
  await ensureData(s.loc, days);
}

async function notify(id: string, title: string, message: string) {
  await chrome.notifications.create(`${id}-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title,
    message,
    priority: 2,
  });
}

async function setup() {
  const now = new Date();
  // tick pertama di awal menit berikutnya, lalu tiap menit
  await chrome.alarms.create(ALARM_TICK, {
    when: now.getTime() + (60 - now.getSeconds()) * 1000 - now.getMilliseconds(),
    periodInMinutes: 1,
  });
  await chrome.alarms.create(ALARM_SYNC, { periodInMinutes: 60 });
  const s = await loadAll();
  await update(s);
  await sync(s);
  await update(s);
}

chrome.runtime.onInstalled.addListener(() => void setup());
chrome.runtime.onStartup.addListener(() => void setup());

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const s = await loadAll();
  const now = Date.now();
  if (alarm.name === ALARM_PRAYER && s.notif) {
    const p = getPrevPrayer(now + 30_000, s.loc, s.corr);
    if (Math.abs(p.time.getTime() - now) < 5 * 60_000) {
      await notify(
        'prayer',
        p.name === 'Jumatan' ? 'Waktunya salat Jumat' : `Waktu ${p.name} telah masuk`,
        `${formatClock(p.time, s.loc.tz)} ${tzLabel(s.loc.tz)} · ${s.loc.name}`,
      );
    }
  } else if (alarm.name === ALARM_REMINDER && s.notif) {
    const n = getNextPrayer(now, s.loc, s.corr);
    const min = Math.round((n.time.getTime() - now) / 60_000);
    if (min > 0 && min <= s.reminderMin + 1) {
      await notify('reminder', `${min} menit lagi ${n.name}`, `${n.name} pukul ${formatClock(n.time, s.loc.tz)} ${tzLabel(s.loc.tz)} · ${s.loc.name}`);
    }
  } else if (alarm.name === ALARM_SYNC) {
    await sync(s);
  }
  await update(s);
});

// klik notifikasi → buka popup tidak bisa, jadi cukup tutup
chrome.notifications.onClicked.addListener((id) => void chrome.notifications.clear(id));

onSettingsChanged(async (s) => {
  await update(s);
  await sync(s);
  await update(s);
});
onCacheChanged(() => void update());

// service worker bisa dibangunkan tanpa onStartup (mis. setelah reload) → pastikan badge ada
void (async () => {
  const alarms = await chrome.alarms.getAll();
  if (!alarms.some((a) => a.name === ALARM_TICK)) await setup();
  else await update();
})();
