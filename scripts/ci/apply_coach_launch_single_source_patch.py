from pathlib import Path


def replace_once(path, old, new):
    p=Path(path)
    text=p.read_text(encoding='utf-8')
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{path}: expected exactly one match, found {count}: {old[:180]!r}')
    p.write_text(text.replace(old,new,1),encoding='utf-8')


# Client records use their own id; never stringify the whole object as fallback.
replace_once(
    'src/m26/onboarding/coach-launch-journey.js',
    "function recordClientId(record){return recordId(field(record,'clientId','client_id')||recordId(record));}",
    "function recordClientId(record){return recordId(field(record,'clientId','client_id','id','entityId','entity_id'));}",
)

# A Coach is still genuinely starting until there is operational evidence beyond identity/profile.
replace_once(
    'src/m26/rc39/route-render.js',
    "  const completedCount=Math.max(0,Number(journey.completedCount||0));\n  const launchExpanded=!journey.ready&&completedCount<=2;",
    "  const operationalStarted=(journey.milestones||[]).some((item)=>['client','planning','session'].includes(item?.id)&&item?.complete===true);\n  const launchExpanded=!journey.ready&&!operationalStarted;",
)

# Parity requires the same persisted first-access evidence that Admin uses.
replace_once(
    'tests/m26_coach_launch_identity_parity.test.mjs',
    "const identity={id:'coach-1',role:'coach',name:'Carlos',email:'coach@iberfit.cl',status:'active'};",
    "const identity={id:'coach-1',role:'coach',name:'Carlos',email:'coach@iberfit.cl',status:'active',lastAccessAt:'2026-09-24T12:30:00Z'};",
)

# A fully verified own profile must not render the administrative verification warning.
replace_once(
    'tests/m26_coach_launch_self_journey.test.mjs',
    "  assert.match(markup,/Pendiente de verificación administrativa/u);",
    "  assert.match(markup,/3 de 6 hitos verificados/u);\n  assert.match(markup,/Perfil verificado/u);\n  assert.doesNotMatch(markup,/Pendiente de verificación administrativa/u);",
)
