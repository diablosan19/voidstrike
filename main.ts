// VOIDSTRIKE hand-in program (Node 22, standard library only, erasable TypeScript).
//
// What lands in the output directory is a static browser game (game/), its screenshots
// (screenshots/) and dossier.json, the machine-readable summary the make.fun judge scores.
// This program refuses to hand in a broken entry: it validates the package first, and only
// when every check passes does it copy anything. A failed run writes nothing at all.
//
//   MAKEFUN_OUTPUT_DIR=<dir> node main.ts     # <dir> defaults to /output
//
// Alongside dossier.json the run leaves build-manifest.json, an inventory of the packaged
// files with their sizes, so a human can see at a glance exactly what was handed in.

import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The scorer's caps, mirrored from the bounty's gate so a package that would be refused
// at judging time is refused here instead, before a single byte is copied.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

/** A packaging problem worth stopping for: the message says what is wrong and where. */
class PackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackageError';
  }
}

/** One file found under game/: its path relative to game/ (POSIX separators) and its size. */
interface GameFileInfo {
  rel: string;
  bytes: number;
}

/** Everything the preflight learns about game/ in one walk. */
interface GameInventory {
  files: GameFileInfo[];
  /** Files and directories together: the count the platform's entry cap is charged on. */
  entries: number;
  totalBytes: number;
}

const utf8Bytes = (s: string): number => Buffer.byteLength(s, 'utf8');

/**
 * Walk game/ once, recording every file's relative path and size. Directories are counted
 * (they count against the entry cap) but not listed. Links and other special files are
 * rejected on sight: the dossier refuses them too, and a link could smuggle in content
 * from outside the package.
 */
function inventoryGame(gameDir: string): GameInventory {
  if (!existsSync(gameDir)) throw new PackageError('game/: no such directory beside main.ts');
  const files: GameFileInfo[] = [];
  let entries = 0;
  let totalBytes = 0;
  const pending: string[] = [''];
  while (pending.length > 0) {
    const rel = pending.pop()!;
    const dir = rel === '' ? gameDir : join(gameDir, rel);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      entries += 1;
      if (entry.isDirectory()) {
        pending.push(childRel);
        continue;
      }
      if (!entry.isFile()) {
        throw new PackageError(`game/${childRel}: not a plain file (links and special files are not packaged)`);
      }
      const size = lstatSync(join(gameDir, childRel)).size;
      files.push({ rel: childRel, bytes: size });
      totalBytes += size;
    }
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return { files, entries, totalBytes };
}

/**
 * The game-side preflight: the page must be there, no path or size may exceed the caps the
 * scorer enforces, and the totals must fit. Returns the inventory so later steps reuse the
 * one walk instead of re-reading the tree.
 */
function checkGame(gameDir: string): GameInventory {
  const inv = inventoryGame(gameDir);
  if (!inv.files.some((f) => f.rel === 'index.html')) {
    throw new PackageError('game/index.html: missing (a game is static files with index.html at the root of game/)');
  }
  for (const f of inv.files) {
    const pathBytes = utf8Bytes(f.rel);
    if (pathBytes > CAPS.game_path_max_bytes) {
      throw new PackageError(`game/${f.rel}: path is ${pathBytes} bytes, over the ${CAPS.game_path_max_bytes} allowed`);
    }
  }
  if (inv.entries > CAPS.game_max_files) {
    throw new PackageError(`game/: ${inv.entries} files and directories, over the ${CAPS.game_max_files} allowed`);
  }
  if (inv.totalBytes > CAPS.game_max_bytes) {
    throw new PackageError(`game/: files total ${inv.totalBytes} bytes, over the ${CAPS.game_max_bytes} allowed`);
  }
  return inv;
}

/**
 * The screenshot-side preflight: shots.json (beside main.ts) names the shots the entry
 * presents, and each named file must actually sit in screenshots/ within the byte cap.
 * A name is a plain file name, never a path: anything with a separator in it is refused
 * rather than resolved, so a stray entry cannot point outside screenshots/.
 */
function checkScreenshots(root: string): string[] {
  const shotsFile = join(root, 'shots.json');
  if (!existsSync(shotsFile)) throw new PackageError('shots.json: missing beside main.ts');
  let named: unknown;
  try {
    named = JSON.parse(readFileSync(shotsFile, 'utf8'));
  } catch (err) {
    throw new PackageError(`shots.json: not valid JSON (${(err as Error).message})`);
  }
  if (!Array.isArray(named)) throw new PackageError('shots.json: expected an array of shot entries');
  const names: string[] = [];
  for (const item of named) {
    const name = (item as { name?: unknown } | null)?.name;
    if (typeof name !== 'string' || name === '' || name.includes('/') || name.includes('\\')) {
      throw new PackageError(`shots.json: bad shot name ${JSON.stringify(name)} (a plain file name is required)`);
    }
    names.push(name);
  }
  if (names.length > CAPS.screenshots.max) {
    throw new PackageError(`shots.json: names ${names.length} shots, over the ${CAPS.screenshots.max} allowed`);
  }
  const shotsDir = join(root, 'screenshots');
  for (const name of names) {
    const file = join(shotsDir, name);
    if (!existsSync(file) || !lstatSync(file).isFile()) {
      throw new PackageError(`screenshots/${name}: named in shots.json but not present in screenshots/`);
    }
    const size = lstatSync(file).size;
    if (size > CAPS.screenshots.max_bytes) {
      throw new PackageError(`screenshots/${name}: ${size} bytes, over the ${CAPS.screenshots.max_bytes} allowed per screenshot`);
    }
  }
  return names;
}

/** One packaged file as the manifest records it: path relative to the output directory. */
interface ManifestEntry {
  path: string;
  bytes: number;
}

/** Measure one directory of the finished package (game/ or screenshots/) for the manifest. */
function measurePackaged(outDir: string, sub: string): ManifestEntry[] {
  const base = join(outDir, sub);
  const found: ManifestEntry[] = [];
  const pending: string[] = [''];
  while (pending.length > 0) {
    const rel = pending.pop()!;
    const dir = rel === '' ? base : join(base, rel);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) pending.push(childRel);
      else if (entry.isFile()) found.push({ path: `${sub}/${childRel}`, bytes: lstatSync(join(base, childRel)).size });
    }
  }
  return found;
}

/**
 * Write build-manifest.json: every packaged file (the game, the screenshots and
 * dossier.json itself) with its byte size, plus the totals. The manifest does not list
 * itself: its own size is not known until it is written, and a self-entry would be a lie
 * the moment the file changed.
 */
function writeManifest(outDir: string): { count: number; bytes: number } {
  const files = [...measurePackaged(outDir, 'game'), ...measurePackaged(outDir, 'screenshots')];
  files.push({ path: 'dossier.json', bytes: lstatSync(join(outDir, 'dossier.json')).size });
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  const manifest = { files, file_count: files.length, total_bytes: totalBytes };
  writeFileSync(join(outDir, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { count: files.length, bytes: totalBytes };
}

function main(): void {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  const gameDir = join(root, 'game');

  // Preflight, all of it before the output directory is touched. The dossier is also
  // built once against the source tree here: buildDossier refuses anything the scorer
  // would refuse, and running it now means such a refusal still leaves no partial
  // output behind. The bytes written later are built from the copied tree and are the
  // same, because the dossier is a pure function of the tree's contents.
  checkGame(gameDir);
  const shotNames = checkScreenshots(root);
  buildDossier(root, CAPS);

  mkdirSync(outDir, { recursive: true });
  cpSync(gameDir, join(outDir, 'game'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  if (existsSync(join(root, 'screenshots'))) {
    cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
  }

  writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, CAPS));
  const totals = writeManifest(outDir);

  console.log(
    `voidstrike: packaged ${totals.count} files (${totals.bytes} bytes) into ${outDir}${sep} ` +
      `(game/, ${shotNames.length} screenshots, dossier.json, build-manifest.json)`,
  );
}

try {
  main();
} catch (err) {
  console.error(`main.ts: packaging refused: ${(err as Error).message}`);
  process.exit(1);
}
