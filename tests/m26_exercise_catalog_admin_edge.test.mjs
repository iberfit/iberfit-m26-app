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

test('catalog admin Edge Function mantiene auth Admin multiapp y rename explícito',()=>{
  assert.match(
    source,
    /db\.rpc\('iberfit_application_context_v14'\)/,
  );
  assert.match(
    source,
    /context\?\.membershipStatus!=='active'/,
  );
  assert.match(
    source,
    /!roles\.includes\('admin'\)/,
  );
  assert.doesNotMatch(
    source,
    /from\('user_profiles'\)\.select\('role'\)/,
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


test('catalog Admin liga CORS al proyecto desplegado y falla cerrado fuera de QA/PROD',()=>{
  assert.match(source,/const FUNCTION_VERSION='catalog-admin-v1\.2'/u);
  assert.match(source,/const QA_PROJECT_REF='gjztkdwfmunnzhtvxrsu'/u);
  assert.match(source,/const PROD_PROJECT_REF='pjhmrhejsoofmouedavw'/u);
  assert.match(source,/DEPLOYMENT_PROJECT_REF===QA_PROJECT_REF[\s\S]*\?\['https:\/\/m26-canary\.iberfit\.cl'\]/u);
  assert.match(source,/DEPLOYMENT_PROJECT_REF===PROD_PROJECT_REF[\s\S]*\?\['https:\/\/app\.iberfit\.cl','https:\/\/coach\.iberfit\.cl'\]/u);
  assert.match(source,/IBERFIT_CATALOG_ORIGIN_FORBIDDEN/u);
  assert.doesNotMatch(source,/hostname\.endsWith\('\.iberfit-cl\.workers\.dev'\)/u);
  assert.doesNotMatch(source,/if\(!v\)return '\*'/u);
});
