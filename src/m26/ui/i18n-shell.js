import {getIberfitLanguage,iberfitTranslate} from './i18n.js';

const SHELL_BUNDLES=Object.freeze({
  es:Object.freeze({
    'shell.skipToContent':'Saltar al contenido',
    'shell.accessibility.navigation':'Navegación IBERFIT',
    'shell.product':'Entrenamiento personal con criterio',
    'shell.access.title':'Entrenamiento personal con criterio',
    'shell.access.subtitle':'Diagnóstico, planificación, control y seguimiento.',
    'shell.access.confirming':'Confirmando identidad y permisos…',
    'shell.access.error':'No fue posible confirmar el acceso.',
    'shell.operations.pending.one':'{count} pendiente',
    'shell.operations.pending.other':'{count} pendientes',
    'shell.operations.conflicts.one':'{count} conflicto',
    'shell.operations.conflicts.other':'{count} conflictos',
    'shell.operations.rejected.one':'{count} por revisar',
    'shell.operations.rejected.other':'{count} por revisar',
    'shell.role.admin':'Administrador',
    'shell.role.coach':'Entrenador',
    'shell.role.client':'Cliente',
  }),
  en:Object.freeze({
    'shell.skipToContent':'Skip to content',
    'shell.accessibility.navigation':'IBERFIT navigation',
    'shell.product':'Personal training with purpose',
    'shell.access.title':'Personal training with purpose',
    'shell.access.subtitle':'Assessment, planning, control and follow-up.',
    'shell.access.confirming':'Confirming identity and permissions…',
    'shell.access.error':'We could not confirm access.',
    'shell.operations.pending.one':'{count} pending',
    'shell.operations.pending.other':'{count} pending',
    'shell.operations.conflicts.one':'{count} conflict',
    'shell.operations.conflicts.other':'{count} conflicts',
    'shell.operations.rejected.one':'{count} to review',
    'shell.operations.rejected.other':'{count} to review',
    'shell.role.admin':'Admin',
    'shell.role.coach':'Coach',
    'shell.role.client':'Client',
  }),
  fr:Object.freeze({
    'shell.skipToContent':'Aller au contenu',
    'shell.accessibility.navigation':'Navigation IBERFIT',
    'shell.product':'Coaching personnalisé avec méthode',
    'shell.access.title':'Coaching personnalisé avec méthode',
    'shell.access.subtitle':'Diagnostic, planification, contrôle et suivi.',
    'shell.access.confirming':'Vérification de l’identité et des autorisations…',
    'shell.access.error':'Impossible de confirmer l’accès.',
    'shell.operations.pending.one':'{count} en attente',
    'shell.operations.pending.other':'{count} en attente',
    'shell.operations.conflicts.one':'{count} conflit',
    'shell.operations.conflicts.other':'{count} conflits',
    'shell.operations.rejected.one':'{count} à vérifier',
    'shell.operations.rejected.other':'{count} à vérifier',
    'shell.role.admin':'Administrateur',
    'shell.role.coach':'Coach',
    'shell.role.client':'Client',
  }),
  pt:Object.freeze({
    'shell.skipToContent':'Saltar para o conteúdo',
    'shell.accessibility.navigation':'Navegação IBERFIT',
    'shell.product':'Treino personalizado com critério',
    'shell.access.title':'Treino personalizado com critério',
    'shell.access.subtitle':'Diagnóstico, planeamento, controlo e acompanhamento.',
    'shell.access.confirming':'A confirmar identidade e permissões…',
    'shell.access.error':'Não foi possível confirmar o acesso.',
    'shell.operations.pending.one':'{count} pendente',
    'shell.operations.pending.other':'{count} pendentes',
    'shell.operations.conflicts.one':'{count} conflito',
    'shell.operations.conflicts.other':'{count} conflitos',
    'shell.operations.rejected.one':'{count} por rever',
    'shell.operations.rejected.other':'{count} por rever',
    'shell.role.admin':'Administrador',
    'shell.role.coach':'Coach',
    'shell.role.client':'Cliente',
  }),
});

function shellLanguage(value=getIberfitLanguage()){
  const normalized=String(value||'').trim().toLowerCase();
  return Object.hasOwn(SHELL_BUNDLES,normalized)?normalized:'es';
}

function interpolate(value,params={}){
  return String(value??'').replace(/\{([a-zA-Z0-9_.-]+)\}/g,(_,key)=>String(params?.[key]??`{${key}}`));
}

export function iberfitShellTranslate(key,{language:requestedLanguage=getIberfitLanguage(),fallback=null,params={}}={}){
  const language=shellLanguage(requestedLanguage);
  const selected=SHELL_BUNDLES[language];
  if(Object.hasOwn(selected,key))return interpolate(selected[key],params);
  return interpolate(iberfitTranslate(key,{language,fallback:fallback??String(key||'')}),params);
}

export function iberfitShellTranslationCoverage(){
  const referenceKeys=Object.keys(SHELL_BUNDLES.es).sort();
  return Object.freeze(Object.keys(SHELL_BUNDLES).map((language)=>{
    const selected=SHELL_BUNDLES[language];
    const selectedKeys=Object.keys(selected).sort();
    const selectedSet=new Set(selectedKeys);
    const referenceSet=new Set(referenceKeys);
    const missing=referenceKeys.filter((key)=>!selectedSet.has(key));
    const extra=selectedKeys.filter((key)=>!referenceSet.has(key));
    const blank=selectedKeys.filter((key)=>String(selected[key]??'').trim()==='');
    return Object.freeze({
      language,
      total:referenceKeys.length,
      translated:referenceKeys.length-missing.length-blank.filter((key)=>referenceSet.has(key)).length,
      missing:Object.freeze(missing),
      extra:Object.freeze(extra),
      blank:Object.freeze(blank),
      complete:missing.length===0&&extra.length===0&&blank.length===0,
    });
  }));
}
