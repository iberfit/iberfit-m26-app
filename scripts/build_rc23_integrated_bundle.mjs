import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const args=['--allowJs','--checkJs','false','--module','amd','--target','ES2022','--skipLibCheck','--noEmitOnError','false','--outFile','qa/rc23_bundle.js','qa/rc23_integrated_app.js'];
const result=spawnSync('tsc',args,{encoding:'utf8'});if(result.status!==0&&!fs.existsSync('qa/rc23_bundle.js')){console.error(result.stdout||result.stderr);process.exit(result.status||1);}if(result.stdout?.trim())console.log(result.stdout.trim());if(!fs.existsSync('qa/rc23_bundle.js'))throw new Error('RC23_BUNDLE_MISSING');console.log(`RC23 AMD bundle ${fs.statSync('qa/rc23_bundle.js').size} bytes`);
