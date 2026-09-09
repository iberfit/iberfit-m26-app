import {getIberfitLanguage} from '../ui/i18n.js';

export const IBERFIT_EXERCISE_NAME_LANGUAGES=Object.freeze(['es','en','fr','pt']);

function cleanName(value=''){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/gu,' ').replace(/\s+/gu,' ').trim().slice(0,160);
}

export function exerciseNameTranslations(exercise={}){
  const raw=exercise?.name_translations||exercise?.nameTranslations||exercise?.translations||{};
  const source=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const names={es:cleanName(exercise?.name_es||exercise?.name||exercise?.nombre||'')};
  for(const language of ['en','fr','pt']){
    const value=cleanName(source?.[language]||exercise?.[`name_${language}`]||'');
    if(value)names[language]=value;
  }
  return Object.freeze(names);
}

export function exerciseDisplayName(exercise={},language=getIberfitLanguage()){
  const names=exerciseNameTranslations(exercise);
  const requested=IBERFIT_EXERCISE_NAME_LANGUAGES.includes(String(language||'').toLowerCase())
    ?String(language).toLowerCase()
    :'es';
  return names[requested]||names.es||cleanName(exercise?.id)||'Ejercicio IBERFIT';
}

export function exerciseSearchNames(exercise={}){
  const names=exerciseNameTranslations(exercise);
  return Object.freeze([...new Set(Object.values(names).filter(Boolean))]);
}
