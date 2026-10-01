import {cp,mkdir,rename,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const scriptDir=path.dirname(new URL(import.meta.url).pathname);
const repoRoot=path.resolve(scriptDir,'../..');
const outputArg=String(process.argv[2]||process.env.IBERFIT_DIST_DIR||'dist-current').trim();
const outputDir=path.resolve(repoRoot,outputArg);
const tempDir=path.resolve(repoRoot,`${outputArg}.tmp-${process.pid}`);
const sha=String(process.env.GITHUB_SHA||process.env.SHA||process.env.COMMIT_SHA||'').trim()||'unknown';

const entries=Object.freeze([
  ['public/m26/index.html','index.html'],
  ['public/m26','m26'],
  ['src/m26','src/m26'],
  ['baseline_m25_2/exercise-catalog-m25.json','baseline_m25_2/exercise-catalog-m25.json'],
  ['public/isotipo-iberfit.png','public/isotipo-iberfit.png'],
  ['public/iberfit-email-isotipo.png','public/iberfit-email-isotipo.png'],
  ['public/iberfit-email-access-hero.jpg','public/iberfit-email-access-hero.jpg'],
  ['public/iberfit','public/iberfit'],
  ['public/vendor/repdb','public/vendor/repdb'],
]);

async function copyEntry(sourceRelative,targetRelative){
  const source=path.resolve(repoRoot,sourceRelative);
  const target=path.resolve(tempDir,targetRelative);
  await mkdir(path.dirname(target),{recursive:true});
  await cp(source,target,{recursive:true,force:true,errorOnExist:false,dereference:false,preserveTimestamps:false});
}

async function main(){
  await rm(tempDir,{recursive:true,force:true});
  await mkdir(tempDir,{recursive:true});
  try{
    for(const [source,target] of entries){
      await copyEntry(source,target);
    }
    const meta={
      sha,
      builtAt:new Date().toISOString(),
      source:'canonical-current-surface',
    };
    await mkdir(path.join(tempDir,'__iberfit'),{recursive:true});
    await writeFile(path.join(tempDir,'__iberfit','build.json'),`${JSON.stringify(meta)}\n`,'utf8');
    await rm(outputDir,{recursive:true,force:true});
    await rename(tempDir,outputDir);
    console.log(`[build-current-surface] built=${path.relative(repoRoot,outputDir)||outputDir} sha=${sha}`);
  }catch(error){
    await rm(tempDir,{recursive:true,force:true});
    throw error;
  }
}
await main();
