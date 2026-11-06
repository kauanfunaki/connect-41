// Motor fiscal do Connect Tributário (ENGINE R_4.1), portado de dev41tech/connect-tributario,
// arquivo `lib/accounting/snapshot.ts`, commit 0fcc797 (14/10/2026). Cópia fiel: NÃO altere fórmulas, tabelas
// ou arredondamentos aqui — os testes-gabarito ao lado garantem o mesmo resultado do original.
// Ajustes do porte (mecânicos): imports sem a extensão .ts e `.prefault({})` no lugar de
// `.default({})` em objetos, porque no zod 4 o default de objeto não preenche os campos internos.

import {z} from 'zod';
const date=z.string().regex(/^20\d{2}-\d{2}-\d{2}$/);
const amounts=z.record(z.string().max(60),z.number().finite()).refine(v=>Object.keys(v).length<=30);
export const statementSnapshot=z.object({documentId:z.string().uuid(),filename:z.string().max(180),hash:z.string().regex(/^[a-f0-9]{64}$/),start:date,end:date,importedAt:z.string().datetime(),method:z.enum(['modelo','ia']),totals:amounts,details:amounts,rows:z.number().int().min(0).max(2000),netProfit:z.number().finite().nullable()});
export const accountingSnapshots=z.object({balanco:statementSnapshot.optional(),balancete:statementSnapshot.optional(),dre:statementSnapshot.optional()}).prefault({});
