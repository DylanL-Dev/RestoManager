'use strict';
// Assemble the reviewed SQL candidates into one transaction. This script has no database client.
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../supabase/proposals');
const proposals=[
 'rm-ops-engine/20261126_rm_ops_engine_v4.PROPOSAL.sql',
 'rm-ops-quick-release/quick-release-v1.PROPOSAL.sql',
 'rm-ops-engine/express-service-v1.PROPOSAL.sql'
];
function buildExpressReleaseSql(){
 const statements=proposals.map(file=>{
  const text=fs.readFileSync(path.join(root,file),'utf8');
  const match=text.match(/^((?:--[^\n]*\n|\s)*?)begin;\s*([\s\S]+)\ncommit;\s*$/u);
  if(!match||/^(?:begin|commit|rollback);\s*$/im.test(match[2]))throw Error('Unexpected transaction boundary in '+file);
  return '-- '+file+'\n'+match[1].trim()+'\n'+match[2].trim();
 });
 return 'begin;\n\n'+statements.join('\n\n')+'\n\ncommit;\n';
}
if(require.main===module)process.stdout.write(buildExpressReleaseSql());
module.exports={buildExpressReleaseSql};
