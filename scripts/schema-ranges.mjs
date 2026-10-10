// Range-setting rules Shopify enforces on upload but Theme Check does not:
// (max - min) / step ≤ 101, unit ≤ 3 characters, and every default / stored value inside the range and on a step.
// Covers config/settings_schema.json (+ settings_data.json), section schemas (settings, blocks, presets) and the
// values saved in templates/*.json and section groups. Returns offenses shaped like Theme Check's.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const CHECK = 'SchemaRangeStep';
const onStep = (v, min, step) => {
  const n = (v - min) / step;
  return Math.abs(n - Math.round(n)) < 1e-9;
};
const stripComments = (text) => text.replace(/^\s*\/\*[\s\S]*?\*\/\s*/, '');

export function schemaRangeOffenses(themeRoot) {
  const offenses = [];
  const lineOf = (text, needle) => {
    const i = needle ? text.indexOf(needle) : -1;
    return i < 0 ? 0 : text.slice(0, i).split('\n').length - 1;
  };
  const report = (file, text, needle, message) => offenses.push({
    check: CHECK,
    severity: 0,
    uri: pathToFileURL(join(themeRoot, file)).href,
    start: { line: lineOf(text, needle) },
    message,
  });

  const checkDefinition = (file, text, where, s) => {
    if (!s || s.type !== 'range') return;
    const { id, min, max, step = 1, unit } = s;
    const needle = `"id": "${id}"`;
    if (typeof min !== 'number' || typeof max !== 'number' || !(step > 0)) {
      report(file, text, needle, `${where}: range "${id}" needs numeric min, max and a positive step`);
      return;
    }
    if ((max - min) / step > 101) report(file, text, needle, `${where}: range "${id}" has ${(max - min) / step} steps (max 101)`);
    if (unit && unit.length > 3) report(file, text, needle, `${where}: range "${id}" unit "${unit}" is longer than 3 characters`);
    if (typeof s.default !== 'number') report(file, text, needle, `${where}: range "${id}" needs a numeric default`);
    else if (s.default < min || s.default > max || !onStep(s.default, min, step)) {
      report(file, text, needle, `${where}: range "${id}" default ${s.default} is not a step of ${min}–${max} (step ${step})`);
    }
  };
  const checkValue = (file, text, where, s, value) => {
    if (!s || s.type !== 'range' || typeof value !== 'number') return;
    const { id, min, max, step = 1 } = s;
    if (value < min || value > max || !onStep(value, min, step)) {
      report(file, text, `"${id}": ${value}`, `${where}: "${id}" = ${value} is not a step of ${min}–${max} (step ${step})`);
    }
  };
  const checkValues = (file, text, where, defs, values) => {
    if (!values) return;
    for (const s of defs || []) checkValue(file, text, where, s, values[s.id]);
  };

  // Global settings
  const schemaFile = 'config/settings_schema.json';
  if (existsSync(resolve(themeRoot, schemaFile))) {
    const text = readFileSync(resolve(themeRoot, schemaFile), 'utf8');
    const groups = JSON.parse(text);
    const defs = groups.flatMap((g) => g.settings || []);
    groups.forEach((g) => (g.settings || []).forEach((s) => checkDefinition(schemaFile, text, g.name, s)));
    const dataFile = 'config/settings_data.json';
    if (existsSync(resolve(themeRoot, dataFile))) {
      const dataText = readFileSync(resolve(themeRoot, dataFile), 'utf8');
      const data = JSON.parse(stripComments(dataText));
      checkValues(dataFile, dataText, 'current', defs, typeof data.current === 'object' ? data.current : null);
      Object.entries(data.presets || {}).forEach(([name, p]) => checkValues(dataFile, dataText, `preset "${name}"`, defs, p));
    }
  }

  // Section schemas
  const sections = new Map();
  const sectionsDir = resolve(themeRoot, 'sections');
  if (existsSync(sectionsDir)) {
    for (const f of readdirSync(sectionsDir).filter((n) => n.endsWith('.liquid'))) {
      const file = `sections/${f}`;
      const text = readFileSync(resolve(sectionsDir, f), 'utf8');
      const m = text.match(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/);
      if (!m) continue;
      let schema;
      try { schema = JSON.parse(m[1]); } catch (_) { continue; } // invalid JSON is Theme Check's job
      sections.set(f.replace(/\.liquid$/, ''), schema);
      (schema.settings || []).forEach((s) => checkDefinition(file, text, 'settings', s));
      const blockDefs = new Map((schema.blocks || []).map((b) => [b.type, b.settings || []]));
      (schema.blocks || []).forEach((b) => (b.settings || []).forEach((s) => checkDefinition(file, text, `block "${b.type}"`, s)));
      (schema.presets || []).forEach((p) => {
        checkValues(file, text, `preset "${p.name}"`, schema.settings, p.settings);
        const blocks = Array.isArray(p.blocks) ? p.blocks : Object.values(p.blocks || {});
        blocks.forEach((b) => checkValues(file, text, `preset "${p.name}" block "${b.type}"`, blockDefs.get(b.type), b.settings));
      });
    }
  }

  // Values stored in JSON templates and section groups
  const jsonFiles = [];
  const walk = (dir, rel) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(join(dir, entry.name), `${rel}/${entry.name}`);
      else if (entry.name.endsWith('.json')) jsonFiles.push(`${rel}/${entry.name}`);
    }
  };
  walk(resolve(themeRoot, 'templates'), 'templates');
  if (existsSync(sectionsDir)) readdirSync(sectionsDir).filter((n) => n.endsWith('.json')).forEach((n) => jsonFiles.push(`sections/${n}`));
  for (const file of jsonFiles) {
    const text = readFileSync(resolve(themeRoot, file), 'utf8');
    let json;
    try { json = JSON.parse(stripComments(text)); } catch (_) { continue; }
    for (const [key, sec] of Object.entries(json.sections || {})) {
      const schema = sections.get(sec?.type);
      if (!schema) continue;
      checkValues(file, text, `section "${key}"`, schema.settings, sec.settings);
      const blockDefs = new Map((schema.blocks || []).map((b) => [b.type, b.settings || []]));
      for (const [bKey, block] of Object.entries(sec.blocks || {})) {
        checkValues(file, text, `section "${key}" block "${bKey}"`, blockDefs.get(block?.type), block?.settings);
      }
    }
  }
  return offenses;
}
