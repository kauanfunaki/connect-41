// Testes-gabarito do motor, portados de dev41tech/connect-tributario (tests/external-taxes.test.mjs,
// commit 0fcc797). As asserções são as do original; o porte só acrescentou anotações de tipo.
import assert from 'node:assert/strict';
import {test} from 'vitest';
import {externalTaxSchema,createExternalTax,externalTaxResult,externalAmounts,detailExternalYear,externalTaxProblem,type ExternalRegime} from './external-taxes';
import {createActivity,annualActivitySchema} from './activities';
import {schema,demo,calculate,scope,problems} from './fiscal';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const item=(regime:ExternalRegime='real')=>({...createExternalTax('item-'+regime,'ipi',regime),reviewed:true,basis:'Exemplo fictício com base, alíquota e créditos conferidos.',method:'calculated' as const,base:100000,rate:5,debits:200,deductions:1200});
const sample=()=>schema.parse({...demo,activities:{enabled:true,rows:[{...createActivity('industry','industry',demo.revenue),reviewed:true,basis:'Cenário fictício para teste.'}]}});
test('assisted net calculation includes declared debit and deduction once',()=>{
 assert.deepEqual(externalTaxResult(item()),{gross:5200,deductions:1200,net:4000,unused:0,added:4000});
 close(externalTaxResult({...item(),base:1000.50,rate:2.5,debits:10.25,deductions:5.50}).added,29.7625);
});
test('deductions cannot generate a negative charge or cross to another item',()=>{
 const credit={...item(),deductions:6200};const r=externalTaxResult(credit);close(r.added,0);close(r.unused,1000);
 const v=annualActivitySchema.parse({externalMode:'items',externalItems:[credit,{...item(),id:'other'}]});close(externalAmounts(v).real,4000);
});
test('included and not-applicable entries document the calculation but never add it',()=>{
 for(const status of ['included','notApplicable'] as const){const r=externalTaxResult({...item(),status});close(r.net,4000);close(r.added,0);}
 const r=externalTaxResult({...item(),method:'amount' as const,amount:912.34});close(r.added,912.34);close(r.deductions,0);
});
test('total and item modes are mutually exclusive and legacy annual data defaults to totals',()=>{
 const v=annualActivitySchema.parse({simple:100,hybrid:200,presumed:300,real:400,externalItems:[item()]});
 assert.equal(v.externalMode,'total');assert.deepEqual(externalAmounts(v),{simple:100,hybrid:200,presumed:300,real:400});
 assert.deepEqual(externalAmounts({...v,externalMode:'items' as const}),{simple:0,hybrid:0,presumed:0,real:4000});
});
test('first conversion retains every existing total and creates pending, unique items',()=>{
 const v=annualActivitySchema.parse({simple:100.75,real:400});let n=0;
 const detailed=detailExternalYear(v,()=>String(++n));assert.equal(detailed.externalItems.length,2);
 assert.deepEqual(externalAmounts(v),externalAmounts(detailed));assert.ok(detailed.externalItems.every(x=>!x.reviewed&&!x.basis));
 assert.deepEqual(detailExternalYear({...detailed,externalMode:'total' as const},()=>String(++n)),detailed);
});
test('only the selected annual regime receives the item totals, without legacy duplication',()=>{
 const d=sample(),before=calculate(d,2029),a=d.activities.rows[0];
 a.annual[2]={...a.annual[2],externalMode:'items',real:99999,presumed:99999,externalItems:[item('real'),{...item('presumed'),amount:800,method:'amount' as const}]};
 const after=calculate(d,2029);close(after.real-before.real,4000);close(after.presumed-before.presumed,800);close(after.simple,before.simple);close(after.hybrid,before.hybrid);
 assert.deepEqual(calculate(d,2033).activityExtras,{simple:0,hybrid:0,presumed:0,real:0});close(after.current,before.current);
});
test('review and documentation exclude the affected regime across the comparison period',()=>{
 const d=sample(),a=d.activities.rows[0];a.annual[2]={...a.annual[2],externalMode:'items',externalItems:[{...item(),reviewed:false}]};
 assert.deepEqual(scope(d).slice(0,3),[null,null,null]);assert.match(scope(d)[3]!,/2029/);
 a.annual[2].externalItems[0].reviewed=true;assert.deepEqual(scope(d),[null,null,null,null]);
 a.annual[2].externalItems[0].basis='';assert.ok(scope(d)[3]);assert.ok(externalTaxProblem(a.annual[2].externalItems[0]));
 a.annual[2].externalMode='total';assert.deepEqual(scope(d),[null,null,null,null]);
});
test('invalid inputs, excessive item count and duplicated identifiers are rejected',()=>{
 for(const patch of [{rate:101},{deductions:-1},{base:Infinity},{regime:'unknown'}])assert.equal(externalTaxSchema.safeParse({...item(),...patch}).success,false);
 assert.equal(annualActivitySchema.safeParse({externalItems:Array.from({length:25},()=>item())}).success,false);
 const d=sample();d.activities.rows[0].annual[0]={...d.activities.rows[0].annual[0],externalMode:'items',externalItems:[item(),item()]};
 assert.ok(problems(d).some(x=>x.includes('identificador duplicado')));
});
