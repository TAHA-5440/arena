/**
 * Records real gameplay from the game and encodes it to the two MP4s
 * CrazyGames requires:
 *
 *   Landscape  1920x1080 (16:9)
 *   Portrait    1080x1620 (2:3)
 *
 * The game source is TypeScript with enums, so it is bundled with esbuild
 * before running. Frames come from the real `Game.render()`.
 *
 *   node scripts/record-gameplay.mjs
 */
import { build } from 'esbuild';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

const ROOT = resolve(process.cwd());
const OUT = join(ROOT, 'release', 'videos');
const WORK = join(ROOT, '.recorder');

const FPS = 30;
const SECONDS = 16;
const FRAMES = FPS * SECONDS;

// --- bundle the recorder ----------------------------------------------------

console.log('Bundling the recorder...');
mkdirSync(WORK, { recursive: true });
const bundlePath = join(WORK, 'recorder.mjs');

await build({
  entryPoints: [join(ROOT, 'scripts', 'video', 'recorder.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: bundlePath,
  external: ['@napi-rs/canvas'],
  logLevel: 'warning',
});

const { record } = await import(pathToFileURL(bundlePath).href);

// --- record + encode --------------------------------------------------------

const TARGETS = [
  { name: 'preview-landscape', width: 1920, height: 1080, out: join(OUT, 'preview-landscape.mp4') },
  { name: 'preview-portrait', width: 1080, height: 1620, out: join(OUT, 'preview-portrait.mp4') },
  // 9:16 fallback — only needed if the portal ever insists on 16:9-only
  // phone framing. The spec asks for 2:3, so this is a spare.
  { name: 'preview-portrait-9x16', width: 1080, height: 1920, out: join(OUT, 'alt', 'preview-portrait-1080x1920.mp4') },
];

mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, 'alt'), { recursive: true });

for (const target of TARGETS) {
  const framesDir = join(WORK, `frames-${target.name}`);
  console.log(`\nRecording ${target.name} (${target.width}x${target.height}, ${FRAMES} frames @ ${FPS}fps)...`);

  const started = Date.now();
  await record({
    width: target.width,
    height: target.height,
    frames: FRAMES,
    fps: FPS,
    outDir: framesDir,
    wave: 20,               // THE NULL ARCHON — the final boss
  });
  console.log(`  simulated in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const outFile = target.out;
  console.log(`  encoding ${target.name}.mp4...`);
  execFileSync(ffmpegInstaller.path, [
    '-y',
    '-framerate', String(FPS),
    '-i', join(framesDir, 'f%05d.png'),
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outFile,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const size = statSync(outFile).size;
  console.log(`  done: ${(size / 1024 / 1024).toFixed(2)} MB`);
}

rmSync(WORK, { recursive: true, force: true });

// --- report -----------------------------------------------------------------

console.log('\nPreview videos:');
for (const f of ['preview-landscape.mp4', 'preview-portrait.mp4']) {
  const p = join(OUT, f);
  if (!existsSync(p)) { console.log(`  !! missing ${f}`); continue; }
  const probe = spawnSync(ffmpegInstaller.path, ['-hide_banner', '-i', p], { encoding: 'utf8' });
  const info = `${probe.stderr || ''}${probe.stdout || ''}`;
  const dur = /Duration: ([0-9:.]+)/.exec(info)?.[1] ?? '?';
  const res = /Video: .*?, ([0-9]+x[0-9]+)/.exec(info)?.[1] ?? '?';
  console.log(`  ${f}  ${res}  ${dur}  ${(statSync(p).size / 1024 / 1024).toFixed(2)} MB`);
}
