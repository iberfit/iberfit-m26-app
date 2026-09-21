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
import {P0_CLIENT_AUTH_SURFACE_ROWS} from './i18n-surface-p0-client-auth.js';

const COACH_LAUNCH_SURFACE_ROWS=Object.freeze([
  ['Coach listo para trabajar','Coach ready to work','Coach prêt à travailler','Coach pronto para trabalhar'],
  ['Completar primer cliente','Complete first client','Finaliser le premier client','Concluir primeiro cliente'],
  ['Preparar primera planificación','Prepare first plan','Préparer la première planification','Preparar primeiro planeamento'],
  ['Puesta en marcha pendiente','Launch readiness pending','Mise en route en attente','Configuração inicial pendente'],
  ['Recorrido completado','Tour completed','Parcours terminé','Percurso concluído'],
  ['Recorrido completado y puesta en marcha validada con datos operativos del Coach.','Tour completed and launch readiness validated with the Coach’s operational data.','Parcours terminé et mise en route validée avec les données opérationnelles du Coach.','Percurso concluído e configuração inicial validada com os dados operacionais do Coach.'],
  ['Recorrido de interfaz completado; puesta en marcha pendiente. IBERFIT no marca al Coach como listo hasta validar cliente y planificación.','Interface tour completed; launch readiness is still pending. IBERFIT does not mark the Coach as ready until the client and planning milestones are validated.','Parcours de l’interface terminé ; la mise en route reste en attente. IBERFIT ne considère pas le Coach comme prêt tant que le client et la planification ne sont pas validés.','Percurso da interface concluído; a configuração inicial continua pendente. A IBERFIT não considera o Coach pronto até validar o cliente e o planeamento.'],
  ['Coach listo','Coach ready','Coach prêt','Coach pronto'],
  ['Abrir estado de puesta en marcha completada','Open completed launch readiness status','Ouvrir l’état de mise en route terminée','Abrir estado de configuração inicial concluída'],
  ['Puesta en marcha','Launch readiness','Mise en route','Configuração inicial'],
  ['Abrir puesta en marcha de Coach','Open Coach launch readiness','Ouvrir la mise en route du Coach','Abrir configuração inicial do Coach'],
]);

export const IBERFIT_EXTRA_SURFACE_ROWS=Object.freeze([
  ...ROUTE_SURFACE_ROWS_A,
  ...ROUTE_SURFACE_ROWS_B,
  ...ROUTE_SURFACE_ROWS_C,
  ...ROUTE_SURFACE_ROWS_D,
  ...ROUTE_SURFACE_ROWS_E,
  ...SESSION_SURFACE_ROWS,
  ...ONBOARDING_CLIENT_SURFACE_ROWS,
  ...COACH_LAUNCH_SURFACE_ROWS,
  ...ADMIN_SURFACE_ROWS,
  ...WEARABLE_SURFACE_ROWS,
  ...WORKSPACE_SURFACE_ROWS,
  ...FINAL_RESIDUAL_SURFACE_ROWS,
  ...P0_CLIENT_AUTH_SURFACE_ROWS,
]);

const LANGUAGE_INDEX=Object.freeze({en:1,fr:2,pt:3});
const EXTRA=new Map();
for(const row of IBERFIT_EXTRA_SURFACE_ROWS){
  if(!Array.isArray(row)||row.length!==4)throw new Error('M26_I18N_EXTRA_ROW_INVALID');
  const source=String(row[0]||'').trim();
  if(!source)throw new Error('M26_I18N_EXTRA_SOURCE_REQUIRED');
  if(!EXTRA.has(source))EXTRA.set(source,Object.freeze({en:row[1],fr:row[2],pt:row[3]}));
}

function runtimeExtra(source,language){
  let match;
  if((match=source.match(/^(\d+) sesiones\/semana$/u))){
    if(language==='en')return `${match[1]} sessions/week`;
    if(language==='fr')return `${match[1]} séances/semaine`;
    return `${match[1]} sessões/semana`;
  }
  if((match=source.match(/^(\d+) sesiones por semana$/u))){
    if(language==='en')return `${match[1]} sessions per week`;
    if(language==='fr')return `${match[1]} séances par semaine`;
    return `${match[1]} sessões por semana`;
  }
  if((match=source.match(/^(\d+) sesiones publicadas$/u))){
    if(language==='en')return `${match[1]} published sessions`;
    if(language==='fr')return `${match[1]} séances publiées`;
    return `${match[1]} sessões publicadas`;
  }
  if((match=source.match(/^(\d+) sesiones$/u))){
    if(language==='en')return `${match[1]} sessions`;
    if(language==='fr')return `${match[1]} séances`;
    return `${match[1]} sessões`;
  }
  if((match=source.match(/^Tienes (\d+) (?:sesión|sesiones) (?:disponible|disponibles) en tu planificación\.$/u))){
    if(language==='en')return `You have ${match[1]} session${match[1]==='1'?'':'s'} available in your planning.`;
    if(language==='fr')return `Vous avez ${match[1]} séance${match[1]==='1'?'':'s'} disponible${match[1]==='1'?'':'s'} dans votre planification.`;
    return `Tem ${match[1]} ${match[1]==='1'?'sessão':'sessões'} ${match[1]==='1'?'disponível':'disponíveis'} no seu planeamento.`;
  }
  if((match=source.match(/^Comenzar · (.+)$/u))){
    if(language==='en')return `Start · ${match[1]}`;
    if(language==='fr')return `Démarrer · ${match[1]}`;
    return `Iniciar · ${match[1]}`;
  }
  if((match=source.match(/^Abrir seguimiento de (.+)$/u))){
    if(language==='en')return `Open follow-up for ${match[1]}`;
    if(language==='fr')return `Ouvrir le suivi de ${match[1]}`;
    return `Abrir acompanhamento de ${match[1]}`;
  }
  if((match=source.match(/^(\d+) clientes$/u))){
    if(language==='en'||language==='fr')return `${match[1]} clients`;
    return `${match[1]} clientes`;
  }
  if((match=source.match(/^([\d.,]+) de ([\d.,]+) h · (\d+) clientes$/u))){
    if(language==='en')return `${match[1]} of ${match[2]} h · ${match[3]} clients`;
    if(language==='fr')return `${match[1]} sur ${match[2]} h · ${match[3]} clients`;
    return `${match[1]} de ${match[2]} h · ${match[3]} clientes`;
  }
  if((match=source.match(/^([\d.,]+)% de carga$/u))){
    if(language==='en')return `${match[1]}% workload`;
    if(language==='fr')return `${match[1]} % de charge`;
    return `${match[1]}% de carga`;
  }
  if((match=source.match(/^(\d+) de (\d+) series resueltas · (.+)$/u))){
    if(language==='en')return `${match[1]} of ${match[2]} sets resolved · ${match[3]}`;
    if(language==='fr')return `${match[1]} séries résolues sur ${match[2]} · ${match[3]}`;
    return `${match[1]} de ${match[2]} séries resolvidas · ${match[3]}`;
  }
  if((match=source.match(/^(\d+) de (\d+) series$/u))){
    if(language==='en')return `${match[1]} of ${match[2]} sets`;
    if(language==='fr')return `${match[1]} séries sur ${match[2]}`;
    return `${match[1]} de ${match[2]} séries`;
  }
  if((match=source.match(/^Importación local disponible\. (.+)$/u))){
    if(language==='en')return `Local import available. ${match[1]}`;
    if(language==='fr')return `Import local disponible. ${match[1]}`;
    return `Importação local disponível. ${match[1]}`;
  }
  return source;
}

export function iberfitExtraSurfaceTranslate(value,{language='es'}={}){
  const source=String(value??'');
  const lang=String(language||'').trim().toLowerCase();
  if(!Object.hasOwn(LANGUAGE_INDEX,lang)||!source.trim())return source;
  return EXTRA.get(source)?.[lang]??runtimeExtra(source,lang);
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
