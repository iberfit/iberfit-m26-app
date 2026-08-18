import {promises as fs} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(here,'../..');
const candidate=await fs.realpath(path.join(repoRoot,'.tmp','rc64-current-surface'));
process.chdir(candidate);
await import('./static-server.mjs');