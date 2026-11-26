/**
 * Picture-in-Picture countdown.
 * 1) Document Picture-in-Picture API (Chrome/Edge desktop) → jendela HTML asli.
 * 2) Fallback: canvas → MediaStream → <video>.requestPictureInPicture()
 *    (Safari, Chrome Android, dll).
 */

export interface PipData {
  label: string; // "Menuju Ashar" / "Menuju Jumatan"
  countdown: string; // "01:23:45"
  sub: string; // "15:08 WIB · Jakarta"
  note: string; // "Waktu Dzuhur telah masuk" atau ""
  progress: number; // 0..1
  friday: boolean;
}

type Mode = 'document' | 'video' | 'none';

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(opts?: { width?: number; height?: number }): Promise<Window>;
      window: Window | null;
    };
  }
}

export const pipMode: Mode =
  typeof window !== 'undefined' && 'documentPictureInPicture' in window
    ? 'document'
    : typeof document !== 'undefined' &&
        document.pictureInPictureEnabled &&
        'captureStream' in HTMLCanvasElement.prototype
      ? 'video'
      : 'none';

let getData: () => PipData = () => ({ label: '', countdown: '', sub: '', note: '', progress: 0, friday: false });
let onChange: (open: boolean) => void = () => {};

export function initPip(dataFn: () => PipData, changeFn: (open: boolean) => void) {
  getData = dataFn;
  onChange = changeFn;
  // Fallback video perlu disiapkan lebih dulu agar requestPictureInPicture()
  // dipanggil langsung di dalam user gesture (syarat Safari).
  if (pipMode === 'video') setupVideo();
}

export function isPipOpen() {
  return docWin !== null || (video !== null && document.pictureInPictureElement === video);
}

export async function togglePip() {
  if (isPipOpen()) return closePip();
  if (pipMode === 'document') return openDocumentPip();
  if (pipMode === 'video') return openVideoPip();
  throw new Error('Browser ini belum mendukung Picture-in-Picture.');
}

export function closePip() {
  if (docWin) docWin.close();
  if (video && document.pictureInPictureElement === video) void document.exitPictureInPicture();
}

/* ---------------- Document PiP ---------------- */

let docWin: Window | null = null;

const PIP_CSS = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: radial-gradient(120% 120% at 0% 0%, #0f5a45 0%, #062b22 60%, #031a15 100%);
    color: #ecfdf5; display: flex; flex-direction: column; justify-content: center;
    padding: 14px 18px; gap: 4px; overflow: hidden; user-select: none;
  }
  body.friday { background: radial-gradient(120% 120% at 0% 0%, #7a5a12 0%, #3b2a06 60%, #1f1603 100%); }
  .label { font-size: clamp(12px, 7vw, 22px); font-weight: 600; letter-spacing: .02em; color: #a7f3d0; }
  body.friday .label { color: #fde68a; }
  .cd { font-variant-numeric: tabular-nums; font-weight: 700; line-height: 1;
        font-size: clamp(28px, 22vw, 96px); letter-spacing: -.02em; }
  .sub { font-size: clamp(11px, 5vw, 16px); opacity: .8; }
  .note { font-size: clamp(11px, 4.5vw, 14px); color: #fde68a; min-height: 1em; }
  .bar { height: 4px; border-radius: 4px; background: rgba(255,255,255,.15); margin-top: 6px; overflow: hidden; }
  .bar > i { display: block; height: 100%; background: currentColor; color: #34d399; transition: width 1s linear; }
  body.friday .bar > i { color: #fbbf24; }
`;

async function openDocumentPip() {
  const win = await window.documentPictureInPicture!.requestWindow({ width: 340, height: 190 });
  docWin = win;
  const doc = win.document;
  doc.title = 'Countdown Salat';
  const style = doc.createElement('style');
  style.textContent = PIP_CSS;
  doc.head.append(style);
  doc.body.innerHTML = `
    <div class="label"></div>
    <div class="cd"></div>
    <div class="sub"></div>
    <div class="note"></div>
    <div class="bar"><i></i></div>`;
  const $ = (s: string) => doc.querySelector(s) as HTMLElement;
  const render = () => {
    const d = getData();
    doc.body.classList.toggle('friday', d.friday);
    $('.label').textContent = d.label;
    $('.cd').textContent = d.countdown;
    $('.sub').textContent = d.sub;
    $('.note').textContent = d.note;
    $('.bar > i').style.width = `${(d.progress * 100).toFixed(2)}%`;
  };
  render();
  // Timer milik jendela PiP sendiri: tetap jalan walau tab utama di background.
  const timer = win.setInterval(render, 1000);
  win.addEventListener('pagehide', () => {
    win.clearInterval(timer);
    docWin = null;
    onChange(false);
  });
  onChange(true);
}

/* ---------------- Video PiP (fallback) ---------------- */

let video: HTMLVideoElement | null = null;
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

const W = 640;
const H = 360;

function setupVideo() {
  canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  ctx = canvas.getContext('2d');
  drawCanvas();

  video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = canvas.captureStream();
  // Harus ada di DOM (Safari), tapi tidak terlihat.
  Object.assign(video.style, {
    position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', bottom: '0', right: '0',
  });
  document.body.append(video);
  void video.play().catch(() => {});

  setInterval(drawCanvas, 1000);
  video.addEventListener('enterpictureinpicture', () => onChange(true));
  video.addEventListener('leavepictureinpicture', () => onChange(false));
}

async function openVideoPip() {
  if (!video) setupVideo();
  drawCanvas();
  if (video!.paused) await video!.play();
  await video!.requestPictureInPicture();
}

function drawCanvas() {
  if (!ctx) return;
  const d = getData();
  const g = ctx.createLinearGradient(0, 0, W, H);
  if (d.friday) {
    g.addColorStop(0, '#7a5a12');
    g.addColorStop(1, '#1f1603');
  } else {
    g.addColorStop(0, '#0f5a45');
    g.addColorStop(1, '#031a15');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const font = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const x = 40;

  ctx.fillStyle = d.friday ? '#fde68a' : '#a7f3d0';
  ctx.font = `600 34px ${font}`;
  ctx.fillText(d.label, x, 84);

  ctx.fillStyle = '#ecfdf5';
  let size = 132;
  ctx.font = `700 ${size}px ${font}`;
  const maxW = W - 2 * x;
  const w = ctx.measureText(d.countdown).width;
  if (w > maxW) {
    size = Math.floor((size * maxW) / w);
    ctx.font = `700 ${size}px ${font}`;
  }
  ctx.fillText(d.countdown, x - 4, 210);

  ctx.globalAlpha = 0.8;
  ctx.font = `400 26px ${font}`;
  ctx.fillText(d.sub, x, 260);
  ctx.globalAlpha = 1;

  if (d.note) {
    ctx.fillStyle = '#fde68a';
    ctx.font = `500 24px ${font}`;
    ctx.fillText(d.note, x, 296);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x, 318, W - 2 * x, 8);
  ctx.fillStyle = d.friday ? '#fbbf24' : '#34d399';
  ctx.fillRect(x, 318, (W - 2 * x) * d.progress, 8);
}
