import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root=process.cwd();
const args=process.argv.slice(2);
const value=(flag,fallback='')=>{
  const index=args.indexOf(flag);
  return index>=0?String(args[index+1]||''):fallback;
};
const base=value('--base',process.env.M26_FAST_LANE_BASE||'HEAD^');
const head=value('--head',process.env.M26_FAST_LANE_HEAD||'HEAD');
const evidenceDir=path.join(root,'recovery','fast-lane');
fs.mkdirSync(evidenceDir,{recursive:true});

function git(args){
  const result=spawnSync('git',args,{cwd:root,encoding:'utf8'});
  if(result.status!==0)throw new Error(`FAST_LANE_GIT_FAILED:${args.join(' ')}\n${result.stderr||result.stdout||''}`);
  return String(result.stdout||'').trim();
}

const changed=git(['diff','--name-only',`${base}...${head}`])
  .split(/\r?\n/u).map((item)=>item.trim()).filter(Boolean);

const selected=new Set();
const add=(...tests)=>tests.forEach((test)=>selected.add(test));
const matches=(pattern)=>changed.some((file)=>pattern.test(file));

if(matches(/^src\/m26\/shell\//u)) add(
  'tests/m26_shell_roles.test.mjs',
  'tests/m26_role_route_navigation_contract.test.mjs',
  'tests/m26_rc75_native_workspace_stability.test.mjs',
);
if(matches(/^src\/m26\/productivity\/coach-productivity\.js$/u)) add(
  'tests/m26_rc60_1_coach_productivity_search_commands.test.mjs',
  'tests/m26_rc75_native_workspace_stability.test.mjs',
);
if(matches(/^src\/m26\/ui\/(?:native-workspace|preferences|i18n|castellano)\.js$/u)) add(
  'tests/m26_rc71_2_preferences_i18n.test.mjs',
  'tests/m26_rc75_native_workspace_stability.test.mjs',
);
if(matches(/^src\/m26\/admin\//u)) add(
  'tests/m26_rc40_admin_complete.test.mjs',
  'tests/m26_rc75_native_workspace_stability.test.mjs',
);
if(matches(/^src\/m26\/modules\/(?:route-render|route-view-model)\.js$/u)) add(
  'tests/m26_rc38_client_bottom_navigation.test.mjs',
  'tests/m26_role_route_navigation_contract.test.mjs',
);
if(matches(/^src\/m26\/supabase-transport\.js$/u)) add(
  'tests/m26_rc75_native_workspace_stability.test.mjs',
);
if(matches(/^public\/m26\/|^src\/m26\//u)) add(
  'tests/m26_rc58_5c_b_app_integrity.test.mjs',
);

const summary={
  schema:'iberfit.fast-lane.v1',
  base,
  head,
  changedFiles:changed,
  selectedTests:[...selected],
  appShellChecked:false,
  ok:false,
};
const summaryPath=path.join(evidenceDir,'summary.json');
const writeSummary=()=>fs.writeFileSync(summaryPath,JSON.stringify(summary,null,2)+'\n','utf8');

function run(label,command,commandArgs){
  console.log(`\n=== FAST LANE · ${label} ===`);
  console.log(`$ ${command} ${commandArgs.join(' ')}`);
  const result=spawnSync(command,commandArgs,{cwd:root,stdio:'inherit',env:process.env});
  if(result.status!==0)throw new Error(`FAST_LANE_FAILED:${label}:exit=${result.status}`);
}

try{
  console.log(`FAST_LANE_BASE=${base}`);
  console.log(`FAST_LANE_HEAD=${head}`);
  console.log(`FAST_LANE_CHANGED=${changed.length}`);
  changed.forEach((file)=>console.log(` - ${file}`));

  if(matches(/^public\/m26\/|^src\/m26\//u)){
    console.log('\n=== FAST LANE · PWA APP SHELL CONTRACT ===');
    const check=spawnSync(process.execPath,['scripts/generate_rc58_app_shell.mjs','--check'],{cwd:root,encoding:'utf8'});
    summary.appShellChecked=true;
    if(check.status!==0){
      process.stdout.write(check.stdout||'');
      process.stderr.write(check.stderr||'');
      console.error('\nFAST_LANE_APP_SHELL_STALE: regenerating ephemeral checkout to show the exact required diff.');
      const generate=spawnSync(process.execPath,['scripts/generate_rc58_app_shell.mjs'],{cwd:root,encoding:'utf8'});
      process.stdout.write(generate.stdout||'');
      process.stderr.write(generate.stderr||'');
      const diff=spawnSync('git',['diff','--','public/m26/sw.js'],{cwd:root,encoding:'utf8'});
      process.stderr.write(diff.stdout||'');
      throw new Error('FAST_LANE_APP_SHELL_STALE:run node scripts/generate_rc58_app_shell.mjs and commit public/m26/sw.js');
    }
    process.stdout.write(check.stdout||'');
  }

  const tests=[...selected].filter((file)=>fs.existsSync(path.join(root,file)));
  if(tests.length){
    run(`TARGETED NODE TESTS (${tests.length})`,process.execPath,['--test',...tests]);
  }else{
    console.log('\nFAST_LANE_TARGETED_TESTS=NONE_MAPPED; full CI remains authoritative.');
  }

  summary.ok=true;
  writeSummary();
  console.log('\nFAST_LANE=GREEN');
}catch(error){
  summary.error=String(error?.message||error).slice(0,1000);
  writeSummary();
  console.error(`\nFAST_LANE=RED\n${summary.error}`);
  process.exitCode=1;
}
