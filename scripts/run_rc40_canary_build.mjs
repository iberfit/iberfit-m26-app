import { spawnSync } from 'node:child_process';

const PROJECT_REF = 'tvqnvvwaddcuehqmzvty';
const PRODUCTION_REF = 'pjhmrhejsoofmouedavw';
const BRANCH = 'canary/rc40-business-hardening';
const expectedUrl = `https://${PROJECT_REF}.supabase.co`;

const required = ['M26_SUPABASE_URL', 'M26_SUPABASE_PUBLISHABLE_KEY', 'M26_QA_ONLY'];
const missing = required.filter((name) => !String(process.env[name] || '').trim());
if (missing.length) throw new Error(`RC40_CANARY_ENV_MISSING:${missing.join(',')}`);

const url = String(process.env.M26_SUPABASE_URL).replace(/\/$/u, '');
if (url !== expectedUrl || url.includes(PRODUCTION_REF)) {
  throw new Error(`RC40_CANARY_URL_REQUIRED:${expectedUrl}`);
}
if (String(process.env.M26_QA_ONLY).toLowerCase() !== 'true') {
  throw new Error('RC40_CANARY_QA_ONLY_REQUIRED');
}
const branch = String(process.env.CF_PAGES_BRANCH || BRANCH).trim();
if (branch !== BRANCH) throw new Error(`RC40_CANARY_BRANCH_REQUIRED:${BRANCH}`);

const key = String(process.env.M26_SUPABASE_PUBLISHABLE_KEY).trim();
if (!key) throw new Error('RC40_CANARY_PUBLISHABLE_KEY_MISSING');
if (/service[_-]?role/iu.test(key)) throw new Error('RC40_CANARY_SERVICE_ROLE_FORBIDDEN');

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CF_PAGES_BRANCH: BRANCH,
      M26_SUPABASE_URL: expectedUrl,
      M26_QA_ONLY: 'true',
    },
    stdio: 'inherit',
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

if (process.platform === 'win32') {
  run(process.env.ComSpec || 'cmd.exe', [
    '/d',
    '/s',
    '/c',
    'npm.cmd run build:rc40',
  ]);
} else {
  run('npm', ['run', 'build:rc40']);
}
run(process.execPath, ['scripts/patch_rc40_canary_runtime_source.mjs']);
run(process.execPath, ['scripts/generate_rc40_runtime_config.mjs']);
run(process.execPath, ['scripts/verify_rc40_canary_candidate.mjs']);

console.log(JSON.stringify({
  ok: true,
  release: 'IBERFIT_M26_CANARY_RC40_ADMIN_COMPLETE',
  branch: BRANCH,
  projectRef: PROJECT_REF,
  qaOnly: true,
  productionModified: false,
  productionDeployed: false,
}, null, 2));