-- IBERFIT · baseline explícito de 26 movimientos de registro inequívoco.
-- Solo altas nuevas; NO sobreescribir decisiones Admin existentes ni incrementar revisiones.
-- No clasificamos aquí variantes mixtas (plancha con arrastre, abducción, skipping, bear crawl).
insert into public.exercise_measurement_profiles(exercise_id,profile,revision)
select e.id,v.profile,1
from (values
  ('IBF-CAMINATA-RAPIDA','endurance'),
  ('IBF-CARRERA-SUAVE','endurance'),
  ('IBF-CINTA-INCLINADA','endurance'),
  ('IBF-SUBIDA-DE-ESCALERAS','endurance'),
  ('IBF-AIR-BIKE','endurance'),
  ('IBF-BICICLETA-ESTATICA','endurance'),
  ('IBF-ELIPTICA','endurance'),
  ('IBF-RECUPERACION-ACTIVA-EN-BICICLETA','endurance'),
  ('IBF-REMO-ERGOMETRO','endurance'),
  ('IBF-SKIERG','endurance'),
  ('IBF-INTERVALOS-CAMINAR-CORRER','intervals'),
  ('IBF-FARMER-CARRY','carry'),
  ('IBF-FRONT-RACK-CARRY','carry'),
  ('IBF-OVERHEAD-CARRY-UNILATERAL','carry'),
  ('IBF-SUITCASE-CARRY','carry'),
  ('IBF-SLED-DRAG-HACIA-ATRAS','carry'),
  ('IBF-SLED-PUSH','carry'),
  ('IBF-HOLLOW-HOLD','isometric'),
  ('IBF-HOLLOW-HOLD-REGRESADO','isometric'),
  ('IBF-PLANCHA-FRONTAL-ALTA','isometric'),
  ('IBF-PLANCHA-FRONTAL-ANTEBRAZOS','isometric'),
  ('IBF-PLANCHA-LATERAL','isometric'),
  ('IBF-PLANCHA-LATERAL-APOYO-BANCO','isometric'),
  ('IBF-PLANCHA-LATERAL-CON-RODILLAS','isometric'),
  ('IBF-SUITCASE-HOLD','isometric'),
  ('IBF-HANDSTAND-HOLD-ASISTIDO','isometric')
) as v(exercise_id,profile)
join public.exercise_catalog e on e.id=v.exercise_id
where e.active=true and e.review_status<>'retirado'
on conflict (exercise_id) do nothing;

-- Estas filas son configuración inicial verificada, no cambios de un actor.
-- Las ediciones posteriores pasan exclusivamente por RPC Admin con auditoría.
