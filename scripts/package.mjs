// Packages ./theme into dist/vault-theme.zip (upload via Online Store → Themes → Add theme → Upload zip file).
// Writes the ZIP itself (Node zlib) instead of shelling out to `tar`: Git Bash and Linux resolve `tar` to GNU tar,
// which ignores `-a` and silently writes a POSIX tar named .zip that Shopify rejects. Entry names always use
// forward slashes with the theme folders at the archive root (layout/theme.liquid, …), as Shopify expects.
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync, crc32 } from 'node:zlib';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const theme = resolve(root, 'theme');
const dist = resolve(root, 'dist');
const zip = resolve(dist, 'vault-theme.zip');
const FOLDERS = ['assets', 'config', 'layout', 'locales', 'sections', 'snippets', 'templates', 'blocks'];
const JUNK = /^(\..*|Thumbs\.db|desktop\.ini)$/i;

const files = [];
const walk = (dir, rel) => {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (JUNK.test(entry.name)) continue;
    const abs = join(dir, entry.name);
    const name = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(abs, name);
    else if (entry.isFile()) files.push({ abs, name });
  }
};
for (const folder of FOLDERS) {
  try {
    if (statSync(resolve(theme, folder)).isDirectory()) walk(resolve(theme, folder), folder);
  } catch (_) { /* folder not present */ }
}
if (!files.some((f) => f.name === 'layout/theme.liquid')) throw new Error('theme/layout/theme.liquid is missing — nothing to package');

const dosDateTime = (date) => {
  const d = date.getFullYear() < 1980 ? new Date(1980, 0, 1) : date;
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
};

const chunks = [];
const central = [];
let offset = 0;
for (const { abs, name } of files) {
  const data = readFileSync(abs);
  const deflated = deflateRawSync(data, { level: 9 });
  const stored = deflated.length >= data.length;
  const body = stored ? data : deflated;
  const nameBuf = Buffer.from(name, 'utf8');
  const crc = crc32(data);
  const { time, date } = dosDateTime(statSync(abs).mtime);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(stored ? 0 : 8, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4); // made by (MS-DOS attrs)
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(stored ? 0 : 8, 10);
  cd.writeUInt16LE(time, 12);
  cd.writeUInt16LE(date, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(body.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt32LE(offset, 42);

  chunks.push(local, nameBuf, body);
  central.push(cd, nameBuf);
  offset += local.length + nameBuf.length + body.length;
  if (offset > 0xffffffff || files.length > 0xffff) throw new Error('Theme too large for a non-ZIP64 archive');
}
const cdBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdBuf.length, 12);
end.writeUInt32LE(offset, 16);

mkdirSync(dist, { recursive: true });
writeFileSync(zip, Buffer.concat([...chunks, cdBuf, end]));
console.log(`✓ ${zip} (${files.length} files, ${(statSync(zip).size / 1024).toFixed(0)} KB)`);
