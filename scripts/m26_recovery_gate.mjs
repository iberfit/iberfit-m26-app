import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const activeRoot = path.join(root, 'src', 'm26');
const checks=[];
const failed=[];
function check(name, ok, detail='') { checks.push({name,ok,detail}); if(!ok) failed.push(name); }
async function walk(dir) {
  const out=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const target=path.join(dir,entry.name);
    if(entry.isDirectory()) out.push(...await walk(target)); else out.push(target);
  }
  return out;
}
const files=(await walk(activeRoot)).filter((file)=>file.endsWith('.js'));
const sources=await Promise.all(files.map(async(file)=>({file,text:await readFile(file,'utf8')})));
const joined=sources.map((item)=>item.text).join('\n');
const forbidden=[/\bprompt\s*\(/, /\balert\s*\(/, /\bconfirm\s*\(/, /window\.open\s*\(/, /document\.write\s*\(/];
check('Núcleo activo M26 existe', files.length >= 4, `${files.length} módulos recuperados`);
for(const rule of forbidden) check(`M26 no contiene ${rule}`, !rule.test(joined));
const executableWithoutDetector = sources.filter((item) => !item.file.endsWith('production-state.js')).map((item) => item.text).join('\n');
check('M26 no contiene fixtures productivos', !/(?:CLI-DEMO|USR-DEMO|demo\.iberfit|cliente\s+sint[eé]tico)/i.test(executableWithoutDetector));
check('Transporte usa bootstrap v26', joined.includes('iberfit_bootstrap_v26'));
check('Transporte usa preflight v26', joined.includes('iberfit_command_preflight_v26'));
check('Transporte usa execute v26', joined.includes('iberfit_execute_command_v26'));
check('pages.dev queda fuera de hosts remotos permitidos', !joined.includes("host.endsWith('.pages.dev')") && !joined.includes(".pages.dev'"));
check('Estado productivo define colecciones vacías', joined.includes("M26_COLLECTION_KEYS.map((key) => [key, []])"));
check('Command Bus sanitiza operaciones', joined.includes('sanitizeOperation'));
check('ACK obliga rehidratación', joined.includes("await rehydrate({ reason: kind, response })"));
check('Store separa pendientes, conflictos y rechazadas', joined.includes('pendingOperations') && joined.includes('conflicts') && joined.includes('rejectedOperations'));
const report={generatedAt:new Date().toISOString(),pass:failed.length===0,total:checks.length,passed:checks.filter(x=>x.ok).length,failed,checks};
console.log(JSON.stringify(report,null,2));
if(failed.length) process.exitCode=1;
