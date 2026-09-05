import {iberfitLocaleOptions as i18nLocaleOptions,getIberfitLanguage,getIberfitLocale,setIberfitLocale} from './i18n.js';
import {
  iberfitStatusLabel,
  iberfitSourceLabel,
  iberfitPlatformLabel,
  iberfitEntityLabel,
  iberfitOperationTitle,
  iberfitOperationDetail,
} from './i18n-domain.js';

// Backward-compatible bridge. New UI must use the canonical i18n modules directly.
export const IBERFIT_SUPPORTED_LOCALES=Object.freeze(
  i18nLocaleOptions('es').map((item)=>Object.freeze({...item}))
);

export let IBERFIT_UI_LOCALE=getIberfitLocale();

export function iberfitLocaleOptions(){
  return i18nLocaleOptions(getIberfitLanguage()).map((item)=>({...item}));
}

export function setIberfitUiLocale(value){
  const activeLanguage=getIberfitLanguage();
  IBERFIT_UI_LOCALE=setIberfitLocale(value,{language:activeLanguage});
  return IBERFIT_UI_LOCALE;
}

export function castilianStatusLabel(value,fallback=null){
  return iberfitStatusLabel(value,{fallback});
}

export function castilianSourceLabel(value,fallback=null){
  return iberfitSourceLabel(value,{fallback});
}

export function castilianPlatformLabel(value){
  return iberfitPlatformLabel(value);
}

export function castilianEntityLabel(value){
  return iberfitEntityLabel(value);
}

export function castilianOperationTitle(type,entityType=''){
  return iberfitOperationTitle(type,entityType);
}

export function castilianOperationDetail(errorCode,entityType=''){
  return iberfitOperationDetail(errorCode,entityType);
}
