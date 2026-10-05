/**
 * Cada método HTTP debe tener @Roles o @Public en la clase o en el método.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = path.join(root, 'src');
const verb = /@(Get|Post|Put|Patch|Delete|Head|Options|All)\b/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

const gaps = [];
for (const file of walk(src)) {
  const text = fs.readFileSync(file, 'utf8');
  const classIdx = text.indexOf('export class ');
  const head = classIdx >= 0 ? text.slice(0, classIdx) : text;
  const classOk = /@Roles\b/.test(head) || /@Public\(\)/.test(head);
  const lines = text.split('\n');
  let window = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*@/.test(line) || /^\s*\/\//.test(line) || line.trim() === '') {
      window.push(line);
      if (window.length > 25) window.shift();
      continue;
    }
    const block = `${window.join('\n')}\n${line}`;
    if (verb.test(block)) {
      const methodOk = /@Roles\b/.test(block) || /@Public\(\)/.test(block);
      if (!classOk && !methodOk) {
        gaps.push(`${path.relative(root, file)}:${i + 1}`);
      }
    }
    window = [];
  }
}

if (gaps.length) {
  console.error(gaps.join('\n'));
  process.exit(1);
}
console.log('Rutas: cada método HTTP tiene @Roles o @Public');
