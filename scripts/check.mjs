// Runs Shopify Theme Check against ./theme and prints a compact report.
// Usage: node scripts/check.mjs [--json] [--all]   (--all includes info-level offenses)
import { check } from '@shopify/theme-check-node';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const themeRoot = resolve(fileURLToPath(new URL('../theme', import.meta.url)));
const args = process.argv.slice(2);
const SEVERITY = ['error', 'warning', 'info'];

const offenses = await check(themeRoot);
const shown = offenses.filter((o) => args.includes('--all') || o.severity < 2);

if (args.includes('--json')) {
  console.log(JSON.stringify(shown.map((o) => ({
    check: o.check,
    severity: SEVERITY[o.severity],
    file: relative(themeRoot, fileURLToPath(o.uri)).replace(/\\/g, '/'),
    line: (o.start?.line ?? 0) + 1,
    message: o.message,
  })), null, 2));
} else {
  const byFile = new Map();
  for (const o of shown) {
    const file = relative(themeRoot, fileURLToPath(o.uri)).replace(/\\/g, '/');
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(o);
  }
  for (const [file, list] of [...byFile].sort()) {
    console.log(`\n${file}`);
    for (const o of list.sort((a, b) => (a.start?.line ?? 0) - (b.start?.line ?? 0))) {
      console.log(`  ${String((o.start?.line ?? 0) + 1).padStart(4)}  ${SEVERITY[o.severity].padEnd(7)} ${o.check}: ${o.message}`);
    }
  }
  const errors = shown.filter((o) => o.severity === 0).length;
  const warnings = shown.filter((o) => o.severity === 1).length;
  console.log(`\n${errors} error(s), ${warnings} warning(s) across ${byFile.size} file(s)`);
  if (errors) process.exitCode = 1;
}
