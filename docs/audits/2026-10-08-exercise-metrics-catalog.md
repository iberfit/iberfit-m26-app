# Auditoría IBERFIT: variables específicas por ejercicio

Fecha: 2026-10-08. Fuente: `public.exercise_catalog` en Supabase PRODUCTION (consulta de solo lectura). **368 ejercicios activos**. 

## Resumen por tipo de prescripción (clasificación automática para QA)

- fuerza: 276
- movilidad: 30
- isometrico: 24
- resistencia: 12
- potencia: 10
- transporte: 7
- activacion: 6
- ciclismo: 2
- intervalos: 1

**Riesgos de desajuste de unidades:** {"Revisar":311,"Alta":40,"Media":17}. *Alto* significa que hay unidades genéricas (kg/reps) poco apropiadas para cardio o para ciertas tareas de duración; no implica que la variante cargada sea incorrecta. Debe confirmarse técnica y modalidad por el Coach. No son diagnósticos clínicos.

## Debilidad principal por grupo

| Grupo | Variables principales | Variables complementarias | Oportunidad detectada |
|---|---|---|---|
| activacion | repeticiones / pasos / control | lateralidad, tensión de banda, técnica | Evitar clasificar caminatas laterales como cardio |
| transporte | distancia (m) / tiempo (s) / carga (kg) | RPE, implemento, lado | Metros, no kilómetros; no confundir carga transportada con distancia |
| intervalos | repeticiones / trabajo (s) / recuperación (s) | ritmo, zona FC, RPE, intensidad del tramo | Guardar tramos y recuperaciones sin imponer kg |
| ciclismo | tiempo (min) / distancia (km) | km/h, FC media, potencia W, cadencia rpm, desnivel | No mostrar ritmo de carrera min/km; km/h y watts opcionales |
| resistencia | tiempo (min) / distancia (km) | ritmo/velocidad, FC media, RPE, desnivel | No mostrar kg/reps por defecto; conservar FC real separada de objetivo |
| isometrico | sostenimiento (s) | carga añadida, RPE, lateralidad | Tiempo como primario, carga adicional solo opcional |
| movilidad | repeticiones / tiempo / rango articular | dolor, calidad, simetría, ROM | Falta calidad del movimiento y amplitud sin dolor |
| potencia | repeticiones de calidad / altura o distancia | altura, velocidad, kg, descanso | La cantidad sin velocidad o altura no describe bien la potencia |
| fuerza | repeticiones / carga (kg) | RPE, RIR, tempo, descanso, recorrido | Carga y repeticiones válidas, pero no todos los ejercicios usan peso externo |

## Recomendaciones de nuevos ejercicios (propuestas, todavía NO añadidos a producción)

| Ejercicio propuesto | Prescripción útil |
|---|---|
| Carrera continua | Duración o km + ritmo/FC/RPE |
| Carrera por intervalos | Bloques de trabajo, pausas, ritmo y repeticiones |
| Series de velocidad | Distancias (m), repeticiones, recuperación |
| Fartlek | Tramos de intensidad alterna, duración, terreno |
| Carrera tempo / umbral | Tiempo en intensidad objetivo, FC o ritmo |
| Carrera en cuestas | Repeticiones, desnivel, pendientes, duración |
| Trail running | Km, desnivel positivo, tiempo, FC/RPE |
| Ciclismo en ruta | Km, minutos, km/h, potencia, FC, desnivel |
| Mountain bike (MTB) | Km, desnivel, duración, técnica y RPE |
| Ciclismo indoor / rodillo | Min, W, cadencia, FC, resistencia |
| Intervalos de ciclismo | Repeticiones, W/FC objetivo, descanso |
| Recuperación activa en bici | Tiempo, intensidad Z1-Z2, cadencia |

## Revisión de los 368 ejercicios reales (registro a registro)

Clasificación inicial determinística y campo principal recomendado. **No es una validación biomecánica visual de las 368 técnicas**; cada excepción requiere revisión del Coach antes de establecer su perfil definitivo.

| exercise_id | Ejercicio | Patrón actual | Perfil propuesto | Métricas principales | Alerta de unidades |
|---|---|---|---|---|---|
| IBF-ABDUCCION-DE-CADERA-LATERAL | Abducción de cadera lateral | activación glúteo | activacion | repeticiones / pasos / control | Revisar |
| IBF-CAMINATA-LATERAL-CON-BANDA | Caminata lateral con banda | activación glúteo | activacion | repeticiones / pasos / control | Revisar |
| IBF-CLAMSHELL | Clamshell | activación glúteo | activacion | repeticiones / pasos / control | Revisar |
| IBF-CLAMSHELL-CON-BANDA | Clamshell con banda | activación glúteo | activacion | repeticiones / pasos / control | Revisar |
| IBF-MONSTER-WALK | Monster walk | activación glúteo | activacion | repeticiones / pasos / control | Revisar |
| IBF-PATADA-DE-GLUTEO-EN-CUADRUPEDIA | Patada de glúteo en cuadrupedia | activación glúteo | activacion | repeticiones / pasos / control | Revisar |
| IBF-APRETON-ISOMETRICO-DE-AGARRE | Apretón isométrico de agarre | agarre | isometrico | sostenimiento (s) | Alta |
| IBF-PINCH-GRIP-CON-DISCOS | Pinch grip con discos | agarre | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-EXTENSION-DE-MUNECA | Extensión de muñeca | antebrazo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FLEXION-DE-MUNECA | Flexión de muñeca | antebrazo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRONACION-Y-SUPINACION-DE-ANTEBRAZO | Pronación y supinación de antebrazo | antebrazo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-AB-WHEEL-DESDE-RODILLAS | Ab wheel desde rodillas | anti-extensión | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-BEAR-PLANK | Bear plank | anti-extensión | isometrico | sostenimiento (s) | Alta |
| IBF-BODY-SAW | Body saw | anti-extensión | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-DEAD-BUG | Dead bug | anti-extensión | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-DEAD-BUG-CON-BANDA | Dead bug con banda | anti-extensión | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-DEAD-BUG-CON-FITBALL | Dead bug con fitball | anti-extensión | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-HOLLOW-HOLD | Hollow hold | anti-extensión | isometrico | sostenimiento (s) | Alta |
| IBF-HOLLOW-HOLD-REGRESADO | Hollow hold regresado | anti-extensión | isometrico | sostenimiento (s) | Alta |
| IBF-HOLLOW-ROCKS | Hollow rocks | anti-extensión | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-L-SIT-ASISTIDO | L-sit asistido | anti-extensión | isometrico | sostenimiento (s) | Alta |
| IBF-MOUNTAIN-CLIMBER | Mountain climber | anti-extensión | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-MOUNTAIN-CLIMBER-LENTO | Mountain climber lento | anti-extensión | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PLANCHA-FRONTAL-ALTA | Plancha frontal alta | anti-extensión | isometrico | sostenimiento (s) | Alta |
| IBF-PLANCHA-FRONTAL-ANTEBRAZOS | Plancha frontal antebrazos | anti-extensión | isometrico | sostenimiento (s) | Alta |
| IBF-STIR-THE-POT | Stir the pot | anti-extensión | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-COPENHAGEN-PLANK-CORTO | Copenhagen plank corto | anti-inclinación | isometrico | sostenimiento (s) | Alta |
| IBF-COPENHAGEN-PLANK-LARGO | Copenhagen plank largo | anti-inclinación | isometrico | sostenimiento (s) | Alta |
| IBF-OVERHEAD-CARRY-UNILATERAL | Overhead carry unilateral | anti-inclinación | transporte | distancia (m) / tiempo (s) / carga (kg) | Media |
| IBF-PLANCHA-LATERAL | Plancha lateral | anti-inclinación | isometrico | sostenimiento (s) | Alta |
| IBF-PLANCHA-LATERAL-CON-ABDUCCION | Plancha lateral con abducción | anti-inclinación | isometrico | sostenimiento (s) | Alta |
| IBF-PLANCHA-LATERAL-APOYO-BANCO | Plancha lateral con apoyo en banco | anti-inclinación | isometrico | sostenimiento (s) | Revisar |
| IBF-PLANCHA-LATERAL-CON-RODILLAS | Plancha lateral con rodillas | anti-inclinación | isometrico | sostenimiento (s) | Alta |
| IBF-SUITCASE-CARRY | Suitcase carry | anti-inclinación | transporte | distancia (m) / tiempo (s) / carga (kg) | Media |
| IBF-SUITCASE-HOLD | Suitcase hold | anti-inclinación | isometrico | sostenimiento (s) | Alta |
| IBF-BEAR-PLANK-SHOULDER-TAP | Bear plank shoulder tap | anti-rotación | isometrico | sostenimiento (s) | Alta |
| IBF-BIRD-DOG | Bird dog | anti-rotación | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-BIRD-DOG-CON-BANDA | Bird dog con banda | anti-rotación | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-BIRD-DOG-CON-PAUSA | Bird dog con pausa | anti-rotación | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PALLOF-PRESS-CON-PASO-LATERAL | Pallof press con paso lateral | anti-rotación | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PALLOF-PRESS-DE-PIE | Pallof press de pie | anti-rotación | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PALLOF-PRESS-EN-POLEA | Pallof press en polea | anti-rotación | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PALLOF-PRESS-MEDIO-ARRODILLADO | Pallof press medio arrodillado | anti-rotación | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PALLOF-PRESS-OVERHEAD | Pallof press overhead | anti-rotación | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PLANCHA-FRONTAL-CON-ARRASTRE | Plancha frontal con arrastre | anti-rotación | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-BISAGRA-DE-CADERA-A-PARED | Bisagra de cadera a pared | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-BISAGRA-DE-CADERA-CON-PALO | Bisagra de cadera con palo | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-BUENOS-DIAS-CON-BANDA | Buenos días con banda | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-BUENOS-DIAS-CON-BARRA | Buenos días con barra | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-BUENOS-DIAS-SENTADO | Buenos días sentado | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-CABLE-PULL-THROUGH-UNILATERAL | Cable pull through unilateral | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-CURL-FEMORAL-CON-FITBALL | Curl femoral con fitball | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-CURL-FEMORAL-DESLIZANTE | Curl femoral deslizante | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-CURL-FEMORAL-EN-MAQUINA | Curl femoral en máquina | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-CURL-FEMORAL-UNILATERAL-EN-MAQUINA | Curl femoral unilateral en máquina | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-EXTENSION-DE-CADERA-EN-BANCO-45 | Extensión de cadera en banco 45° | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-EXTENSION-LUMBAR-EN-BANCO-45 | Extensión lumbar en banco 45° | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-HIP-HINGE-CON-SACO | Hip hinge con saco | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-HIP-THRUST-CON-BANDA | Hip thrust con banda | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-HIP-THRUST-CON-BARRA | Hip thrust con barra | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-HIP-THRUST-CON-PESO-CORPORAL | Hip thrust con peso corporal | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-HIP-THRUST-UNILATERAL | Hip thrust unilateral | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ISOMETRICO-DE-PUENTE-DE-GLUTEOS | Isométrico de puente de glúteos | bisagra | isometrico | sostenimiento (s) | Alta |
| IBF-KETTLEBELL-SWING | Kettlebell swing | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-MARCHA-DE-PUENTE-DE-GLUTEOS | Marcha de puente de glúteos | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-NORDIC-HAMSTRING-ASISTIDO | Nordic hamstring asistido | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-NORDIC-HAMSTRING-EXCENTRICO | Nordic hamstring excéntrico | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PESO-MUERTO-CON-BANDA | Peso muerto con banda | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PESO-MUERTO-CON-TRAP-BAR | Peso muerto con trap bar | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PESO-MUERTO-CONVENCIONAL-CON-BARRA | Peso muerto convencional con barra | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PESO-MUERTO-DESDE-BLOQUES | Peso muerto desde bloques | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PESO-MUERTO-KETTLEBELL-DESDE-EL-SUELO | Peso muerto kettlebell desde el suelo | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PESO-MUERTO-LANDMINE | Peso muerto landmine | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PESO-MUERTO-MALETA | Peso muerto maleta | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PESO-MUERTO-RUMANO-CON-BARRA | Peso muerto rumano con barra | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PESO-MUERTO-RUMANO-CON-KETTLEBELL | Peso muerto rumano con kettlebell | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PESO-MUERTO-RUMANO-CON-MANCUERNAS | Peso muerto rumano con mancuernas | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PESO-MUERTO-RUMANO-UNILATERAL-ASISTIDO | Peso muerto rumano unilateral asistido | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PESO-MUERTO-RUMANO-UNILATERAL-CON-MANCUERNA | Peso muerto rumano unilateral con mancuerna | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PESO-MUERTO-SUMO-CON-BARRA | Peso muerto sumo con barra | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PUENTE-DE-GLUTEOS | Puente de glúteos | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PUENTE-DE-GLUTEOS-CON-BANDA | Puente de glúteos con banda | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PUENTE-DE-GLUTEOS-UNILATERAL | Puente de glúteos unilateral | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PULL-THROUGH-EN-POLEA | Pull through en polea | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REVERSE-HYPER | Reverse hyper | bisagra | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ABDUCCION-DE-CADERA-EN-MAQUINA | Abducción de cadera en máquina | cadera | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ADUCCION-DE-CADERA-EN-MAQUINA | Aducción de cadera en máquina | cadera | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-AIR-BIKE | Air bike | cíclico | resistencia | tiempo (min) / distancia (km) | Alta |
| IBF-BICICLETA-ESTATICA | Bicicleta estática | cíclico | ciclismo | tiempo (min) / distancia (km) | Alta |
| IBF-ELIPTICA | Elíptica | cíclico | resistencia | tiempo (min) / distancia (km) | Alta |
| IBF-RECUPERACION-ACTIVA-EN-BICICLETA | Recuperación activa en bicicleta | cíclico | ciclismo | tiempo (min) / distancia (km) | Alta |
| IBF-REMO-ERGOMETRO | Remo ergómetro | cíclico | resistencia | tiempo (min) / distancia (km) | Alta |
| IBF-SKIERG | SkiErg | cíclico | resistencia | tiempo (min) / distancia (km) | Alta |
| IBF-CAT-COW | Cat-cow | columna | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-CHILD-POSE-CON-ALCANCE-LATERAL | Child pose con alcance lateral | columna | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-ROTACION-LUMBAR-SUPINA-CONTROLADA | Rotación lumbar supina controlada | columna | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-CHIN-TUCK | Chin tuck | cuello | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-LANZAMIENTO-DE-BALON-AL-PECHO | Lanzamiento de balón al pecho | empuje | potencia | repeticiones de calidad / altura o distancia | Media |
| IBF-APERTURAS-CON-MANCUERNAS | Aperturas con mancuernas | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-APERTURAS-EN-POLEA | Aperturas en polea | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FLEXION-CON-BANDA | Flexión con banda | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FLEXION-CON-MANOS-ELEVADAS-EN-TRX | Flexión con manos elevadas en TRX | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FLEXION-CON-PAUSA | Flexión con pausa | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FLEXION-CON-RODILLAS-APOYADAS | Flexión con rodillas apoyadas | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FLEXION-DE-BRAZOS | Flexión de brazos | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FLEXION-DECLINADA | Flexión declinada | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FLEXION-EN-PARED | Flexión en pared | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FLEXION-INCLINADA | Flexión inclinada | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FLEXION-TEMPO-3-1-1 | Flexión tempo 3-1-1 | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FLOOR-PRESS-CON-BARRA | Floor press con barra | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FLOOR-PRESS-CON-MANCUERNAS | Floor press con mancuernas | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FONDOS-EN-BANCO-ASISTIDOS | Fondos en banco asistidos | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FONDOS-EN-PARALELAS | Fondos en paralelas | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FONDOS-EN-PARALELAS-ASISTIDOS | Fondos en paralelas asistidos | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-DE-PECHO-AGARRE-CERRADO | Press de pecho agarre cerrado | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-DE-PECHO-CON-BARRA | Press de pecho con barra | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-DE-PECHO-CON-MANCUERNAS | Press de pecho con mancuernas | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-DE-PECHO-CON-PAUSA | Press de pecho con pausa | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-DE-PECHO-EN-MAQUINA | Press de pecho en máquina | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-DE-PECHO-EN-POLEA-DE-PIE | Press de pecho en polea de pie | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-DECLINADO-CON-MANCUERNAS | Press declinado con mancuernas | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-EN-MAQUINA-CONVERGENTE | Press en máquina convergente | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-INCLINADO-CON-BARRA | Press inclinado con barra | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-INCLINADO-CON-MANCUERNAS | Press inclinado con mancuernas | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-LANDMINE-BILATERAL | Press landmine bilateral | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-LANDMINE-UNILATERAL | Press landmine unilateral | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-UNILATERAL-EN-POLEA | Press unilateral en polea | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SQUEEZE-PRESS-CON-MANCUERNAS | Squeeze press con mancuernas | empuje horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-BOTTOM-UP-PRESS-CON-KETTLEBELL | Bottom-up press con kettlebell | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ELEVACION-FRONTAL-CON-DISCO | Elevación frontal con disco | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ELEVACION-LATERAL-CON-MANCUERNAS | Elevación lateral con mancuernas | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ELEVACION-LATERAL-EN-POLEA | Elevación lateral en polea | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-HANDSTAND-HOLD-ASISTIDO | Handstand hold asistido | empuje vertical | isometrico | sostenimiento (s) | Alta |
| IBF-JERK-TECNICO-CON-PALO | Jerk técnico con palo | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PIKE-PUSH-UP | Pike push-up | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PIKE-PUSH-UP-ELEVADA | Pike push-up elevada | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-ARNOLD | Press Arnold | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-CON-BANDA-SOBRE-LA-CABEZA | Press con banda sobre la cabeza | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-DE-HOMBROS-EN-MAQUINA | Press de hombros en máquina | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-LANDMINE-DE-PIE | Press landmine de pie | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-LANDMINE-MEDIO-ARRODILLADO | Press landmine medio arrodillado | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-MILITAR-CON-BARRA | Press militar con barra | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-MILITAR-SENTADO-CON-BARRA | Press militar sentado con barra | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-UNILATERAL-MEDIO-ARRODILLADO | Press unilateral medio arrodillado | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-VERTICAL-DE-PIE-CON-MANCUERNAS | Press vertical de pie con mancuernas | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-VERTICAL-SENTADO-CON-MANCUERNAS | Press vertical sentado con mancuernas | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PUSH-PRESS-CON-BARRA | Push press con barra | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PUSH-PRESS-CON-MANCUERNAS | Push press con mancuernas | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SCAPTION-CON-MANCUERNAS | Scaption con mancuernas | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-TURKISH-GET-UP-COMPLETO | Turkish get-up completo | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-TURKISH-GET-UP-PARCIAL | Turkish get-up parcial | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-Z-PRESS-CON-MANCUERNAS | Z press con mancuernas | empuje vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ENCOGIMIENTOS-CON-BARRA | Encogimientos con barra | escápula | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ENCOGIMIENTOS-CON-MANCUERNAS | Encogimientos con mancuernas | escápula | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRONE-COBRA | Prone cobra | escápula | isometrico | sostenimiento (s) | Revisar |
| IBF-PUSH-UP-PLUS | Push-up plus | escápula | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PUSH-UP-PLUS-EN-PARED | Push-up plus en pared | escápula | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SERRATUS-WALL-SLIDE | Serratus wall slide | escápula | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-Y-T-W-EN-BANCO | Y-T-W en banco | escápula | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-EXTENSION-DE-TRICEPS-EN-POLEA | Extensión de tríceps en polea | extensión de codo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-EXTENSION-DE-TRICEPS-SOBRE-CABEZA | Extensión de tríceps sobre cabeza | extensión de codo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PATADA-DE-TRICEPS | Patada de tríceps | extensión de codo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRESS-FRANCES-CON-BARRA-EZ | Press francés con barra EZ | extensión de codo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ELEVACION-DE-PIERNAS-COLGADO | Elevación de piernas colgado | flexión de cadera | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ELEVACION-DE-RODILLAS-COLGADO | Elevación de rodillas colgado | flexión de cadera | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-CURL-CON-BARRA-EZ | Curl con barra EZ | flexión de codo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-CURL-DE-BICEPS-CON-MANCUERNAS | Curl de bíceps con mancuernas | flexión de codo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-CURL-EN-POLEA | Curl en polea | flexión de codo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-CURL-INCLINADO-CON-MANCUERNAS | Curl inclinado con mancuernas | flexión de codo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-CURL-MARTILLO | Curl martillo | flexión de codo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-CURL-PREDICADOR | Curl predicador | flexión de codo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-CRUNCH-ABDOMINAL | Crunch abdominal | flexión de tronco | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-CRUNCH-EN-POLEA | Crunch en polea | flexión de tronco | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REVERSE-CRUNCH | Reverse crunch | flexión de tronco | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-BURPEE | Burpee | global | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-BURPEE-SIN-SALTO | Burpee sin salto | global | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-DEVIL-PRESS | Devil press | global | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-THRUSTER-CON-MANCUERNAS | Thruster con mancuernas | global | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ROTACION-EXTERNA-CON-BANDA | Rotación externa con banda | hombro | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ROTACION-INTERNA-CON-BANDA | Rotación interna con banda | hombro | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-BEAR-CRAWL | Bear crawl | locomoción | resistencia | tiempo (min) / distancia (km) | Alta |
| IBF-CAMINATA-RAPIDA | Caminata rápida | locomoción | resistencia | tiempo (min) / distancia (km) | Alta |
| IBF-CARRERA-SUAVE | Carrera suave | locomoción | resistencia | tiempo (min) / distancia (km) | Alta |
| IBF-CINTA-INCLINADA | Cinta inclinada | locomoción | resistencia | tiempo (min) / distancia (km) | Alta |
| IBF-FARMER-CARRY | Farmer carry | locomoción | transporte | distancia (m) / tiempo (s) / carga (kg) | Media |
| IBF-FRONT-RACK-CARRY | Front rack carry | locomoción | transporte | distancia (m) / tiempo (s) / carga (kg) | Media |
| IBF-INTERVALOS-CAMINAR-CORRER | Intervalos caminar-correr | locomoción | intervalos | repeticiones / trabajo (s) / recuperación (s) | Alta |
| IBF-MARCHA-EN-EL-SITIO | Marcha en el sitio | locomoción | resistencia | tiempo (min) / distancia (km) | Alta |
| IBF-SKIPPING-ALTO | Skipping alto | locomoción | resistencia | tiempo (min) / distancia (km) | Alta |
| IBF-SKIPPING-BAJO | Skipping bajo | locomoción | resistencia | tiempo (min) / distancia (km) | Alta |
| IBF-SLED-DRAG-HACIA-ATRAS | Sled drag hacia atrás | locomoción | transporte | distancia (m) / tiempo (s) / carga (kg) | Media |
| IBF-SLED-PUSH | Sled push | locomoción | transporte | distancia (m) / tiempo (s) / carga (kg) | Media |
| IBF-SUBIDA-DE-ESCALERAS | Subida de escaleras | locomoción | resistencia | tiempo (min) / distancia (km) | Alta |
| IBF-90-90-DE-CADERA | 90/90 de cadera | movilidad cadera | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-CARS-DE-CADERA | CARs de cadera | movilidad cadera | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-COSSACK-FLOW-ASISTIDO | Cossack flow asistido | movilidad cadera | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-ESTIRAMIENTO-DE-ADUCTORES-MARIPOSA | Estiramiento de aductores mariposa | movilidad cadera | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-ESTIRAMIENTO-DE-ISQUIOTIBIALES-SUPINO | Estiramiento de isquiotibiales supino | movilidad cadera | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-ESTIRAMIENTO-FLEXOR-DE-CADERA-MEDIO-ARRODILLADO | Estiramiento flexor de cadera medio arrodillado | movilidad cadera | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-ROCK-BACK-DE-ADUCTORES | Rock back de aductores | movilidad cadera | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-TRANSICIONES-90-90 | Transiciones 90/90 | movilidad cadera | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-CARS-DE-HOMBRO | CARs de hombro | movilidad hombro | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-DISLOCACIONES-CON-PALO | Dislocaciones con palo | movilidad hombro | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-ESTIRAMIENTO-DE-PECTORAL-EN-PARED | Estiramiento de pectoral en pared | movilidad hombro | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-WALL-ANGEL | Wall angel | movilidad hombro | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-WALL-SLIDE | Wall slide | movilidad hombro | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-DORSIFLEXION-CON-BANDA | Dorsiflexión con banda | movilidad tobillo | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-ESTIRAMIENTO-DE-GEMELO-EN-PARED | Estiramiento de gemelo en pared | movilidad tobillo | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-MOVILIDAD-DE-TOBILLO-RODILLA-A-PARED | Movilidad de tobillo rodilla a pared | movilidad tobillo | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-EXTENSION-TORACICA-SOBRE-FOAM-ROLLER | Extensión torácica sobre foam roller | movilidad torácica | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-OPEN-BOOK | Open book | movilidad torácica | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-ROTACION-TORACICA-EN-CUADRUPEDIA | Rotación torácica en cuadrupedia | movilidad torácica | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-BATTLE-ROPES-ALTERNAS | Battle ropes alternas | potencia | potencia | repeticiones de calidad / altura o distancia | Media |
| IBF-BATTLE-ROPES-DOBLES | Battle ropes dobles | potencia | potencia | repeticiones de calidad / altura o distancia | Media |
| IBF-MED-BALL-SLAM | Med ball slam | potencia | potencia | repeticiones de calidad / altura o distancia | Media |
| IBF-FOAM-ROLL-CUADRICEPS | Foam roll cuádriceps | recuperación | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-FOAM-ROLL-DORSAL-ANCHO | Foam roll dorsal ancho | recuperación | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-FOAM-ROLL-GEMELOS | Foam roll gemelos | recuperación | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-FOAM-ROLL-ISQUIOTIBIALES | Foam roll isquiotibiales | recuperación | movilidad | repeticiones / tiempo / rango articular | Revisar |
| IBF-EXHALACION-LARGA-EN-SUPINO | Exhalación larga en supino | respiración | movilidad | repeticiones / tiempo / rango articular | Alta |
| IBF-RESPIRACION-90-90 | Respiración 90/90 | respiración | movilidad | repeticiones / tiempo / rango articular | Alta |
| IBF-RESPIRACION-COCODRILO | Respiración cocodrilo | respiración | movilidad | repeticiones / tiempo / rango articular | Alta |
| IBF-CHOP-ALTO-A-BAJO | Chop alto a bajo | rotación | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-LANDMINE-ROTATION | Landmine rotation | rotación | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-LANZAMIENTO-ROTACIONAL-CON-BALON | Lanzamiento rotacional con balón | rotación | potencia | repeticiones de calidad / altura o distancia | Media |
| IBF-LIFT-BAJO-A-ALTO | Lift bajo a alto | rotación | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ROTACION-CON-BANDA-DE-PIE | Rotación con banda de pie | rotación | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-BOX-JUMP | Box jump | salto | potencia | repeticiones de calidad / altura o distancia | Media |
| IBF-BOX-JUMP-BAJO | Box jump bajo | salto | potencia | repeticiones de calidad / altura o distancia | Media |
| IBF-POGO-JUMPS | Pogo jumps | salto | potencia | repeticiones de calidad / altura o distancia | Media |
| IBF-SALTO-LATERAL-SOBRE-LINEA | Salto lateral sobre línea | salto | potencia | repeticiones de calidad / altura o distancia | Media |
| IBF-SALTO-VERTICAL-CON-CONTRAMOVIMIENTO | Salto vertical con contramovimiento | salto | potencia | repeticiones de calidad / altura o distancia | Media |
| IBF-EXTENSION-DE-RODILLA-EN-MAQUINA | Extensión de rodilla en máquina | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-EXTENSION-DE-RODILLA-UNILATERAL | Extensión de rodilla unilateral | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-HACK-SQUAT | Hack squat | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRENSA-DE-PIERNAS-INCLINADA | Prensa de piernas inclinada | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRENSA-HORIZONTAL | Prensa horizontal | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-A-CAJON | Sentadilla a cajón | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-A-SILLA | Sentadilla a silla | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-AL-AIRE | Sentadilla al aire | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-CICLISTA | Sentadilla ciclista | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-CON-BALON-MEDICINAL | Sentadilla con balón medicinal | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-CON-BANDA-EN-RODILLAS | Sentadilla con banda en rodillas | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-CON-BANDA-FRONTAL | Sentadilla con banda frontal | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-CON-CONTRAPESO | Sentadilla con contrapeso | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-CON-SACO-FRONTAL | Sentadilla con saco frontal | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-CON-SALTO | Sentadilla con salto | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-CON-TALONES-ELEVADOS | Sentadilla con talones elevados | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-CON-TRX | Sentadilla con TRX | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-CON-TRX-Y-PAUSA | Sentadilla con TRX y pausa | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-COSSACK | Sentadilla Cossack | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-COSSACK-ASISTIDA | Sentadilla Cossack asistida | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-EN-MULTIPOWER | Sentadilla en multipower | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-ESPANOLA-ISOMETRICA | Sentadilla española isométrica | sentadilla | isometrico | sostenimiento (s) | Alta |
| IBF-SENTADILLA-FRONTAL-CON-BARRA | Sentadilla frontal con barra | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-GOBLET | Sentadilla Goblet | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-GOBLET-CON-PAUSA | Sentadilla Goblet con pausa | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-GOBLET-TEMPO-3-1-1 | Sentadilla Goblet tempo 3-1-1 | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-LANDMINE | Sentadilla landmine | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-LANDMINE-A-CAJON | Sentadilla landmine a cajón | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-LATERAL | Sentadilla lateral | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-OVERHEAD-CON-BARRA | Sentadilla overhead con barra | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-OVERHEAD-CON-PALO | Sentadilla overhead con palo | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-PROFUNDA-ASISTIDA | Sentadilla profunda asistida | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-SISSY-ASISTIDA | Sentadilla sissy asistida | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-SUMO-CON-KETTLEBELL | Sentadilla sumo con kettlebell | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-SUMO-CON-MANCUERNA | Sentadilla sumo con mancuerna | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-TRASERA-A-CAJON | Sentadilla trasera a cajón | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-TRASERA-CON-BARRA | Sentadilla trasera con barra | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-ZERCHER | Sentadilla Zercher | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SPANISH-SQUAT-DINAMICA | Spanish squat dinámica | sentadilla | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-WALL-SIT | Wall sit | sentadilla | isometrico | sostenimiento (s) | Alta |
| IBF-ELEVACION-DE-TALON-UNILATERAL | Elevación de talón unilateral | tobillo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ELEVACION-DE-TALONES-BILATERAL | Elevación de talones bilateral | tobillo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ELEVACION-DE-TALONES-EN-PRENSA | Elevación de talones en prensa | tobillo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ELEVACION-DE-TALONES-SENTADO | Elevación de talones sentado | tobillo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-TIBIALIS-RAISE-EN-PARED | Tibialis raise en pared | tobillo | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ARRASTRE-DE-TRINEO-CON-CUERDA | Arrastre de trineo con cuerda | tracción | transporte | distancia (m) / tiempo (s) / carga (kg) | Media |
| IBF-FACE-PULL | Face pull | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-FACE-PULL-CON-BANDA | Face pull con banda | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PAJAROS-CON-MANCUERNAS | Pájaros con mancuernas | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PAJAROS-EN-MAQUINA | Pájaros en máquina | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-AL-CUELLO-CON-CUERDA | Remo al cuello con cuerda | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-ALTO-EN-POLEA | Remo alto en polea | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-CON-BANDA-DE-PIE | Remo con banda de pie | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-CON-BANDA-SENTADO | Remo con banda sentado | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-CON-BARRA | Remo con barra | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-CON-MANCUERNA-A-UNA-MANO | Remo con mancuerna a una mano | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-CON-SACO | Remo con saco | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-CON-TRX | Remo con TRX | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-CON-TRX-PIES-ADELANTADOS | Remo con TRX pies adelantados | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-EN-MAQUINA-CONVERGENTE | Remo en máquina convergente | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-GORILA-CON-KETTLEBELL | Remo gorila con kettlebell | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-INCLINADO-CON-MANCUERNAS | Remo inclinado con mancuernas | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-INVERTIDO | Remo invertido | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-INVERTIDO-ALTO | Remo invertido alto | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-INVERTIDO-CON-PIES-ELEVADOS | Remo invertido con pies elevados | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-ISOMETRICO-CON-BANDA | Remo isométrico con banda | tracción horizontal | isometrico | sostenimiento (s) | Alta |
| IBF-REMO-LANDMINE-UNILATERAL | Remo landmine unilateral | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-MEADOWS | Remo Meadows | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-PECHO-APOYADO-CON-MANCUERNAS | Remo pecho apoyado con mancuernas | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-PENDLAY | Remo Pendlay | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-SENTADO-EN-POLEA | Remo sentado en polea | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-T-BAR | Remo T-bar | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REMO-UNILATERAL-EN-POLEA | Remo unilateral en polea | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-RENEGADE-ROW | Renegade row | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-RENEGADE-ROW-APOYADO | Renegade row apoyado | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SEAL-ROW | Seal row | tracción horizontal | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-DOMINADA-AGARRE-NEUTRO | Dominada agarre neutro | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-DOMINADA-ASISTIDA-CON-BANDA | Dominada asistida con banda | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-DOMINADA-ASISTIDA-EN-MAQUINA | Dominada asistida en máquina | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-DOMINADA-CON-PAUSA | Dominada con pausa | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-DOMINADA-ESCAPULAR | Dominada escapular | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-DOMINADA-EXCENTRICA | Dominada excéntrica | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-DOMINADA-ISOMETRICA-A-90 | Dominada isométrica a 90° | tracción vertical | isometrico | sostenimiento (s) | Alta |
| IBF-DOMINADA-ISOMETRICA-ARRIBA | Dominada isométrica arriba | tracción vertical | isometrico | sostenimiento (s) | Alta |
| IBF-DOMINADA-PRONADA | Dominada pronada | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-DOMINADA-SUPINA | Dominada supina | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-JALON-AL-PECHO-AGARRE-ANCHO | Jalón al pecho agarre ancho | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-JALON-AL-PECHO-AGARRE-NEUTRO | Jalón al pecho agarre neutro | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-JALON-AL-PECHO-UNILATERAL | Jalón al pecho unilateral | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-JALON-CON-AGARRE-CERRADO | Jalón con agarre cerrado | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-JALON-CON-BANDA-ARRODILLADO | Jalón con banda arrodillado | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-JALON-EN-MAQUINA-CONVERGENTE | Jalón en máquina convergente | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-JALON-MEDIO-ARRODILLADO-UNILATERAL | Jalón medio arrodillado unilateral | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-JALON-TRAS-NUCA | Jalón tras nuca | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-LAT-PRAYER-EN-POLEA | Lat prayer en polea | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PULLOVER-CON-BANDA | Pullover con banda | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PULLOVER-CON-MANCUERNA | Pullover con mancuerna | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PULLOVER-EN-POLEA | Pullover en polea | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-STRAIGHT-ARM-PULLDOWN | Straight-arm pulldown | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-TREPA-DE-CUERDA | Trepa de cuerda | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-TREPA-DE-CUERDA-ASISTIDA | Trepa de cuerda asistida | tracción vertical | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-BOUND-LATERAL-CONTROLADO | Bound lateral controlado | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-CURTSY-LUNGE | Curtsy lunge | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-LUNGE-LATERAL | Lunge lateral | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-LUNGE-LATERAL-CON-MANCUERNA | Lunge lateral con mancuerna | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PISTOL-SQUAT-A-CAJON | Pistol squat a cajón | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PISTOL-SQUAT-ASISTIDA-CON-TRX | Pistol squat asistida con TRX | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-PRENSA-UNILATERAL | Prensa unilateral | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-REVERSE-LUNGE-DESDE-DEFICIT | Reverse lunge desde déficit | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SALTO-EN-SPLIT-SQUAT | Salto en split squat | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-BULGARA | Sentadilla búlgara | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-BULGARA-ASISTIDA | Sentadilla búlgara asistida | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-BULGARA-CON-MANCUERNAS | Sentadilla búlgara con mancuernas | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SENTADILLA-BULGARA-CON-PIE-DELANTERO-ELEVADO | Sentadilla búlgara con pie delantero elevado | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SKATER-SQUAT | Skater squat | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SKATER-SQUAT-ASISTIDA | Skater squat asistida | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SPLIT-SQUAT | Split squat | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SPLIT-SQUAT-ASISTIDO | Split squat asistido | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SPLIT-SQUAT-CON-BARRA | Split squat con barra | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SPLIT-SQUAT-CON-MANCUERNAS | Split squat con mancuernas | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-SPLIT-SQUAT-ISOMETRICO | Split squat isométrico | unilateral | isometrico | sostenimiento (s) | Alta |
| IBF-STEP-DOWN-FRONTAL | Step-down frontal | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-STEP-DOWN-LATERAL | Step-down lateral | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-STEP-UP-ALTO | Step-up alto | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-STEP-UP-BAJO | Step-up bajo | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-STEP-UP-CON-IMPULSO-DE-RODILLA | Step-up con impulso de rodilla | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-STEP-UP-LATERAL | Step-up lateral | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-STEP-UP-MEDIO | Step-up medio | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ZANCADA-ADELANTE | Zancada adelante | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ZANCADA-ATRAS | Zancada atrás | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ZANCADA-ATRAS-CON-DESLIZADORES | Zancada atrás con deslizadores | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ZANCADA-ATRAS-CON-MANCUERNAS | Zancada atrás con mancuernas | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ZANCADA-CAMINANDO | Zancada caminando | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ZANCADA-CAMINANDO-CON-MANCUERNAS | Zancada caminando con mancuernas | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ZANCADA-CON-LANDMINE | Zancada con landmine | unilateral | fuerza | repeticiones / carga (kg) | Revisar |
| IBF-ZANCADA-EN-MULTIPOWER | Zancada en multipower | unilateral | fuerza | repeticiones / carga (kg) | Revisar |

## Principios para evitar regresiones

- Compatibilidad con sesiones históricas: mantener carga/repeticiones si ya se grabaron.
- Separación entre objetivo prescrito y dato realmente medido. Nunca autocompletar FC, potencia o ritmo real desde la planificación.
- Núcleo deportivo común con variables específicas; no imponer kilos/repeticiones a una carrera.
- Guardar unidad física inequívoca (metros, km, segundos, lpm, rpm, W). La visualización puede convertir formatos con trazabilidad.
- Diferenciar intervalos de un bloque continuo con componentes trabajo/recuperación; permitir rondas y bloques combinados.
- Personalización por ejercicio y variante, nunca borrar medios o funcionalidades existentes.
