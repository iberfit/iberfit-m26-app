import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const args=['--allowJs','--checkJs','false','--module','amd','--target','ES2022','--skipLibCheck','--noEmitOnError','false','--outFile','qa/rc21_bundle.js','qa/rc17_integrated_app.js'];
const result=spawnSync('tsc',args,{encoding:'utf8'});if(result.status!==0&&!fs.existsSync('qa/rc21_bundle.js')){console.error(result.stdout||result.stderr);process.exit(result.status||1);}if(result.stdout?.trim())console.log(result.stdout.trim());if(!fs.existsSync('qa/rc21_bundle.js'))throw new Error('RC21_BUNDLE_MISSING');console.log(`RC21 AMD bundle ${fs.statSync('qa/rc21_bundle.js').size} bytes`);
