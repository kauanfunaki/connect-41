// Motor fiscal do Connect Tributário (ENGINE R_4.1), portado de dev41tech/connect-tributario,
// arquivo `lib/external-taxes.ts`, commit 0fcc797 (14/10/2026). Cópia fiel: NÃO altere fórmulas, tabelas
// ou arredondamentos aqui — os testes-gabarito ao lado garantem o mesmo resultado do original.
// Ajustes do porte (mecânicos): imports sem a extensão .ts e `.prefault({})` no lugar de
// `.default({})` em objetos, porque no zod 4 o default de objeto não preenche os campos internos.

import {z} from 'zod';

const money=z.number().finite().min(0).max(1e12);
export const externalTaxKinds={ipi:'IPI',st:'ICMS-ST / antecipação',difal:'DIFAL',fcp:'FCP',import:'Tributo de importação',selective:'Imposto Seletivo',other:'Outro recolhimento'} as const;
export const externalRegimes={simple:'Simples',hybrid:'Híbrido',presumed:'Presumido',real:'Real'} as const;
export const externalStatuses={external:'Somar fora dos demais cálculos',included:'Já incluído em outro componente',notApplicable:'Não devido neste cenário'} as const;
export const externalTaxSchema=z.object({
 id:z.string().min(1).max(80),name:z.string().max(140).default(''),
 kind:z.enum(['ipi','st','difal','fcp','import','selective','other']).default('other'),
 regime:z.enum(['simple','hybrid','presumed','real']).default('real'),
 status:z.enum(['external','included','notApplicable']).default('external'),
 method:z.enum(['amount','calculated']).default('amount'),
 amount:money.default(0),base:money.default(0),rate:z.number().finite().min(0).max(100).default(0),
 debits:money.default(0),deductions:money.default(0),basis:z.string().max(1500).default(''),reviewed:z.boolean().default(false),
});
export type ExternalTax=z.infer<typeof externalTaxSchema>;
export type ExternalRegime=ExternalTax['regime'];
export const createExternalTax=(id:string,kind:ExternalTax['kind']='ipi',regime:ExternalRegime='real')=>externalTaxSchema.parse({id,kind,regime,name:externalTaxKinds[kind]});
export function externalTaxResult(item:ExternalTax){
 const calculated=item.method==='calculated',gross=calculated?item.base*item.rate/100+item.debits:item.amount;
 const deductions=calculated?item.deductions:0,net=Math.max(0,gross-deductions),unused=Math.max(0,deductions-gross);
 return {gross,deductions,net,unused,added:item.status==='external'?net:0};
}
type AnnualExternal={externalMode:'total'|'items';externalItems:ExternalTax[];simple:number;hybrid:number;presumed:number;real:number};
export function externalAmounts(v:AnnualExternal){
 const totals={simple:v.simple,hybrid:v.hybrid,presumed:v.presumed,real:v.real};
 if(v.externalMode!=='items')return totals;
 const result={simple:0,hybrid:0,presumed:0,real:0};
 for(const item of v.externalItems)result[item.regime]+=externalTaxResult(item).added;
 return result;
}
export function externalTaxProblem(item:ExternalTax){
 if(!item.name.trim())return 'Informe o nome do recolhimento.';
 if(!item.basis.trim())return 'Registre a origem, a regra e a vigência do recolhimento.';
 if(!item.reviewed)return 'Confira o recolhimento e sua forma de inclusão.';
 return null;
}
export type ExternalReviewFilter='all'|'pending'|'external'|'included'|'notApplicable';
export function filterExternalItems(items:ExternalTax[],regime:ExternalRegime|'all',review:ExternalReviewFilter,query:string){
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const words=normalize(query).trim().split(/\s+/).filter(Boolean);
 return items.filter(item=>(regime==='all'||item.regime===regime)&&(review==='all'||(review==='pending'?externalTaxProblem(item)!==null:item.status===review))&&words.every(word=>normalize(item.name+' '+externalTaxKinds[item.kind]).includes(word)));
}
export function detailExternalYear<T extends AnnualExternal>(value:T,id:()=>string):T{
 if(value.externalItems.length)return {...value,externalMode:'items'};
 const externalItems=(Object.keys(externalRegimes) as ExternalRegime[]).filter(regime=>value[regime]>0).map(regime=>({...createExternalTax(id(),'other',regime),name:'Total anterior — '+externalRegimes[regime],amount:value[regime]}));
 return {...value,externalMode:'items',externalItems};
}
export const externalTaxSources=[
 ['IPI — regulamento e apuração','https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2010/decreto/d7212.htm'],
 ['ICMS — Lei Complementar 87/1996','https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp87.htm'],
];
