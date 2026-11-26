/**
 * Jendela kecil pembuka Picture-in-Picture.
 * Document PiP butuh klik pengguna & halaman pembuka harus tetap hidup,
 * jadi popup extension membuka jendela ini; setelah PiP terbuka jendela ini diminimalkan.
 */
import { initPip, isPipOpen, pipMode, togglePip } from '../../src/scripts/pip';
import { currentSettings, loadAll, onCacheChanged, onSettingsChanged, type Settings } from './core';
import { pipDataFor } from './ui';

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;

let s: Settings;

function render() {
  const d = pipDataFor(s);
  document.body.classList.toggle('friday', d.friday);
  $('#label').textContent = d.label;
  $('#cd').textContent = d.countdown;
  $('#sub').textContent = d.sub;
  document.title = `${d.countdown} · ${d.label.replace('Menuju ', '')}`;
}

(async () => {
  s = await loadAll();
  onSettingsChanged((n) => (s = n));
  onCacheChanged(() => (s = currentSettings()));
  render();
  setInterval(render, 1000);

  const btn = $('#start') as HTMLButtonElement;
  const hint = $('#hint');
  if (pipMode !== 'document') {
    btn.disabled = true;
    hint.textContent = 'Browser ini tidak mendukung Document Picture-in-Picture (butuh Chrome 116+).';
    return;
  }

  initPip(
    () => pipDataFor(s),
    async (open) => {
      btn.textContent = open ? 'Tutup Picture-in-Picture' : 'Buka Picture-in-Picture';
      const win = await chrome.windows.getCurrent();
      if (open && win.id !== undefined && win.type === 'popup') {
        await chrome.windows.update(win.id, { state: 'minimized' });
      } else if (!open && win.id !== undefined) {
        // PiP ditutup pengguna → tampilkan lagi jendela ini
        await chrome.windows.update(win.id, { state: 'normal', focused: true });
      }
    },
  );
  btn.addEventListener('click', async () => {
    try {
      await togglePip();
    } catch (e) {
      hint.textContent = e instanceof Error ? e.message : 'Gagal membuka Picture-in-Picture.';
    }
    btn.textContent = isPipOpen() ? 'Tutup Picture-in-Picture' : 'Buka Picture-in-Picture';
  });
  hint.textContent = 'Setelah PiP terbuka, jendela ini otomatis diminimalkan. Jangan ditutup agar PiP tetap tampil.';
})();
