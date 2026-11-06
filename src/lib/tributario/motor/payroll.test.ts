// Testes-gabarito do motor, portados de dev41tech/connect-tributario (tests/payroll.test.mjs,
// commit 0fcc797). As asserções são as do original; o porte só acrescentou anotações de tipo.
import assert from 'node:assert/strict';
import {test} from 'vitest';
import {schema,demo,calculate,problems,years} from './fiscal';
import {payrollSchema,calculatePayroll,emptyPayroll} from './payroll';
import {parseSimpleDREValues} from './csv-import';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const p=payrollSchema.parse({enabled:true,employees:120000,thirteenth:10000,apprentices:12000,apprenticeThirteenth:1000,contributors:24000,rat:2,fap:1.5,thirdPartyRate:5.8,includedInMargin:0});
const d={...demo,payrollConfig:p};

test('Legacy scenarios keep their results; filling a disabled module changes nothing',()=>{
 const legacy:Partial<typeof demo>={...demo};delete legacy.payrollConfig;
 const migrated=schema.parse(legacy);assert.deepEqual(migrated.payrollConfig,emptyPayroll());
 for(const y of years){const a=calculate(migrated,y),b=calculate({...demo,payrollConfig:{...p,enabled:false,includedInMargin:10000}},y);for(const k of ['simple','hybrid','presumed','real','current','realIncome'] as const)close(a[k],b[k]);}
});
test('Standard CPP, RAT/FAP, third parties, FGTS and apprentices use the correct distinct bases',()=>{
 const r=calculatePayroll(p,2029,'real','III');
 close(r.employeeBase,143000);close(r.cppBase,167000);close(r.cppEmployees,28600);close(r.cppContributors,4800);
 close(r.rat,4290);close(r.thirdParties,8294);close(r.fgtsEmployees,10400);close(r.fgtsApprentices,260);
 close(r.total,56644);close(r.taxes,45984);close(r.employerCost,223644);
 assert.deepEqual(r,calculatePayroll(p,2029,'presumed','III'));
});
test('Simples and hybrid do not duplicate CPP in DAS and exempt third parties; Annex IV adds external CPP/RAT',()=>{
 for(const regime of ['simple','hybrid'] as const){
  for(const annex of ['I','II','III','V'] as const){const r=calculatePayroll(p,2029,regime,annex);close(r.total,10660);close(r.cpp+r.rat+r.thirdParties,0);assert.equal(r.inDas,true);}
  const r=calculatePayroll(p,2029,regime,'IV');close(r.total,48350);close(r.thirdParties,0);assert.equal(r.inDas,false);
 }
 const ref=calculate({...d,annex:'IV',factorR:true,payroll:336000},2029);close(ref.payroll.simple.cpp,0);
 close(calculate({...d,annex:'IV',factorR:false},2029).payroll.simple.cpp,33400);
});
test('FS12 is not used as a payroll base; CI-only remuneration has no RAT, third parties or FGTS',()=>{
 close(calculate({...d,payroll:999999},2029).payroll.real.total,calculate(d,2029).payroll.real.total);
 const r=calculatePayroll({...emptyPayroll(),enabled:true,contributors:50000},2029,'real','III');
 close(r.total,10000);close(r.fgts+r.rat+r.thirdParties,0);
});
test('CPRB transition applies 2025–2027 rates, excludes only CPP on 13th and ends in 2028',()=>{
 const c={...p,cprbRegular:true,cprbRate:4.5,cprbRevenue:300000,cprbEligible:true};
 for(const [year,cppRate,cprbRate,cpp,due] of [[2025,5,3.6,7800,10800],[2026,10,2.7,15600,8100],[2027,15,1.8,23400,5400],[2028,20,0,33400,0],[2033,20,0,33400,0]]){
  const r=calculatePayroll(c,year,'real','III');close(r.cppRate,cppRate);close(r.cprbRate,cprbRate);close(r.cpp,cpp);close(r.cprbDue,due);close(r.rat,4290);close(r.thirdParties,8294);close(r.fgts,10660);
 }
 const simple=calculatePayroll({...c,cprbSimple:true},2027,'simple','IV');close(simple.cpp,23400);close(simple.cprbDue,5400);close(simple.thirdParties,0);
 close(calculatePayroll({...c,cprbSimple:true},2027,'simple','III').cprbDue,0);
});
test('Current comparison uses base year while future comparison uses selected year',()=>{
 const cp={...p,cprbRegular:true,cprbRate:4.5,cprbRevenue:300000,cprbEligible:true};
 const base={...d,payrollConfig:cp,period:'2026'},a=calculate(base,2027),b=calculate(base,2028);
 close(a.current,b.current);close(a.payroll.current.cpp,15600);close(a.payroll.real.cpp,23400);close(b.payroll.real.cpp,33400);
 close(a.currentRealBase,300000-a.payroll.current.total);close(b.realBase,300000-b.payroll.real.total);
});
test('DRE reconciliation replaces included charges exactly once and preserves the source',()=>{
 const parsed=parseSimpleDREValues({empresa:'DRE teste',ano_base:'2026',receita_bruta:'1200000',custos_diretos:'676356',folha_encargos_dre:'223644'});
 const original=structuredClone(parsed.dre),data=schema.parse({...demo,...parsed.fields,dre:parsed.dre,payrollConfig:{...p,includedInMargin:56644}}),r=calculate(data,2029);
 close(r.profit,300000);close(r.payrollProfits.real,300000);close(r.realIncome,78000);
 close(r.payrollProfits.simple,345984);close(r.real,calculate({...data,payrollConfig:emptyPayroll()},2029).real+56644);
 assert.deepEqual(data.dre,original);
 const noIncluded=calculate({...data,payrollConfig:p},2029);close(noIncluded.realBase,243356);close(noIncluded.realIncome,58741.04);
 close(noIncluded.income,r.income);
});
test('Manual payroll amounts are replaced once and missing reconciliation blocks saving',()=>{
 const cfg={...p,manualOverlap:{simple:5000,hybrid:4000,presumed:3000,real:2000},extrasReviewed:true};
 const data={...d,extra:6000,payrollConfig:cfg},r=calculate(data,2029);
 assert.deepEqual(r.remainingExtras,{simple:1000,hybrid:2000,presumed:3000,real:4000});
 close(r.simple,156360+10660+1000);assert.deepEqual(problems(data),[]);
 assert.ok(problems({...data,payrollConfig:{...cfg,extrasReviewed:false}}).some(x=>x.includes('Concilie')));
 assert.ok(problems({...data,extraReal:1000}).some(x=>x.includes('não pode superar')));
});
test('Inputs require real payroll bases and explicit DRE/FPAS configuration',()=>{
 assert.deepEqual(problems(d),[]);
 assert.ok(problems({...d,payrollConfig:{...p,rat:null}}).some(x=>x.includes('RAT')));
 assert.ok(problems({...d,payrollConfig:{...p,thirdPartyRate:null}}).some(x=>x.includes('FPAS')));
 assert.ok(problems({...d,payrollConfig:{...p,includedInMargin:null}}).some(x=>x.includes('margem/DRE')));
 assert.ok(problems({...d,period:'2024'}).some(x=>x.includes('ano-base')));
 assert.ok(problems({...d,payrollConfig:{...emptyPayroll(),enabled:true}}).length);
 for(const bad of [{fap:2.01},{rat:4},{employees:-1},{employees:Infinity},{cprbRate:5}])assert.equal(payrollSchema.safeParse({...p,...bad}).success,false);
});
test('CPRB cannot silently apply without declared eligibility, rates or proper Simples annex',()=>{
 assert.ok(problems({...d,payrollConfig:{...p,cprbRegular:true}}).some(x=>x.includes('enquadramento')));
 assert.ok(problems({...d,payrollConfig:{...p,cprbSimple:true,cprbEligible:true,cprbRate:4.5,cprbRevenue:300000}}).some(x=>x.includes('Anexo IV')));
 assert.deepEqual(problems({...d,annex:'IV',payrollConfig:{...p,cprbSimple:true,cprbEligible:true,cprbRate:4.5,cprbRevenue:300000}}),[]);
});
test('Losses from payroll produce zero income tax and finite totals across the transition',()=>{
 const loss={...d,margin:1};for(const y of years){const r=calculate(loss,y);close(r.realIncome,0);assert.ok(r.payrollProfits.real<0);for(const k of ['simple','hybrid','presumed','real','current'] as const)assert.ok(Number.isFinite(r[k])&&r[k]>=0);}
});
