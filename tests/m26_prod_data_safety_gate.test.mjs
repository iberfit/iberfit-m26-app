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
  assert.deepEqual(findDestructiveSql('drop type public.old_status;'), ['DROP_TYPE']);
  assert.deepEqual(findDestructiveSql('drop owned by old_app_role;'), ['DROP_OWNED']);
  assert.deepEqual(findDestructiveSql('drop extension old_extension cascade;'), ['DROP_EXTENSION']);
  assert.deepEqual(findDestructiveSql('drop trigger old_trigger on public.clients;'), ['DROP_TRIGGER']);
  assert.deepEqual(findDestructiveSql('drop function public.old_fn(uuid);'), ['DROP_FUNCTION']);
  assert.deepEqual(findDestructiveSql('drop policy old_policy on public.clients;'), ['DROP_POLICY']);
});

test('data safety gate blocks in-place column type transforms', () => {
  const findings = findDestructiveSql('alter table public.clients alter column legacy_id type bigint using legacy_id::bigint;');
  assert.deepEqual(findings, ['ALTER_COLUMN_TYPE']);
});

test('data safety gate blocks top-level mutation of existing rows', () => {
  assert.deepEqual(
    findDestructiveSql("update public.clients set status='active' where status is null;"),
    ['UPDATE_EXISTING_ROWS'],
  );
  assert.deepEqual(
    findDestructiveSql("insert into public.settings(id,value) values(1,'x') on conflict(id) do update set value=excluded.value;"),
    ['ON_CONFLICT_DO_UPDATE'],
  );
});

test('data safety gate blocks MERGE updates and deletes', () => {
  assert.deepEqual(
    findDestructiveSql('merge into public.clients c using public.stage s on c.id=s.id when matched then update set status=s.status;'),
    ['MERGE_UPDATE'],
  );
  assert.deepEqual(
    findDestructiveSql('merge into public.clients c using public.legacy_clients l on c.id = l.id when matched then delete;'),
    ['MERGE_DELETE'],
  );
});

test('data safety gate ignores destructive words in comments and literals', () => {
  const sql = `
    -- DROP TABLE public.clients;
    select 'DELETE FROM public.clients';
    /* TRUNCATE public.sessions; */
  `;
  assert.deepEqual(findDestructiveSql(sql), []);
});

test('data safety gate permits explicit domain mutation logic inside function bodies', () => {
  const sql = `
    create or replace function public.update_one_client(p_id uuid)
    returns void
    language plpgsql
    as $$
    begin
      update public.clients set updated_at=now() where id = p_id;
      delete from public.client_cache where client_id = p_id;
    end;
    $$;
  `;
  assert.deepEqual(findDestructiveSql(sql), []);
});

test('data safety gate permits tagged explicit routine bodies', () => {
  const sql = `
    create or replace procedure public.delete_one_session(p_id uuid)
    language plpgsql
    as $body$
    begin
      delete from public.sessions where id = p_id;
    end;
    $body$;
  `;
  assert.deepEqual(findDestructiveSql(sql), []);
});

test('anonymous DO blocks fail closed even when destructive SQL is dynamic', () => {
  const findings = findDestructiveSql(`
    do $$
    begin
      execute 'DELETE FROM public.clients';
    end;
    $$;
  `);
  assert.deepEqual(findings, ['ANONYMOUS_DO_BLOCK']);
});

test('anonymous DO blocks exposing direct DELETE are rejected', () => {
  const findings = findDestructiveSql(`
    do $migration$
    begin
      delete from public.clients where id is not null;
    end;
    $migration$;
  `);
  assert.ok(findings.includes('DELETE_FROM'));
  assert.ok(findings.includes('ANONYMOUS_DO_BLOCK'));
});

test('top-level CALL fails closed because procedures can hide destructive side effects', () => {
  assert.deepEqual(findDestructiveSql('call public.rewrite_all_clients();'), ['CALL_STATEMENT']);
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
