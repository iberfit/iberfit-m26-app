import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(
  new URL('../src/m26/modules/route-render.js',import.meta.url),
  'utf8'
);
const start=source.indexOf('function clientOnboardingForm()');
const end=source.indexOf('\nexport function renderClientsRoute',start);
assert.ok(start>=0&&end>start);
const onboarding=source.slice(start,end);

test('alta Coach no inventa modalidad, frecuencia, duración ni preferencias personales',()=>{
  assert.match(onboarding,/name="modality" required><option value="">Seleccionar modalidad/);
  assert.doesNotMatch(onboarding,/name="modality" required><option value="presencial"/);
  assert.match(onboarding,/name="weeklyFrequency"[^>]*placeholder="Ej\. 2"/);
  assert.doesNotMatch(onboarding,/name="weeklyFrequency"[^>]*value="2"/);
  assert.match(onboarding,/name="sessionDurationMinutes"[^>]*placeholder="Ej\. 60 min"/);
  assert.doesNotMatch(onboarding,/name="sessionDurationMinutes"[^>]*value="60"/);
  assert.match(onboarding,/name="preferredContactChannel"><option value="">Sin preferencia registrada/);
  assert.match(onboarding,/name="locationType"><option value="">Seleccionar tipo de lugar/);
  assert.match(onboarding,/name="experienceLevel"><option value="">Sin nivel registrado/);
});

test('alta Coach usa autofill nativo donde hay evidencia semántica y deriva la fase',()=>{
  assert.match(onboarding,/name="birthDate"[^>]*autocomplete="bday"/);
  assert.match(onboarding,/name="emergencyContactName"[^>]*autocomplete="section-emergency name"/);
  assert.match(onboarding,/name="emergencyContactPhone"[^>]*autocomplete="section-emergency tel"/);
  assert.match(onboarding,/name="phase"[^>]*readonly[^>]*aria-readonly="true"/);
});

test('campos físicos están marcados como dependientes de modalidad y conservables',()=>{
  for(const name of ['commune','trainingAddress','locationType','accessInstructions']){
    const pattern=new RegExp(`<label[^>]*data-onboarding-location-only[^>]*>[^<]*(?:<[^>]+>[^<]*)*<[^>]+name="${name}"`);
    assert.match(onboarding,pattern,name);
  }
});
