// Avaliação (estudo) do Connect Tributário, portada de dev41tech/connect-tributario,
// arquivo `lib/studies/assessment.ts`, commit 0fcc797 (14/10/2026). Cópia fiel das regras: NÃO altere
// cálculos aqui. Ajustes do porte (mecânicos): imports sem a extensão .ts apontando para ../motor
// e `.prefault({})` no lugar de `.default({})` em objeto (zod 4). Na Fase 1 não há documentos:
// `assess(study, [])` usa só os valores informados; os tipos de fato e documento ficam para a Fase 2.
// Também mecânicos: `Number(v).toLocaleString` (forma aceita pelo ESLint) e imports sem uso removidos.

import {calculate,schema,scope,problems,manualExtras,type Data} from '../motor/fiscal';
import {consolidate} from './consolidation';
import {type Study,type Fact,fieldLabels,studySchema,newStudy} from './model';
export const dreKeys=['receita_bruta','devolucoes_descontos','impostos_sobre_vendas','custos_diretos','folha_encargos_dre','despesas_administrativas','despesas_comerciais','outras_despesas_operacionais','depreciacao_amortizacao','receitas_financeiras','despesas_financeiras','outras_receitas'];
export function assess(study:Study,facts:Fact[],year=2029){
 const fields=consolidate(study,facts),multiplier=study.periodMode==='monthly-projection'?12:1;
 if(fields.folha_encargos_dre.value===null&&fields.salarios.value!==null&&fields.encargos.value!==null)fields.folha_encargos_dre={value:fields.salarios.value+fields.encargos.value,source:'Salários + encargos informados',facts:[],issue:null,manual:false};
 const get=(key:string)=>fields[key]?.value??0;
 const annual=(key:string)=>get(key)*(['rbt12','fs12','ativo','passivo','pl','prejuizo_fiscal','base_negativa','prazo_receber','prazo_pagar','clientes_empresas'].includes(key)?1:multiplier);
 const revenue=annual('receita_bruta')-annual('devolucoes_descontos');
 const costs=['custos_diretos','folha_encargos_dre','despesas_administrativas','despesas_comerciais','outras_despesas_operacionais','depreciacao_amortizacao','despesas_financeiras'].reduce((s,k)=>s+annual(k),0);
 const profit=revenue-annual('impostos_sobre_vendas')-costs+annual('receitas_financeiras')+annual('outras_receitas');
 const missing=dreKeys.filter(k=>fields[k].value===null);
 const yearFull=study.start.endsWith('-01-01')&&study.end.endsWith('-12-31');
 const parsed=schema.safeParse({...study.base,name:study.name,cnpj:study.cnpj,activity:({services:'Serviços',commerce:'Comércio',industry:'Indústria',mixed:'Atividades mistas'})[study.activity],notes:study.notes,period:study.start.slice(0,4),revenue:Math.max(0,revenue),costs,margin:revenue>0?profit/revenue*100:0,rbt12:annual('rbt12'),payroll:annual('fs12'),cbsCreditBase:annual('base_cbs'),ibsCreditBase:annual('base_ibs'),pisCreditBase:annual('base_pis_cofins'),realAdjust:annual('real_adjust'),reviewed:false,dre:null});
 const validation=studySchema.safeParse(study),d:Data=parsed.success?parsed.data:newStudy().base;
 const invalid=[...(!parsed.success?parsed.error.issues.map(i=>'Confira '+i.path.join('.')+': '+i.message):[]),...(!validation.success?validation.error.issues.map(i=>'Confira '+(i.path.join('.')||'o período')+': '+i.message):[])];
 // The detailed engine keeps its own configured bases. Imports never reset payroll or activity settings.
 const simpleRef=d.simpleMethod==='reference'&&d.rbt12>0;
 if(!simpleRef)d.simpleMethod='manual';
 const r=calculate(d,year),excluded=scope(d),common=[...invalid,...missing.map(k=>'Informe '+fieldLabels[k]+'.')];
 if(!yearFull&&study.periodMode!=='monthly-projection')common.push('O comparativo exige ano completo ou média mensal projetada. Os dados parciais foram preservados.');
 if(study.periodMode==='monthly-projection'&&study.start.slice(0,7)!==study.end.slice(0,7))common.push('Selecione somente um mês de referência para projetar 12 meses.');
 if(fields.encargos.value!==null&&fields.folha_encargos_dre.value!==null&&fields.encargos.value>fields.folha_encargos_dre.value)common.push('Os encargos não podem superar o custo total de pessoal na DRE.');
 if(revenue<=0)common.push('Informe receita superior às devoluções.');
 if(dreKeys.some(k=>fields[k].issue))common.push('Há diferenças entre fontes da DRE; resolva-as antes da comparação.');
 common.push(...problems(d).filter(s=>!s.includes('RBT12')));
 const noPayroll=d.payrollConfig.enabled?false:annual('folha_encargos_dre')>0&&fields.encargos.value===null;
 const manualPayroll=d.payrollConfig.enabled?0:annual('encargos');
 const keys=['simple','hybrid','presumed','real'] as const,names=['Simples Nacional','Simples híbrido','Lucro Presumido','Lucro Real'];
 const cards=keys.map((key,index)=>{
  const pending=[...common];if(excluded[index])pending.push(excluded[index]!);
  if(noPayroll)pending.push('Separe os encargos do total de pessoal ou configure a folha detalhada.');
  if(index<2){if(fields.rbt12.value===null)pending.push('Informe a RBT12.');if(d.factorR&&fields.fs12.value===null)pending.push('Informe a FS12 para o fator R.');if(!simpleRef&&d.das[year-2027]===0)pending.push('Configure o DAS ou o anexo de referência.');}
  if(index>0&&[fields.base_cbs,fields.base_ibs].some(f=>f.value===null))pending.push('Informe as bases de crédito ou escolha explicitamente simular sem créditos.');
  if(index===3&&fields.real_adjust.value===null)pending.push('Informe os ajustes fiscais, inclusive zero se não houver.');
  if(index===3&&((fields.prejuizo_fiscal.value||0)>0||(fields.base_negativa.value||0)>0))pending.push('Compensações acumuladas não estão modeladas no motor anual; mantenha esta análise como parcial.');
  const eligibility=study.eligibility[key==='hybrid'?'simple':key];
  const value=pending.length||eligibility==='no'?null:r[key]+manualPayroll;
  return {key,name:names[index],value,rate:value===null?null:value/revenue*100,pending:[...new Set(pending)],eligibility,status:eligibility==='no'?'Não elegível':pending.length?'Faltam informações':study.assumptionsReviewed&&eligibility==='yes'?'Simulação parametrizada':'Estimativa com premissas'};
 });
 const comparable=cards.filter(c=>c.value!==null&&c.eligibility==='yes'&&study.assumptionsReviewed),best=comparable.length===4?comparable.reduce((a,b)=>a.value!<b.value!?a:b).key:null;
 const extras=manualExtras(d),legacyData={...d,extraSimple:extras.simple+manualPayroll,extraHybrid:extras.hybrid+manualPayroll,extraPresumed:extras.presumed+manualPayroll,extraReal:extras.real+manualPayroll};
 return {fields,data:d,legacyData,result:r,cards,best,revenue,costs,profit,missing,multiplier,manualPayroll,ready:!common.length};
}
