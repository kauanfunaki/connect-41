// Motor fiscal do Connect Tributário (ENGINE R_4.1), portado de dev41tech/connect-tributario,
// arquivo `lib/annual-review.ts`, commit 0fcc797 (14/10/2026). Cópia fiel: NÃO altere fórmulas, tabelas
// ou arredondamentos aqui — os testes-gabarito ao lado garantem o mesmo resultado do original.
// Ajustes do porte (mecânicos): imports sem a extensão .ts e `.prefault({})` no lugar de
// `.default({})` em objetos, porque no zod 4 o default de objeto não preenche os campos internos.

import type {ActivityAnnual} from './activities';
import {externalAmounts,externalTaxProblem} from './external-taxes';
export type AnnualCopyScope='external'|'all';
const externalKeys=['simple','hybrid','presumed','real','externalMode','externalItems'] as const;

export function annualReview(value:ActivityAnnual){
 const active=value.externalMode==='items'?value.externalItems:[];
 return {amounts:externalAmounts(value),items:active.length,pending:active.filter(item=>externalTaxProblem(item)!==null).length,omitted:active.filter(item=>item.status!=='external').length};
}
export function copyAnnualParameters(values:ActivityAnnual[],source:number,targets:number[],scope:AnnualCopyScope):ActivityAnnual[]{
 if(values.length!==7||!Number.isInteger(source)||source<0||source>=7||targets.some(n=>!Number.isInteger(n)||n<0||n>=7))throw Error('Ano de cópia inválido.');
 if(scope!=='all'&&scope!=='external')throw Error('Escopo de cópia inválido.');
 const selected=new Set(targets.filter(n=>n!==source));
 return values.map((value,index)=>{
  if(!selected.has(index))return value;
  const sourceValue=structuredClone(values[source]);
  const copied=scope==='all'?sourceValue:{...value,...Object.fromEntries(externalKeys.map(key=>[key,sourceValue[key]]))};
  return {...copied,externalItems:copied.externalItems.map(item=>({...item,reviewed:false}))};
 });
}
const labels:Record<Exclude<keyof ActivityAnnual,'externalItems'>,string>={
 das:'DAS total',removed:'Parcela excluída no híbrido',cbsDebit:'Débito CBS',cbsCredit:'Crédito CBS',ibsDebit:'Débito IBS',ibsCredit:'Crédito IBS',icms:'ICMS líquido',iss:'ISS líquido',
 simple:'Total manual — Simples',hybrid:'Total manual — Híbrido',presumed:'Total manual — Presumido',real:'Total manual — Real',externalMode:'Modo dos adicionais',
};
export function annualCopyDifferences(before:ActivityAnnual,after:ActivityAnnual){
 const format=(key:keyof typeof labels,value:string|number|null)=>value===null?'Automático':key==='externalMode'?(value==='items'?'Detalhado por tributo':'Totais por regime'):key==='das'||key==='removed'?Number(value).toLocaleString('pt-BR')+(key==='removed'?' p.p.':'%'):Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const changes=Object.entries(labels).flatMap(([key,label])=>{const k=key as keyof typeof labels;return before[k]===after[k]?[]:[{label,before:format(k,before[k]),after:format(k,after[k])}];});
 if(JSON.stringify(before.externalItems)!==JSON.stringify(after.externalItems))changes.push({label:'Conteúdo dos recolhimentos detalhados',before:before.externalItems.length+' itens guardados',after:after.externalItems.length+' itens da origem; conferência retirada'});
 return changes;
}
