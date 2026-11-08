const test=require('node:test'),assert=require('node:assert/strict');
const availability=require('../booking-availability.js');
const engine=require('../reservation-engine.js');
const c={numbers:[1],capacity:2},base={connected:true,ready:true,choices:[c],assess:()=>({valid:true,held:false})};
test('explicit availability reasons distinguish synchronization, connection, input, service, capacity, hold, room and full',()=>{
 for(const [change,state] of [[{ready:false},'syncing'],[{online:false},'offline'],[{ready:false,syncState:'error'},'error'],[{checking:true},'checking'],[{validInput:false},'invalid'],[{inHours:false},'out_of_service'],[{choices:[]},'incompatible_capacity'],[{assess:()=>({valid:true,held:true})},'temporary_hold'],[{assess:()=>({valid:false,roomConflict:true})},'room_conflict'],[{assess:()=>({valid:false})},'fully_booked']]){
  const result=availability.evaluate({...base,...change});assert.equal(result.state,state);assert.equal(result.available.length,0);
 }
 assert.deepEqual(availability.evaluate(base).available,[c]);
});
test('pending own hold cannot be reported as a foreign unavailability',()=>{
 let assessed=false;const result=availability.evaluate({...base,checking:true,assess:()=>{assessed=true;return {valid:true,held:true}}});
 assert.equal(result.state,'checking');assert.equal(assessed,false);
});
test('alternatives exclude elapsed Paris times today and preserve earlier future times',()=>{
 assert.equal(availability.allowedAlternative('2030-05-01','11:30','2030-05-01','12:01'),false);
 assert.equal(availability.allowedAlternative('2030-05-01','12:01','2030-05-01','12:01'),false);
 assert.equal(availability.allowedAlternative('2030-05-01','12:30','2030-05-01','12:01'),true);
 assert.equal(availability.allowedAlternative('2030-05-02','11:30','2030-05-01','12:01'),true);
});
test('ranked choices prefer a fitted small table then legal pairs/triples over larger tables',()=>{
 const tables=[{number:1,capacity:2},{number:2,capacity:4},{number:3,capacity:6}];
 assert.deepEqual(engine.rankedTableChoices(tables,[[1,2],[1,2,3]],2).map(c=>c.numbers),[[1],[2],[3],[1,2],[1,2,3]]);
 assert.deepEqual(engine.rankedTableChoices(tables,[[1,2],[1,2,3]],7).map(c=>c.numbers),[[1,2,3]]);
});
