// Testes-gabarito do motor, portados de dev41tech/connect-tributario (tests/annual-review.test.mjs,
// commit 0fcc797). As asserções são as do original; o porte só acrescentou anotações de tipo
// (o caso de argumentos inválidos lista as chamadas em vez de espalhar um array sem tipo).
import assert from 'node:assert/strict';
import {test} from 'vitest';
import {createActivity} from './activities';
import {createExternalTax,filterExternalItems} from './external-taxes';
import {copyAnnualParameters,annualReview,annualCopyDifferences,type AnnualCopyScope} from './annual-review';
const fixture=()=>{
 const annual=createActivity('industry','a',1200000).annual;
 annual[0]={...annual[0],das:10,removed:2,cbsDebit:0,icms:120,real:1234,externalMode:'items',externalItems:[{...createExternalTax('ipi','ipi','real'),name:'IPI fabricação',amount:4000,basis:'Exemplo fictício.',reviewed:true}]};
 annual[2]={...annual[2],das:8,removed:1,cbsDebit:800,icms:600,real:6000};
 return annual;
};
test('external-only copy preserves tax overrides and all unselected years including source',()=>{
 const before=fixture(),snapshot=structuredClone(before),after=copyAnnualParameters(before,0,[2,4],'external');
 assert.deepEqual(before,snapshot);assert.deepEqual(after[0],before[0]);assert.deepEqual(after[1],before[1]);assert.deepEqual(after[3],before[3]);
 assert.equal(after[2].das,8);assert.equal(after[2].removed,1);assert.equal(after[2].cbsDebit,800);assert.equal(after[2].icms,600);
 assert.equal(after[2].real,1234);assert.equal(after[2].externalMode,'items');assert.equal(annualReview(after[2]).amounts.real,4000);assert.equal(annualReview(after[2]).pending,1);
});
test('full copy preserves explicit zero versus automatic and removes destination item reviews',()=>{
 const before=fixture(),after=copyAnnualParameters(before,0,[2],'all');
 assert.equal(after[2].cbsDebit,0);assert.equal(after[2].cbsCredit,null);assert.equal(after[2].das,10);assert.equal(after[2].icms,120);
 assert.equal(after[2].externalItems[0].reviewed,false);assert.equal(before[0].externalItems[0].reviewed,true);
});
test('copied items are independent across years and source is never overwritten',()=>{
 const before=fixture(),after=copyAnnualParameters(before,0,[0,2,2,4],'all');
 after[2].externalItems[0].amount=99;
 assert.equal(after[4].externalItems[0].amount,4000);assert.equal(after[0].externalItems[0].amount,4000);assert.equal(before[0].externalItems[0].amount,4000);
 assert.equal(after[0].externalItems[0].reviewed,true);
});
test('empty selection changes nothing and invalid years/scope are rejected',()=>{
 const before=fixture();assert.deepEqual(copyAnnualParameters(before,0,[],'external'),before);
 assert.throws(()=>copyAnnualParameters(before,-1,[2],'all'));
 assert.throws(()=>copyAnnualParameters(before,0,[7],'all'));
 assert.throws(()=>copyAnnualParameters(before,0,[2.5],'all'));
 assert.throws(()=>copyAnnualParameters(before.slice(1),0,[],'all'));
 assert.throws(()=>copyAnnualParameters(before,0,[2],'unknown' as AnnualCopyScope));
});
test('review summary counts active items, pending documentation and exclusions only',()=>{
 const annual=fixture(),v=annual[0];v.externalItems.push({...createExternalTax('st','st','real'),amount:600,basis:'Já no ICMS',status:'included' as const,reviewed:true},{...createExternalTax('fcp','fcp','real'),amount:500,status:'notApplicable' as const,reviewed:true});
 const detail=annualReview(v);assert.equal(detail.items,3);assert.equal(detail.pending,1);assert.equal(detail.omitted,2);assert.equal(detail.amounts.real,4000);
 const totals=annualReview({...v,externalMode:'total' as const});assert.equal(totals.items,0);assert.equal(totals.pending,0);assert.equal(totals.amounts.real,1234);
});
test('preview distinguishes automatic and zero and lists only fields actually replaced',()=>{
 const before=fixture(),external=copyAnnualParameters(before,0,[2],'external'),all=copyAnnualParameters(before,0,[2],'all');
 assert.ok(!annualCopyDifferences(before[2],external[2]).some(v=>v.label==='Débito CBS'));
 assert.ok(annualCopyDifferences(before[2],all[2]).some(v=>v.label==='Débito CBS'&&v.after.includes('0,00')));
 const automatic={...all[2],cbsDebit:null};assert.ok(annualCopyDifferences(all[2],automatic).some(v=>v.after==='Automático'));
});
test('regime, pending status and accent-insensitive search filter without changing totals',()=>{
 const items=[fixture()[0].externalItems[0],{...createExternalTax('difal','difal','simple'),name:'DIFAL máquina',amount:1000}, {...createExternalTax('fcp','fcp','real'),basis:'Já incluído',status:'included' as const,reviewed:true}];
 const snapshot=structuredClone(items);
 assert.equal(filterExternalItems(items,'simple','pending','maquina').length,1);
 assert.equal(filterExternalItems(items,'real','pending','').length,0);
 assert.equal(filterExternalItems(items,'all','included','FCP').length,1);
 assert.equal(filterExternalItems(items,'all','all','fabricacao').length,1);
 assert.deepEqual(items,snapshot);
});
