import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {execFileSync} from 'node:child_process';

const ROOT=process.cwd();

const TEXT_EXTENSIONS=new Set([
  '.css','.gradle','.html','.js','.json','.kt','.kts','.md','.mjs',
  '.properties','.ps1','.sql','.svg','.toml','.txt','.webmanifest',
  '.xml','.yaml','.yml',
]);

const TEXT_NAMES=new Set([
  '.gitignore',
  '.gitattributes',
  'CODEOWNERS',
  'LICENSE',
]);

const SUSPECT_PATTERNS=[
  /\u00c3[\u0080-\u00bf]/u,
  /\u00c2[\u0080-\u00bf]/u,
  /\u00e2(?:\u20ac|\u0080|\u0081|\u0082|\u0083|\u0084|\u0085|\u0086|\u0087|\u0088|\u0089|\u008a|\u008b|\u008c|\u008e|\u0091|\u0092|\u0093|\u0094|\u0095|\u0096|\u0097|\u0098|\u0099|\u009a|\u009b|\u009c|\u009e|\u009f|\u2018|\u2019|\u201c|\u201d|\u2020|\u2021|\u2022|\u2026|\u2030|\u2039|\u203a|\u2122)/u,
  /\u00ef\u00bb\u00bf/u,
  /\u00f0\u0178/u,
  /\ufffd/u,
];

function normalized(value){
  return String(value||'').replaceAll('\\','/');
}

function isTextCandidate(repoPath){
  const name=path.basename(repoPath);
  const extension=path.extname(repoPath).toLowerCase();

  return (
    TEXT_NAMES.has(name) ||
    TEXT_EXTENSIONS.has(extension)
  );
}

function trackedFiles(){
  const stdout=execFileSync(
    'git',
    ['ls-files'],
    {cwd:ROOT,encoding:'utf8'}
  );

  return stdout
    .split(/\r?\n/u)
    .map(normalized)
    .filter(Boolean);
}

const findings=[];

for(const repoPath of trackedFiles()){
  if(!isTextCandidate(repoPath))continue;

  const full=path.join(ROOT,repoPath);

  if(!fs.existsSync(full))continue;

  const bytes=fs.readFileSync(full);

  if(bytes.includes(0))continue;

  let text;

  try{
    text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }catch{
    findings.push({
      path:repoPath,
      kind:'INVALID_UTF8',
    });
    continue;
  }

  for(const pattern of SUSPECT_PATTERNS){
    if(pattern.test(text)){
      findings.push({
        path:repoPath,
        kind:'MOJIBAKE',
      });
      break;
    }
  }
}

if(findings.length){
  for(const finding of findings){
    console.error(
      `IBERFIT_ENCODING_FINDING=${finding.kind}|${finding.path}`
    );
  }

  console.error(
    `IBERFIT_ENCODING_INTEGRITY=FAIL count=${findings.length}`
  );
  process.exit(1);
}

console.log('IBERFIT_ENCODING_INTEGRITY=PASS');