// Deep-merges src/locales/*.json into theme/locales/en.default.json.
// core.json is applied first; conflicting leaf values are reported and the first value wins.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'src', 'locales');
const out = join(root, 'theme', 'locales', 'en.default.json');

const files = readdirSync(srcDir)
  .filter((f) => f.endsWith('.json'))
  .sort((a, b) => (a === 'core.json' ? -1 : b === 'core.json' ? 1 : a.localeCompare(b)));

const conflicts = [];
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function merge(target, source, path, file) {
  for (const [key, value] of Object.entries(source)) {
    const p = path ? `${path}.${key}` : key;
    if (isObj(value)) {
      if (target[key] !== undefined && !isObj(target[key])) {
        conflicts.push(`${p}: object in ${file} vs string elsewhere`);
        continue;
      }
      target[key] = target[key] || {};
      merge(target[key], value, p, file);
    } else if (target[key] === undefined) {
      target[key] = value;
    } else if (target[key] !== value) {
      conflicts.push(`${p}: "${target[key]}" kept, "${value}" from ${file} ignored`);
    }
  }
}

const result = {};
for (const f of files) {
  let json;
  try {
    json = JSON.parse(readFileSync(join(srcDir, f), 'utf8'));
  } catch (err) {
    console.error(`✗ ${f}: invalid JSON — ${err.message}`);
    process.exitCode = 1;
    continue;
  }
  merge(result, json, '', f);
}

writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(`✓ Merged ${files.length} locale files → theme/locales/en.default.json`);
if (conflicts.length) {
  console.warn(`⚠ ${conflicts.length} conflict(s):`);
  conflicts.forEach((c) => console.warn(`  - ${c}`));
}
