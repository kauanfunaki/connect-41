// Testes-gabarito do motor, portados de dev41tech/connect-tributario (tests/activities.test.mjs,
// commit 0fcc797). As asserções são as do original; o porte só acrescentou anotações de tipo
// e `const` onde o ESLint pede.
import assert from 'node:assert/strict';
import {test} from 'vitest';
import {schema,demo,calculate,activityReference,scope,problems,payrollAnnex,years,creditInputs} from './fiscal';
import {createActivity,activityPresets,emptyActivities,type Activity,type ActivityKind} from './activities';
import {payrollSchema} from './payroll';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const row=(kind:ActivityKind,revenue:number,id:string=kind)=>({...createActivity(kind,id,revenue),reviewed:true,basis:'Premissas fictícias para teste independente.'});
const data=(rows:Activity[])=>schema.parse({...demo,revenue:rows.reduce((s,a)=>s+a.revenue,0),activities:{enabled:true,rows}});

test('legacy payload defaults to aggregate calculation and preserves all annual results',()=>{
 const raw:Partial<typeof demo>=structuredClone(demo);delete raw.activities;
 const legacy=schema.parse(raw);assert.deepEqual(legacy.activities,emptyActivities());
 for(const year of years)assert.deepEqual(calculate(legacy,year),calculate(demo,year));
});
test('all seven compositions have finite calculations and company-wide RBT12',()=>{
 for(const preset of activityPresets){const d=data(preset.kinds.map((kind,i)=>row(kind,1200000/preset.kinds.length,kind+i)));
  assert.deepEqual(problems(d),[]);assert.deepEqual(scope(d),[null,null,null,null]);
  for(const a of d.activities.rows)assert.equal(activityReference(d,a)!.band,4);
  for(const year of years)for(const k of ['simple','hybrid','presumed','real','current'] as const)assert.ok(Number.isFinite(calculate(d,year)[k]),preset.label+' '+year+' '+k);
 }
});
test('mixed annexes use consolidated RBT12 while tax bases are weighted by actual activity revenue',()=>{
 const d=data([row('commerce',600000),row('industry',200000),row('services',400000)]),r=calculate(d,2033);
 close(r.simple,52950+18650+52120);close(r.irBase,48000+16000+128000);close(r.csBase,72000+24000+128000);
 close(r.additional,0);close(r.income,48960);
});
test('IRPJ additional threshold is applied once after consolidating activity bases',()=>{
 const d=data([row('services',1000000,'a'),row('services',1000000,'b')]);
 const r=calculate(d,2033);close(r.irBase,640000);close(r.additional,40000);close(r.irpj,96000);close(r.csll,57600);
});
test('global factor R affects only activities selected for III/V',()=>{
 const d=data([row('commerce',600000),{...row('services',600000),factorR:true}]);
 d.payroll=335999.99;assert.equal(activityReference(d,d.activities.rows[0])!.annex,'I');assert.equal(activityReference(d,d.activities.rows[1])!.annex,'V');
 d.payroll=336000;assert.equal(activityReference(d,d.activities.rows[1])!.annex,'III');
});
test('credits consolidate within each tax but never cross tax or explicitly isolated pools',()=>{
 const a={...row('commerce',200000,'a'),cbs:10,ibs:10,cbsCreditBase:500000,cbsPurchaseRate:10},b={...row('services',200000,'b'),cbs:10,ibs:10};
 const d=data([a,b]);let r=calculate(d,2033);close(r.cbsDue,0);close(r.cbsBalance,10000);close(r.ibsDue,40000);close(r.vat,40000);
 d.activities.rows[0].creditPool='isolated';r=calculate(d,2033);close(r.cbsDue,20000);close(r.cbsBalance,30000);close(r.vat,60000);
});
test('annual overrides distinguish zero from automatic values and external charges enter once per regime',()=>{
 const a={...row('industry',1200000),icms:10,iss:2,currentExtra:700};
 a.annual[2]={...a.annual[2],cbsDebit:0,cbsCredit:0,ibsDebit:1234,ibsCredit:234,icms:300,iss:0,simple:100,hybrid:200,presumed:300,real:400};
 const d=data([a]),r=calculate(d,2029),without=data([{...a,annual:a.annual.map(v=>({...v,simple:0,hybrid:0,presumed:0,real:0}))}]),base=calculate(without,2029);
 close(r.cbsDebit,0);close(r.vat,1000);close(r.old,300);close(r.simple-base.simple,100);close(r.hybrid-base.hybrid,200);close(r.presumed-base.presumed,300);close(r.real-base.real,400);
 close(calculate(d,2033).old,0);assert.ok(calculate(d,2027).cbsDebit>0);
});
test('different sales/purchase rates and reductions do not reduce purchase credits',()=>{
 const a={...row('services',100000),cbs:10,ibs:20,cbsReduction:60,ibsReduction:100,cbsCreditBase:10000,cbsPurchaseRate:8,ibsCreditBase:20000,ibsPurchaseRate:12};
 const r=calculate(data([a]),2033);close(r.cbsDebit,4000);close(r.cbsCredit,800);close(r.ibsDebit,0);close(r.ibsCredit,2400);close(r.cbsDue,3200);close(r.ibsBalance,2400);
});
test('activity mode ignores aggregate activity parameters and totals eligible credit bases',()=>{
 const d=data([{...row('commerce',500000),cbsCreditBase:100000,cbsCreditRate:50},{...row('services',700000),cbsCreditBase:200000,cbsCreditRate:100}]);
 const changed={...d,legacy:99,presIR:99,presCS:99,cbs:99,ibs:99,reduction:99,das:Array(7).fill(99),cbsCreditBase:9999999};
 assert.deepEqual(calculate(d,2029),calculate(changed,2029));close(creditInputs(d).cbsBase,300000);close(creditInputs(d).cbsRate,250000/300000*100);
});
test('incomplete review, special documentation and ineligibility exclude the affected comparisons',()=>{
 let d=data([row('commerce',1200000)]);d.activities.rows[0].reviewed=false;assert.ok(scope(d).every(Boolean));
 d=data([row('industry',1200000)]);d.activities.rows[0].basis='';assert.ok(scope(d).every(Boolean));
 d=data([{...row('services',1200000),simpleAllowed:false}]);assert.ok(scope(d)[0]);assert.ok(scope(d)[1]);assert.equal(scope(d)[2],null);assert.equal(scope(d)[3],null);
 d.rbt12=0;d.activities.rows[0].simpleAllowed=true;assert.ok(scope(d)[0]);assert.equal(scope(d)[2],null);
});
test('invalid sums, duplicate identifiers and excessive DAS removal are rejected',()=>{
 const d=data([row('commerce',600000,'a'),row('services',600000,'b')]);d.revenue++;assert.ok(problems(d).some(x=>x.includes('soma')));
 d.revenue--;d.activities.rows[1].id='a';assert.ok(problems(d).some(x=>x.includes('duplicado')));
 d.activities.rows[0].annual[0].removed=100;assert.ok(problems(d).some(x=>x.includes('exclusão')));
 assert.equal(schema.safeParse({...d,activities:{...d.activities,rows:[{...d.activities.rows[0],revenue:-1}]}}).success,false);
});
test('mixed Annex IV applies explicit effective shares to CPP/RAT and full FGTS',()=>{
 const d=data([row('commerce',600000),{...row('services',600000),annex:'IV'}]);
 d.payrollConfig=payrollSchema.parse({enabled:true,employees:100000,thirteenth:10000,contributors:20000,rat:2,fap:1,thirdPartyRate:5.8,includedInMargin:0,mixedEmployeeShare:40,mixedContributorShare:25,mixedReviewed:true});
 assert.equal(payrollAnnex(d),'mixed');assert.deepEqual(scope(d),[null,null,null,null]);
 const r=calculate(d,2033);close(r.payroll.simple.cppEmployees,8800);close(r.payroll.simple.cppContributors,1000);close(r.payroll.simple.rat,880);close(r.payroll.simple.fgts,8800);close(r.payroll.simple.total,19480);
 close(r.payroll.real.cpp,26000);close(r.payroll.real.rat,2200);close(r.payroll.real.thirdParties,6380);
 d.payrollConfig.mixedReviewed=false;assert.ok(scope(d)[0]);assert.equal(scope(d)[2],null);
 d.payrollConfig.mixedReviewed=true;d.payrollConfig.cprbSimple=true;assert.ok(scope(d)[0]);assert.equal(scope(d)[3],null);
});
test('zero-revenue allocated activity and losses stay finite; invalid projection year rejects',()=>{
 const d=data([row('commerce',0),row('services',1200000)]);d.margin=-5;
 close(calculate(d,2033).realIncome,0);assert.throws(()=>calculate(d,2026));
});
