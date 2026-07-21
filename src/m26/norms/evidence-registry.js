export const NORM_SEX = Object.freeze({ FEMALE:'female', MALE:'male', UNSPECIFIED:'unspecified' });

export const EVIDENCE_REGISTRY = Object.freeze({
  push_up_standard: Object.freeze({
    testId:'push_up_standard',
    label:'Flexiones estándar',
    unit:'repeticiones',
    protocol:'Apoyo en pies, técnica estandarizada y repeticiones máximas válidas.',
    sexSensitive:true,
    ageSensitive:true,
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
    limitations:'No se extrapolan tablas fuera del sexo, edad y protocolo estudiados. La escala masculina disponible es histórica y debe reemplazarse al incorporar una referencia contemporánea validada.'
  }),
  chair_stand_30s: Object.freeze({
    testId:'chair_stand_30s', label:'Sentarse y levantarse en 30 segundos', unit:'repeticiones',
    protocol:'Silla estandarizada; número de repeticiones completas en 30 segundos.', sexSensitive:true, ageSensitive:true,
    sourceId:'barros-poblete-2025-chile', confidence:'high_regional',
    bands:Object.freeze({
      female:Object.freeze({
        '18-29':[17,19,24], '30-39':[18,20,23], '40-49':[15,17,20], '50-59':[14,16,20], '60-69':[12,15,19], '70-80':[11,13,18]
      }),
      male:Object.freeze({
        '18-29':[16,19,24], '30-39':[18,21,27], '40-49':[15,16,24], '50-59':[16,18,21], '60-69':[12,14,15], '70-80':[10,11,13]
      })
    }),
    limitations:'Los cortes corresponden a P25, P50 y P75 reportados para población adulta chilena; no equivalen a diagnóstico clínico.'
  }),
  handgrip: Object.freeze({
    testId:'handgrip', label:'Fuerza de prensión manual', unit:'kg', sexSensitive:true, ageSensitive:true,
    sourceId:'tomkinson-2024-international-handgrip', confidence:'high', status:'reference_import_required',
    limitations:'La fuente ofrece percentiles por sexo y edad, pero la tabla completa debe importarse y verificarse antes de asignar puntuación individual. Hasta entonces se muestra el valor bruto sin categoría.'
  }),
  weight_bearing_lunge: Object.freeze({
    testId:'weight_bearing_lunge', label:'Lunge con carga de peso', unit:'cm', sexSensitive:true, ageSensitive:true,
    sourceId:'mcbride-2026-wblt', confidence:'high', status:'reference_import_required',
    limitations:'No se asigna puntuación hasta incorporar las tablas completas por sexo y edad del estudio internacional.'
  })
});

export const EVIDENCE_SOURCES = Object.freeze({
  'adams-2022-standard-pushup-female': Object.freeze({doi:'10.70252/XIJI4089', year:2022, title:'Development of a Standard Push-up Scale for College-Aged Females'}),
  'cass-acsm-legacy-20-29-male': Object.freeze({year:1987, title:'CASS/ACSM historical push-up categories for ages 20–29', reviewRequired:true}),
  'barros-poblete-2025-chile': Object.freeze({doi:'10.4067/s0034-98872025000500329', year:2025, title:'30 Seconds Sit-to-Stand Test: Reference Values for the Chilean Population'}),
  'tomkinson-2024-international-handgrip': Object.freeze({doi:'10.1016/j.jshs.2024.101014', year:2024, title:'International norms for adult handgrip strength'}),
  'mcbride-2026-wblt': Object.freeze({doi:'10.1016/j.msksp.2026.103525', year:2026, title:'International normative values for the weight-bearing lunge test across age and sex'})
});
