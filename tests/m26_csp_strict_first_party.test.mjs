import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import {extname, join, relative, sep} from 'node:path';

const ROOT = process.cwd();
const SCAN_ROOTS = ['src/m26', 'public/m26'];
const ALLOWED_EXTENSIONS = new Set(['.js', '.mjs', '.html']);
const EXCLUDED_PATH_SEGMENTS = new Set(['vendor']);

const RULES = [
  ['style-element', /<style(?:\s|>)/i],
  ['style-attribute', /<[^>\n]*\sstyle\s*=/i],
  ['dom-style-property', /\.style(?:\s*=|\s*\.|\s*\[)/],
  ['setAttribute-style', /\.setAttribute\(\s*['"]style['"]/],
  ['runtime-style-element', /createElement\(\s*['"]style['"]\s*\)/],
  ['runtime-insertRule', /\.insertRule\s*\(/],
  ['constructable-stylesheet', /\bnew\s+CSSStyleSheet\s*\(/],
  ['adopted-stylesheets', /\.adoptedStyleSheets\s*=/],
];

function isExcluded(path) {
  return path.split(sep).some((segment) => EXCLUDED_PATH_SEGMENTS.has(segment));
}

async function collectFiles(path, output = []) {
  if (isExcluded(path)) return output;
  for (const entry of await readdir(path, {withFileTypes: true})) {
    const absolute = join(path, entry.name);
    if (isExcluded(absolute)) continue;
    if (entry.isDirectory()) {
      await collectFiles(absolute, output);
      continue;
    }
    if (entry.isFile() && ALLOWED_EXTENSIONS.has(extname(entry.name))) output.push(absolute);
  }
  return output;
}

function lineMatches(content, file) {
  const hits = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    for (const [rule, pattern] of RULES) {
      if (!pattern.test(line)) continue;
      hits.push({
        file,
        line: index + 1,
        rule,
        snippet: line.trim().replace(/\s+/g, ' ').slice(0, 220),
      });
    }
  }
  return hits;
}

test('first-party runtime remains compatible with strict style-src CSP', async () => {
  const files = [];
  for (const root of SCAN_ROOTS) await collectFiles(join(ROOT, root), files);

  const hits = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    hits.push(...lineMatches(content, relative(ROOT, file)));
  }

  assert.deepEqual(
    hits,
    [],
    `Strict CSP forbids first-party inline/runtime CSS.\n${hits
      .map((hit) => `${hit.file}:${hit.line} [${hit.rule}] ${hit.snippet}`)
      .join('\n')}`
  );
});
