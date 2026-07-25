export const IBERFIT_TIME_ZONE='America/Santiago';

const CIVIL_DATE_PATTERN=/^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCivilDate(value){
  const match=CIVIL_DATE_PATTERN.exec(String(value??'').trim());
  if(!match)return null;

  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const date=new Date(Date.UTC(year,month-1,day));

  if(
    date.getUTCFullYear()!==year||
    date.getUTCMonth()!==month-1||
    date.getUTCDate()!==day
  )return null;

  return Object.freeze({
    iso:`${match[1]}-${match[2]}-${match[3]}`,
    year,
    month,
    day,
  });
}

export function isCivilDateValue(value){
  return parseCivilDate(value)!==null;
}

export function parseDateValue(value){
  if(value instanceof Date){
    return Number.isFinite(value.getTime())?new Date(value.getTime()):null;
  }

  const civil=parseCivilDate(value);
  if(civil)return new Date(Date.UTC(civil.year,civil.month-1,civil.day));

  if(value===null||value===undefined||value==='')return null;
  const text=typeof value==='string'?value.trim():null;
  if(text&&CIVIL_DATE_PATTERN.test(text))return null;
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date:null;
}

export function civilDateInTimeZone(
  value=new Date(),
  timeZone=IBERFIT_TIME_ZONE
){
  const date=parseDateValue(value);
  if(!date)return null;

  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone,
    year:'numeric',
    month:'2-digit',
    day:'2-digit',
  }).formatToParts(date);

  const values=Object.fromEntries(
    parts
      .filter((part)=>['year','month','day'].includes(part.type))
      .map((part)=>[part.type,part.value])
  );

  if(!values.year||!values.month||!values.day)return null;
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatIberfitDate(
  value,
  {
    locale='es-ES',
    timeZone=IBERFIT_TIME_ZONE,
    dateStyle='medium',
    includeTime='auto',
  }={}
){
  const civil=parseCivilDate(value);

  if(civil){
    return new Intl.DateTimeFormat(locale,{
      dateStyle,
      timeZone:'UTC',
    }).format(
      new Date(Date.UTC(civil.year,civil.month-1,civil.day))
    );
  }

  const date=parseDateValue(value);
  if(!date)return null;

  const options={dateStyle,timeZone};
  if(includeTime===true||includeTime==='auto')options.timeStyle='short';

  return new Intl.DateTimeFormat(locale,options).format(date);
}
