import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessExercisePerformance,
  buildExercisePerformanceMemory,
  buildExercisePerformanceTrend,
  listExercisePerformanceMemories,
  normalizeExerciseLoad,
  projectExercisePerformanceForRole,
} from '../src/m26/engagement/exercise-performance-engine.js';

const clientId='client-a';

function state(sessionExecutions=[],extra={}){
  return {
    collections:{sessionExecutions},
    pendingOperations:[],
    conflicts:[],
    rejectedOperations:[],
    ...extra,
  };
}

test(
  'memoria por ejercicio ordena exposiciones confirmadas, conserva series y excluye pendientes',
  ()=>{
    const executions=[
      {
        id:'e-old',
        clientId,
        status:'completed',
        completedAt:'2026-06-01T10:00:00Z',
        results:{
          'sq:1':{
            exerciseId:'sq',
            setNumber:1,
            reps:10,
            loadKg:20,
            rpe:7,
            rir:3,
          },
          'sq:2':{
            exerciseId:'sq',
            setNumber:2,
            reps:10,
            loadKg:20,
            rpe:7.5,
            rir:2,
          },
          'row:1':{
            exerciseId:'row',
            setNumber:1,
            reps:12,
            loadKg:15,
            rpe:7,
          },
        },
      },
      {
        id:'e-new',
        clientId,
        status:'completed',
        completedAt:'2026-06-08T10:00:00Z',
        results:[
          {
            exerciseId:'sq',
            setNumber:1,
            reps:8,
            load:'22,5 kg',
            rpe:8,
            rir:2,
          },
          {
            exerciseId:'sq',
            setNumber:2,
            reps:8,
            load:'22.5 kg',
            rpe:8.5,
            rir:1,
          },
        ],
      },
      {
        id:'e-pending',
        clientId,
        status:'completed',
        syncStatus:'pending',
        completedAt:'2026-06-15T10:00:00Z',
        results:[
          {
            exerciseId:'sq',
            setNumber:1,
            reps:5,
            loadKg:40,
            rpe:10,
          },
        ],
      },
      {
        id:'e-other',
        clientId:'client-b',
        status:'completed',
        completedAt:'2026-06-20T10:00:00Z',
        results:[
          {
            exerciseId:'sq',
            setNumber:1,
            reps:5,
            loadKg:100,
            rpe:10,
          },
        ],
      },
    ];

    const memory=
      buildExercisePerformanceMemory(
        state(executions),
        clientId,
        'sq',
      );

    assert.equal(
      memory.exposureCount,
      2,
    );

    assert.equal(
      memory.excludedUnconfirmedExposures,
      1,
    );

    assert.equal(
      memory.latest.executionId,
      'e-new',
    );

    assert.equal(
      memory.previous.executionId,
      'e-old',
    );

    assert.deepEqual(
      memory.latest.lastLoad,
      {
        raw:'22.5 kg',
        value:22.5,
        unit:'kg',
        comparableKey:'kg',
      },
    );

    assert.equal(
      memory.latest.totalReps,
      16,
    );

    assert.equal(
      memory.latest.volumeKg,
      360,
    );

    assert.equal(
      memory.previous.volumeKg,
      400,
    );

    assert.equal(
      memory.comparison.peakLoadKg,
      2.5,
    );

    assert.equal(
      memory.comparison.peakLoadKgPercent,
      12.5,
    );

    assert.equal(
      memory.comparison.volumeKg,
      -40,
    );

    assert.equal(
      memory.comparison.volumeKgPercent,
      -10,
    );

    assert.equal(
      memory.comparison.totalReps,
      -4,
    );

    assert.equal(
      memory.records.maxLoadKg.value,
      22.5,
    );

    assert.equal(
      memory.records.maxExposureVolumeKg.value,
      400,
    );
  },
);

test(
  'operación EJECUCION_COMPLETAR pendiente bloquea una ejecución aunque syncStatus esté limpio',
  ()=>{
    const execution={
      id:'e-clean',
      clientId,
      status:'completed',
      syncStatus:'clean',
      completedAt:'2026-06-01T10:00:00Z',
      results:[
        {
          exerciseId:'sq',
          setNumber:1,
          reps:10,
          loadKg:30,
          rpe:8,
        },
      ],
    };

    const current=state(
      [execution],
      {
        pendingOperations:[
          {
            type:'EJECUCION_COMPLETAR',
            entityId:'e-clean',
            clientId,
            status:'pending',
          },
        ],
      },
    );

    const memory=
      buildExercisePerformanceMemory(
        current,
        clientId,
        'sq',
      );

    assert.equal(
      memory.exposureCount,
      0,
    );

    assert.equal(
      memory.excludedUnconfirmedExposures,
      1,
    );

    assert.equal(
      memory.latest,
      null,
    );

    assert.equal(
      memory.missingReason,
      'no-confirmed-exposures',
    );
  },
);

test(
  'normalización de carga preserva unidad explícita y no inventa significado para cargas opacas',
  ()=>{
    assert.deepEqual(
      normalizeExerciseLoad({
        loadKg:70,
      }),
      {
        raw:'70 kg',
        value:70,
        unit:'kg',
        comparableKey:'kg',
      },
    );

    assert.deepEqual(
      normalizeExerciseLoad({
        load:'154 lb',
      }),
      {
        raw:'154 lb',
        value:154,
        unit:'lb',
        comparableKey:'lb',
      },
    );

    assert.deepEqual(
      normalizeExerciseLoad({
        load:'27,5',
      }),
      {
        raw:'27,5',
        value:27.5,
        unit:null,
        comparableKey:'numeric',
      },
    );

    assert.deepEqual(
      normalizeExerciseLoad({
        load:'TRX · inclinación media',
      }),
      {
        raw:'TRX · inclinación media',
        value:null,
        unit:null,
        comparableKey:null,
      },
    );

    assert.deepEqual(
      normalizeExerciseLoad({}),
      {
        raw:null,
        value:null,
        unit:null,
        comparableKey:null,
      },
    );
  },
);

test(
  'carga sin unidad solo se compara con carga sin unidad y nunca se convierte implícitamente a kg',
  ()=>{
    const executions=[
      {
        id:'e1',
        clientId,
        status:'completed',
        completedAt:'2026-06-01T10:00:00Z',
        results:[
          {
            exerciseId:'press',
            setNumber:1,
            reps:10,
            load:'50',
            rpe:7,
          },
        ],
      },
      {
        id:'e2',
        clientId,
        status:'completed',
        completedAt:'2026-06-08T10:00:00Z',
        results:[
          {
            exerciseId:'press',
            setNumber:1,
            reps:10,
            load:'55',
            rpe:8,
          },
        ],
      },
    ];

    const memory=
      buildExercisePerformanceMemory(
        state(executions),
        clientId,
        'press',
      );

    assert.deepEqual(
      memory.comparison.lastLoad,
      {
        unit:null,
        comparableKey:'numeric',
        value:5,
        percent:10,
      },
    );

    assert.equal(
      memory.latest.volumeKg,
      null,
    );

    assert.equal(
      memory.records.maxLoadKg,
      null,
    );
  },
);

test(
  'series temporizadas y datos ausentes conservan semántica null en lugar de cero',
  ()=>{
    const executions=[
      {
        id:'e1',
        clientId,
        status:'completed',
        completedAt:'2026-06-01T10:00:00Z',
        results:[
          {
            exerciseId:'plank',
            setNumber:1,
            seconds:45,
            rpe:7,
          },
          {
            exerciseId:'plank',
            setNumber:2,
            seconds:60,
            rpe:8,
            notes:'estable',
          },
        ],
      },
    ];

    const memory=
      buildExercisePerformanceMemory(
        state(executions),
        clientId,
        'plank',
      );

    assert.equal(
      memory.latest.totalReps,
      null,
    );

    assert.equal(
      memory.latest.totalSeconds,
      105,
    );

    assert.equal(
      memory.latest.volumeKg,
      null,
    );

    assert.equal(
      memory.latest.lastLoad.raw,
      null,
    );

    assert.equal(
      memory.records.longestSetSeconds.value,
      60,
    );

    assert.equal(
      memory.comparison,
      null,
    );
  },
);

test(
  'sin exposiciones devuelve memoria explícitamente vacía y limita historial sin alterar el conteo total',
  ()=>{
    const empty=
      buildExercisePerformanceMemory(
        state([]),
        clientId,
        'sq',
      );

    assert.equal(empty.latest,null);
    assert.equal(empty.previous,null);
    assert.deepEqual(empty.history,[]);
    assert.equal(empty.exposureCount,0);

    assert.equal(
      empty.missingReason,
      'no-confirmed-exposures',
    );

    const executions=
      Array.from(
        {length:4},
        (_,index)=>({
          id:`e${index}`,
          clientId,
          status:'completed',
          completedAt:
            `2026-06-0${index+1}T10:00:00Z`,
          results:[
            {
              exerciseId:'sq',
              setNumber:1,
              reps:10,
              loadKg:20+index,
            },
          ],
        }),
      );

    const limited=
      buildExercisePerformanceMemory(
        state(executions),
        clientId,
        'sq',
        {limit:2},
      );

    assert.equal(
      limited.exposureCount,
      4,
    );

    assert.equal(
      limited.history.length,
      2,
    );

    assert.equal(
      limited.latest.executionId,
      'e3',
    );

    assert.equal(
      limited.previous.executionId,
      'e2',
    );
  },
);
test(
  'listado de memoria prioriza ejercicios confirmados más recientes y mantiene aislamiento por cliente',
  ()=>{
    const executions=[
      {
        id:'old-squat',
        clientId,
        status:'completed',
        completedAt:'2026-06-01T10:00:00Z',
        results:[
          {
            exerciseId:'squat',
            setNumber:1,
            reps:10,
            loadKg:20,
            rpe:7,
          },
        ],
      },
      {
        id:'new-row',
        clientId,
        status:'completed',
        completedAt:'2026-06-08T10:00:00Z',
        results:[
          {
            exerciseId:'row',
            setNumber:1,
            reps:8,
            loadKg:30,
            rpe:8,
          },
        ],
      },
      {
        id:'other-client',
        clientId:'client-b',
        status:'completed',
        completedAt:'2026-06-20T10:00:00Z',
        results:[
          {
            exerciseId:'press',
            setNumber:1,
            reps:5,
            loadKg:100,
            rpe:9,
          },
        ],
      },
    ];

    const memories=
      listExercisePerformanceMemories(
        state(executions),
        clientId,
        {limit:2},
      );

    assert.equal(memories.length,2);
    assert.equal(memories[0].exerciseId,'row');
    assert.equal(memories[1].exerciseId,'squat');

    assert.ok(
      memories.every(
        (memory)=>memory.clientId===clientId,
      ),
    );

    const limited=
      listExercisePerformanceMemories(
        state(executions),
        clientId,
        {limit:1},
      );

    assert.equal(limited.length,1);
    assert.equal(limited[0].exerciseId,'row');
  },
);
test(
  'tendencia longitudinal separa hechos por métrica comparable sin interpretar progreso',
  ()=>{
    const executions=[
      {
        id:'s1',
        clientId,
        status:'completed',
        completedAt:'2026-06-01T10:00:00Z',
        results:[
          {
            exerciseId:'sq',
            setNumber:1,
            reps:10,
            loadKg:20,
            rpe:7,
            rir:3,
          },
          {
            exerciseId:'sq',
            setNumber:2,
            reps:10,
            loadKg:20,
            rpe:7,
            rir:3,
          },
        ],
      },
      {
        id:'s2',
        clientId,
        status:'completed',
        completedAt:'2026-06-08T10:00:00Z',
        results:[
          {
            exerciseId:'sq',
            setNumber:1,
            reps:10,
            loadKg:22.5,
            rpe:8,
            rir:2,
          },
          {
            exerciseId:'sq',
            setNumber:2,
            reps:8,
            loadKg:22.5,
            rpe:8,
            rir:2,
          },
        ],
      },
      {
        id:'s3',
        clientId,
        status:'completed',
        completedAt:'2026-06-15T10:00:00Z',
        results:[
          {
            exerciseId:'sq',
            setNumber:1,
            reps:8,
            loadKg:25,
            rpe:8.5,
            rir:1,
          },
          {
            exerciseId:'sq',
            setNumber:2,
            reps:8,
            loadKg:25,
            rpe:9,
            rir:1,
          },
        ],
      },
    ];

    const memory=
      buildExercisePerformanceMemory(
        state(executions),
        clientId,
        'sq',
      );

    const trend=
      buildExercisePerformanceTrend(
        memory,
        {window:8},
      );

    assert.equal(
      trend.primaryMetric,
      'load',
    );

    assert.equal(
      trend.metrics.load.pointCount,
      3,
    );

    assert.equal(
      trend.metrics.load.first.value,
      20,
    );

    assert.equal(
      trend.metrics.load.latest.value,
      25,
    );

    assert.equal(
      trend.metrics.load.absoluteDelta,
      5,
    );

    assert.equal(
      trend.metrics.load.percentageDelta,
      25,
    );

    assert.equal(
      trend.metrics.load.direction,
      'up',
    );

    assert.equal(
      trend.averageGapDays,
      7,
    );

    assert.equal(
      trend.interpretation,
      'facts-only',
    );

    assert.equal(
      memory.records.maxComparableLoad.value,
      25,
    );

    assert.equal(
      memory.records.maxComparableLoad.unit,
      'kg',
    );
  },
);

test(
  'ejercicio temporizado usa tiempo como métrica longitudinal sin inventar carga',
  ()=>{
    const executions=[
      {
        id:'p1',
        clientId,
        status:'completed',
        completedAt:'2026-06-01T10:00:00Z',
        results:[
          {
            exerciseId:'plank',
            setNumber:1,
            seconds:40,
            rpe:7,
          },
          {
            exerciseId:'plank',
            setNumber:2,
            seconds:40,
            rpe:7.5,
          },
        ],
      },
      {
        id:'p2',
        clientId,
        status:'completed',
        completedAt:'2026-06-08T10:00:00Z',
        results:[
          {
            exerciseId:'plank',
            setNumber:1,
            seconds:50,
            rpe:8,
          },
          {
            exerciseId:'plank',
            setNumber:2,
            seconds:50,
            rpe:8,
          },
        ],
      },
    ];

    const memory=
      buildExercisePerformanceMemory(
        state(executions),
        clientId,
        'plank',
      );

    const trend=
      buildExercisePerformanceTrend(memory);

    assert.equal(
      trend.primaryMetric,
      'secondsPerSet',
    );

    assert.equal(
      trend.metrics.totalSeconds.first.value,
      80,
    );

    assert.equal(
      trend.metrics.totalSeconds.latest.value,
      100,
    );

    assert.equal(
      trend.metrics.totalSeconds.absoluteDelta,
      20,
    );

    assert.equal(
      trend.metrics.load.pointCount,
      0,
    );

    assert.equal(
      memory.records.maxComparableLoad,
      null,
    );
  },
);

test(
  'carga longitudinal nunca mezcla kg y lb y usa la unidad comparable más reciente',
  ()=>{
    const executions=[
      {
        id:'mixed-old',
        clientId,
        status:'completed',
        completedAt:'2026-06-01T10:00:00Z',
        results:[
          {
            exerciseId:'press',
            setNumber:1,
            reps:10,
            load:'50 kg',
            rpe:7,
          },
        ],
      },
      {
        id:'lb-1',
        clientId,
        status:'completed',
        completedAt:'2026-06-08T10:00:00Z',
        results:[
          {
            exerciseId:'press',
            setNumber:1,
            reps:10,
            load:'100 lb',
            rpe:7,
          },
        ],
      },
      {
        id:'lb-2',
        clientId,
        status:'completed',
        completedAt:'2026-06-15T10:00:00Z',
        results:[
          {
            exerciseId:'press',
            setNumber:1,
            reps:8,
            load:'110 lb',
            rpe:8,
          },
        ],
      },
    ];

    const memory=
      buildExercisePerformanceMemory(
        state(executions),
        clientId,
        'press',
      );

    const trend=
      buildExercisePerformanceTrend(memory);

    assert.equal(
      trend.metrics.load.comparableKey,
      'lb',
    );

    assert.equal(
      trend.metrics.load.unit,
      'lb',
    );

    assert.equal(
      trend.metrics.load.pointCount,
      2,
    );

    assert.equal(
      trend.metrics.load.first.value,
      100,
    );

    assert.equal(
      trend.metrics.load.latest.value,
      110,
    );

    assert.equal(
      trend.metrics.load.absoluteDelta,
      10,
    );

    assert.equal(
      memory.records.maxComparableLoad.value,
      110,
    );

    assert.equal(
      memory.records.maxComparableLoad.unit,
      'lb',
    );
  },
);
test(
  'clasificación semántica distingue evolución de simple subida numérica',
  ()=>{
    const memory=
      buildExercisePerformanceMemory(
        state([
          {
            id:'a1',
            clientId,
            status:'completed',
            completedAt:'2026-06-01T10:00:00Z',
            results:[{
              exerciseId:'sq',
              setNumber:1,
              reps:8,
              loadKg:20,
              rpe:8,
              rir:2,
            }],
          },
          {
            id:'a2',
            clientId,
            status:'completed',
            completedAt:'2026-06-08T10:00:00Z',
            results:[{
              exerciseId:'sq',
              setNumber:1,
              reps:10,
              loadKg:20,
              rpe:8,
              rir:2,
            }],
          },
        ]),
        clientId,
        'sq',
      );

    const assessment=
      assessExercisePerformance(memory);

    assert.equal(
      assessment.status,
      'progress',
    );

    assert.equal(
      assessment.tone,
      'success',
    );

    assert.equal(
      assessment.colorEligible,
      true,
    );

    assert.match(
      assessment.basis,
      /Más repeticiones/,
    );
  },
);

test(
  'menos rendimiento con igual carga y mayor esfuerzo se clasifica como retroceso',
  ()=>{
    const memory=
      buildExercisePerformanceMemory(
        state([
          {
            id:'r1',
            clientId,
            status:'completed',
            completedAt:'2026-06-01T10:00:00Z',
            results:[{
              exerciseId:'sq',
              setNumber:1,
              reps:10,
              loadKg:20,
              rpe:7,
              rir:3,
            }],
          },
          {
            id:'r2',
            clientId,
            status:'completed',
            completedAt:'2026-06-08T10:00:00Z',
            results:[{
              exerciseId:'sq',
              setNumber:1,
              reps:8,
              loadKg:20,
              rpe:8.5,
              rir:1,
            }],
          },
        ]),
        clientId,
        'sq',
      );

    const assessment=
      assessExercisePerformance(memory);

    assert.equal(
      assessment.status,
      'regression',
    );

    assert.equal(
      assessment.tone,
      'danger',
    );

    assert.equal(
      assessment.colorEligible,
      true,
    );
  },
);

test(
  'mismo trabajo con menor esfuerzo puede representar evolución',
  ()=>{
    const memory=
      buildExercisePerformanceMemory(
        state([
          {
            id:'e1',
            clientId,
            status:'completed',
            completedAt:'2026-06-01T10:00:00Z',
            results:[{
              exerciseId:'press',
              setNumber:1,
              reps:10,
              loadKg:30,
              rpe:8.5,
              rir:1,
            }],
          },
          {
            id:'e2',
            clientId,
            status:'completed',
            completedAt:'2026-06-08T10:00:00Z',
            results:[{
              exerciseId:'press',
              setNumber:1,
              reps:10,
              loadKg:30,
              rpe:7,
              rir:3,
            }],
          },
        ]),
        clientId,
        'press',
      );

    const assessment=
      assessExercisePerformance(memory);

    assert.equal(
      assessment.status,
      'progress',
    );

    assert.match(
      assessment.basis,
      /menor esfuerzo/i,
    );
  },
);

test(
  'cambio de carga solo se colorea cuando el ejercicio declara su dirección semántica',
  ()=>{
    const resistanceMemory=
      buildExercisePerformanceMemory(
        state([
          {
            id:'l1',
            clientId,
            status:'completed',
            completedAt:'2026-06-01T10:00:00Z',
            results:[{
              exerciseId:'press',
              setNumber:1,
              reps:10,
              loadKg:20,
              rpe:7.5,
            }],
          },
          {
            id:'l2',
            clientId,
            status:'completed',
            completedAt:'2026-06-08T10:00:00Z',
            results:[{
              exerciseId:'press',
              setNumber:1,
              reps:10,
              loadKg:22.5,
              rpe:8,
            }],
          },
        ]),
        clientId,
        'press',
      );

    assert.equal(
      assessExercisePerformance(
        resistanceMemory,
      ).status,
      'indeterminate',
    );

    assert.equal(
      assessExercisePerformance(
        resistanceMemory,
        {
          loadDirection:
            'higher-is-better',
        },
      ).status,
      'progress',
    );

    const assistanceMemory=
      buildExercisePerformanceMemory(
        state([
          {
            id:'as1',
            clientId,
            status:'completed',
            completedAt:'2026-06-01T10:00:00Z',
            results:[{
              exerciseId:'assisted',
              setNumber:1,
              reps:8,
              loadKg:40,
              rpe:8,
            }],
          },
          {
            id:'as2',
            clientId,
            status:'completed',
            completedAt:'2026-06-08T10:00:00Z',
            results:[{
              exerciseId:'assisted',
              setNumber:1,
              reps:8,
              loadKg:35,
              rpe:8,
            }],
          },
        ]),
        clientId,
        'assisted',
      );

    assert.equal(
      assessExercisePerformance(
        assistanceMemory,
        {
          loadDirection:
            'lower-is-better',
        },
      ).status,
      'progress',
    );
  },
);

test(
  'más carga con caída fuerte de repeticiones y esfuerzo disparado no se pinta verde',
  ()=>{
    const memory=
      buildExercisePerformanceMemory(
        state([
          {
            id:'x1',
            clientId,
            status:'completed',
            completedAt:'2026-06-01T10:00:00Z',
            results:[{
              exerciseId:'sq',
              setNumber:1,
              reps:10,
              loadKg:20,
              rpe:7,
            }],
          },
          {
            id:'x2',
            clientId,
            status:'completed',
            completedAt:'2026-06-08T10:00:00Z',
            results:[{
              exerciseId:'sq',
              setNumber:1,
              reps:5,
              loadKg:25,
              rpe:10,
            }],
          },
        ]),
        clientId,
        'sq',
      );

    const assessment=
      assessExercisePerformance(
        memory,
        {
          loadDirection:
            'higher-is-better',
        },
      );

    assert.equal(
      assessment.status,
      'indeterminate',
    );

    assert.equal(
      assessment.colorEligible,
      false,
    );
  },
);

test(
  'unidades incompatibles permanecen neutrales aunque cambien repeticiones',
  ()=>{
    const memory=
      buildExercisePerformanceMemory(
        state([
          {
            id:'u1',
            clientId,
            status:'completed',
            completedAt:'2026-06-01T10:00:00Z',
            results:[{
              exerciseId:'press',
              setNumber:1,
              reps:8,
              load:'50 kg',
              rpe:8,
            }],
          },
          {
            id:'u2',
            clientId,
            status:'completed',
            completedAt:'2026-06-08T10:00:00Z',
            results:[{
              exerciseId:'press',
              setNumber:1,
              reps:12,
              load:'110 lb',
              rpe:8,
            }],
          },
        ]),
        clientId,
        'press',
      );

    const assessment=
      assessExercisePerformance(
        memory,
        {
          loadDirection:
            'higher-is-better',
        },
      );

    assert.equal(
      assessment.status,
      'indeterminate',
    );

    assert.equal(
      assessment.tone,
      'neutral',
    );
  },
);
test(
  '3A.2 visual truth rejects partial volume and exposes per-set trends',
  ()=>{
    const incomplete=
      buildExercisePerformanceMemory(
        state([
          {
            id:'truth-volume',
            clientId,
            status:'completed',
            completedAt:'2026-07-01T10:00:00Z',
            results:[
              {
                exerciseId:'truth',
                setNumber:1,
                reps:10,
                loadKg:20,
              },
              {
                exerciseId:'truth',
                setNumber:2,
                loadKg:20,
              },
            ],
          },
        ]),
        clientId,
        'truth',
      );

    assert.equal(incomplete.latest.volumeKg,null);

    assert.deepEqual(
      incomplete.latest.volumeCoverage,
      {
        complete:false,
        coveredSets:1,
        totalSets:2,
      },
    );

    const trend=
      buildExercisePerformanceTrend({
        clientId,
        exerciseId:'truth',
        exposureCount:2,
        latest:{
          completedAt:'2026-07-08T10:00:00Z',
          repsPerSet:10,
          secondsPerSet:30,
          peakLoad:{value:20,unit:'kg',comparableKey:'kg'},
        },
        history:[
          {
            completedAt:'2026-07-08T10:00:00Z',
            repsPerSet:10,
            secondsPerSet:30,
            peakLoad:{value:20,unit:'kg',comparableKey:'kg'},
          },
          {
            completedAt:'2026-07-01T10:00:00Z',
            repsPerSet:10,
            secondsPerSet:25,
            peakLoad:{value:20,unit:'kg',comparableKey:'kg'},
          },
        ],
      });

    assert.equal(trend.metrics.repsPerSet.direction,'flat');
    assert.equal(trend.metrics.secondsPerSet.direction,'up');
    assert.equal(trend.metrics.repsPerSet.comparable,true);
    assert.equal(trend.metrics.secondsPerSet.comparable,true);
  },
);

test(
  '3A.2 client projection exposes facts only and rejects cross-client access',
  ()=>{
    const memory=
      buildExercisePerformanceMemory(
        state([
          {
            id:'privacy-1',
            clientId,
            status:'completed',
            completedAt:'2026-07-01T10:00:00Z',
            results:[{
              exerciseId:'press',
              setNumber:1,
              reps:8,
              loadKg:20,
              rpe:8,
              rir:2,
            }],
          },
          {
            id:'privacy-2',
            clientId,
            status:'completed',
            completedAt:'2026-07-08T10:00:00Z',
            results:[{
              exerciseId:'press',
              setNumber:1,
              reps:10,
              loadKg:20,
              rpe:8,
              rir:2,
            }],
          },
        ]),
        clientId,
        'press',
      );

    const projected=
      projectExercisePerformanceForRole(
        memory,
        {
          role:'client',
          viewerClientId:clientId,
          loadDirection:'higher-is-better',
        },
      );

    assert.equal(projected.facts.clientId,clientId);
    assert.equal(projected.coachAssessment,null);
    assert.equal(projected.facts.interpretation,'facts-only');

    const serialized=JSON.stringify(projected);

    assert.doesNotMatch(
      serialized,
      /"methodology"|"confidence"|"basis"|"evidence"/u,
    );

    assert.throws(
      ()=>
        projectExercisePerformanceForRole(
          memory,
          {
            role:'client',
            viewerClientId:'client-other',
          },
        ),
      /CROSS_SCOPE_FORBIDDEN/u,
    );
  },
);

test(
  '3A.2 coach projection receives deterministic assessment separately from facts',
  ()=>{
    const memory=
      buildExercisePerformanceMemory(
        state([
          {
            id:'coach-1',
            clientId,
            status:'completed',
            completedAt:'2026-07-01T10:00:00Z',
            results:[{
              exerciseId:'press',
              setNumber:1,
              reps:8,
              loadKg:20,
              rpe:8,
              rir:2,
            }],
          },
          {
            id:'coach-2',
            clientId,
            status:'completed',
            completedAt:'2026-07-08T10:00:00Z',
            results:[{
              exerciseId:'press',
              setNumber:1,
              reps:10,
              loadKg:20,
              rpe:8,
              rir:2,
            }],
          },
        ]),
        clientId,
        'press',
      );

    const projected=
      projectExercisePerformanceForRole(
        memory,
        {
          role:'coach',
          loadDirection:'higher-is-better',
        },
      );

    assert.equal(projected.facts.interpretation,'facts-only');
    assert.ok(projected.coachAssessment);
    assert.equal(
      projected.coachAssessment.methodology,
      'deterministic-comparable-performance-v1',
    );
    assert.equal(projected.coachAssessment.status,'progress');
    assert.equal(projected.coachAssessment.colorEligible,true);
  },
);
test(
  '3B causal metric follows the actual deterministic reason',
  ()=>{
    const repsAssessment=
      assessExercisePerformance(
        {
          latest:{
            peakLoad:{value:20,unit:'kg',comparableKey:'kg'},
            repsPerSet:10,
            secondsPerSet:null,
            averageRpe:8,
            averageRir:2,
          },
          previous:{
            peakLoad:{value:20,unit:'kg',comparableKey:'kg'},
            repsPerSet:8,
            secondsPerSet:null,
            averageRpe:8,
            averageRir:2,
          },
        },
        {
          loadDirection:'higher-is-better',
        },
      );

    assert.equal(repsAssessment.status,'progress');
    assert.equal(repsAssessment.causalMetric,'repsPerSet');

    const timeAssessment=
      assessExercisePerformance({
        latest:{
          peakLoad:null,
          repsPerSet:null,
          secondsPerSet:30,
          averageRpe:8,
          averageRir:2,
        },
        previous:{
          peakLoad:null,
          repsPerSet:null,
          secondsPerSet:20,
          averageRpe:8,
          averageRir:2,
        },
      });

    assert.equal(timeAssessment.status,'progress');
    assert.equal(timeAssessment.causalMetric,'secondsPerSet');

    const loadAssessment=
      assessExercisePerformance(
        {
          latest:{
            peakLoad:{value:22,unit:'kg',comparableKey:'kg'},
            repsPerSet:10,
            secondsPerSet:null,
            averageRpe:8,
            averageRir:2,
          },
          previous:{
            peakLoad:{value:20,unit:'kg',comparableKey:'kg'},
            repsPerSet:10,
            secondsPerSet:null,
            averageRpe:8,
            averageRir:2,
          },
        },
        {
          loadDirection:'higher-is-better',
        },
      );

    assert.equal(loadAssessment.status,'progress');
    assert.equal(loadAssessment.causalMetric,'load');
  },
);

test(
  '3B ambiguous load semantics never receive a causal load graph',
  ()=>{
    const assessment=
      assessExercisePerformance({
        latest:{
          peakLoad:{value:22,unit:'kg',comparableKey:'kg'},
          repsPerSet:10,
          secondsPerSet:null,
          averageRpe:8,
          averageRir:2,
        },
        previous:{
          peakLoad:{value:20,unit:'kg',comparableKey:'kg'},
          repsPerSet:10,
          secondsPerSet:null,
          averageRpe:8,
          averageRir:2,
        },
      });

    assert.equal(assessment.colorEligible,false);
    assert.notEqual(assessment.causalMetric,'load');
  },
);

test(
  '3B effort improvement can identify the causal effort metric without prescribing',
  ()=>{
    const assessment=
      assessExercisePerformance({
        latest:{
          peakLoad:{value:20,unit:'kg',comparableKey:'kg'},
          repsPerSet:10,
          secondsPerSet:null,
          averageRpe:7,
          averageRir:3,
        },
        previous:{
          peakLoad:{value:20,unit:'kg',comparableKey:'kg'},
          repsPerSet:10,
          secondsPerSet:null,
          averageRpe:8,
          averageRir:2,
        },
      });

    assert.equal(assessment.status,'progress');
    assert.ok(
      assessment.causalMetric==='averageRpe'||
      assessment.causalMetric==='averageRir',
    );
  },
);
