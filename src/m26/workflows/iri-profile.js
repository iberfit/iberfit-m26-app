import {
  civilDateInTimeZone,
  parseCivilDate,
} from '../domain/civil-date.js';

const SEX_VALUES=['female','male'];
export function deriveAgeYears(birthDate,assessmentDate=civilDateInTimeZone(new Date())){
  const birth=parseCivilDate(birthDate);
  const at=parseCivilDate(assessmentDate);
  if(!birth||!at||birth.iso>at.iso)throw new Error('M26_IRI_BIRTH_DATE_INVALID');
  let age=at.year-birth.year;
  const before=at.month<birth.month||(at.month===birth.month&&at.day<birth.day);
  if(before)age--;
  return age;
}
export function validateIriProfile(profile={},assessmentDate){const errors=[];if(!SEX_VALUES.includes(profile.sexForNorms))errors.push('sexForNorms');let ageYears=null;if(profile.birthDate){try{ageYears=deriveAgeYears(profile.birthDate,assessmentDate);}catch{errors.push('birthDate');}}else if(Number.isFinite(Number(profile.ageYears))){ageYears=Number(profile.ageYears);}else{errors.push('birthDate');}if(ageYears!=null&&(ageYears<16||ageYears>100))errors.push('ageYears');return {ok:errors.length===0,errors:[...new Set(errors)],ageYears,migratedFromAgeYears:!profile.birthDate&&ageYears!=null};}
export function buildIriProfileFields(profile={},assessmentDate){const check=validateIriProfile(profile,assessmentDate);return Object.freeze({birthDate:profile.birthDate||'',ageYears:check.ageYears,sexForNorms:profile.sexForNorms||'',genderIdentity:profile.genderIdentity||'',pronouns:profile.pronouns||'',valid:check.ok,errors:Object.freeze(check.errors)});}
