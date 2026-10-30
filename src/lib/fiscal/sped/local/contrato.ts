import { z } from "zod";
import { apoioSchema, documentoSchema, obrigacaoSchema, parametrosSchema, perfilSchema } from "./dominio";
const identificador = z.string().min(1).max(191);
export const pacoteGeracaoSchema = z.object({
  versao: z.literal(1), finalidade: z.literal("geracao_connect_v1"), tenant_id: identificador,
  raiz: z.string().regex(/^\d{8}$/), competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), obrigacao: obrigacaoSchema,
  tipo_sped: z.enum(["0", "1"]), revisao: z.number().int().nonnegative(),
  estabelecimentos: z.array(z.object({ id_connect: identificador, cnpj: z.string().regex(/^\d{14}$/), nome: z.string(), perfil: perfilSchema })).min(1),
  documentos: z.array(documentoSchema.extend({ id: identificador, companyId: identificador, cnpjEmpresa: z.string().regex(/^\d{14}$/), sentido: z.enum(["entrada", "saida"]), nomeArquivo: z.string() })),
  apoios: z.array(apoioSchema.extend({ id: identificador, companyId: identificador, autor: z.string(), em: z.string() })),
  decisoes: z.array(z.object({ chave: z.string(), tipo: z.string(), dados: z.record(z.string(), z.unknown()), autor: z.string(), em: z.string() })),
  parametros: z.array(parametrosSchema.extend({ companyId: identificador, competencia: z.string() })),
  apuracao: z.object({ obrigacao: obrigacaoSchema, linhas: z.array(z.record(z.string(), z.unknown())), tributos: z.array(z.object({ tributo: z.string(), debitos: z.string(), creditos: z.string(), saldoAnterior: z.string().nullable(), recolher: z.string().nullable(), transportar: z.string().nullable() })), pendencias: z.array(z.string()), ajustes: z.array(z.record(z.string(), z.unknown())), totalEntradas: z.string(), totalSaidas: z.string() }),
});
export type PacoteGeracaoV1 = z.infer<typeof pacoteGeracaoSchema>;
