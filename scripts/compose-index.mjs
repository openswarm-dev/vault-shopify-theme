// Composes theme/templates/index.json from src/index-fragments/*.json.
// Fragment shape: { "order_hint"?: n, "sections": { "<key>": { "order_hint"?: n, "type", "settings", "blocks", "block_order", "disabled"? } } }
// A section's own order_hint wins over the fragment-level one. Lower numbers render first.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src', 'index-fragments');
const out = join(root, 'theme', 'templates', 'index.json');
const sectionsDir = join(root, 'theme', 'sections');

const entries = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  let json;
  try {
    json = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  } catch (err) {
    console.error(`✗ ${file}: ${err.message}`);
    process.exitCode = 1;
    continue;
  }
  const fragmentHint = Number(json.order_hint ?? 500);
  for (const [key, section] of Object.entries(json.sections || {})) {
    const { order_hint: hint, ...rest } = section;
    entries.push({ key, file, hint: Number(hint ?? fragmentHint), section: rest });
  }
}

entries.sort((a, b) => a.hint - b.hint || a.key.localeCompare(b.key));
const sections = {};
const order = [];
for (const e of entries) {
  if (sections[e.key]) {
    console.error(`✗ duplicate section key "${e.key}" (${e.file})`);
    process.exitCode = 1;
    continue;
  }
  if (!existsSync(join(sectionsDir, `${e.section.type}.liquid`))) {
    console.warn(`⚠ "${e.key}" uses missing section type "${e.section.type}" (${e.file}) — skipped`);
    continue;
  }
  sections[e.key] = e.section;
  order.push(e.key);
}

writeFileSync(out, `${JSON.stringify({ sections, order }, null, 2)}\n`);
console.log(`✓ templates/index.json: ${order.map((k, i) => `${i + 1}.${sections[k].type}`).join('  ')}`);
