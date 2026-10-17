/**
 * Packages the production build into a CrazyGames-ready upload archive.
 *
 * CrazyGames requires a ZIP whose ROOT contains `index.html` (no wrapping
 * folder) and that only references its files with relative paths. This script
 * verifies both before writing the archive.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, rmSync, mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'release');

// --- 1. sanity checks -------------------------------------------------------

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const indexPath = join(DIST, 'index.html');
if (!existsSync(indexPath)) {
  console.error('dist/index.html is missing — the upload would not run.');
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf-8');

// Any `src="/..."` or `href="/..."` would break once hosted under a sub-path.
const absoluteRefs = [...html.matchAll(/(?:src|href)\s*=\s*["'](\/[^"'/][^"']*)["']/g)].map((m) => m[1]);
if (absoluteRefs.length) {
  console.error('Absolute paths found in dist/index.html (must be relative):');
  absoluteRefs.forEach((r) => console.error('  ' + r));
  process.exit(1);
}

// Every local reference must actually exist inside the bundle.
const localRefs = [...html.matchAll(/(?:src|href)\s*=\s*["'](\.\/[^"']+)["']/g)].map((m) => m[1]);
for (const ref of localRefs) {
  const target = join(DIST, ref.replace(/^\.\//, ''));
  if (!existsSync(target)) {
    console.error(`dist/index.html references a missing file: ${ref}`);
    process.exit(1);
  }
}

// --- 2. collect files -------------------------------------------------------

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(DIST).sort();
const totalBytes = files.reduce((n, f) => n + statSync(f).size, 0);

// --- 3. report the platform limits -----------------------------------------

const LIMIT_TOTAL = 250 * 1024 * 1024;   // total file size
const LIMIT_INITIAL = 50 * 1024 * 1024;  // initial download
const LIMIT_FILES = 1500;

console.log('CrazyGames package');
console.log('  files        :', files.length, '/', LIMIT_FILES);
console.log('  total size   :', (totalBytes / 1024).toFixed(1), 'KB /', (LIMIT_TOTAL / 1024 / 1024), 'MB');
console.log('  initial dl   :', (totalBytes / 1024).toFixed(1), 'KB /', (LIMIT_INITIAL / 1024 / 1024), 'MB',
  '(mobile homepage needs <= 20MB)');

if (files.length > LIMIT_FILES) { console.error('  !! too many files'); process.exit(1); }
if (totalBytes > LIMIT_TOTAL) { console.error('  !! bundle too large'); process.exit(1); }

// --- 4. write the archive ---------------------------------------------------

// Only the archive is replaced — keep the rest of release/ (covers) intact.
const zipPath = join(OUT, 'hex-defender-last-core.zip');
if (existsSync(zipPath)) rmSync(zipPath);
mkdirSync(OUT, { recursive: true });

// Zip from inside dist/ so that index.html sits at the archive root.
execFileSync('zip', ['-r', '-q', zipPath, '.'], { cwd: DIST });

console.log('\n  archive      :', relative(ROOT, join(OUT, 'hex-defender-last-core.zip')));
console.log('\nArchive contents:');
execFileSync('unzip', ['-l', join(OUT, 'hex-defender-last-core.zip')], { stdio: 'inherit' });
