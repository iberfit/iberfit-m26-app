import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const directory=
  new URL(
    '../supabase/migrations/',
    import.meta.url,
  );

const file=
  fs.readdirSync(directory)
    .filter(
      (name)=>
        name.endsWith(
          '_exercise_name_governance_v1.sql',
        ),
    )
    .sort()
    .at(-1);

if(!file){
  throw new Error(
    'EXERCISE_NAME_GOVERNANCE_MIGRATION_MISSING',
  );
}

const sql=
  fs.readFileSync(
    new URL(
      `../supabase/migrations/${file}`,
      import.meta.url,
    ),
    'utf8',
  );

test('exercise_id sigue siendo identidad y Admin name es override explícito',()=>{
  assert.match(
    sql,
    /name_admin_override boolean/,
  );

  assert.match(
    sql,
    /references public\.exercise_catalog\(id\)/,
  );

  assert.match(
    sql,
    /name_admin_override=true/,
  );
});

test('traducciones en-fr-pt se guardan atómicamente con revision',()=>{
  assert.match(
    sql,
    /create table if not exists public\.exercise_name_translations/,
  );

  assert.match(
    sql,
    /language in \('en','fr','pt'\)/,
  );

  assert.match(
    sql,
    /source_revision bigint not null/,
  );

  assert.match(
    sql,
    /p_translations jsonb/,
  );

  assert.match(
    sql,
    /translationStatus','ready'/,
  );
});

test('rename exige Admin y control optimista de revision',()=>{
  assert.match(
    sql,
    /security invoker/,
  );

  assert.match(
    sql,
    /IBERFIT_ADMIN_REQUIRED/,
  );

  assert.match(
    sql,
    /IBERFIT_EXERCISE_REVISION_CONFLICT/,
  );

  assert.match(
    sql,
    /for update/,
  );
});

test('tablas privadas no conceden escritura a anon',()=>{
  assert.match(
    sql,
    /revoke all[\s\S]*exercise_name_translations[\s\S]*from anon, authenticated/i,
  );

  assert.match(
    sql,
    /revoke all[\s\S]*exercise_name_history[\s\S]*from anon, authenticated/i,
  );

  assert.doesNotMatch(
    sql,
    /grant\s+(?:insert|update|delete)[\s\S]{0,120}\bto anon\b/i,
  );
});

test('RPC público sólo proyecta traducciones de revision vigente',()=>{
  assert.match(
    sql,
    /name_translations jsonb/,
  );

  assert.match(
    sql,
    /jsonb_object_agg/,
  );

  assert.match(
    sql,
    /t\.source_revision=e\.revision/,
  );

  assert.match(
    sql,
    /grant execute[\s\S]*to anon, authenticated/i,
  );
});

test('historial de nombres queda inmutable para la app',()=>{
  assert.match(
    sql,
    /create table if not exists public\.exercise_name_history/,
  );

  assert.match(
    sql,
    /grant select, insert[\s\S]*exercise_name_history[\s\S]*to authenticated/i,
  );

  assert.doesNotMatch(
    sql,
    /grant\s+[^;]*\bupdate\b[^;]*\bon\s+table\s+public\.exercise_name_history\s*;/i,
  );

  assert.doesNotMatch(
    sql,
    /grant\s+[^;]*\bdelete\b[^;]*\bon\s+table\s+public\.exercise_name_history\s*;/i,
  );
});