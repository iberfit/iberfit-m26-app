import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findDestructiveSql,
  scanFutureMigrations,
  validateMigrationDiff,
} from '../scripts/data-safety/check_migration_safety.mjs';

test('data safety gate allows additive schema evolution', () => {
  const sql = `
    create table if not exists public.example_safe (
      id uuid primary key,
      note text
    );
    alter table public.example_safe add column if not exists created_at timestamptz;
    create index if not exists example_safe_created_at_idx on public.example_safe(created_at);
  `;
  assert.deepEqual(findDestructiveSql(sql), []);
});

test('data safety gate blocks destructive migration primitives', () => {
  assert.deepEqual(findDestructiveSql('drop table public.clients;'), ['DROP_TABLE']);
  assert.deepEqual(findDestructiveSql('truncate table public.sessions;'), ['TRUNCATE']);
  assert.deepEqual(findDestructiveSql('alter table public.clients drop column email;'), ['DROP_COLUMN']);
  assert.deepEqual(findDestructiveSql('delete from public.clients where id is not null;'), ['DELETE_FROM']);
});

test('data safety gate ignores destructive words in comments and literals', () => {
  const sql = `
    -- DROP TABLE public.clients;
    select 'DELETE FROM public.clients';
    /* TRUNCATE public.sessions; */
  `;
  assert.deepEqual(findDestructiveSql(sql), []);
});

test('data safety gate permits explicit domain deletion logic inside function bodies', () => {
  const sql = `
    create or replace function public.delete_one_client(p_id uuid)
    returns void
    language plpgsql
    as $$
    begin
      delete from public.clients where id = p_id;
    end;
    $$;
  `;
  assert.deepEqual(findDestructiveSql(sql), []);
});

test('historical migrations are append-only', () => {
  const modified = 'M\tsupabase/migrations/20260926193000_admin_media_review_v1.sql\n';
  const violations = validateMigrationDiff(modified, () => '');
  assert.equal(violations.length, 1);
  assert.match(violations[0], /^HISTORICAL_MIGRATION_IMMUTABLE:M:/);
});

test('new destructive migrations are rejected', () => {
  const added = 'A\tsupabase/migrations/20260929120000_bad_drop.sql\n';
  const violations = validateMigrationDiff(added, () => 'drop table public.clients;');
  assert.deepEqual(violations, ['DROP_TABLE:supabase/migrations/20260929120000_bad_drop.sql']);
});

test('repository migrations after the protected baseline remain additive', () => {
  assert.deepEqual(scanFutureMigrations(), []);
});
