import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../src/m26/design/dark-iberfit-v2.css',import.meta.url),'utf8');
const routes=readFileSync(new URL('../src/m26/modules/route-render.js',import.meta.url),'utf8');
const branch='[data-m26-role="client"]';

function block(selector){
  const start=css.indexOf(selector+'{');
  assert.notEqual(start,-1,'M41 selector missing: '+selector);
  const end=css.indexOf('}',start);
  assert.ok(end>start,'M41 selector unterminated: '+selector);
  return css.slice(start,end+1);
}

test('M41: Client Today still uses canonical functional route and role-scoped CSS',()=>{
  assert.match(routes,/function renderClientHoyRoute\(vm\)/);
  assert.match(routes,/m26-client-home-primary-zone/);
  assert.match(routes,/data-workflow-action=\\"start-published-session\\"/);
  assert.match(css,/\.m26-shell\[data-m26-role="client"\] \.m26-client-home-v1/);
});

test('M41: on Today, important captions meet the 14px product readability baseline',()=>{
  const selectors=[
    '.m26-client-home-primary-zone .m26-today-action.is-primary small',
    '.m26-client-home-glance small',
    '.m26-client-home-secondary-disclosure > summary small',
    '.m26-client-home-secondary-actions button',
    '.m26-client-home-context-action small',
    '.m26-client-home-community.is-completed small',
    '.m26-client-home-clear small'
  ];
  for(const selector of selectors){
    const value=block('.m26-shell'+branch+' '+selector).match(/font-size:\s*([\d.]+)rem/);
    assert.ok(value,'M41 missing scalable font size '+selector);
    assert.ok(Number(value[1])>=0.875,'M41 text too small in '+selector+': '+value[1]);
  }
});

test('M41: status labels remain distinguishable and full names can wrap',()=>{
  for(const selector of ['.m26-client-home-status span','.m26-client-home-glance span','.m26-client-home-context-action > span']){
    const value=block('.m26-shell'+branch+' '+selector).match(/font-size:\s*([\d.]+)rem/);
    assert.ok(value&&Number(value[1])>=0.8125,'M41 labels must be readable: '+selector);
  }
  for(const selector of ['.m26-client-home-glance strong','.m26-client-home-community.is-completed strong']){
    const styles=block('.m26-shell'+branch+' '+selector);
    assert.match(styles,/overflow-wrap:anywhere/);
    assert.match(styles,/white-space:normal/);
    assert.doesNotMatch(styles,/text-overflow:ellipsis/);
  }
});

test('M41: important tap targets remain comfortable without touching Coach/Admin',()=>{
  const styles=block('.m26-shell'+branch+' .m26-client-home-secondary-actions button');
  assert.match(styles,/min-height:48px/);
  const completed=block('.m26-shell'+branch+' .m26-client-home-community.is-completed > button');
  assert.match(completed,/min-height:48px/);
  assert.match(css,/@media\(max-width:680px\)/);
  assert.match(css,/font-size:\.875rem/);
});
