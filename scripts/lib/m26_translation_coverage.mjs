const LANGUAGE_MARKER=(language)=>`${language}:Object.freeze({`;

function bundleBody(source,language){
  const bundlesStart=source.indexOf('const BUNDLES=Object.freeze({');
  if(bundlesStart<0)throw new Error('M26_TRANSLATION_BUNDLES_NOT_FOUND');
  const marker=LANGUAGE_MARKER(language);
  const start=source.indexOf(marker,bundlesStart);
  if(start<0)return null;
  const bodyStart=start+marker.length;
  const nextLanguage=/\n\s{2}(?:es|en|fr|pt):Object\.freeze\(\{/g;
  nextLanguage.lastIndex=bodyStart;
  const next=nextLanguage.exec(source);
  const bundlesEnd=source.indexOf('\n});',bodyStart);
  const end=next?next.index:bundlesEnd;
  if(end<0)throw new Error('M26_TRANSLATION_BUNDLE_UNTERMINATED');
  return source.slice(bodyStart,end);
}

function keysFromBody(body){
  const keys=[];
  const pattern=/'([^']+)'\s*:/g;
  let match;
  while((match=pattern.exec(body||'')))keys.push(match[1]);
  return [...new Set(keys)].sort();
}

function blankKeysFromBody(body){
  const blanks=[];
  const pattern=/'([^']+)'\s*:\s*['"]\s*['"]/g;
  let match;
  while((match=pattern.exec(body||'')))blanks.push(match[1]);
  return [...new Set(blanks)].sort();
}

export function analyzeIberfitTranslationCoverage(source,{languages=['es','en','fr','pt'],reference='es'}={}){
  const text=String(source||'');
  const bodies=Object.fromEntries(languages.map((language)=>[language,bundleBody(text,language)]));
  const referenceKeys=keysFromBody(bodies[reference]);
  if(referenceKeys.length===0)throw new Error('M26_TRANSLATION_REFERENCE_EMPTY');
  const referenceSet=new Set(referenceKeys);
  const reports=languages.map((language)=>{
    const keys=keysFromBody(bodies[language]);
    const keySet=new Set(keys);
    const missing=referenceKeys.filter((key)=>!keySet.has(key));
    const extra=keys.filter((key)=>!referenceSet.has(key));
    const blank=blankKeysFromBody(bodies[language]);
    return Object.freeze({
      language,
      total:referenceKeys.length,
      translated:referenceKeys.length-missing.length-blank.filter((key)=>referenceSet.has(key)).length,
      missing:Object.freeze(missing),
      extra:Object.freeze(extra),
      blank:Object.freeze(blank),
      complete:missing.length===0&&extra.length===0&&blank.length===0,
    });
  });
  return Object.freeze({
    reference,
    referenceKeys:Object.freeze(referenceKeys),
    reports:Object.freeze(reports),
    complete:reports.every((report)=>report.complete),
  });
}

export function assertIberfitTranslationCoverage(source,options){
  const report=analyzeIberfitTranslationCoverage(source,options);
  const failures=report.reports.filter((item)=>!item.complete);
  if(failures.length){
    const detail=failures.map((item)=>`${item.language}:missing=${item.missing.join(',')||'-'};extra=${item.extra.join(',')||'-'};blank=${item.blank.join(',')||'-'}`).join('|');
    throw new Error(`M26_TRANSLATION_COVERAGE_INCOMPLETE:${detail}`);
  }
  return report;
}
