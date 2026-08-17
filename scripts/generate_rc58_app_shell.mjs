import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {execFileSync} from 'node:child_process';

const ROOT=process.cwd();
const SW_REPO_PATH='public/m26/sw.js';
const SW_PATH=path.join(ROOT,SW_REPO_PATH);
const CHECK=process.argv.includes('--check');
const MARKER='const APP_SHELL=/* RC58_GENERATED_APP_SHELL */';

const PUBLIC_EXTENSIONS=new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.png',
  '.webmanifest',
  '.woff2',
]);

const EXCLUDED_REPO_PATHS=new Set([
  'public/m26/runtime-config.js',
  'public/m26/runtime-config.example.js',
  SW_REPO_PATH,
]);

const REQUIRED_STATIC_PATHS=Object.freeze([
  'public/isotipo-iberfit.png',
  'baseline_m25_2/exercise-catalog-m25.json',
  'public/iberfit/exercises/iberfit-exercise-media-v1.json',
  'public/iberfit/exercises/iberfit-exercise-media-v2.json',
  'public/vendor/repdb/iberfit-canonical-media-map-v1.json',
  'public/m26/icons/apple-touch-icon-180.png',
]);

function normalized(value){
  return String(value||'')
    .replaceAll('\\','/')
    .replace(/^\.\/+/u,'');
}

function trackedFiles(){
  const stdout=execFileSync(
    'git',
    ['ls-files','--','src/m26','public/m26'],
    {cwd:ROOT,encoding:'utf8'}
  );

  return stdout
    .split(/\r?\n/u)
    .map(normalized)
    .filter(Boolean);
}

function webPath(repoPath){
  const value=normalized(repoPath);

  if(value.startsWith('public/m26/')){
    return `/m26/${value.slice('public/m26/'.length)}`;
  }

  if(value.startsWith('public/')){
    return `/${value}`;
  }

  if(value.startsWith('src/')){
    return `/${value}`;
  }

  if(value.startsWith('baseline_m25_2/')){
    return `/${value}`;
  }

  throw new Error(`RC58_5C_B_PRECACHE_PATH_UNMAPPED:${value}`);
}

const repoPaths=new Set();

for(const repoPath of trackedFiles()){
  if(EXCLUDED_REPO_PATHS.has(repoPath))continue;

  const extension=path.extname(repoPath).toLowerCase();

  if(
    repoPath.startsWith('src/m26/') &&
    !['.js','.css'].includes(extension)
  ){
    continue;
  }

  if(
    repoPath.startsWith('public/m26/') &&
    !PUBLIC_EXTENSIONS.has(extension)
  ){
    continue;
  }

  repoPaths.add(repoPath);
}

for(const required of REQUIRED_STATIC_PATHS){
  if(!fs.existsSync(path.join(ROOT,required))){
    throw new Error(`RC58_5C_B_REQUIRED_STATIC_MISSING:${required}`);
  }

  repoPaths.add(required);
}

const webPaths=[...repoPaths]
  .map(webPath)
  .sort((a,b)=>a.localeCompare(b,'en'));

for(const forbidden of [
  '/m26/runtime-config.js',
  '/m26/runtime-config.example.js',
  '/m26/sw.js',
]){
  if(webPaths.includes(forbidden)){
    throw new Error(`RC58_5C_B_FORBIDDEN_PRECACHE:${forbidden}`);
  }
}

const generatedLine=
  `${MARKER}${JSON.stringify(webPaths)};`;

const sw=fs.readFileSync(SW_PATH,'utf8').replace(/\r\n/gu,'\n');
const linePattern=/^const APP_SHELL=\/\* RC58_GENERATED_APP_SHELL \*\/.*;$/mu;
const matches=sw.match(new RegExp(linePattern.source,'gmu'))||[];

if(matches.length!==1){
  throw new Error(
    `RC58_5C_B_APP_SHELL_MARKER_COUNT:${matches.length}`
  );
}

const currentLine=matches[0];

if(CHECK){
  if(currentLine!==generatedLine){
    console.error('RC58_5C_B_APP_SHELL_STALE');
    process.exit(1);
  }

  console.log(
    `RC58_5C_B_APP_SHELL=PASS paths=${webPaths.length}`
  );
  process.exit(0);
}

const updated=sw.replace(linePattern,generatedLine);

fs.writeFileSync(SW_PATH,updated,'utf8');

console.log(
  `RC58_5C_B_APP_SHELL=GENERATED paths=${webPaths.length}`
);