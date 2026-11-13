// A validação do que a tela da conferência do financeiro envia (Bloco B, Fase B4, 12/11/2026): porte de
// `AnaliseCreate`, `FinanceiroVinculoCreate`, `FinanceiroSugestoesLote` e `FinanceiroDesfazer`
// (`schemas/conciliacao_financeiro.py`). O nome e a exclusão são os mesmos da revisão (B3):
// `NomeConciliacao` e `ExclusaoConciliacao`.
//
// Como no pydantic (e como em `entradasRevisao.ts`):
// - o tamanho do texto é conferido ANTES de aparar, e em caracteres (não em unidades UTF-16);
// - aparar é o `str.strip()` do Python;
// - os ids são UUID nas formas que o pydantic aceita e viram o texto canônico em minúsculas;
// - campo a mais é ignorado, a não ser no nome e na exclusão.

import { z } from "zod";
import { len, strip } from "./motor/unicodePy";
import { excluirRevisaoSchema, renomearRevisaoSchema, uuidCanonico, versaoSchema } from "./entradasRevisao";
import type {
  DesfazerVinculoFinanceiro,
  NovaAnaliseFinanceiro,
  NovoVinculoFinanceiro,
  RenomearAnaliseFinanceiro,
  SugestoesEmLote,
} from "./conciliacao/financeiroTipos";

export { versaoSchema };

const uuid = (mensagem: string) =>
  z.string({ error: mensagem }).transform((v, ctx) => {
    const c = uuidCanonico(v);
    if (c === null) {
      ctx.addIssue({ code: "custom", message: mensagem });
      return z.NEVER;
    }
    return c;
  });

const movimento = uuid("Selecione um movimento válido.");

/** `list[UUID] = Field(min_length=1, max_length=20_000)` */
const ids = (lado: string) =>
  z
    .array(movimento, { error: `Selecione os movimentos ${lado}.` })
    .min(1, `Selecione ao menos um movimento ${lado}.`)
    .max(20_000, `Selecione até 20.000 movimentos ${lado}.`);

/** Texto com o tamanho conferido em caracteres antes de aparar, como o `Field(max_length=…)`. */
const textoAparado = (minimo: number, maximo: number, curto: string, longo: string) =>
  z
    .string({ error: curto })
    .refine((v) => len(v) >= minimo, curto)
    .refine((v) => len(v) <= maximo, longo)
    .transform((v) => strip(v));

const observacao = textoAparado(0, 2000, "A observação precisa ser um texto.", "A observação passa de 2000 caracteres.").default("");

/** "AAAA-MM-DD" de um dia que existe (o `date` do pydantic). */
const dia = (mensagem: string) =>
  z
    .string({ error: mensagem })
    .regex(/^\d{4}-\d{2}-\d{2}$/, mensagem)
    .refine((v) => {
      const d = new Date(`${v}T00:00:00.000Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    }, mensagem);

/** `AnaliseCreate`: a conta bancária, o período (fim igual ou depois do início) e o título. */
export const novaAnaliseSchema: z.ZodType<NovaAnaliseFinanceiro, unknown> = z
  .object({
    agenciaId: uuid("Selecione a conta bancária."),
    periodoInicio: dia("Informe a data inicial."),
    periodoFim: dia("Informe a data final."),
    titulo: textoAparado(1, 200, "Informe um título para a análise.", "O título passa de 200 caracteres.")
      .refine((v) => v.length > 0, "Informe um título para a análise.")
      .default("Conciliação do financeiro"),
  })
  .refine((d) => d.periodoFim >= d.periodoInicio, "A data final deve ser igual ou posterior à inicial.");

/** `FinanceiroVinculoCreate`: a seleção dos dois lados, de uma sugestão ou à mão. */
export const novoVinculoFinanceiroSchema: z.ZodType<NovoVinculoFinanceiro, unknown> = z.object({
  versao: versaoSchema,
  sugestaoId: z
    .string({ error: "Sugestão inválida." })
    .refine((v) => len(v) <= 64, "Sugestão inválida.")
    .nullable()
    .default(null),
  financeiroIds: ids("do documento base"),
  comparacaoIds: ids("da comparação"),
  observacao,
});

/** `FinanceiroSugestoesLote`: as sugestões marcadas juntas; cada uma vira uma conferência, todas na mesma versão. */
export const sugestoesEmLoteSchema: z.ZodType<SugestoesEmLote, unknown> = z
  .object({
    versao: versaoSchema,
    sugestoes: z
      .array(
        z.object({
          sugestaoId: z
            .string({ error: "Sugestão inválida." })
            .refine((v) => len(v) >= 1 && len(v) <= 64, "Sugestão inválida."),
          financeiroIds: ids("do documento base"),
          comparacaoIds: ids("da comparação"),
        }),
        { error: "Marque ao menos uma sugestão." },
      )
      .min(1, "Marque ao menos uma sugestão.")
      .max(5_000, "Marque até 5.000 sugestões por vez."),
    observacao,
  })
  .refine((d) => new Set(d.sugestoes.map((s) => s.sugestaoId)).size === d.sugestoes.length, "A mesma sugestão foi enviada mais de uma vez.");

/** `FinanceiroDesfazer`: o motivo é obrigatório e fica no histórico da conferência. */
export const desfazerVinculoFinanceiroSchema: z.ZodType<DesfazerVinculoFinanceiro, unknown> = z.object({
  versao: versaoSchema,
  motivo: textoAparado(1, 2000, "Informe o motivo do desfazimento.", "O motivo passa de 2000 caracteres.").refine(
    (v) => v.length > 0,
    "Informe o motivo do desfazimento.",
  ),
});

/** `NomeConciliacao`: só o nome muda; trocar conta, período ou arquivos é recusado (campo a mais). */
export const renomearAnaliseSchema: z.ZodType<RenomearAnaliseFinanceiro, unknown> = renomearRevisaoSchema;

/** `ExclusaoConciliacao`: a exclusão é lógica e também confere a versão. */
export const excluirAnaliseSchema: z.ZodType<{ versao: number }, unknown> = excluirRevisaoSchema;
