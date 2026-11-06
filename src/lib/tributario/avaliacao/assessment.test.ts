// Testes-gabarito da avaliação, portados de dev41tech/connect-tributario (tests/studies.test.mjs,
// casos 1 a 3, commit 0fcc797). As asserções são as do original; o porte só acrescentou anotações
// de tipo e trouxe para cá o CNPJ fictício da fixture do diagnóstico. Os casos 4 a 9 cobrem
// documentos, leitores e uploads e voltam na Fase 2, com a fila de documentos.
import assert from 'node:assert/strict';
import {test} from 'vitest';
import {newStudy,factSchema,type Study} from './model';
import {calculate} from '../motor/fiscal';
import {assess,dreKeys} from './assessment';

const company='12345678000195';
const study=():Study=>({...newStudy('quick',2026),cnpj:company});
let n=0;const fact=(field:string,value:number|null,start='2026-01-01',end='2026-12-31',extra={})=>({...factSchema.parse({field,value,start,end,basis:'total',source:'fixture',...extra}),id:String(++n),documentId:'doc',filename:'teste.csv'});
const full=()=>{const s=study();s.values=Object.fromEntries(dreKeys.map(k=>[k,0]));Object.assign(s.values,{receita_bruta:1200000,custos_diretos:600000,folha_encargos_dre:120000,encargos:20000,rbt12:1200000,fs12:120000,base_cbs:100000,base_ibs:100000,real_adjust:0});s.base.simpleMethod='reference';s.eligibility={simple:'yes',presumed:'yes',real:'yes'};s.assumptionsReviewed=true;return s;};
test('manual totals and document totals produce the same four estimates; blanks are unknown',()=>{const s=full(),a=assess(s,[]),facts=Object.entries(s.values).map(([k,v])=>fact(k,v));const imported={...s,values:{}};assert.deepEqual(assess(imported,facts).cards,a.cards);assert.ok(a.cards.every(c=>c.value!==null&&c.value>0));assert.ok(a.best);for(const c of a.cards)assert.equal(c.value,calculate(a.legacyData,2029)[c.key]);s.values.custos_diretos=null;assert.ok(assess(s,[]).cards.every(c=>c.value===null));});
test('partial actual data never silently annualize; explicit single-month projection multiplies only flows',()=>{const s=full();s.start='2026-01-01';s.end='2026-01-31';assert.ok(assess(s,[]).cards.every(c=>c.value===null));s.periodMode='monthly-projection';const a=assess(s,[]);assert.equal(a.revenue,14400000);assert.equal(a.data.rbt12,1200000);s.end='2026-12-31';assert.ok(assess(s,[]).cards.every(c=>c.pending.some(p=>p.includes('um mês'))));});
test('in-progress invalid form remains renderable and cannot publish estimates',()=>{const s=full();s.name='';s.start='';s.values.receita_bruta=-10;s.base.cbs=999;const a=assess(s,[fact('receita_bruta',200)]);assert.ok(a.cards.every(c=>c.value===null));});
