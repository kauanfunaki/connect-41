// Motor fiscal do Connect Tributário (ENGINE R_4.1), portado de dev41tech/connect-tributario,
// arquivo `lib/fiscal.ts`, commit 0fcc797 (14/10/2026). Cópia fiel: NÃO altere fórmulas, tabelas
// ou arredondamentos aqui — os testes-gabarito ao lado garantem o mesmo resultado do original.
// Ajustes do porte (mecânicos): imports sem a extensão .ts e `.prefault({})` no lugar de
// `.default({})` em objetos, porque no zod 4 o default de objeto não preenche os campos internos;
// e `Number(n).toLocaleString` em `percent`, a forma que o ESLint do Connect aceita (mesma saída).

import { z } from 'zod';
import {accountingSnapshots} from './snapshot';
import {payrollSchema,calculatePayroll,calculateMixedPayroll,payrollProblems,payrollRegimes} from './payroll';
import {activitiesSchema,type Activity} from './activities';
import {externalAmounts,externalTaxResult,externalTaxProblem,type ExternalRegime} from './external-taxes';
const money=z.number().finite().min(0).max(1e12), pct=z.number().finite().min(0).max(100);
export const ENGINE='R_4.1';
export const schema=z.object({accounting:accountingSnapshots,name:z.string().trim().min(1).max(160),cnpj:z.string().max(30),period:z.string().max(30),activity:z.string().max(120),revenue:money,rbt12:money,payroll:money,costs:money,creditBase:money,creditRate:pct,margin:z.number().finite().min(-1000000).max(1000000),cbs:pct,ibs:pct,reduction:pct,legacy:pct,pis:pct,presIR:pct,presCS:pct,extra:money,realAdjust:z.number().finite().min(-1e12).max(1e12),das:z.array(pct).length(7),removed:z.array(pct).length(7),notes:z.string().max(5000),
 cbsCreditBase:money.nullable().default(null),ibsCreditBase:money.nullable().default(null),pisCreditBase:money.nullable().default(null),
 cbsCreditRate:pct.nullable().default(null),ibsCreditRate:pct.nullable().default(null),pisCreditRate:pct.nullable().default(null),
 extraSimple:money.nullable().default(null),extraHybrid:money.nullable().default(null),extraPresumed:money.nullable().default(null),extraReal:money.nullable().default(null),
 annex:z.enum(['I','II','III','IV','V']).default('III'),factorR:z.boolean().default(false),simpleMethod:z.enum(['manual','reference']).default('manual'),
 payrollConfig:payrollSchema.prefault({}),
 activities:activitiesSchema.prefault({}),
 dre:z.object({version:z.literal(1),format:z.literal('simplified').optional(),period:z.string().regex(/^(19|20|21)\d{2}$/),importedAt:z.string().datetime(),values:z.object({
  receita_bruta:money,devolucoes_descontos:money,impostos_sobre_vendas:money,custos_diretos:money,folha_encargos_dre:money,
  despesas_administrativas:money,despesas_comerciais:money,outras_despesas_operacionais:money,depreciacao_amortizacao:money,
  receitas_financeiras:money,despesas_financeiras:money,outras_receitas:money,irpj_csll:money,rbt12:money,fs12:money,
  base_cbs:money,base_ibs:money,base_pis_cofins:money,
 })}).nullable().default(null),
 responsible:z.string().max(160).default(''),reviewed:z.boolean().default(false),scenario:z.string().max(160).default('Base'),
});
export type Data=z.infer<typeof schema>;
export const demo:Data=schema.parse({name:'Empresa demonstração',cnpj:'',period:'2026',activity:'Serviços • exemplo editável',revenue:1200000,rbt12:1200000,payroll:360000,costs:900000,creditBase:240000,creditRate:100,margin:25,cbs:8.8,ibs:17.7,reduction:0,legacy:3,pis:9.25,presIR:32,presCS:32,extra:0,realAdjust:0,das:[13.03,13.03,13.03,13.03,13.03,13.03,13.03],removed:[2,2,2.5,3,3.5,4,6],notes:'Exemplo fictício. Substitua os valores. CBS, IBS, DAS e exclusões do DAS são premissas, não alíquotas oficiais validadas.'});
export const years=[2027,2028,2029,2030,2031,2032,2033];
// LC 123/2006, anexos I–V. Referência geral; exceções da operação exigem parâmetros específicos.
export const annexTables={
 I:{rates:[4,7.3,9.5,10.7,14.3,19],deductions:[0,5940,13860,22500,87300,378000]},
 II:{rates:[4.5,7.8,10,11.2,14.7,30],deductions:[0,5940,13860,22500,85500,720000]},
 III:{rates:[6,11.2,13.5,16,21,33],deductions:[0,9360,17640,35640,125640,648000]},
 IV:{rates:[4.5,9,10.2,14,22,33],deductions:[0,8100,12420,39780,183780,828000]},
 V:{rates:[15.5,18,19.5,20.5,23,30.5],deductions:[0,4500,9900,17100,62100,540000]},
};
export function simplesReference(d:Data){
 const factor=d.rbt12>0?d.payroll/d.rbt12:0;
 const annex=d.factorR?(factor>=.28?'III':'V'):d.annex;
 const band=[180000,360000,720000,1800000,3600000,4800000].findIndex(v=>d.rbt12<=v);
 if(d.rbt12<=0||band<0)return null;
 const t=annexTables[annex],nominal=t.rates[band],deduction=t.deductions[band];
 return {annex,band:band+1,nominal,deduction,factor,effective:(d.rbt12*nominal/100-deduction)/d.rbt12*100};
}
export function creditInputs(d:Data){if(d.activities?.enabled){const rows=d.activities.rows;const total=(key:'cbs'|'ibs'|'pis')=>{const base=rows.reduce((s,a)=>s+a[`${key}CreditBase`],0),eligible=rows.reduce((s,a)=>s+a[`${key}CreditBase`]*a[`${key}CreditRate`]/100,0);return {base,rate:base?eligible/base*100:0}};const c=total('cbs'),i=total('ibs'),p=total('pis');return {cbsBase:c.base,ibsBase:i.base,pisBase:p.base,cbsRate:c.rate,ibsRate:i.rate,pisRate:p.rate}}return {
 cbsBase:d.cbsCreditBase??d.creditBase,ibsBase:d.ibsCreditBase??d.creditBase,pisBase:d.pisCreditBase??d.creditBase,
 cbsRate:d.cbsCreditRate??d.creditRate,ibsRate:d.ibsCreditRate??d.creditRate,pisRate:d.pisCreditRate??d.creditRate,
};}
export function activityReference(d:Data,a:Activity){return simplesReference({...d,annex:a.annex,factorR:a.factorR});}
export function payrollAnnex(d:Data){
 if(!d.activities?.enabled)return simplesReference(d)?.annex??d.annex;
 const annexes=d.activities.rows.map(a=>activityReference(d,a)?.annex??a.annex);
 return annexes.includes('IV')?(annexes.some(a=>a!=='IV')?'mixed':'IV'):'III';
}
export function activityResults(d:Data,year:number){
 const i=years.indexOf(year);if(i<0)throw Error('Ano inválido');
 const factor=[0,0,.1,.2,.3,.4,1][i];
 return (d.activities?.enabled?d.activities.rows:[]).map(a=>{
  const v=a.annual[i],ref=activityReference(d,a),dasRate=a.simpleMethod==='reference'?(ref?.effective??0):v.das;
  const cbs=Math.max(0,a.cbs-(i<2?.1:0)),ibs=i<2?.1:a.ibs*factor;
  const cbsPurchase=Math.max(0,a.cbsPurchaseRate-(i<2?.1:0)),ibsPurchase=i<2?.1:a.ibsPurchaseRate*factor;
  const cbsDebit=v.cbsDebit??a.revenue*cbs/100*(1-a.cbsReduction/100),ibsDebit=v.ibsDebit??a.revenue*ibs/100*(1-a.ibsReduction/100);
  const cbsCredit=v.cbsCredit??a.cbsCreditBase*a.cbsCreditRate/100*cbsPurchase/100,ibsCredit=v.ibsCredit??a.ibsCreditBase*a.ibsCreditRate/100*ibsPurchase/100;
  const icms=v.icms??a.revenue*a.icms/100*(1-factor),iss=v.iss??a.revenue*a.iss/100*(1-factor);
  return {id:a.id,name:a.name,kind:a.kind,revenue:a.revenue,annex:ref?.annex??a.annex,dasRate,das:a.revenue*dasRate/100,residual:a.revenue*Math.max(0,dasRate-v.removed)/100,
   irBase:a.revenue*a.presIR/100,csBase:a.revenue*a.presCS/100,cbsDebit,ibsDebit,cbsCredit,ibsCredit,icms,iss,
   currentLegacy:a.revenue*(a.icms+a.iss)/100,pisDebit:a.revenue*a.pis/100,pisCredit:a.pisCreditBase*a.pisCreditRate/100*a.pisPurchaseRate/100,currentExtra:a.currentExtra,creditPool:a.creditPool,
   external:externalAmounts(v),externalMode:v.externalMode,externalItems:v.externalMode==='items'?v.externalItems.map(item=>({...item,result:externalTaxResult(item)})):[],manual:a.treatments.length>0||v.externalMode==='items'||[v.cbsDebit,v.ibsDebit,v.cbsCredit,v.ibsCredit,v.icms,v.iss].some(x=>x!==null)};
 });
}
export function calculate(d:Data,year:number){
 const i=years.indexOf(year);if(i<0)throw Error('Ano inválido');
 const rows=activityResults(d,year),mixed=!!d.activities?.enabled;
 const total=(key:'cbsDebit'|'ibsDebit'|'cbsCredit'|'ibsCredit'|'icms'|'iss'|'irBase'|'csBase'|'das'|'residual'|'pisDebit'|'pisCredit'|'currentLegacy'|'currentExtra')=>rows.reduce((sum,a)=>sum+a[key],0);
 const factor=[0,0,.1,.2,.3,.4,1][i], cbs=Math.max(0,d.cbs-(i<2?.1:0)),ibs=i<2?.1:d.ibs*factor;
 const bases=creditInputs(d),cbsDebit=mixed?total('cbsDebit'):d.revenue*cbs*(1-d.reduction/100)/100,ibsDebit=mixed?total('ibsDebit'):d.revenue*ibs*(1-d.reduction/100)/100;
 const cbsCredit=mixed?total('cbsCredit'):bases.cbsBase*bases.cbsRate/100*cbs/100,ibsCredit=mixed?total('ibsCredit'):bases.ibsBase*bases.ibsRate/100*ibs/100;
 const pools=new Map<string,{cbsDebit:number;cbsCredit:number;ibsDebit:number;ibsCredit:number}>();
 for(const row of rows){const key=row.creditPool==='isolated'?'isolated:'+row.id:'company',pool=pools.get(key)??{cbsDebit:0,cbsCredit:0,ibsDebit:0,ibsCredit:0};for(const field of ['cbsDebit','cbsCredit','ibsDebit','ibsCredit'] as const)pool[field]+=row[field];pools.set(key,pool);}
 const poolResults=[...pools.values()];
 const cbsDue=mixed?poolResults.reduce((s,p)=>s+Math.max(0,p.cbsDebit-p.cbsCredit),0):Math.max(0,cbsDebit-cbsCredit),ibsDue=mixed?poolResults.reduce((s,p)=>s+Math.max(0,p.ibsDebit-p.ibsCredit),0):Math.max(0,ibsDebit-ibsCredit);
 const cbsBalance=mixed?poolResults.reduce((s,p)=>s+Math.max(0,p.cbsCredit-p.cbsDebit),0):Math.max(0,cbsCredit-cbsDebit),ibsBalance=mixed?poolResults.reduce((s,p)=>s+Math.max(0,p.ibsCredit-p.ibsDebit),0):Math.max(0,ibsCredit-ibsDebit);
 // Saldos não compensam outro tributo e não são entrada de caixa.
 const debit=cbsDebit+ibsDebit,credit=cbsCredit+ibsCredit,vat=cbsDue+ibsDue,balance=cbsBalance+ibsBalance;
 const old=mixed?total('icms')+total('iss'):d.revenue*d.legacy/100*(1-factor),profit=d.revenue*d.margin/100;
 const irBase=mixed?total('irBase'):d.revenue*d.presIR/100,csBase=mixed?total('csBase'):d.revenue*d.presCS/100;
 const irpj=irBase*.15,additional=Math.max(0,irBase-240000)*.1,csll=csBase*.09;
 const reference=simplesReference(d),annex=payrollAnnex(d),p=d.payrollConfig;
 const payroll={simple:annex==='mixed'?calculateMixedPayroll(p,year,'simple'):calculatePayroll(p,year,'simple',annex),hybrid:annex==='mixed'?calculateMixedPayroll(p,year,'hybrid'):calculatePayroll(p,year,'hybrid',annex),presumed:calculatePayroll(p,year,'presumed',annex),real:calculatePayroll(p,year,'real',annex),current:calculatePayroll(p,Number(d.period),'real',annex)};
 const included=p.enabled?(p.includedInMargin??0):0;
 const payrollProfits={simple:profit+included-payroll.simple.total,hybrid:profit+included-payroll.hybrid.total,presumed:profit+included-payroll.presumed.total,real:profit+included-payroll.real.total,current:profit+included-payroll.current.total};
 const manual=manualExtras(d);
 const remainingExtras=Object.fromEntries(payrollRegimes.map(k=>[k,manual[k]-(p.enabled?p.manualOverlap[k]:0)])) as Record<'simple'|'hybrid'|'presumed'|'real',number>;
 const income=irpj+additional+csll,realBase=Math.max(0,payrollProfits.real+d.realAdjust);
 const currentRealBase=Math.max(0,payrollProfits.current+d.realAdjust),currentRealIncome=currentRealBase*.24+Math.max(0,currentRealBase-240000)*.1;
 const realIrpj=realBase*.15,realAdditional=Math.max(0,realBase-240000)*.1,realCsll=realBase*.09,realIncome=realIrpj+realAdditional+realCsll;
 const dasRate=mixed?(d.revenue?total('das')/d.revenue*100:0):d.simpleMethod==='reference'?(reference?.effective??0):d.das[i];
 const activityExtras=Object.fromEntries(payrollRegimes.map(k=>[k,rows.reduce((sum,a)=>sum+a.external[k],0)])) as Record<'simple'|'hybrid'|'presumed'|'real',number>;
 const simple=d.revenue*dasRate/100+remainingExtras.simple+payroll.simple.total+activityExtras.simple;
 const residual=mixed?total('residual'):d.revenue*Math.max(0,dasRate-d.removed[i])/100;
 const hybrid=residual+vat+remainingExtras.hybrid+payroll.hybrid.total+activityExtras.hybrid,presumed=income+vat+old+remainingExtras.presumed+payroll.presumed.total+activityExtras.presumed;
 const currentPis=mixed?Math.max(0,total('pisDebit')-total('pisCredit')):Math.max(0,(d.revenue-bases.pisBase*bases.pisRate/100)*d.pis/100);
 const current=currentRealIncome+currentPis+(mixed?total('currentLegacy'):d.revenue*d.legacy/100)+remainingExtras.real+payroll.current.total+total('currentExtra'),real=realIncome+vat+old+remainingExtras.real+payroll.real.total+activityExtras.real;
 return {activityRows:rows,activityExtras,payroll,payrollProfits,remainingExtras,currentRealBase,currentRealIncome,year,cbs:mixed&&d.revenue?cbsDebit/d.revenue*100:cbs,ibs:mixed&&d.revenue?ibsDebit/d.revenue*100:ibs,debit,credit,vat,balance,old,income,realIncome,residual,simple,hybrid,presumed,current,real,profit,irBase,csBase,irpj,additional,csll,realBase,realIrpj,realAdditional,realCsll,currentPis,cbsDebit,ibsDebit,cbsCredit,ibsCredit,cbsDue,ibsDue,cbsBalance,ibsBalance,dasRate};
}
export function activityScope(d:Data):Array<string|null>{
 if(!d.activities?.enabled)return [null,null,null,null];
 const rows=d.activities.rows,unreviewed=rows.find(a=>!a.reviewed),undocumented=rows.find(a=>a.treatments.length>0&&!a.basis.trim());
 const common=unreviewed?'Revise os parâmetros da atividade: '+unreviewed.name:undocumented?'Documente o tratamento especial de '+undocumented.name:null;
 const excluded=(key:'simpleAllowed'|'presumedAllowed'|'realAllowed')=>rows.some(a=>!a[key])?'Regime não elegível conforme cadastro das atividades.':null;
 const mixedIV=payrollAnnex(d)==='mixed'&&d.payrollConfig.enabled,p=d.payrollConfig;
 const referenceMissing=rows.some(a=>a.simpleAllowed&&a.simpleMethod==='reference'&&d.rbt12<=0)?'Informe a RBT12 consolidada para projetar o Simples.':null;
 const allocation=mixedIV&&(!p.mixedReviewed||p.mixedEmployeeShare===null||p.mixedContributorShare===null)?'Concilie a folha do Anexo IV com as demais atividades.':mixedIV&&p.cprbSimple?'CPRB parcial no Simples: use encargos externos revisados; combinação automática não modelada.':null;
 const externalIssue=(regime:ExternalRegime)=>{for(const a of rows)for(const [index,v] of a.annual.entries()){if(v.externalMode==='items'){const item=v.externalItems.find(item=>item.regime===regime&&externalTaxProblem(item));if(item)return `${a.name} · ${years[index]} · ${item.name||'Recolhimento'}: ${externalTaxProblem(item)}`;}}return null;};
 return [common||excluded('simpleAllowed')||referenceMissing||allocation||externalIssue('simple'),common||excluded('simpleAllowed')||referenceMissing||allocation||externalIssue('hybrid'),common||excluded('presumedAllowed')||externalIssue('presumed'),common||excluded('realAllowed')||externalIssue('real')];
}
export function scope(d:Data){
 const simple=Math.max(d.rbt12,d.revenue)>3600000?'Acima de R$ 3,6 milhões: sublimites e recolhimentos externos não modelados.':null;
 const base=[simple,simple,d.revenue>5000000?'Acima de R$ 5 milhões: majoração de bases do Presumido não modelada.':null,null],activities=activityScope(d);
 return base.map((item,i)=>item||activities[i]);
}
export const brl=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(n);
export const percent=(n:number)=>Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';
export function manualExtras(d:Data){return {simple:d.extraSimple??d.extra,hybrid:d.extraHybrid??d.extra,presumed:d.extraPresumed??d.extra,real:d.extraReal??d.extra}}
export function problems(d:Data){
 const ref=simplesReference(d),rates=d.simpleMethod==='reference'?Array(7).fill(ref?.effective??0):d.das;
 const errors=payrollProblems(d.payrollConfig,d.period,manualExtras(d),payrollAnnex(d)==='mixed'?'IV':payrollAnnex(d));
 if(d.revenue<=0)errors.push('Informe uma receita anual maior que zero.');
 if(d.activities?.enabled){
  const rows=d.activities.rows;
  if(!rows.length)errors.push('Adicione ao menos uma atividade.');
  if(new Set(rows.map(a=>a.id)).size!==rows.length)errors.push('Há atividades com identificador duplicado.');
  if(Math.abs(rows.reduce((sum,a)=>sum+a.revenue,0)-d.revenue)>.01)errors.push('A soma das receitas por atividade deve coincidir com a receita da empresa.');
  for(const a of rows){
   if(!a.name.trim())errors.push('Informe o nome de cada atividade.');
   if(a.annual.some(v=>v.externalMode==='items'&&new Set(v.externalItems.map(item=>item.id)).size!==v.externalItems.length))errors.push(a.name+': há recolhimentos com identificador duplicado no mesmo ano.');
   const reference=activityReference(d,a);
   if(a.simpleAllowed&&a.annual.some(v=>v.removed>(a.simpleMethod==='reference'?(reference?.effective??0):v.das)))errors.push(a.name+': a exclusão do DAS supera a alíquota total.');
   if(a.factorR&&!['III','V'].includes(a.annex))errors.push(a.name+': Fator R exige referência III ou V.');
  }
 }else{
  if(d.removed.some((v,i)=>v>rates[i]))errors.push('A exclusão do DAS não pode superar a alíquota total.');
  if(d.simpleMethod==='reference'&&(!ref||d.rbt12>3600000))errors.push('A projeção automática de referência exige RBT12 positiva de até R$ 3,6 milhões. Use o modo manual para estudos fora desse escopo.');
 }
 return errors;
}
