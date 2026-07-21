import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const root=new URL('..',import.meta.url);const json=(p)=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));const text=(p)=>fs.readFileSync(new URL(p,root),'utf8');const exists=(p)=>fs.existsSync(new URL(p,root));

test('artefacto web RC15 está construido y dentro de presupuesto',()=>{const version=json('dist/m26-launch-candidate/version.json');assert.equal(version.version,'26.0.0-launch-candidate.15');assert.equal(version.status,'not_deployed');assert.equal(version.productionModified,false);assert.equal(version.budgetOk,true);assert.ok(version.files>=80);});

test('grafo de módulos del artefacto no tiene imports ausentes',()=>{const report=json('recovery/RC15_MODULE_GRAPH_REPORT.json');assert.equal(report.ok,true);assert.deepEqual(report.missing,[]);assert.ok(report.modules>=45);});

test('cabeceras de seguridad y service worker están endurecidos',()=>{const headers=text('dist/m26-launch-candidate/_headers');for(const required of ['Content-Security-Policy','Strict-Transport-Security','X-Content-Type-Options','Permissions-Policy','Service-Worker-Allowed'])assert.match(headers,new RegExp(required));const sw=text('dist/m26-launch-candidate/m26/sw.js');assert.match(sw,/m26-rc15/);assert.match(sw,/request\.method!==\'GET\'/);assert.match(sw,/\/auth\/v1\//);assert.match(sw,/\/rest\/v1\//);assert.match(sw,/request\.mode===\'navigate\'/);});

test('configuración entregada es fail-closed y plantilla canaria no contiene clave real',()=>{assert.match(text('dist/m26-launch-candidate/m26/runtime-config.js'),/enabled:\s*false/);const example=text('dist/m26-launch-candidate/m26/runtime-config.example.js');assert.match(example,/REPLACE_WITH_SUPABASE_PUBLISHABLE_KEY/);assert.doesNotMatch(example,/eyJ[A-Za-z0-9_-]{20,}/);});

test('estado remoto es honesto y producción permanece intacta',()=>{const status=json('recovery/RC15_REMOTE_VALIDATION_STATUS.json');assert.equal(status.connector_available,false);assert.equal(status.catalog_remote_validated,false);assert.equal(status.authenticated_roles_validated_remotely,false);assert.equal(status.production_modified,false);assert.equal(status.production_deployed,false);});

test('manifest PWA apunta a m26 y contiene iconos disponibles',()=>{const manifest=json('dist/m26-launch-candidate/m26/manifest.webmanifest');assert.equal(manifest.id,'/m26/');assert.match(manifest.start_url,/^\/m26\//);for(const icon of manifest.icons)assert.ok(exists(`dist/m26-launch-candidate${icon.src}`),icon.src);});

test('manifiesto de activos coincide con los bytes entregados',()=>{const base=new URL('dist/m26-launch-candidate/',root);const manifest=json('dist/m26-launch-candidate/asset-manifest.json');for(const item of manifest.files){const data=fs.readFileSync(new URL(item.path,base));assert.equal(data.length,item.size,item.path);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256,item.path);}});
