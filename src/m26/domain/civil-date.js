export const IBERFIT_TIME_ZONE='America/Santiago';

const CIVIL_DATE_PATTERN=/^(\d{4})-(\d{2})-(\d{2})$/;
const defaultCivilFormatter=new Intl.DateTimeFormat('en-US',{timeZone:IBERFIT_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});

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

  const formatter=timeZone===IBERFIT_TIME_ZONE?defaultCivilFormatter:new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
  const parts=formatter.formatToParts(date);

  const values=Object.fromEntries(
    parts
      .filter((part)=>['year','month','day'].includes(part.type))
      .map((part)=>[part.type,part.value])
  );

  if(!values.year||!values.month||!values.day)return null;
  return `${values.year}-${values.month}-${values.day}`;
}

// A stored civil date is already a local calendar day. Only instants need a timezone projection.
export function reportCivilDate(value){
  if(typeof value!=='string'&&!(value instanceof Date))return null;
  const raw=typeof value==='string'?value.trim():value;
  const civil=parseCivilDate(raw);
  if(civil)return civil.iso;
  if(typeof raw==='string'&&!/^\d{4}-\d{2}-\d{2}T/.test(raw))return null;
  if(typeof raw==='string'&&!parseCivilDate(raw.slice(0,10)))return null;
  return civilDateInTimeZone(raw);
}

export function isWithinCivilPeriod(value,start,end,now){
  const day=reportCivilDate(value);
  if(!day||day<start||day>end)return false;
  if(parseCivilDate(value))return true;
  const instant=parseDateValue(value),cutoff=parseDateValue(now);
  return Boolean(instant&&cutoff&&instant.getTime()<=cutoff.getTime());
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
    const options=
      dateStyle==='medium'
        ?{
            day:'numeric',
            month:'short',
            year:'numeric',
            timeZone:'UTC',
          }
        :{
            dateStyle,
            timeZone:'UTC',
          };

    return new Intl.DateTimeFormat(locale,options).format(
      new Date(Date.UTC(civil.year,civil.month-1,civil.day))
    );
  }

  const date=parseDateValue(value);
  if(!date)return null;

  const options={dateStyle,timeZone};
  if(includeTime===true||includeTime==='auto')options.timeStyle='short';

  return new Intl.DateTimeFormat(locale,options).format(date);
}


// Positive-only civil-day runs. A missing date is not a rest day; these runs
// describe only the evidence supplied by the authorized caller.
export function observedCivilDayRuns(dates){
  if(!Array.isArray(dates))return Object.freeze([]);
  const valid=[...new Set(dates.filter(value=>typeof value==='string'&&parseCivilDate(value)?.iso===value))].sort();
  const runs=[];
  let current=null,previous=null;
  for(const day of valid){
    const instant=Date.parse(day+'T00:00:00Z');
    if(current&&instant-previous===86400000){
      current.days++;current.periodEnd=day;
    }else{
      current={days:1,periodStart:day,periodEnd:day};
      runs.push(current);
    }
    previous=instant;
  }
  return Object.freeze(runs.map(run=>Object.freeze(run)));
}
