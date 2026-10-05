function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function clamp(value,min=0,max=10){
  return Math.max(min,Math.min(max,Number(value)||0));
}
function half(value){
  return Math.round(clamp(value)*2)/2;
}
function text(value){
  return String(value??'').replace(/\s+/gu,' ').trim().toLocaleLowerCase('es');
}
function includesAny(value,needles=[]){
  const source=text(value);
  return needles.some((needle)=>source.includes(needle));
}
function noPain(value){
  const source=text(value);
  return !source||['no','ninguno','ninguna','sin dolor','sin síntomas','sin sintomas'].includes(source);
}
function normScore(scoring,domain){
  const raw=scoring?.domainScores?.[domain]?.score10;
  const value=finite(raw);
  return value===null?null:half(value);
}
function movementRating(draft={},scoring={}){
  const normalized=normScore(scoring,'mobility');
  if(normalized!==null)return Object.freeze({score:normalized,basis:'baremo-compatible'});
  const mobility=draft?.mobility||{};
  if(mobility?.skipped)return null;
  let points=0,available=0;
  const ankle=mobility?.ankle||{};
  const al=finite(ankle.leftBest),ar=finite(ankle.rightBest);
  if(al!==null&&ar!==null){
    available+=3;
    const best=Math.min(al,ar);
    points+=best>=8?2:best>=6?1.5:best>=4?1:0.5;
    const diff=Math.abs(al-ar);
    points+=diff<=1?1:diff<=2?0.5:0;
  }
  const posterior=mobility?.posteriorChain||{};
  const pl=finite(posterior.leftBest),pr=finite(posterior.rightBest);
  if(pl!==null&&pr!==null){
    available+=2;
    const best=Math.min(pl,pr);
    points+=best>=7?1.5:best>=5?1:0.5;
    points+=Math.abs(pl-pr)<=1?0.5:0;
  }
  const squat=mobility?.assistedSquat||{};
  if(!squat?.skipped&&text(squat?.depth)){
    available+=4;
    points+=includesAny(squat.depth,['completa','profunda'])?2:includesAny(squat.depth,['parcial'])?1:0.5;
    points+=includesAny(squat.knees,['buena','alineación','alineacion','estable'])?1:0.5;
    points+=includesAny(squat.trunk,['bueno','buena','neutro','estable'])?1:includesAny(squat.trunk,['liger','leve'])?0.5:0.25;
  }
  if(al!==null&&ar!==null){
    available+=1;
    points+=noPain(ankle.pain)?1:0;
  }
  if(available<4)return null;
  return Object.freeze({score:half(points/available*10),basis:'valoracion-iberfit'});
}
function strengthRating(draft={},scoring={}){
  const normalized=normScore(scoring,'strength');
  if(normalized!==null)return Object.freeze({score:normalized,basis:'baremo-compatible'});
  const strength=draft?.strength||draft?.strengthAssessment||{};
  if(strength?.skipped)return null;
  let score=0,parts=0;
  const squat=finite(strength?.squat60?.repetitions);
  const chair=finite(strength?.chairStand?.repetitions);
  if(squat!==null){
    parts+=2.5;
    score+=squat>40?2.5:squat>=26?2:squat>=15?1.25:0.5;
  }else if(chair!==null){
    parts+=2.5;
    score+=chair>=18?2.5:chair>=14?2:chair>=10?1.5:0.75;
  }
  const push=finite(strength?.push?.repetitions);
  if(push!==null&&!strength?.push?.skipped){
    parts+=2.5;
    const variant=text(strength?.push?.variant);
    if(includesAny(variant,['knees','rodilla'])){
      score+=push>20?2.5:push>=11?2:push>=5?1.5:0.75;
    }else{
      score+=push>=20?2.5:push>=12?2:push>=6?1.5:0.75;
    }
  }
  const trx=finite(strength?.trxRow?.repetitions);
  if(trx!==null&&!strength?.trxRow?.skipped){
    parts+=2.5;
    score+=trx>20?2.5:trx>=13?2:trx>=8?1.5:1;
  }
  const plank=finite(strength?.core?.frontPlankSeconds);
  if(plank!==null&&!strength?.core?.skipped){
    parts+=2.5;
    score+=plank>=90?2.5:plank>=60?2:plank>=30?1.5:0.75;
  }
  if(parts<5)return null;
  return Object.freeze({score:half(score/parts*10),basis:'valoracion-iberfit'});
}
function cardioRating(draft={},scoring={}){
  const normalized=normScore(scoring,'cardio');
  if(normalized!==null)return Object.freeze({score:normalized,basis:'baremo-compatible'});
  const cardio=draft?.cardio||{};
  if(cardio?.skipped||cardio?.valid!==true)return null;
  const hrr1=finite(cardio?.deltaOneMinute);
  if(hrr1===null)return null;
  let score=1; // protocolo válido
  score+=hrr1>30?5:hrr1>=21?4:hrr1>=12?3:1.5;
  const hrr2=finite(cardio?.deltaTwoMinute);
  if(hrr2!==null)score+=hrr2>40?1:hrr2>=25?0.75:0.5;
  const rpe=finite(cardio?.rpe);
  if(rpe!==null)score+=(rpe>=3&&rpe<=6)?1:(rpe<=8?0.5:0.25);
  const configured=finite(cardio?.speedKmh)!==null&&finite(cardio?.inclinePercent)!==null&&Boolean(cardio?.recoveryMode);
  if(configured)score+=0.5;
  return Object.freeze({score:half(score),basis:'valoracion-iberfit'});
}
export function clientIriAreaRatings(draft={},scoring={}){
  return Object.freeze({
    movement:movementRating(draft,scoring),
    strength:strengthRating(draft,scoring),
    recovery:cardioRating(draft,scoring),
  });
}
export const __clientIriAreaRatingInternals=Object.freeze({movementRating,strengthRating,cardioRating,half});
