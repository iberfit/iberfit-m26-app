import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const style=readFileSync(new URL('../src/m26/design/signature-ux-v2.css',import.meta.url),'utf8');
const session=readFileSync(new URL('../src/m26/workflows/session-ui.js',import.meta.url),'utf8');
test('B31: compact Coach metrics remain four source-of-truth fields',()=>{
 for(const value of ['Ejercicios','Trabajo','Bloques','Duración'])assert.ok(session.includes('<span>'+value+'</span>'));
 assert.ok(style.includes('grid-template-columns:repeat(4,minmax(0,1fr))'));
 assert.ok(style.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
});
test('B31: source role and context stay scoped to Coach builder only',()=>{
 const chunk=style.slice(style.lastIndexOf('SIGNATURE B31'));
 assert.ok(chunk.includes('data-m26-role="coach"'));
 assert.ok(!chunk.includes('data-m26-role="client"'));
 assert.ok(!chunk.includes('data-m26-role="admin"'));
 assert.ok(chunk.includes('.m26-session-builder-v2'));
});
test('B31: mobile controls, review and forced colors remain available',()=>{
 const chunk=style.slice(style.lastIndexOf('SIGNATURE B31'));
 assert.ok(chunk.includes('text-wrap:pretty'));
 assert.doesNotMatch(chunk,/display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/iu);
 assert.ok(chunk.includes('forced-colors:active'));
 assert.ok(session.includes('data-session-action="preview"'));
 assert.ok(session.includes('data-session-action="save-draft"'));
});
