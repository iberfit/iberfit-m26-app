-- IBERFIT · Plancha lateral con apoyo en banco v1
-- Adds the canonical elevated side-plank regression approved by the owner.
-- Non-destructive/idempotent seed. Existing canonical rows are never overwritten.

insert into public.exercise_catalog (
  id,
  name_es,
  name_source,
  source,
  source_id,
  pattern,
  intent,
  equipment,
  difficulty,
  primary_muscles,
  secondary_muscles,
  cues,
  instructions_es,
  precautions,
  units,
  tags,
  aliases,
  media_status,
  media,
  review_status,
  active,
  revision,
  name_admin_override
)
select
  'IBF-PLANCHA-LATERAL-APOYO-BANCO',
  'Plancha lateral con apoyo en banco',
  'Plancha lateral con apoyo en banco',
  'IBERFIT_CANONICAL',
  'IBF-PLANCHA-LATERAL-APOYO-BANCO',
  'anti-inclinación',
  'estabilidad',
  'banco',
  'baja',
  array['core','oblicuos']::text[],
  array['glúteos']::text[],
  array[
    'Alinea hombro, pelvis y tobillos',
    'Mantén pelvis elevada y costillas controladas',
    'Apoya el antebrazo de forma estable sobre el banco'
  ]::text[],
  array[
    'Coloca el antebrazo sobre un banco estable y extiende las piernas',
    'Eleva la pelvis hasta formar una línea recta de hombros a tobillos',
    'Mantén la posición con respiración controlada'
  ]::text[],
  array[
    'Detener ante dolor de hombro, codo o zona lumbar',
    'Asegurar que el banco no pueda desplazarse'
  ]::text[],
  array['segundos','repeticiones']::text[],
  array['core','estabilidad','regresión','banco']::text[],
  array['plancha lateral en banco','side plank elevado','elevated side plank']::text[],
  'pendiente',
  '{}'::jsonb,
  'validado_nucleo',
  true,
  1,
  false
where not exists (
  select 1
  from public.exercise_catalog
  where id='IBF-PLANCHA-LATERAL-APOYO-BANCO'
     or lower(regexp_replace(trim(name_es), '[[:space:]]+', ' ', 'g'))
        = lower('Plancha lateral con apoyo en banco')
);
