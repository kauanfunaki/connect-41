// Avaliação (estudo) do Connect Tributário, portada de dev41tech/connect-tributario,
// arquivo `lib/studies/model.ts`, commit 0fcc797 (14/10/2026). Cópia fiel das regras: NÃO altere
// cálculos aqui. Ajustes do porte (mecânicos): imports sem a extensão .ts apontando para ../motor
// e `.prefault({})` no lugar de `.default({})` em objeto (zod 4). Na Fase 1 não há documentos:
// `assess(study, [])` usa só os valores informados; os tipos de fato e documento ficam para a Fase 2.

import {z} from 'zod';
import {demo,schema as fiscalSchema,type Data} from '../motor/fiscal';

export const fieldLabels:Record<string,string>={
 receita_bruta:'Receita bruta',devolucoes_descontos:'Devoluções e descontos',impostos_sobre_vendas:'Tributos sobre vendas',
 custos_diretos:'Custos diretos',folha_encargos_dre:'Pessoal e encargos na DRE',despesas_administrativas:'Despesas operacionais',
 despesas_comerciais:'Despesas comerciais',outras_despesas_operacionais:'Outras despesas operacionais',depreciacao_amortizacao:'Depreciação e amortização',
 receitas_financeiras:'Receitas financeiras',despesas_financeiras:'Despesas financeiras',outras_receitas:'Outras receitas',irpj_csll:'IRPJ e CSLL atuais',
 rbt12:'RBT12 de referência',fs12:'FS12 para fator R',base_cbs:'Compras elegíveis a CBS',base_ibs:'Compras elegíveis a IBS',base_pis_cofins:'Base PIS/Cofins atual',
 salarios:'Salários e pró-labore',encargos:'Encargos patronais',ativo:'Ativo',passivo:'Passivo sem PL',pl:'Patrimônio líquido',
 real_adjust:'Adições menos exclusões fiscais',prejuizo_fiscal:'Prejuízo fiscal acumulado',base_negativa:'Base negativa de CSLL',
 documentos_vendas:'Vendas documentadas',documentos_compras:'Compras documentadas',tributos_pagos:'Tributos pagos',
 prazo_receber:'Prazo médio de recebimento (dias)',prazo_pagar:'Prazo médio de pagamento (dias)',clientes_empresas:'Vendas para empresas (%)',
};
export const steps=[
 {title:'Empresa',short:'Empresa',description:'Quem vamos avaliar e qual é o período?',fields:[]},
 {title:'Receitas',short:'Receitas',description:'Quanto a empresa vende e quais atividades geram receita?',fields:['receita_bruta','devolucoes_descontos','rbt12']},
 {title:'Custos e despesas',short:'Operação',description:'Separe os gastos da operação, sem repetir pessoal ou impostos.',fields:['custos_diretos','despesas_administrativas','despesas_comerciais','outras_despesas_operacionais']},
 {title:'Folha e encargos',short:'Pessoal',description:'O custo da DRE e a folha para fator R têm finalidades diferentes.',fields:['folha_encargos_dre','salarios','encargos','fs12']},
 {title:'Contabilidade e lucro',short:'Contabilidade',description:'Conecte patrimônio, resultado e ajustes fiscais.',fields:['ativo','passivo','pl','depreciacao_amortizacao','receitas_financeiras','despesas_financeiras','outras_receitas','real_adjust','prejuizo_fiscal','base_negativa']},
 {title:'Tributos e créditos',short:'Tributos',description:'Informe o que está comprovado e explicite as hipóteses.',fields:['impostos_sobre_vendas','irpj_csll','base_cbs','base_ibs','base_pis_cofins','tributos_pagos']},
 {title:'Clientes e caixa',short:'Caixa',description:'Veja como prazos e clientes influenciam a decisão.',fields:['prazo_receber','prazo_pagar','clientes_empresas']},
 {title:'Comparativo',short:'Resultado',description:'Compare os cenários com as premissas e evidências disponíveis.',fields:[]},
];
export const amount=z.number().finite().min(-1e12).max(1e12);
export const isoDate=z.string().regex(/^20\d{2}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v,'Data inválida');
export const factSchema=z.object({field:z.string().refine(v=>v in fieldLabels),value:amount,start:isoDate,end:isoDate,
 cancelled:z.boolean().default(false),basis:z.enum(['total','transaction','balance','reference']),source:z.string().max(1500),identity:z.string().max(200).default(''),
}).refine(v=>v.start<=v.end,'Período inválido').refine(v=>v.value>=0||['pl','real_adjust'].includes(v.field),'Valor negativo incompatível').refine(v=>v.field!=='clientes_empresas'||v.value<=100,'Percentual acima de 100').refine(v=>!v.field.startsWith('prazo_')||v.value<=3650,'Prazo acima do limite');
export type Fact=z.infer<typeof factSchema>&{id:string;documentId:string;filename:string};
export const studySchema=z.object({
 name:z.string().trim().min(1).max(160),cnpj:z.string().regex(/^(?:\d{14})?$/).default(''),
 mode:z.enum(['quick','guided']).default('quick'),step:z.number().int().min(0).max(7).default(0),
 start:isoDate,end:isoDate,periodMode:z.enum(['actual','monthly-projection']).default('actual'),
 activity:z.enum(['services','commerce','industry','mixed']).default('services'),
 currentRegime:z.enum(['simple','presumed','real','unknown']).default('unknown'),uf:z.string().max(2).default(''),city:z.string().max(100).default(''),
 values:z.record(z.string().refine(v=>v in fieldLabels),amount.nullable()).default({}),
 eligibility:z.object({simple:z.enum(['unknown','yes','no']).default('unknown'),presumed:z.enum(['unknown','yes','no']).default('unknown'),real:z.enum(['unknown','yes','no']).default('unknown')}).prefault({}),
 notes:z.string().max(5000).default(''),assumptionsReviewed:z.boolean().default(false),
 acceptedSources:z.record(z.string(),z.string().max(50000)).default({}),
 base:fiscalSchema,legacyId:z.string().max(80).nullable().default(null),
}).refine(s=>s.start<=s.end&&s.start.slice(0,4)===s.end.slice(0,4),'Use datas do mesmo ano, em ordem cronológica')
 .refine(s=>Object.entries(s.values).every(([k,v])=>v===null||v>=0||['pl','real_adjust'].includes(k)),'Use valores positivos para receitas e despesas')
 .refine(s=>(s.values.clientes_empresas??0)<=100&&(s.values.prazo_receber??0)<=3650&&(s.values.prazo_pagar??0)<=3650,'Percentual ou prazo inválido');
export type Study=z.infer<typeof studySchema>;
export type StudyRecord={id:string;revision:number;created:string;updated:string;data:Study};
export function newStudy(mode:'quick'|'guided'='quick',year=new Date().getFullYear()):Study{
 const base=fiscalSchema.parse({...structuredClone(demo),name:'Nova avaliação',cnpj:'',period:String(year),revenue:0,rbt12:0,payroll:0,costs:0,creditBase:0,margin:0,notes:'',das:Array(7).fill(0),removed:Array(7).fill(0)});
 return studySchema.parse({name:'Nova avaliação',mode,start:year+'-01-01',end:year+'-12-31',base});
}
export function fromLegacy(data:Data,legacyId:string):Study{
 const year=/^20\d{2}$/.test(data.period)?data.period:String(new Date().getFullYear());
 const values:Record<string,number>={rbt12:data.rbt12,fs12:data.payroll,base_cbs:data.cbsCreditBase??data.creditBase,base_ibs:data.ibsCreditBase??data.creditBase};
 if(data.dre)Object.assign(values,data.dre.values);
 return studySchema.parse({name:data.name,cnpj:data.cnpj.replace(/\D/g,''),start:year+'-01-01',end:year+'-12-31',mode:'guided',values,base:data,legacyId,notes:[data.notes,...(data.dre?[]:['Estudo anterior preservado. Complete a composição da DRE para usar o novo comparativo.'])].filter(Boolean).join('\n').slice(0,5000)});
}
export type DocumentStatus='queued'|'reading'|'applied'|'attention'|'failed'|'cancelled';
export type StudyDocument={id:string;batchId:string;filename:string;bytes:number;status:DocumentStatus;kind:string;start:string;end:string;issues:string[];attempts:number;created:string;updated:string;tokens:number;method:string};
export const documentNames:Record<string,string>={dre:'DRE',balanco:'Balanço',balancete:'Balancete',pgdas:'PGDAS-D',folha:'Folha',fiscal:'Documento fiscal',sped:'SPED',cadastro:'Cadastro',outro:'Documento de apoio',modelo:'Modelo Connect'};
