// RC71_2_I18N_FOUNDATION_BEGIN
export const IBERFIT_LANGUAGE_STORAGE_KEY='iberfit:m26:ui-language';
export const IBERFIT_LOCALE_STORAGE_KEY='iberfit:m26:ui-locale';

export const IBERFIT_LANGUAGE_CATALOG=Object.freeze([
  Object.freeze({
    value:'es',
    label:'Español',
    nativeLabel:'Español',
    complete:true,
    defaultLocale:'es-ES',
    locales:Object.freeze(['es-ES','es-CL']),
  }),
  Object.freeze({
    value:'en',
    label:'English',
    nativeLabel:'English',
    complete:false,
    defaultLocale:'en-US',
    locales:Object.freeze(['en-US','en-GB']),
  }),
  Object.freeze({
    value:'de',
    label:'Deutsch',
    nativeLabel:'Deutsch',
    complete:false,
    defaultLocale:'de-DE',
    locales:Object.freeze(['de-DE']),
  }),
  Object.freeze({
    value:'fr',
    label:'Français',
    nativeLabel:'Français',
    complete:false,
    defaultLocale:'fr-FR',
    locales:Object.freeze(['fr-FR']),
  }),
  Object.freeze({
    value:'pt',
    label:'Português',
    nativeLabel:'Português',
    complete:false,
    defaultLocale:'pt-BR',
    locales:Object.freeze(['pt-BR','pt-PT']),
  }),
]);

const LOCALE_LABELS=Object.freeze({
  'es-ES':'Español (España)',
  'es-CL':'Español (Chile)',
  'en-US':'United States',
  'en-GB':'United Kingdom',
  'de-DE':'Deutschland',
  'fr-FR':'France',
  'pt-BR':'Brasil',
  'pt-PT':'Portugal',
});

const BUNDLES=Object.freeze({
  es:Object.freeze({
    'settings.title':'Ajustes',
    'settings.language':'Idioma',
    'settings.region':'Región y formato',
    'settings.privacy':'Privacidad',
  }),
});

function storage(){
  try{
    return globalThis?.localStorage||null;
  }catch{
    return null;
  }
}

function languageDefinition(value){
  const key=String(value||'').trim().toLowerCase();
  return IBERFIT_LANGUAGE_CATALOG.find((item)=>item.value===key)||null;
}

export function iberfitPlannedLanguages(){
  return IBERFIT_LANGUAGE_CATALOG.map((item)=>({...item,locales:[...item.locales]}));
}

export function iberfitLanguageOptions(){
  return IBERFIT_LANGUAGE_CATALOG
    .filter((item)=>item.complete)
    .map((item)=>({
      value:item.value,
      label:item.nativeLabel,
    }));
}

export function getIberfitLanguage(){
  const saved=String(
    storage()?.getItem?.(IBERFIT_LANGUAGE_STORAGE_KEY)||''
  ).trim().toLowerCase();

  const definition=languageDefinition(saved);
  return definition?.complete?saved:'es';
}

export function setIberfitLanguage(value){
  const next=String(value||'').trim().toLowerCase();
  const definition=languageDefinition(next);

  if(!definition){
    throw new Error('M26_UI_LANGUAGE_UNSUPPORTED');
  }

  if(!definition.complete){
    throw new Error('M26_UI_LANGUAGE_INCOMPLETE');
  }

  try{
    storage()?.setItem?.(IBERFIT_LANGUAGE_STORAGE_KEY,next);
  }catch{}

  const currentLocale=getIberfitLocale(next);
  if(!definition.locales.includes(currentLocale)){
    setIberfitLocale(definition.defaultLocale,{language:next});
  }

  applyIberfitDocumentLanguage(next);
  return next;
}

export function iberfitLocaleOptions(language=getIberfitLanguage()){
  const definition=languageDefinition(language)||languageDefinition('es');

  return definition.locales.map((value)=>({
    value,
    label:LOCALE_LABELS[value]||value,
  }));
}

export function getIberfitLocale(language=getIberfitLanguage()){
  const definition=languageDefinition(language)||languageDefinition('es');
  const saved=String(
    storage()?.getItem?.(IBERFIT_LOCALE_STORAGE_KEY)||''
  ).trim();

  if(definition.locales.includes(saved)){
    return saved;
  }

  return definition.defaultLocale;
}

export function setIberfitLocale(value,{language=getIberfitLanguage()}={}){
  const next=String(value||'').trim();
  const definition=languageDefinition(language)||languageDefinition('es');

  if(!definition.locales.includes(next)){
    throw new Error('M26_UI_LOCALE_UNSUPPORTED');
  }

  try{
    storage()?.setItem?.(IBERFIT_LOCALE_STORAGE_KEY,next);
  }catch{}

  return next;
}

export function applyIberfitDocumentLanguage(language=getIberfitLanguage()){
  const definition=languageDefinition(language)||languageDefinition('es');

  try{
    globalThis?.document?.documentElement?.setAttribute?.(
      'lang',
      definition.value
    );
  }catch{}

  return definition.value;
}

export function iberfitTranslate(
  key,
  {language=getIberfitLanguage(),fallback=null}={}
){
  const selected=
    BUNDLES[language]||
    BUNDLES.es;

  if(Object.hasOwn(selected,key)){
    return selected[key];
  }

  if(Object.hasOwn(BUNDLES.es,key)){
    return BUNDLES.es[key];
  }

  return fallback??String(key||'');
}
// RC71_2_I18N_FOUNDATION_END
