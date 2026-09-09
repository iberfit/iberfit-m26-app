import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(
  new URL(
    '../supabase/functions/iberfit-catalog-admin/index.ts',
    import.meta.url,
  ),
  'utf8',
);

test('catalog admin Edge Function mantiene auth Admin y rename explícito',()=>{
  assert.match(
    source,
    /p\?\.role!=='admin'/,
  );

  assert.match(
    source,
    /action==='rename_exercise'/,
  );

  assert.match(
    source,
    /iberfit_admin_rename_exercise_v1/,
  );

  assert.doesNotMatch(
    source,
    /SERVICE_ROLE/i,
  );
});

test('traducción se valida antes de ejecutar el rename transaccional',()=>{
  const aiIndex=source.indexOf(
    'ai.models.generateContent',
  );

  const rpcIndex=source.indexOf(
    "db.rpc('iberfit_admin_rename_exercise_v1'",
  );

  assert.ok(aiIndex>=0);
  assert.ok(rpcIndex>aiIndex);

  assert.match(
    source,
    /validatedTranslations/,
  );

  assert.match(
    source,
    /translationStatus:'ready'/,
  );
});

test('sincronizaciones respetan nombres gobernados por Admin',()=>{
  assert.match(
    source,
    /preserveAdminNames/,
  );

  assert.match(
    source,
    /name_admin_override/,
  );

  assert.match(
    source,
    /\.eq\('name_admin_override',false\)/,
  );
});

test('dependencias Edge están pinneadas',()=>{
  assert.match(
    source,
    /supabase-js@2\.116\.0/,
  );

  assert.match(
    source,
    /@google\/genai@2\.21\.0/,
  );
});
