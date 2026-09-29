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

function removeRoutineBodies(sql) {
  // Explicit function/procedure bodies may contain user-driven DELETE logic. Keep
  // their DDL headers visible, but hide only the body from migration-time DML checks.
  // Anonymous DO blocks are intentionally NOT hidden: they execute during migration
  // and are rejected below because they can conceal arbitrary dynamic/destructive SQL.
  const routineRe = /\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\b[\s\S]*?(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)[\s\S]*?\1/gi;
  return sql.replace(routineRe, (match, delimiter) => {
    const bodyStart = match.indexOf(delimiter);
    return bodyStart >= 0 ? `${match.slice(0, bodyStart)}${delimiter}${delimiter}` : match;
  });
}

function normalize(sql) {
  return sql.replace(/\s+/g, ' ').trim().toUpperCase();
}

export function findDestructiveSql(sql) {
  const withoutCommentsOrStrings = removeCommentsAndSingleQuotedStrings(sql);
  const routineMaskedSurface = normalize(removeRoutineBodies(withoutCommentsOrStrings));
  const ddlSurface = normalize(withoutCommentsOrStrings);
  const findings = [];

  const rules = [
    ['DROP_TABLE', /\bDROP\s+TABLE\b/],
    ['DROP_SCHEMA', /\bDROP\s+SCHEMA\b/],
    ['TRUNCATE', /\bTRUNCATE(?:\s+TABLE)?\b/],
    ['DROP_COLUMN', /\bALTER\s+TABLE\b[^;]*\bDROP\s+COLUMN\b/],
    ['ALTER_COLUMN_TYPE', /\bALTER\s+TABLE\b[^;]*\bALTER\s+COLUMN\b[^;]*\b(?:TYPE|SET\s+DATA\s+TYPE)\b/],
    ['DROP_DATABASE', /\bDROP\s+DATABASE\b/],
    ['DROP_TYPE', /\bDROP\s+TYPE\b/],
    ['DROP_OWNED', /\bDROP\s+OWNED\b/],
    ['DROP_EXTENSION', /\bDROP\s+EXTENSION\b/],
  ];

  for (const [code, pattern] of rules) {
    if (pattern.test(ddlSurface)) findings.push(code);
  }

  // Migration-time row deletion is prohibited. Only explicit routine bodies are
  // excluded because they execute later under application authorization, not now.
  if (/\bDELETE\s+FROM\b/.test(routineMaskedSurface)) findings.push('DELETE_FROM');

  // Anonymous procedural blocks and CALL can execute arbitrary side effects and can
  // hide destructive SQL behind dynamic EXECUTE strings. Fail closed and require a
  // separately reviewed/backfilled path instead of allowing them in schema migration.
  if (/\bDO\s+(?:LANGUAGE\s+[A-Z_][A-Z0-9_]*\s+)?(?:\$[A-Z_][A-Z0-9_]*\$|\$\$)/.test(routineMaskedSurface)) {
    findings.push('ANONYMOUS_DO_BLOCK');
  }
  if (/\bCALL\s+[A-Z_][A-Z0-9_.]*\s*\(/.test(routineMaskedSurface)) findings.push('CALL_STATEMENT');

  // PostgreSQL 17 MERGE may delete matched rows.
  if (/\bMERGE\b[^;]*\bTHEN\s+DELETE\b/.test(routineMaskedSurface)) findings.push('MERGE_DELETE');

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
