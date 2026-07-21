import fs from 'node:fs'; import path from 'node:path';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const files=['src/m26/norms/evidence-registry.js','src/m26/norms/norms-engine.js','src/m26/norms/iri-scoring.js','docs/SCIENTIFIC_NORMS_POLICY.md','docs/COMPETITIVE_PRODUCT_AUDIT_2026-07-18.md'];
const checks=[]; for(const f of files) checks.push({name:`exists:${f}`,ok:fs.existsSync(path.join(root,f))});
const engine=fs.readFileSync(path.join(root,'src/m26/norms/norms-engine.js'),'utf8');
checks.push({name:'blocks-missing-table',ok:engine.includes('NORM_REFERENCE_TABLE_PENDING')});
checks.push({name:'blocks-sex-age-missing',ok:engine.includes('NORM_CONTEXT_')});
checks.push({name:'no-cross-age-extrapolation',ok:engine.includes('NORM_NO_VALIDATED_TABLE_FOR_SEX_AGE')});
const bad=[]; for(const f of files.filter(x=>x.endsWith('.js'))){ const s=fs.readFileSync(path.join(root,f),'utf8'); if(/\b(prompt|alert|confirm)\s*\(/.test(s)) bad.push(f); }
checks.push({name:'no-blocking-dialogs',ok:bad.length===0,detail:bad});
const failed=checks.filter(x=>!x.ok); console.log(JSON.stringify({checks,passed:checks.length-failed.length,failed:failed.length},null,2)); if(failed.length) process.exit(1);
