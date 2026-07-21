// IBERFIT · configuración pública de producción.
// Solo contiene la clave pública necesaria para iniciar la aplicación.
const host = globalThis.location?.hostname || '';
const allowedHost = host === 'localhost'
  || host === '127.0.0.1'
  || host.endsWith('.pages.dev')
  || host === 'iberfit-cl.workers.dev'
  || host.endsWith('.iberfit-cl.workers.dev')
  || host === 'app.iberfit.cl'
  || host === 'coach.iberfit.cl';

globalThis.__IBERFIT_SUPABASE__ = Object.freeze({
  enabled: allowedHost,
  syntheticOnly: false,
  allowRealData: true,
  environment: 'PRODUCTION',
  authMode: 'supabase-production',
  url: 'https://pjhmrhejsoofmouedavw.supabase.co',
  anonKey: 'sb_publishable_R5hU49RTDLAFFx46j4b4Hg_l8o0Pg2k',
  documentsBucket: 'iberfit-documents-private',
  timeoutMs: 12000,
  preview: Object.freeze({ enabled: false, audience: 'comercial', channel: 'production' }),
});
