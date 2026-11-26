/** Helper tampilan bersama popup & jendela PiP extension. */
import { formatClock, formatCountdown, tzLabel, ymdInTz, type YMD } from '../../src/lib/prayTimes';
import { getNextPrayer, getPrevPrayer } from '../../src/lib/schedule';
import type { PipData } from '../../src/scripts/pip';
import type { Settings } from './core';

export const ARRIVED_WINDOW_MS = 15 * 60_000;

export const ymdUtc = (d: YMD) => new Date(Date.UTC(d.y, d.m - 1, d.d));
export const fmtMasehi = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});
export const fmtHijri = (() => {
  try {
    return new Intl.DateTimeFormat('id-ID-u-ca-islamic-umalqura', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
  } catch {
    return null;
  }
})();
export const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function countdownState(s: Settings, now = Date.now()) {
  const next = getNextPrayer(now, s.loc, s.corr);
  const prev = getPrevPrayer(now, s.loc, s.corr);
  const span = next.time.getTime() - prev.time.getTime();
  const progress = span > 0 ? Math.min(1, Math.max(0, (now - prev.time.getTime()) / span)) : 0;
  const arrived = now - prev.time.getTime() < ARRIVED_WINDOW_MS ? prev : null;
  return { now, today: ymdInTz(now, s.loc.tz), next, prev, progress, arrived, jumatan: next.name === 'Jumatan' };
}

export function pipDataFor(s: Settings): PipData {
  const st = countdownState(s);
  return {
    label: `Menuju ${st.next.name}`,
    countdown: formatCountdown(st.next.time.getTime() - st.now),
    sub: `${formatClock(st.next.time, s.loc.tz)} ${tzLabel(s.loc.tz)} · ${s.loc.name}`,
    note: st.arrived ? `Waktu ${st.arrived.name} telah masuk` : '',
    progress: st.progress,
    friday: st.jumatan,
  };
}
