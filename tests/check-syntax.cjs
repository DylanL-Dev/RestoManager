'use strict';
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const files=spawnSync('git',['ls-files','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'}).stdout.trim().split('\n').filter(file=>/\.(js|mjs|cjs)$/.test(file));
let failed=0;for(const file of new Set(files)){const source=fs.readFileSync(path.join(root,file),'utf8');const module=file.endsWith('.mjs')||/^\s*(import |export )/m.test(source);const result=spawnSync(process.execPath,module?['--input-type=module','--check']:['--check',file],{cwd:root,input:module?source:undefined,encoding:'utf8'});if(result.status!==0){failed++;process.stderr.write(file+'\n'+result.stderr);}}
console.log(JSON.stringify({checked:new Set(files).size,failed}));if(failed)process.exitCode=1;
