import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const BASELINE_MIGRATION = '20260926193000_admin_media_review_v1.sql';
export const MIGRATIONS_DIR = 'supabase/migrations';

const FILE_NAME_RE = /^\d{14}_[A-Za-z0-9_]+\.sql$/;

function removeCommentsAndSingleQuotedStrings(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''");
}

function removeDollarQuotedBodies(sql) {
  return sql
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/g, ' ')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ');
}

function normalize(sql) {
  return sql.replace(/\s+/g, ' ').trim().toUpperCase();
}

export function findDestructiveSql(sql) {
  const withoutCommentsOrStrings = removeCommentsAndSingleQuotedStrings(sql);
  const ddlSurface = normalize(withoutCommentsOrStrings);
  const topLevelSurface = normalize(removeDollarQuotedBodies(withoutCommentsOrStrings));
  const findings = [];

  const rules = [
    ['DROP_TABLE', /\bDROP\s+TABLE\b/],
    ['DROP_SCHEMA', /\bDROP\s+SCHEMA\b/],
    ['TRUNCATE', /\bTRUNCATE(?:\s+TABLE)?\b/],
    ['DROP_COLUMN', /\bALTER\s+TABLE\b[\s\S]{0,800}?\bDROP\s+COLUMN\b/],
    ['DROP_DATABASE', /\bDROP\s+DATABASE\b/],
  ];

  for (const [code, pattern] of rules) {
    if (pattern.test(ddlSurface)) findings.push(code);
  }

  // Migration-time row deletion is prohibited. Function/procedure bodies are excluded
  // because domain commands can legitimately implement explicit user-driven deletion.
  if (/\bDELETE\s+FROM\b/.test(topLevelSurface)) findings.push('DELETE_FROM');

  return [...new Set(findings)];
}

export function validateAddedMigration(filePath, sql) {
  const name = path.basename(filePath);
  const violations = [];

  if (!FILE_NAME_RE.test(name)) {
    violations.push(`MIGRATION_FILENAME_INVALID:${filePath}`);
  }

  for (const code of findDestructiveSql(sql)) {
    violations.push(`${code}:${filePath}`);
  }

  return violations;
}

export function validateMigrationDiff(diffText, readFile = (filePath) => fs.readFileSync(filePath, 'utf8')) {
  const violations = [];
  const lines = diffText.split(/\r?\n/).filter(Boolean);

  for (const line of lines) {
    const parts = line.split('\t');
    const status = parts[0] || '';

    if (status !== 'A') {
      const touched = parts.slice(1).join(' -> ') || '(unknown)';
      violations.push(`HISTORICAL_MIGRATION_IMMUTABLE:${status}:${touched}`);
      continue;
    }

    const filePath = parts[1];
    if (!filePath?.endsWith('.sql')) continue;
    violations.push(...validateAddedMigration(filePath, readFile(filePath)));
  }

  return violations;
}

export function scanFutureMigrations({ migrationsDir = MIGRATIONS_DIR, baseline = BASELINE_MIGRATION } = {}) {
  if (!fs.existsSync(migrationsDir)) return [];

  const violations = [];
  const files = fs.readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql') && name > baseline)
    .sort();

  for (const name of files) {
    const filePath = path.join(migrationsDir, name);
    violations.push(...validateAddedMigration(filePath, fs.readFileSync(filePath, 'utf8')));
  }

  return violations;
}

export function gitMigrationDiff(baseSha, headSha) {
  return execFileSync(
    'git',
    ['diff', '--name-status', '--find-renames', baseSha, headSha, '--', `${MIGRATIONS_DIR}/`],
    { encoding: 'utf8' },
  );
}

export function enforceMigrationSafety({ baseSha, headSha } = {}) {
  const violations = [];

  if (baseSha && headSha) {
    violations.push(...validateMigrationDiff(gitMigrationDiff(baseSha, headSha)));
  }

  violations.push(...scanFutureMigrations());

  if (violations.length) {
    const unique = [...new Set(violations)];
    throw new Error(`IBERFIT_DATA_SAFETY_GATE_FAILED\n${unique.join('\n')}`);
  }

  return { ok: true, baseline: BASELINE_MIGRATION };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const [baseSha, headSha] = process.argv.slice(2);
  const result = enforceMigrationSafety({ baseSha, headSha });
  console.log(`IBERFIT_DATA_SAFETY_GATE_OK baseline=${result.baseline}`);
}
