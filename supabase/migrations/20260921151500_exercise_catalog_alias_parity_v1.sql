-- IBERFIT canonical exercise aliases parity v1
-- Canonical snapshot is verified against baseline_m25_2/exercise-catalog-m25.json in CI.
-- Scope: aliases only. Existing Admin-added aliases are preserved when name_admin_override=true.

do $migration$
declare
  v_payload jsonb := '[{"id":"IBF-AB-WHEEL-DESDE-RODILLAS","aliases":["ab wheel desde rodillas","rollout desde rodillas"]},{"id":"IBF-ABDUCCION-DE-CADERA-LATERAL","aliases":["elevación lateral de pierna","abducción de cadera en decúbito lateral"]},{"id":"IBF-APRETON-ISOMETRICO-DE-AGARRE","aliases":["apretón isométrico","squeeze hold"]},{"id":"IBF-BEAR-PLANK","aliases":["bear plank","cuadrupedia suspendida"]},{"id":"IBF-BEAR-PLANK-SHOULDER-TAP","aliases":["bear plank shoulder tap","toque de hombros en plancha de oso"]},{"id":"IBF-BIRD-DOG","aliases":["bird dog","extensión alterna de brazo y pierna"]},{"id":"IBF-BIRD-DOG-CON-BANDA","aliases":["bird dog con banda","bird dog con resistencia"]},{"id":"IBF-BIRD-DOG-CON-PAUSA","aliases":["bird dog con pausa","bird dog isométrico"]},{"id":"IBF-BISAGRA-DE-CADERA-A-PARED","aliases":["bisagra con referencia de pared","wall hip hinge"]},{"id":"IBF-BISAGRA-DE-CADERA-CON-PALO","aliases":["peso muerto con bastón","bisagra de cadera con palo","hip hinge con bastón"]},{"id":"IBF-BODY-SAW","aliases":["body saw","serrucho corporal"]},{"id":"IBF-BUENOS-DIAS-CON-BANDA","aliases":["buenos días con banda","good morning con banda","bisagra con banda"]},{"id":"IBF-BUENOS-DIAS-CON-BARRA","aliases":["buenos días con barra","good morning con barra"]},{"id":"IBF-BUENOS-DIAS-SENTADO","aliases":["buenos días sentado","seated good morning"]},{"id":"IBF-CABLE-PULL-THROUGH-UNILATERAL","aliases":["cable pull-through unilateral","pull-through unilateral en polea"]},{"id":"IBF-CAMINATA-LATERAL-CON-BANDA","aliases":["pasos laterales con banda","lateral walk con banda"]},{"id":"IBF-CLAMSHELL","aliases":["clamshell","apertura lateral de cadera"]},{"id":"IBF-CLAMSHELL-CON-BANDA","aliases":["clamshell con banda"]},{"id":"IBF-COPENHAGEN-PLANK-CORTO","aliases":["Copenhagen plank corto","plancha Copenhagen corta"]},{"id":"IBF-COPENHAGEN-PLANK-LARGO","aliases":["Copenhagen plank largo","plancha Copenhagen larga"]},{"id":"IBF-CURL-FEMORAL-CON-FITBALL","aliases":["curl femoral con fitball","curl femoral con pelota"]},{"id":"IBF-CURL-FEMORAL-DESLIZANTE","aliases":["curl femoral deslizante","sliding leg curl"]},{"id":"IBF-CURL-FEMORAL-EN-MAQUINA","aliases":["leg curl en máquina","flexión de rodilla en máquina"]},{"id":"IBF-CURL-FEMORAL-UNILATERAL-EN-MAQUINA","aliases":["leg curl unilateral","flexión unilateral de rodilla en máquina"]},{"id":"IBF-DEAD-BUG","aliases":["bicho muerto","contralateral supino"]},{"id":"IBF-DEAD-BUG-CON-BANDA","aliases":["dead bug con banda","dead bug con resistencia"]},{"id":"IBF-DEAD-BUG-CON-FITBALL","aliases":["dead bug con fitball","dead bug con pelota"]},{"id":"IBF-EXTENSION-DE-CADERA-EN-BANCO-45","aliases":["extensión de cadera a 45°","extensión dominante de cadera en banco"]},{"id":"IBF-EXTENSION-DE-MUNECA","aliases":["wrist extension"]},{"id":"IBF-EXTENSION-LUMBAR-EN-BANCO-45","aliases":["extensión lumbar a 45°","back extension"]},{"id":"IBF-FLEXION-DE-MUNECA","aliases":["wrist curl","wrist flexion"]},{"id":"IBF-HIP-HINGE-CON-SACO","aliases":["hip hinge con saco","peso muerto con sandbag"]},{"id":"IBF-HIP-THRUST-CON-BANDA","aliases":["hip thrust con banda","elevación de cadera con resistencia"]},{"id":"IBF-HIP-THRUST-CON-BARRA","aliases":["hip thrust con barra"]},{"id":"IBF-HIP-THRUST-CON-PESO-CORPORAL","aliases":["hip thrust sin carga","hip thrust con peso corporal"]},{"id":"IBF-HIP-THRUST-UNILATERAL","aliases":["hip thrust unilateral","elevación de cadera a una pierna","hip thrust a una pierna"]},{"id":"IBF-HOLLOW-HOLD","aliases":["posición hueca isométrica","isométrico hollow"]},{"id":"IBF-HOLLOW-HOLD-REGRESADO","aliases":["hollow hold básico","regresión de hollow hold"]},{"id":"IBF-HOLLOW-ROCKS","aliases":["hollow rocks","balanceo hollow"]},{"id":"IBF-ISOMETRICO-DE-PUENTE-DE-GLUTEOS","aliases":["puente de glúteos isométrico","glute bridge hold","elevación isométrica de cadera"]},{"id":"IBF-KETTLEBELL-SWING","aliases":["kettlebell swing","swing con pesa rusa","balanceo con pesa rusa"]},{"id":"IBF-L-SIT-ASISTIDO","aliases":["L-sit asistido","elevación en L asistida"]},{"id":"IBF-MARCHA-DE-PUENTE-DE-GLUTEOS","aliases":["marcha de puente de glúteos","glute bridge march","elevación de cadera alternando piernas"]},{"id":"IBF-MONSTER-WALK","aliases":["monster walk","pasos diagonales con banda"]},{"id":"IBF-MOUNTAIN-CLIMBER","aliases":["mountain climber","escaladores"]},{"id":"IBF-MOUNTAIN-CLIMBER-LENTO","aliases":["mountain climber lento","escalador controlado"]},{"id":"IBF-NORDIC-HAMSTRING-ASISTIDO","aliases":["Nordic hamstring asistido","curl nórdico con banda","nórdico asistido"]},{"id":"IBF-NORDIC-HAMSTRING-EXCENTRICO","aliases":["Nordic hamstring excéntrico","nórdico excéntrico","caída nórdica controlada"]},{"id":"IBF-OVERHEAD-CARRY-UNILATERAL","aliases":["overhead carry unilateral","transporte unilateral sobre la cabeza","caminata unilateral sobre la cabeza"]},{"id":"IBF-PALLOF-PRESS-CON-PASO-LATERAL","aliases":["Pallof press con paso lateral","press antirotación con desplazamiento"]},{"id":"IBF-PALLOF-PRESS-DE-PIE","aliases":["Pallof press de pie","press antirotación de pie"]},{"id":"IBF-PALLOF-PRESS-EN-POLEA","aliases":["Pallof press en polea","press antirotación en polea"]},{"id":"IBF-PALLOF-PRESS-MEDIO-ARRODILLADO","aliases":["Pallof press medio arrodillado","press Pallof semiarrodillado"]},{"id":"IBF-PALLOF-PRESS-OVERHEAD","aliases":["Pallof press overhead","press antirotación sobre la cabeza"]},{"id":"IBF-PATADA-DE-GLUTEO-EN-CUADRUPEDIA","aliases":["patada de glúteo","donkey kick"]},{"id":"IBF-PESO-MUERTO-CON-BANDA","aliases":["peso muerto con banda","banded deadlift"]},{"id":"IBF-PESO-MUERTO-CON-TRAP-BAR","aliases":["peso muerto con trap bar","trap bar deadlift","peso muerto hexagonal"]},{"id":"IBF-PESO-MUERTO-CONVENCIONAL-CON-BARRA","aliases":["peso muerto convencional","conventional deadlift"]},{"id":"IBF-PESO-MUERTO-DESDE-BLOQUES","aliases":["peso muerto desde bloques","block pull","deadlift desde bloques"]},{"id":"IBF-PESO-MUERTO-KETTLEBELL-DESDE-EL-SUELO","aliases":["peso muerto con pesa rusa","kettlebell deadlift desde el suelo"]},{"id":"IBF-PESO-MUERTO-LANDMINE","aliases":["peso muerto landmine","landmine deadlift"]},{"id":"IBF-PESO-MUERTO-MALETA","aliases":["peso muerto maleta","suitcase deadlift","peso muerto unilateral al costado"]},{"id":"IBF-PESO-MUERTO-RUMANO-CON-BARRA","aliases":["peso muerto rumano","romanian deadlift con barra","RDL con barra"]},{"id":"IBF-PESO-MUERTO-RUMANO-CON-KETTLEBELL","aliases":["peso muerto rumano con pesa rusa","kettlebell romanian deadlift","RDL con kettlebell"]},{"id":"IBF-PINCH-GRIP-CON-DISCOS","aliases":["pinch grip","pinza con discos"]},{"id":"IBF-PLANCHA-FRONTAL-ALTA","aliases":["plancha alta","high plank"]},{"id":"IBF-PLANCHA-FRONTAL-ANTEBRAZOS","aliases":["plancha baja","forearm plank"]},{"id":"IBF-PLANCHA-FRONTAL-CON-ARRASTRE","aliases":["plank dumbbell drag","plancha con arrastre"]},{"id":"IBF-PLANCHA-LATERAL","aliases":["side plank","plancha de lado"]},{"id":"IBF-PLANCHA-LATERAL-CON-ABDUCCION","aliases":["plancha lateral elevando pierna","side plank con abducción"]},{"id":"IBF-PLANCHA-LATERAL-CON-RODILLAS","aliases":["plancha lateral adaptada","side plank con rodillas"]},{"id":"IBF-PRONACION-Y-SUPINACION-DE-ANTEBRAZO","aliases":["giros de antebrazo","rotación de antebrazo"]},{"id":"IBF-STIR-THE-POT","aliases":["stir the pot","círculos sobre fitball"]},{"id":"IBF-SUITCASE-CARRY","aliases":["suitcase carry","paseo del granjero unilateral"]},{"id":"IBF-SUITCASE-HOLD","aliases":["suitcase hold","sujeción isométrica unilateral"]}]'::jsonb;
  v_rows integer;
  v_aliases integer;
  v_missing integer;
begin
  select jsonb_array_length(v_payload), coalesce(sum(jsonb_array_length(x->'aliases')),0)
  into v_rows, v_aliases
  from jsonb_array_elements(v_payload) x;

  if v_rows <> 75 or v_aliases <> 161 then
    raise exception 'IBERFIT_CANONICAL_ALIAS_SNAPSHOT_INVALID rows=% aliases=%', v_rows, v_aliases;
  end if;

  select count(*)
  into v_missing
  from jsonb_array_elements(v_payload) x
  left join public.exercise_catalog e
    on e.id=x->>'id'
   and e.source='IBERFIT_CANONICAL'
   and e.review_status='validado_nucleo'
  where e.id is null;

  if v_missing <> 0 then
    raise exception 'IBERFIT_CANONICAL_ALIAS_TARGET_MISSING count=%', v_missing;
  end if;

  with canonical as (
    select
      x->>'id' as id,
      array(select jsonb_array_elements_text(x->'aliases')) as aliases
    from jsonb_array_elements(v_payload) x
  ), desired as (
    select
      e.id,
      case
        when e.name_admin_override then (
          select coalesce(array_agg(value order by first_ord),'{}'::text[])
          from (
            select value, min(ord) as first_ord
            from unnest(c.aliases || coalesce(e.aliases,'{}'::text[])) with ordinality u(value,ord)
            where length(trim(value))>0
            group by value
          ) d
        )
        else c.aliases
      end as aliases
    from public.exercise_catalog e
    join canonical c on c.id=e.id
    where e.source='IBERFIT_CANONICAL'
      and e.review_status='validado_nucleo'
  )
  update public.exercise_catalog e
  set aliases=d.aliases
  from desired d
  where e.id=d.id
    and e.aliases is distinct from d.aliases;
end
$migration$;
