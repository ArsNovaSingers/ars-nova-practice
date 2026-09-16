// Builds the practice player into ../assets/player/.
//
// Why a bundle is committed: the plugin is installed from a GitHub release zip
// and WordPress has no build step, so the browser code must already be built.
// The optional @dawcore/* features we do not use (MIDI, WAM plugins, Faust) are
// replaced with a stub so they are not shipped.
//
// The recording worklet is loaded by the library with
//   new URL('./worklet/recording-processor.worklet.js', import.meta.url)
// so the worklet files are copied next to the bundle chunks.
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'assets', 'player');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const stub = join(here, 'stub.js');
await build({
  entryPoints: { player: join(here, 'player.js') },
  bundle: true,
  format: 'esm',
  splitting: true,
  minify: true,
  target: ['safari15', 'chrome100', 'firefox100'],
  outdir: out,
  legalComments: 'linked',
  alias: { '@dawcore/midi': stub, '@dawcore/wam': stub, '@dawcore/faust': stub },
  logLevel: 'info',
});

const wsrc = join(here, 'node_modules', '@waveform-playlist', 'worklets', 'dist', 'worklet');
mkdirSync(join(out, 'worklet'), { recursive: true });
for (const f of readdirSync(wsrc)) {
  if (f.endsWith('.worklet.js')) cpSync(join(wsrc, f), join(out, 'worklet', f));
}

// Licence texts of everything bundled (MIT / BSD), shipped beside the bundle.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const nm = join(here, 'node_modules');
const pkgs = [];
for (const name of readdirSync(nm)) {
  if (name.startsWith('.') || name === 'esbuild' || name.startsWith('@esbuild')) continue;
  if (name.startsWith('@')) {
    for (const sub of readdirSync(join(nm, name))) pkgs.push(name + '/' + sub);
  } else {
    pkgs.push(name);
  }
}
let text = 'Third-party software bundled in assets/player/ (built by player-src/build.mjs)\n\n';
for (const p of pkgs.sort()) {
  const dir = join(nm, p);
  const lic = readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));
  let meta = {};
  try { meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')); } catch (e) { /* ignore */ }
  text += '==== ' + p + ' ' + (meta.version || '') + ' — ' + (meta.license || 'see below') + ' ====\n';
  if (lic && existsSync(join(dir, lic))) text += readFileSync(join(dir, lic), 'utf8').trim() + '\n\n';
  else text += '(no licence file in the package)\n\n';
}
writeFileSync(join(out, 'THIRD-PARTY-LICENSES.txt'), text);
