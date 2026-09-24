from pathlib import Path


def replace_once(path, old, new):
    p=Path(path)
    text=p.read_text(encoding='utf-8')
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}: {old[:160]!r}')
    p.write_text(text.replace(old,new,1),encoding='utf-8')


def replace_block(path, start, end, new):
    p=Path(path)
    text=p.read_text(encoding='utf-8')
    i=text.find(start)
    j=text.find(end,i+len(start))
    if i<0 or j<0:
        raise SystemExit(f'{path}: deterministic block markers not found')
    p.write_text(text[:i]+new+text[j:],encoding='utf-8')


# Preserve the authenticated user's own activation evidence.
replace_once(
    'src/m26/security/role-projection.js',
    "for(const key of ['name','displayName','firstName','lastName','email','status'])",
    "for(const key of ['name','displayName','firstName','lastName','email','status','lastAccessAt'])",
)

# Keep the self-journey derivation in the neutral onboarding domain module so onboarding does
# not depend on the large Coach view-model (and cannot form a UI-layer import cycle).
replace_once(
    'src/m26/rc39/view-model.js',
    "import {deriveCoachLaunchJourney,isCoachLaunchPlanningPublished} from '../onboarding/coach-launch-journey.js';\nimport {confirmedSessionExecutionsForClient} from '../domain/session-execution-truth.js';",
    "import {deriveCoachSelfLaunchJourney} from '../onboarding/coach-launch-journey.js';\nexport {deriveCoachSelfLaunchJourney};",
)
replace_block(
    'src/m26/rc39/view-model.js',
    'function confirmedCompletedSessions(',
    'const compactAppointment=',
    '',
)
replace_once(
    'src/m26/onboarding/progressive-onboarding.js',
    "import {deriveCoachSelfLaunchJourney} from '../rc39/view-model.js';",
    "import {deriveCoachSelfLaunchJourney} from './coach-launch-journey.js';",
)

# Existing self-journey regression fixtures now use the same persisted activation/profile facts as Admin.
p='tests/m26_coach_launch_self_journey.test.mjs'
text=Path(p).read_text(encoding='utf-8')
text=text.replace(
    "identity:{id:'coach-1',role:'coach',name:'Coach IBERFIT'},",
    "identity:{id:'coach-1',role:'coach',name:'Coach IBERFIT',email:'coach@iberfit.cl',status:'active',lastAccessAt:'2026-09-06T11:55:00.000Z'},",
)
text=text.replace(
    "test('Coach self-launch is role scoped and treats the current authenticated session as activation evidence',()=>{",
    "test('Coach self-launch is role scoped and uses persisted last sign-in as activation evidence',()=>{",
)
text=text.replace(
    "identity:{id:'coach-1',role:'coach'},\n    now:new Date('2026-09-06T12:00:00Z'),",
    "identity:{id:'coach-1',role:'coach',name:'Coach IBERFIT',email:'coach@iberfit.cl',status:'active',lastAccessAt:'2026-09-06T11:55:00.000Z'},",
    1,
)
text=text.replace(
    "  assert.equal(journey.milestones.find((item)=>item.id==='profile').complete,false);\n  assert.equal(journey.profileVerified,false);\n  assert.equal(journey.accountStatusVerified,false);",
    "  assert.equal(journey.milestones.find((item)=>item.id==='profile').complete,true);\n  assert.equal(journey.profileVerified,true);\n  assert.equal(journey.accountStatusVerified,true);",
    1,
)
text=text.replace(
    "sessionExecutions:[{id:'execution-1',clientId:'client-1',status:'completed',completedAt:'2026-09-05T10:00:00Z',syncStatus:'clean'}],",
    "sessionExecutions:[{id:'execution-1',clientId:'client-1',started_by:'coach-1',execution_status:'cerrada_confirmada',remote_confirmed_at:'2026-09-05T10:00:00Z',syncStatus:'clean'}],",
)
text=text.replace("  assert.equal(milestones.get('profile'),false);\n  assert.equal(journey.completedCount,5);\n  assert.equal(journey.percent,83);\n  assert.equal(journey.ready,false);",
                  "  assert.equal(milestones.get('profile'),true);\n  assert.equal(journey.completedCount,6);\n  assert.equal(journey.percent,100);\n  assert.equal(journey.ready,true);",1)
text=text.replace("  assert.match(operationalMarkup,/5 de 6 hitos verificados/u);\n  assert.match(operationalMarkup,/83%/u);",
                  "  assert.match(operationalMarkup,/6 de 6 hitos verificados/u);\n  assert.match(operationalMarkup,/100%/u);",1)
text=text.replace("  assert.match(operationalMarkup,/Pendiente de verificación administrativa/u);",
                  "  assert.match(operationalMarkup,/Coach listo/u);",1)
# Any direct shell identities must carry the same own identity evidence; do not infer readiness from hydration.
text=text.replace(
    "identity:{id:'coach-1',role:'coach',name:'Coach IBERFIT'},\n    activeArea:'hoy',",
    "identity:{id:'coach-1',role:'coach',name:'Coach IBERFIT',email:'coach@iberfit.cl',status:'active',lastAccessAt:'2026-09-06T11:55:00.000Z'},\n    activeArea:'hoy',",
)
Path(p).write_text(text,encoding='utf-8')
