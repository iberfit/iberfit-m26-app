export const NORM_SEX = Object.freeze({ FEMALE:'female', MALE:'male', UNSPECIFIED:'unspecified' });
export const REFERENCE_PERCENTILES=Object.freeze([2.5,25,50,75,97.5]);

const chileBands=(female,male)=>Object.freeze({
  female:Object.freeze(female),
  male:Object.freeze(male),
});

export const EVIDENCE_REGISTRY = Object.freeze({
  push_up_standard: Object.freeze({
    testId:'push_up_standard',
    label:'Flexiones estándar',
    unit:'repeticiones',
    protocol:'Apoyo en pies, técnica estandarizada y repeticiones máximas válidas.',
    sexSensitive:true,
    ageSensitive:true,
    compositeEligible:false,
    tables:Object.freeze([
      Object.freeze({
        sex:NORM_SEX.FEMALE, minAge:18, maxAge:24,
        sourceId:'adams-2022-standard-pushup-female', confidence:'moderate', population:'Mujeres universitarias de 18–24 años',
        categories:Object.freeze([
          {min:0,max:4,key:'needs_improvement',label:'Necesita mejorar',score:20},
          {min:5,max:7,key:'fair',label:'Aceptable',score:40},
          {min:8,max:11,key:'good',label:'Bueno',score:60},
          {min:12,max:17,key:'very_good',label:'Muy bueno',score:80},
          {min:18,max:Infinity,key:'excellent',label:'Excelente',score:90}
        ])
      }),
      Object.freeze({
        sex:NORM_SEX.MALE, minAge:20, maxAge:29,
        sourceId:'cass-acsm-legacy-20-29-male', confidence:'low_legacy', population:'Hombres de 20–29 años; tabla histórica CASS/ACSM',
        categories:Object.freeze([
          {min:0,max:16,key:'poor',label:'Bajo',score:20},
          {min:17,max:21,key:'fair',label:'Aceptable',score:40},
          {min:22,max:28,key:'good',label:'Bueno',score:60},
          {min:29,max:35,key:'very_good',label:'Muy bueno',score:80},
          {min:36,max:Infinity,key:'excellent',label:'Excelente',score:90}
        ])
      })
    ]),
    limitations:'No se extrapolan tablas fuera del sexo, edad y protocolo estudiados. La escala masculina disponible es histórica y no participa en la puntuación global IRI.'
  }),
  chair_stand_30s: Object.freeze({
    testId:'chair_stand_30s',
    label:'Sentarse y levantarse en 30 segundos',
    unit:'repeticiones',
    protocol:'Silla estandarizada; número de repeticiones completas en 30 segundos.',
    sexSensitive:true,
    ageSensitive:true,
    compositeEligible:true,
    domain:'strength',
    sourceId:'barros-poblete-2025-chile',
    confidence:'high_regional',
    percentileKeys:REFERENCE_PERCENTILES,
    bands:chileBands(
      Object.freeze({
        '18-29':Object.freeze([13,17,19,24,31]),
        '30-39':Object.freeze([14,18,20,23,39]),
        '40-49':Object.freeze([11,15,17,20,25]),
        '50-59':Object.freeze([10,14,16,20,29]),
        '60-69':Object.freeze([9,12,15,19,25]),
        '70-80':Object.freeze([9,11,13,18,24]),
      }),
      Object.freeze({
        '18-29':Object.freeze([13,16,19,24,30]),
        '30-39':Object.freeze([14,18,21,27,30]),
        '40-49':Object.freeze([13,15,16,24,37]),
        '50-59':Object.freeze([11,16,18,21,34]),
        '60-69':Object.freeze([9,12,14,15,19]),
        '70-80':Object.freeze([8,10,11,13,19]),
      })
    ),
    limitations:'Percentiles de adultos chilenos sanos de 18–80 años. Son valores de referencia funcional y no un diagnóstico clínico.'
  }),
  one_minute_sit_to_stand: Object.freeze({
    testId:'one_minute_sit_to_stand',
    label:'Sentarse y levantarse en 1 minuto',
    unit:'repeticiones',
    protocol:'1MSTS estándar; repeticiones completas durante 60 segundos.',
    sexSensitive:true,
    ageSensitive:true,
    compositeEligible:true,
    domain:'cardio',
    sourceId:'otto-yanez-2025-chile-1msts',
    confidence:'high_regional',
    percentileKeys:REFERENCE_PERCENTILES,
    bands:chileBands(
      Object.freeze({
        '18-29':Object.freeze([28,33,38,45,61]),
        '30-39':Object.freeze([23,33,38,44,60]),
        '40-49':Object.freeze([22,28,33,38,47]),
        '50-59':Object.freeze([20,26,32,37,53]),
        '60-69':Object.freeze([17,23,28,33,49]),
        '70-80':Object.freeze([17,21,24,30,47]),
      }),
      Object.freeze({
        '18-29':Object.freeze([27,32,38,47,61]),
        '30-39':Object.freeze([26,31,39,47,55]),
        '40-49':Object.freeze([26,30,30,37,58]),
        '50-59':Object.freeze([20,28,32,39,58]),
        '60-69':Object.freeze([15,23,25,30,37]),
        '70-80':Object.freeze([15,20,23,26,31]),
      })
    ),
    limitations:'Percentiles de adultos chilenos sanos de 18–80 años. Solo se aplica al 1MSTS de 60 s; no se aplica a YMCA ni a otros step tests.'
  }),
  handgrip: Object.freeze({
    testId:'handgrip',
    label:'Fuerza de prensión manual',
    unit:'kg',
    sexSensitive:true,
    ageSensitive:true,
    sourceId:'tomkinson-2024-international-handgrip',
    confidence:'high',
    status:'reference_import_required',
    limitations:'La fuente ofrece percentiles por sexo y edad, pero la tabla completa debe importarse y verificarse antes de asignar puntuación individual.'
  }),
  weight_bearing_lunge: Object.freeze({
    testId:'weight_bearing_lunge',
    label:'Rodilla a pared · WBLT',
    unit:'cm',
    sexSensitive:true,
    ageSensitive:true,
    compositeEligible:true,
    domain:'mobility',
    sourceId:'mcbride-2026-wblt',
    confidence:'high',
    categoryKeys:Object.freeze(['very_low','low','slightly_low','normal','slightly_high','high','very_high']),
    categoryLabels:Object.freeze({
      very_low:'Muy bajo para la referencia',
      low:'Bajo para la referencia',
      slightly_low:'Ligeramente bajo',
      normal:'Dentro del rango central',
      slightly_high:'Ligeramente alto',
      high:'Alto para la referencia',
      very_high:'Muy alto para la referencia',
    }),
    iberfitScores:Object.freeze({very_low:20,low:45,slightly_low:70,normal:100,slightly_high:100,high:100,very_high:100}),
    bands:Object.freeze({
      female:Object.freeze({
        '18-29':Object.freeze([4.7,9.0,9.8,12.8,13.7,17.9]),
        '30-39':Object.freeze([4.9,7.6,9.8,13.8,14.0,17.9]),
        '40-49':Object.freeze([4.6,7.8,8.6,13.0,13.5,14.5]),
        '50-59':Object.freeze([4.0,7.0,7.5,11.5,11.9,14.5]),
        '60-69':Object.freeze([2.2,5.8,7.0,9.0,10.1,13.8]),
        '70-79':Object.freeze([2.0,4.0,5.0,8.0,9.0,10.8]),
        '80+':Object.freeze([0.3,4.7,5.0,6.2,7.0,10.8]),
      }),
      male:Object.freeze({
        '18-29':Object.freeze([4.7,7.2,8.0,13.2,14.2,22.1]),
        '30-39':Object.freeze([4.3,7.3,8.8,14.0,15.1,20.5]),
        '40-49':Object.freeze([6.1,7.7,8.0,14.0,14.8,18.0]),
        '50-59':Object.freeze([4.9,7.0,7.5,13.8,15.5,17.8]),
        '60-69':Object.freeze([4.2,6.4,7.0,10.6,12.5,17.2]),
        '70-79':Object.freeze([2.0,5.0,5.8,9.9,10.0,11.0]),
        '80+':Object.freeze([3.2,4.8,5.0,8.0,8.4,11.8]),
      }),
    }),
    limitations:'Categorías percentilares internacionales de adultos sanos. Los autores advierten que valores por encima o por debajo del promedio no establecen por sí solos beneficio, riesgo ni diagnóstico.'
  }),
});

export const EVIDENCE_SOURCES = Object.freeze({
  'adams-2022-standard-pushup-female': Object.freeze({doi:'10.70252/XIJI4089',year:2022,title:'Development of a Standard Push-up Scale for College-Aged Females'}),
  'cass-acsm-legacy-20-29-male': Object.freeze({year:1987,title:'CASS/ACSM historical push-up categories for ages 20–29',reviewRequired:true}),
  'barros-poblete-2025-chile': Object.freeze({pmid:'40526861',doi:'10.4067/s0034-98872025000500329',year:2025,title:'30 Seconds Sit-to-Stand Test: Reference Values for the Chilean Population'}),
  'otto-yanez-2025-chile-1msts': Object.freeze({pmid:'39879255',doi:'10.1371/journal.pone.0317594',year:2025,title:'One-minute sit-to-stand test: Reference values for the Chilean population'}),
  'tomkinson-2024-international-handgrip': Object.freeze({doi:'10.1016/j.jshs.2024.101014',year:2024,title:'International norms for adult handgrip strength'}),
  'mcbride-2026-wblt': Object.freeze({pmid:'41723909',doi:'10.1016/j.msksp.2026.103525',year:2026,title:'International normative values for the weight-bearing lunge test across age and sex in 899 healthy adults'}),
  'powden-2015-wblt-reliability': Object.freeze({pmid:'25704110',doi:'10.1016/j.math.2015.01.004',year:2015,title:'Reliability and minimal detectable change of the weight-bearing lunge test: A systematic review'}),
});
