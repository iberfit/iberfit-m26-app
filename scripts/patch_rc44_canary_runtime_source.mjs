import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const buildRoot = process.env.M26_BUILD_DIR
  || path.join(root, 'dist', 'm26-prepublicacion-infraestructura-candidate');
const transportPath = path.join(buildRoot, 'src', 'm26', 'supabase-transport.js');
const applicationPath = path.join(buildRoot, 'src', 'm26', 'app', 'application.js');
const iriExternalReportPath = path.join(buildRoot, 'src', 'm26', 'workflows', 'iri-external-report-controller.js');

const CANARY_REF = 'tvqnvvwaddcuehqmzvty';
const PRODUCTION_REF = 'pjhmrhejsoofmouedavw';

function readRequired(file, label) {
  if (!fs.existsSync(file)) throw new Error(`RC44_PATCH_MISSING:${label}`);
  return fs.readFileSync(file, 'utf8').replace(/\r\n?/gu, '\n');
}

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`RC44_PATCH_ANCHOR_MISSING:${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) {
    throw new Error(`RC44_PATCH_ANCHOR_DUPLICATE:${label}`);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

let transport = readRequired(transportPath, 'transport');
let application = readRequired(applicationPath, 'application');
let iriExternalReport = readRequired(iriExternalReportPath, 'iri-external-report-controller');

transport = replaceOnce(
  transport,
  `export const M26_CANONICAL_PROJECT_REF='${PRODUCTION_REF}';`,
  `export const M26_CANONICAL_PROJECT_REF='${CANARY_REF}';`,
  'canonical-project-ref',
);

iriExternalReport = replaceOnce(
  iriExternalReport,
  `const CANONICAL_PROJECT_REF = '${PRODUCTION_REF}';`,
  `const CANONICAL_PROJECT_REF = '${CANARY_REF}';`,
  'iri-external-report-project-ref',
);

transport = replaceOnce(
  transport,
  "const MAX_AUTH_EMAIL_CHARS=254;\nconst MAX_RESPONSE_BYTES=20_000_000;",
  [
    "const MAX_AUTH_EMAIL_CHARS=254;",
    "const QA_AUTHORIZED_EMAILS=new Set(['iberfit.cl@gmail.com']);",
    "function qaAuthorizedEmail(value){const email=String(value||'').trim().toLowerCase();return email.startsWith('iberfit.cl+qa.')||QA_AUTHORIZED_EMAILS.has(email);}",
    "const MAX_RESPONSE_BYTES=20_000_000;",
  ].join('\n'),
  'qa-authorized-email-helper',
);

transport = replaceOnce(
  transport,
  [
    "  const exactRemote = EXACT_REMOTE_HOSTS.has(host);",
    "  const canary = host === 'm26-canary.iberfit.cl';",
    "  const qaOnly = canary || Boolean(raw?.qaOnly);",
    "  const enabled = Boolean(raw?.enabled) && (local || (qaOnly ? canary : exactRemote));",
  ].join('\n'),
  [
    "  const configuredHosts=new Set((Array.isArray(raw?.allowedHosts)?raw.allowedHosts:[]).map((value)=>String(value||'').trim().toLowerCase()).filter((value)=>/^[a-z0-9.-]+$/u.test(value)));",
    "  const exactRemote = EXACT_REMOTE_HOSTS.has(host);",
    "  const configuredCanary = configuredHosts.has(host);",
    "  const projectPreview = /^[a-z0-9-]+\\.iberfit-m26-canary\\.pages\\.dev$/u.test(host);",
    "  const canary = host === 'm26-canary.iberfit.cl' || configuredCanary || projectPreview;",
    "  const qaOnly = canary || Boolean(raw?.qaOnly);",
    "  const enabled = Boolean(raw?.enabled) && (local || (qaOnly ? canary : exactRemote));",
  ].join('\n'),
  'preview-host-resolution',
);

transport = replaceOnce(
  transport,
  "!String(body.user.email || '').toLowerCase().startsWith('iberfit.cl+qa.')",
  "!qaAuthorizedEmail(body.user.email)",
  'login-qa-account',
);

transport = replaceOnce(
  transport,
  [
    "      runtime.qaOnly &&",
    "      !normalizedEmail.startsWith('iberfit.cl+qa.')",
  ].join('\n'),
  "      runtime.qaOnly &&\n      !qaAuthorizedEmail(normalizedEmail)",
  'recovery-request-qa-account',
);

transport = replaceOnce(
  transport,
  [
    "    if (",
    "      redirect.origin !== 'https://m26-canary.iberfit.cl' ||",
    "      redirect.pathname !== '/' ||",
  ].join('\n'),
  [
    "    const expectedRecoveryOrigin = runtime.canary && runtime.host",
    "      ? `https://${runtime.host}`",
    "      : '';",
    "",
    "    if (",
    "      redirect.origin !== expectedRecoveryOrigin ||",
    "      redirect.pathname !== '/' ||",
  ].join('\n'),
  'dynamic-recovery-origin',
);

transport = replaceOnce(
  transport,
  "if (runtime.qaOnly && !email.startsWith('iberfit.cl+qa.'))",
  "if (runtime.qaOnly && !qaAuthorizedEmail(email))",
  'password-update-qa-account',
);

transport = replaceOnce(
  transport,
  "if(runtime.qaOnly&&!String(body.user.email||'').toLowerCase().startsWith('iberfit.cl+qa.'))",
  "if(runtime.qaOnly&&!qaAuthorizedEmail(body.user.email))",
  'refresh-qa-account',
);

application = replaceOnce(
  application,
  "      'https://m26-canary.iberfit.cl/'",
  "      new URL('/', locationLike?.origin || `https://${locationLike?.hostname}`).href",
  'recovery-current-origin',
);

if (transport.includes(PRODUCTION_REF)) {
  throw new Error('RC44_PATCH_PRODUCTION_REF_REMAINS');
}
if (!transport.includes(CANARY_REF)) {
  throw new Error('RC44_PATCH_CANARY_REF_MISSING');
}
if (iriExternalReport.includes(PRODUCTION_REF)) {
  throw new Error('RC44_PATCH_IRI_PRODUCTION_REF_REMAINS');
}
if (!iriExternalReport.includes(CANARY_REF)) {
  throw new Error('RC44_PATCH_IRI_CANARY_REF_MISSING');
}
if (!transport.includes("QA_AUTHORIZED_EMAILS=new Set(['iberfit.cl@gmail.com'])")) {
  throw new Error('RC44_PATCH_CARLOS_ALLOWLIST_MISSING');
}
if (!application.includes("locationLike?.origin")) {
  throw new Error('RC44_PATCH_RECOVERY_ORIGIN_MISSING');
}

fs.writeFileSync(transportPath, transport, 'utf8');
fs.writeFileSync(applicationPath, application, 'utf8');
fs.writeFileSync(iriExternalReportPath, iriExternalReport, 'utf8');

const PRODUCTION_ORIGIN = `https://${PRODUCTION_REF}.supabase.co`;
const CANARY_ORIGIN = `https://${CANARY_REF}.supabase.co`;
const cspPatched = [];

function walk(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }

    if (
      entry.name !== '_headers' &&
      !entry.name.endsWith('.html')
    ) {
      continue;
    }

    const source = fs.readFileSync(absolute, 'utf8');
    if (!source.includes('connect-src') || !source.includes(PRODUCTION_ORIGIN)) {
      continue;
    }

    const updated = source.replaceAll(PRODUCTION_ORIGIN, CANARY_ORIGIN);
    if (updated === source || updated.includes(PRODUCTION_ORIGIN)) {
      throw new Error(`RC44_CSP_PATCH_FAILED:${absolute}`);
    }
    fs.writeFileSync(absolute, updated, 'utf8');
    cspPatched.push(path.relative(root, absolute).replaceAll(path.sep, '/'));
  }
}
walk(buildRoot);

if (cspPatched.length === 0) {
  throw new Error('RC44_CSP_SOURCE_NOT_FOUND');
}

console.log(JSON.stringify({
  ok: true,
  release: 'IBERFIT_M26_CANARY_RC44_ZERO_COST_WEARABLES',
  projectRef: CANARY_REF,
  patched: [
    path.relative(root, transportPath).replaceAll(path.sep, '/'),
    path.relative(root, applicationPath).replaceAll(path.sep, '/'),
    path.relative(root, iriExternalReportPath).replaceAll(path.sep, '/'),
    ...cspPatched,
  ],
  csp: {
    productionOriginPresent: false,
    canaryOrigin: CANARY_ORIGIN,
    files: cspPatched,
  },
  productionModified: false,
  productionDeployed: false,
}, null, 2));