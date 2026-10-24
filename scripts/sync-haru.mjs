// Copies Haru's portrait screen (the rig on her vertical monitor) from haru-desktop into haru/, verbatim and in
// the same layout (haru/src, haru/build/portrait), so its relative imports resolve untouched. Run it again
// whenever her portrait changes:  node scripts/sync-haru.mjs [path to haru-desktop]
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = process.argv[2] ?? path.join(process.env.APPDATA ?? '', 'Microsoft/Windows/Network Shortcuts/haru-desktop-master/haru-desktop-master');
const target = path.join(here, '../haru');
const code = ['src/PortraitWindow.tsx', 'src/portraitRig.ts', 'src/portraitHair.ts', 'src/portraitTerminal.ts', 'src/portrait.css', 'src/types.ts', 'src/companion/mouth.ts'];
if (!existsSync(path.join(source, code[0]))) throw new Error(`No haru-desktop at ${source}`);

// The art is whatever the code imports from build/portrait, plus the mouth sprites it globs.
const art = new Set(['build/portrait/mouth-sprites']);
for (const file of code) {
  for (const [, ref] of readFileSync(path.join(source, file), 'utf8').matchAll(/from '(\.\.\/build\/portrait\/[^']+)'/g)) {
    art.add(path.posix.join(path.posix.dirname(file), ref));
  }
}
rmSync(target, { recursive: true, force: true });
for (const file of [...code, ...art]) {
  mkdirSync(path.dirname(path.join(target, file)), { recursive: true });
  cpSync(path.join(source, file), path.join(target, file), { recursive: true });
}
console.log(`Copied ${code.length} source files and ${art.size} art entries from ${source}`);
