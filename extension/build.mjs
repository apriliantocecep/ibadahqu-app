// Build Chrome extension → extension/dist (Load unpacked) + jadwal-ibadah-extension.zip
import { build } from 'esbuild';
import { cp, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(path.join(root, 'static'), dist, { recursive: true });
await cp(path.join(root, 'icons'), path.join(dist, 'icons'), { recursive: true });

await build({
  entryPoints: {
    background: path.join(root, 'src/background.ts'),
    popup: path.join(root, 'src/popup.ts'),
    pip: path.join(root, 'src/pip-page.ts'),
  },
  outdir: dist,
  bundle: true,
  format: 'esm',
  target: 'chrome116',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
});

if (!watch) {
  try {
    const zip = path.join(root, 'jadwal-ibadah-extension.zip');
    await rm(zip, { force: true });
    execFileSync('zip', ['-qr', zip, '.'], { cwd: dist });
    console.log('ZIP:', path.relative(process.cwd(), zip));
  } catch {
    console.log('(zip tidak tersedia, lewati pembuatan arsip)');
  }
}
