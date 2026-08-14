import {IBERFIT_DESIGN_TOKENS} from './tokens.generated.js';

const density=IBERFIT_DESIGN_TOKENS.density;

export const IBERFIT_ROLE_SURFACE_CONTRACT=Object.freeze({
  version:'58.4.0',
  sharedProductLanguage:true,
  noBusinessLogic:true,
  roles:Object.freeze({
    client:Object.freeze({
      role:'client',
      density:'calm',
      controlMinPx:density.client.controlMinPx,
      gapPx:density.client.gapPx,
      priorities:Object.freeze([
        'next-action',
        'progress',
        'reassurance',
        'mobile-first',
      ]),
    }),
    coach:Object.freeze({
      role:'coach',
      density:'professional',
      controlMinPx:density.coach.controlMinPx,
      gapPx:density.coach.gapPx,
      priorities:Object.freeze([
        'comparison',
        'context',
        'fast-action',
        'keyboard-efficiency',
      ]),
    }),
    admin:Object.freeze({
      role:'admin',
      density:'operational',
      controlMinPx:density.admin.controlMinPx,
      gapPx:density.admin.gapPx,
      priorities:Object.freeze([
        'organizational-visibility',
        'permissions',
        'auditability',
        'high-density',
      ]),
    }),
  }),
});

export function roleSurfaceFor(role){
  return IBERFIT_ROLE_SURFACE_CONTRACT.roles[String(role||'').trim().toLowerCase()]||null;
}

export function roleSurfaceAudit(){
  const roles=Object.values(IBERFIT_ROLE_SURFACE_CONTRACT.roles);
  const names=new Set(roles.map((item)=>item.role));
  const touchTargetsValid=roles.every((item)=>item.controlMinPx>=44);
  const densityOrder=
    density.client.gapPx>density.coach.gapPx &&
    density.coach.gapPx>density.admin.gapPx;

  return Object.freeze({
    ok:
      IBERFIT_ROLE_SURFACE_CONTRACT.sharedProductLanguage===true &&
      IBERFIT_ROLE_SURFACE_CONTRACT.noBusinessLogic===true &&
      names.size===3 &&
      touchTargetsValid &&
      densityOrder,
    roleCount:roles.length,
    touchTargetsValid,
    densityOrder,
  });
}