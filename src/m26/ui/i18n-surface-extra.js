import {ROUTE_SURFACE_ROWS_A} from './i18n-surface-route-a.js';
import {ROUTE_SURFACE_ROWS_B} from './i18n-surface-route-b.js';
import {ROUTE_SURFACE_ROWS_C} from './i18n-surface-route-c.js';
import {ROUTE_SURFACE_ROWS_D} from './i18n-surface-route-d.js';
import {ROUTE_SURFACE_ROWS_E} from './i18n-surface-route-e.js';
import {SESSION_SURFACE_ROWS} from './i18n-surface-session.js';
import {ONBOARDING_CLIENT_SURFACE_ROWS} from './i18n-surface-onboarding-client.js';
import {ADMIN_SURFACE_ROWS} from './i18n-surface-admin.js';
import {WEARABLE_SURFACE_ROWS} from './i18n-surface-wearables.js';
import {WORKSPACE_SURFACE_ROWS} from './i18n-surface-workspace.js';
import {FINAL_RESIDUAL_SURFACE_ROWS} from './i18n-surface-final-residual.js';

export const IBERFIT_EXTRA_SURFACE_ROWS=Object.freeze([
  ...ROUTE_SURFACE_ROWS_A,
  ...ROUTE_SURFACE_ROWS_B,
  ...ROUTE_SURFACE_ROWS_C,
  ...ROUTE_SURFACE_ROWS_D,
  ...ROUTE_SURFACE_ROWS_E,
  ...SESSION_SURFACE_ROWS,
  ...ONBOARDING_CLIENT_SURFACE_ROWS,
  ...ADMIN_SURFACE_ROWS,
  ...WEARABLE_SURFACE_ROWS,
  ...WORKSPACE_SURFACE_ROWS,
  ...FINAL_RESIDUAL_SURFACE_ROWS,
]);

const LANGUAGE_INDEX=Object.freeze({en:1,fr:2,pt:3});
const EXTRA=new Map();
for(const row of IBERFIT_EXTRA_SURFACE_ROWS){
  if(!Array.isArray(row)||row.length!==4)throw new Error('M26_I18N_EXTRA_ROW_INVALID');
  const source=String(row[0]||'').trim();
  if(!source)throw new Error('M26_I18N_EXTRA_SOURCE_REQUIRED');
  if(!EXTRA.has(source))EXTRA.set(source,Object.freeze({en:row[1],fr:row[2],pt:row[3]}));
}

export function iberfitExtraSurfaceTranslate(value,{language='es'}={}){
  const source=String(value??'');
  const lang=String(language||'').trim().toLowerCase();
  if(!Object.hasOwn(LANGUAGE_INDEX,lang)||!source.trim())return source;
  return EXTRA.get(source)?.[lang]??source;
}

export function iberfitExtraSurfaceCoverage(){
  return Object.freeze(Object.keys(LANGUAGE_INDEX).map((language)=>{
    const index=LANGUAGE_INDEX[language];
    const missing=IBERFIT_EXTRA_SURFACE_ROWS
      .filter((row)=>!String(row[index]??'').trim())
      .map((row)=>row[0]);
    return Object.freeze({
      language,
      total:IBERFIT_EXTRA_SURFACE_ROWS.length,
      translated:IBERFIT_EXTRA_SURFACE_ROWS.length-missing.length,
      missing:Object.freeze(missing),
      complete:missing.length===0,
    });
  }));
}

export function iberfitExtraSurfaceSpanishCatalog(){
  return Object.freeze([...EXTRA.keys()]);
}
