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
const legacyPlacement='public.apply_smart_placement_v3(uuid,jsonb)';
const originalPlacementHash='4d7538c16784ba283ab62ead4c8a4054';
const synchronizedPlacementHash='18ecbde3e3b5868fdc143b853188cf96';
const smartPlacementLock=" perform pg_advisory_xact_lock(hashtextextended('smart-placement:'||v_restaurant::text,0));";
const orderedPlacementLocks=" perform private.lock_restaurant_mutation_v1();\n"+smartPlacementLock;
const draftEndpoints=[
 'express_seat_v1(text,uuid,text,uuid,jsonb)',
 'express_walkin_v1(text,uuid,integer,text,text)',
 'quick_release_v1(uuid,uuid,uuid[],boolean)'
];
const transaction=(statements)=>'begin;\nset local lock_timeout = \'3s\';\nset local statement_timeout = \'60s\';\n\n'+statements.join('\n\n')+'\n\ncommit;\n';

function changeLegacyPlacementLock(fromHash,toHash,fromLock,toLock){
 return `do $legacy_placement_lock$
declare
 placement regprocedure := '${legacyPlacement}'::regprocedure;
 previous_body text;
 next_body text;
begin
 select prosrc into strict previous_body from pg_proc where oid=placement;
 if md5(previous_body)='${toHash}' then return; end if;
 if md5(previous_body)<>'${fromHash}' then
  raise exception 'La définition de la permutation v3 a changé. Réexaminer le candidat DEV.';
 end if;
 next_body:=replace(previous_body,$from$${fromLock}$from$,$to$${toLock}$to$);
 if md5(next_body)<>'${toHash}' then
  raise exception 'Le changement de verrou v3 ne correspond pas à la version revue.';
 end if;
 execute replace(pg_get_functiondef(placement),previous_body,next_body);
end
$legacy_placement_lock$;`;
}

function buildExpressReleaseSql(){
 const statements=proposals.map(file=>{
  const text=fs.readFileSync(path.join(root,file),'utf8');
  const match=text.match(/^((?:--[^\n]*\n|\s)*?)begin;\s*([\s\S]+)\ncommit;\s*$/u);
  if(!match||/^(?:begin|commit|rollback);\s*$/im.test(match[2]))throw Error('Unexpected transaction boundary in '+file);
  return '-- '+file+'\n'+match[1].trim()+'\n'+match[2].trim();
 });
 return transaction([
  changeLegacyPlacementLock(originalPlacementHash,synchronizedPlacementHash,smartPlacementLock,orderedPlacementLocks),
  ...statements,
  'revoke all on public.placement_events from service_role;'
 ]);
}

function buildExpressRollbackSql(){
 const endpoints=['public','private'].flatMap(schema=>draftEndpoints.map(endpoint=>schema+'.'+endpoint));
 return transaction([
  'revoke all on function '+endpoints.join(',\n ')+ ' from public,anon,authenticated,service_role;',
  `create or replace function public.service_sync_state_v1()
returns jsonb language sql security invoker set search_path='' as $$select private.rm012_sync_api()$$;`,
  changeLegacyPlacementLock(synchronizedPlacementHash,originalPlacementHash,orderedPlacementLocks,smartPlacementLock),
  "notify pgrst,'reload schema';"
 ]);
}

if(require.main===module){
 const args=process.argv.slice(2);
 if(args.length===0)process.stdout.write(buildExpressReleaseSql());
 else if(args.length===1&&args[0]==='--rollback')process.stdout.write(buildExpressRollbackSql());
 else throw Error('Usage: node scripts/prepare-rm-release-03b.cjs [--rollback]');
}
module.exports={buildExpressReleaseSql,buildExpressRollbackSql};
