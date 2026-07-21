import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellRoot = path.join(root, 'src', 'm26', 'shell');
const checks = [];
const failed = [];
function check(name, ok, detail = '') { checks.push({ name, ok, detail }); if (!ok) failed.push(name); }

const entries = await readdir(shellRoot, { withFileTypes: true });
const files = entries.filter((entry) => entry.isFile()).map((entry) => path.join(shellRoot, entry.name));
const content = Object.fromEntries(await Promise.all(files.map(async (file) => [path.basename(file), await readFile(file, 'utf8')])));
const joinedJs = Object.entries(content).filter(([name]) => name.endsWith('.js')).map(([, text]) => text).join('\n');
const css = content['shell.css'] || '';

for (const name of ['role-policy.js', 'navigation.js', 'route-guard.js', 'shell-view-model.js', 'shell-render.js', 'shell-controller.js', 'index.js', 'shell.css']) {
  check(`Existe ${name}`, Boolean(content[name]));
}
check('Shell mantiene separación de roles', joinedJs.includes("role === 'client'") && joinedJs.includes("role === 'admin' || role === 'coach'"));
check('Cliente no recibe navegación Clientes', /client:[\s\S]*primary:\s*\['hoy', 'planificacion', 'sesion', 'progreso'\]/.test(joinedJs));
check('Contexto Coach incluye Expediente e IRI', /context:\s*\[[^\]]*'expediente'[^\]]*'iri'/.test(joinedJs));
check('Rutas por cliente exigen selección visible', joinedJs.includes('M26_CLIENT_CONTEXT_REQUIRED') && joinedJs.includes('M26_CLIENT_NOT_VISIBLE'));
check('Shell no contiene diálogos bloqueantes', !/\b(?:prompt|alert|confirm)\s*\(/.test(joinedJs));
check('Shell no contiene manejadores HTML inline', !/onclick\s*=|onchange\s*=/i.test(joinedJs));
check('Shell usa contenido central con scroll interno', css.includes('height: 100dvh') && css.includes('.m26-main') && css.includes('overflow-y: auto'));
check('Shell incluye foco visible', css.includes(':focus-visible'));
check('Shell mantiene paleta IBERFIT', css.includes('--m26-forest-950') && css.includes('--m26-gold-500') && css.includes('--m26-cream-100'));
check('Shell incluye navegación móvil', css.includes('.m26-mobile-nav') && joinedJs.includes('Navegación rápida'));
check('Shell no accede directamente a tablas Supabase', !/\/rest\/v1\/(?!rpc\/)/.test(joinedJs));

const report = { generatedAt: new Date().toISOString(), pass: failed.length === 0, total: checks.length, passed: checks.filter((item) => item.ok).length, failed, checks };
await import('node:fs/promises').then(({ writeFile }) => writeFile(path.join(root, 'recovery', 'm26-shell-gate-results.json'), JSON.stringify(report, null, 2) + '\n'));
console.log(JSON.stringify(report, null, 2));
if (failed.length) process.exitCode = 1;
