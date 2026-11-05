// Motor fiscal do Connect Tributário (ENGINE R_4.1), portado de dev41tech/connect-tributario,
// arquivo `lib/payroll.ts`, commit 0fcc797 (14/10/2026). Cópia fiel: NÃO altere fórmulas, tabelas
// ou arredondamentos aqui — os testes-gabarito ao lado garantem o mesmo resultado do original.
// Ajustes do porte (mecânicos): imports sem a extensão .ts e `.prefault({})` no lugar de
// `.default({})` em objetos, porque no zod 4 o default de objeto não preenche os campos internos.

import {z} from 'zod';

const money=z.number().finite().min(0).max(1e12);
export const payrollSchema=z.object({
 enabled:z.boolean().default(false),
 employees:money.default(0),thirteenth:money.default(0),
 apprentices:money.default(0),apprenticeThirteenth:money.default(0),contributors:money.default(0),
 rat:z.union([z.literal(1),z.literal(2),z.literal(3)]).nullable().default(null),
 fap:z.number().finite().min(.5).max(2).default(1),
 thirdPartyRate:z.number().finite().min(0).max(100).nullable().default(null),
 includedInMargin:money.nullable().default(null),
 manualOverlap:z.object({simple:money.default(0),hybrid:money.default(0),presumed:money.default(0),real:money.default(0)}).prefault({}),
 extrasReviewed:z.boolean().default(false),
 cprbRegular:z.boolean().default(false),cprbSimple:z.boolean().default(false),
 cprbRate:z.number().finite().min(0).max(4.5).default(0),cprbRevenue:money.default(0),
 cprbEligible:z.boolean().default(false),
 mixedEmployeeShare:z.number().finite().min(0).max(100).nullable().default(null),
 mixedContributorShare:z.number().finite().min(0).max(100).nullable().default(null),
 mixedReviewed:z.boolean().default(false),
});
export type PayrollConfig=z.infer<typeof payrollSchema>;
export const emptyPayroll=()=>payrollSchema.parse({});
export type PayrollRegime='simple'|'hybrid'|'presumed'|'real';
export const payrollRegimes:PayrollRegime[]=['simple','hybrid','presumed','real'];
export const payrollLabels={simple:'Simples',hybrid:'Híbrido',presumed:'Presumido',real:'Real'};

// Annual planning bases, not FS12. Employees include taxable vacation pay and
// its one-third supplement; 13th salary and apprentices are entered separately.
// CPP: Lei 8.212/1991 art. 22 I/III; CPRB: Lei 12.546/2011 art. 9-A.
export function calculatePayroll(p:PayrollConfig,year:number,regime:PayrollRegime,annex:string){
 const inDas=(regime==='simple'||regime==='hybrid')&&annex!=='IV';
 const simple=regime==='simple'||regime==='hybrid';
 const cprb=p.enabled&&!inDas&&(simple?p.cprbSimple:p.cprbRegular)&&year>=2025&&year<=2027;
 const cppRate=!p.enabled||inDas?0:cprb?(year-2024)*5:20;
 const cprbRate=cprb?p.cprbRate*({2025:.8,2026:.6,2027:.4}[year]??0):0;
 const employeeBase=p.employees+p.apprentices+p.thirteenth+p.apprenticeThirteenth;
 const thirteenth=p.thirteenth+p.apprenticeThirteenth;
 const cppBase=employeeBase+p.contributors-(cprb?thirteenth:0);
 const cppEmployees=p.enabled?(employeeBase-(cprb?thirteenth:0))*cppRate/100:0;
 const cppContributors=p.enabled?p.contributors*cppRate/100:0;
 const cpp=cppEmployees+cppContributors;
 const ratRate=!p.enabled||inDas?0:(p.rat??0)*p.fap;
 const rat=p.enabled?employeeBase*ratRate/100:0;
 const thirdPartyRate=!p.enabled||simple?0:p.thirdPartyRate??0;
 const thirdParties=p.enabled?employeeBase*thirdPartyRate/100:0;
 const fgtsEmployees=p.enabled?(p.employees+p.thirteenth)*.08:0;
 const fgtsApprentices=p.enabled?(p.apprentices+p.apprenticeThirteenth)*.02:0;
 const fgts=fgtsEmployees+fgtsApprentices;
 const cprbDue=p.enabled?p.cprbRevenue*cprbRate/100:0;
 const taxes=cpp+rat+thirdParties+cprbDue,total=taxes+fgts;
 return {year,inDas,cppRate,cppBase,employeeBase,cppEmployees,cppContributors,cpp,ratRate,rat,
  thirdPartyRate,thirdParties,fgtsEmployees,fgtsApprentices,fgts,cprb,cprbRate,cprbDue,taxes,total,
  gross:employeeBase+p.contributors,employerCost:employeeBase+p.contributors+total};
}

// Annual effective shares must be prepared from exclusive/shared payroll and
// monthly apportionment. Never infer them from the annual revenue mix.
export function calculateMixedPayroll(p:PayrollConfig,year:number,regime:PayrollRegime){
 const r=calculatePayroll(p,year,regime,'IV');
 if(regime==='presumed'||regime==='real'||!p.enabled)return r;
 const employee=(p.mixedEmployeeShare??0)/100,contributor=(p.mixedContributorShare??0)/100;
 const cppEmployees=r.cppEmployees*employee,cppContributors=r.cppContributors*contributor;
 const cpp=cppEmployees+cppContributors,rat=r.rat*employee;
 const taxes=cpp+rat+r.thirdParties+r.cprbDue,total=taxes+r.fgts;
 return {...r,cppEmployees,cppContributors,cpp,rat,taxes,total,employerCost:r.gross+total};
}

export function payrollProblems(p:PayrollConfig,period:string,extras:Record<PayrollRegime,number>,annex:string){
 if(!p.enabled)return [];
 const errors:string[]=[];
 if(!/^(202[5-9]|203[0-3])$/.test(period))errors.push('Para calcular a folha, informe ano-base entre 2025 e 2033.');
 const employees=p.employees+p.thirteenth+p.apprentices+p.apprenticeThirteenth;
 if(employees+p.contributors<=0)errors.push('Informe a remuneração anual da folha.');
 if(employees>0&&p.rat===null)errors.push('Selecione o RAT da atividade.');
 if(employees>0&&p.thirdPartyRate===null)errors.push('Informe a alíquota de terceiros conforme FPAS (zero se houver dispensa).');
 if(p.includedInMargin===null)errors.push('Informe os encargos já incluídos na margem/DRE, ou zero.');
 if(payrollRegimes.some(r=>extras[r]>0)&&!p.extrasReviewed)errors.push('Concilie a folha já lançada em outros tributos e encargos.');
 if(payrollRegimes.some(r=>p.manualOverlap[r]>extras[r]))errors.push('A folha a substituir nos encargos manuais não pode superar o valor manual do regime.');
 if(p.cprbSimple&&annex!=='IV')errors.push('A CPRB no Simples exige Anexo IV elegível; desmarque essa opção para os demais anexos.');
 if(p.cprbRegular||p.cprbSimple){
  if(!p.cprbEligible)errors.push('Confirme o enquadramento e as condições da CPRB para aplicar a desoneração.');
  if(p.cprbRate<=0||p.cprbRevenue<=0)errors.push('Informe a alíquota integral e a base anual da CPRB.');
 }
 return errors;
}

export const payrollSources=[
 ['CPP e RAT — Lei 8.212/1991','https://www.planalto.gov.br/ccivil_03/leis/l8212cons.htm'],
 ['Simples e Anexo IV — Receita Federal','https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/cobrancas-e-intimacoes/contribuicao-previdenciaria-anexo-iv-do-simples-nacional'],
 ['Reoneração — Lei 14.973/2024','https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14973.htm'],
 ['FGTS — Ministério do Trabalho','https://www.gov.br/trabalho-e-emprego/pt-br/servicos/trabalhador/fgts'],
];
