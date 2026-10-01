import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const srcDir = join(packageRoot, 'src');
const allowedPackages = ['@waypoint/shared'];

const forbiddenPatterns: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bDate\.now\s*\(/, reason: 'the caller passes the current time' },
  { pattern: /\bnew Date\s*\(\s*\)/, reason: 'the caller passes the current time' },
  { pattern: /\bMath\.random\s*\(/, reason: 'planning must be deterministic' },
  { pattern: /\bprocess\s*\./, reason: 'no environment or process access' },
  { pattern: /\bimport\.meta\.env\b/, reason: 'no environment access' },
  { pattern: /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b/, reason: 'no HTTP' },
  {
    pattern: /\b(window|document|navigator|localStorage|sessionStorage|indexedDB)\b/,
    reason: 'no browser APIs',
  },
];

const importSpecifier = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g;

function sourceFiles(): string[] {
  return readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .map((file) => join('src', file));
}

function isAllowedImport(specifier: string): boolean {
  return (
    specifier.startsWith('.') ||
    allowedPackages.some((name) => specifier === name || specifier.startsWith(`${name}/`))
  );
}

// Comments and quoted text may say "delivery window". `outlet.window` is that field, not the browser global.
function inspectableSource(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '""')
    .replace(/'(?:\\.|[^'\n])*'/g, '""')
    .replace(/"(?:\\.|[^"\n])*"/g, '""')
    .replace(/\.window\b/g, '.deliveryHours');
}

describe('planning package purity', () => {
  const files = sourceFiles();

  it('finds source files to inspect', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s imports only relative modules and @waypoint/shared', (file) => {
    const source = readFileSync(join(packageRoot, file), 'utf8');
    const imports = [...source.matchAll(importSpecifier)].map((match) => match[1] ?? '');
    expect(imports.filter((specifier) => !isAllowedImport(specifier))).toEqual([]);
  });

  it.each(files)('%s avoids clocks, randomness, environment, HTTP and browser APIs', (file) => {
    const source = inspectableSource(readFileSync(join(packageRoot, file), 'utf8'));
    const violations = forbiddenPatterns
      .filter(({ pattern }) => pattern.test(source))
      .map(({ pattern, reason }) => `${pattern.source}: ${reason}`);
    expect(violations).toEqual([]);
  });

  it('still flags the browser window global and ignores the outlet field', () => {
    const flagged = inspectableSource('const view = window.document;');
    const allowed = inspectableSource('const close = outlet.window.close; // delivery window');
    const windowPattern = forbiddenPatterns.find((item) => item.reason === 'no browser APIs');
    expect(windowPattern?.pattern.test(flagged)).toBe(true);
    expect(windowPattern?.pattern.test(allowed)).toBe(false);
  });

  it('declares no runtime dependencies other than @waypoint/shared', () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies });
    expect(declared.filter((name) => !allowedPackages.includes(name))).toEqual([]);
  });
});
