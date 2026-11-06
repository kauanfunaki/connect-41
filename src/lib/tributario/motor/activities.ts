// Motor fiscal do Connect Tributário (ENGINE R_4.1), portado de dev41tech/connect-tributario,
// arquivo `lib/activities.ts`, commit 0fcc797 (14/10/2026). Cópia fiel: NÃO altere fórmulas, tabelas
// ou arredondamentos aqui — os testes-gabarito ao lado garantem o mesmo resultado do original.
// Ajustes do porte (mecânicos): imports sem a extensão .ts e `.prefault({})` no lugar de
// `.default({})` em objetos, porque no zod 4 o default de objeto não preenche os campos internos.

import {z} from 'zod';
import {externalTaxSchema} from './external-taxes';

const money=z.number().finite().min(0).max(1e12),pct=z.number().finite().min(0).max(100);
export const activityKinds={commerce:'Comércio / revenda',industry:'Indústria / fabricação',services:'Serviços',other:'Outra atividade'} as const;
export const treatmentLabels={ipi:'IPI',st:'ICMS-ST / antecipação',difal:'DIFAL / FCP',monophase:'PIS/Cofins monofásico',export:'Exportação',import:'Importação',benefit:'Isenção / benefício fiscal',specific:'Regime específico / Imposto Seletivo'} as const;
export const annualActivitySchema=z.object({
 das:pct.default(0),removed:pct.default(0),
 cbsDebit:money.nullable().default(null),cbsCredit:money.nullable().default(null),
 ibsDebit:money.nullable().default(null),ibsCredit:money.nullable().default(null),
 icms:money.nullable().default(null),iss:money.nullable().default(null),
 simple:money.default(0),hybrid:money.default(0),presumed:money.default(0),real:money.default(0),
 externalMode:z.enum(['total','items']).default('total'),externalItems:z.array(externalTaxSchema).max(24).default([]),
});
export const activitySchema=z.object({
 id:z.string().min(1).max(80),name:z.string().max(160),kind:z.enum(['commerce','industry','services','other']),
 revenue:money,annex:z.enum(['I','II','III','IV','V']).default('III'),factorR:z.boolean().default(false),
 simpleMethod:z.enum(['reference','manual']).default('reference'),
 presIR:pct.default(32),presCS:pct.default(32),
 icms:pct.default(0),iss:pct.default(0),pis:pct.default(9.25),
 cbs:pct.default(8.8),ibs:pct.default(17.7),cbsReduction:pct.default(0),ibsReduction:pct.default(0),
 cbsCreditBase:money.default(0),ibsCreditBase:money.default(0),pisCreditBase:money.default(0),
 cbsCreditRate:pct.default(100),ibsCreditRate:pct.default(100),pisCreditRate:pct.default(100),
 cbsPurchaseRate:pct.default(8.8),ibsPurchaseRate:pct.default(17.7),pisPurchaseRate:pct.default(9.25),
 creditPool:z.enum(['company','isolated']).default('company'),
 currentExtra:money.default(0),
 simpleAllowed:z.boolean().default(true),presumedAllowed:z.boolean().default(true),realAllowed:z.boolean().default(true),
 cnae:z.string().max(30).default(''),classification:z.string().max(100).default(''),uf:z.string().max(2).default(''),
 treatments:z.array(z.enum(['ipi','st','difal','monophase','export','import','benefit','specific'])).max(8).default([]),
 reviewed:z.boolean().default(false),basis:z.string().max(2000).default(''),
 annual:z.array(annualActivitySchema).length(7).default(()=>Array.from({length:7},()=>annualActivitySchema.parse({}))),
});
export const activitiesSchema=z.object({enabled:z.boolean().default(false),rows:z.array(activitySchema).max(30).default([])});
export type Activity=z.infer<typeof activitySchema>;
export type ActivityKind=Activity['kind'];
export type ActivityAnnual=z.infer<typeof annualActivitySchema>;
export type Activities=z.infer<typeof activitiesSchema>;
export const emptyActivities=()=>activitiesSchema.parse({});
export const activityPresets=[
 {label:'Comércio',kinds:['commerce']}, {label:'Indústria',kinds:['industry']}, {label:'Serviços',kinds:['services']},
 {label:'Comércio + serviços',kinds:['commerce','services']}, {label:'Indústria + comércio',kinds:['industry','commerce']},
 {label:'Indústria + serviços',kinds:['industry','services']}, {label:'Comércio + indústria + serviços',kinds:['commerce','industry','services']},
] as const;
export function createActivity(kind:ActivityKind,id:string,revenue=0):Activity{
 return activitySchema.parse({id,name:activityKinds[kind],kind,revenue,annex:kind==='commerce'?'I':kind==='industry'?'II':'III',presIR:kind==='commerce'||kind==='industry'?8:32,presCS:kind==='commerce'||kind==='industry'?12:32,treatments:kind==='industry'?['ipi']:kind==='other'?['specific']:[]});
}
export const activitySources=[
 ['Receitas segregadas e anexos — LC 123, art. 18','https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm'],
 ['Bases presumidas por atividade — Lei 9.249, arts. 15 e 20','https://www.planalto.gov.br/ccivil_03/leis/l9249.htm'],
 ['Folha em atividades concomitantes — PGFN, Parecer 687/2025','https://dadosabertos.pgfn.gov.br/Portal_da_Cidadania_Tributaria/Parecer%20SEI%20N%C2%BA%20687-2025-MF.pdf'],
];
