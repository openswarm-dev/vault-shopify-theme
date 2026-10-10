// Packages ./theme into dist/vault-theme.zip (upload via Online Store → Themes → Add theme → Upload zip file).
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const theme = resolve(root, 'theme');
const dist = resolve(root, 'dist');
const zip = resolve(dist, 'vault-theme.zip');
const folders = ['assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates'].filter((f) => existsSync(resolve(theme, f)));

mkdirSync(dist, { recursive: true });
rmSync(zip, { force: true });
// bsdtar ships with Windows 10+ and macOS; -a picks the format from the .zip extension.
execFileSync('tar', ['-a', '-c', '-f', zip, '-C', theme, ...folders], { stdio: 'inherit' });
console.log(`✓ ${zip} (${(statSync(zip).size / 1024).toFixed(0)} KB)`);
