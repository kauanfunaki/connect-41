// A validação do que a tela da revisão manual envia (Bloco B, Fase B3, 12/11/2026): porte de
// `VinculoCreate` e `VinculoDesfazer` (`schemas/revisao_conciliacao.py`) e de `NomeConciliacao` e
// `ExclusaoConciliacao` (`schemas/gestao_conciliacao.py`).
//
// Como no pydantic:
// - o tamanho do texto é conferido ANTES de aparar, e em caracteres (não em unidades UTF-16);
// - aparar é o `str.strip()` do Python, que também tira os separadores \x1c…\x1f e \x85;
// - o id é UUID nas formas que o pydantic aceita (com ou sem hífens, `{…}`, `urn:uuid:…`, maiúsculas)
//   e vira o texto canônico em minúsculas, que é o que o original compara e grava;
// - D/C é exato ("d" é recusado); o nome e a exclusão não aceitam campo a mais.
// A versão é inteiro de 1 até o maior `INT` do banco (o pydantic aceitaria também `true` e "1_0").

import { z } from "zod";
import { len, strip } from "./motor/unicodePy";
import type { DesfazerVinculo, NovoVinculo, RenomearRevisao } from "./conciliacao/revisaoTipos";

const HEX = "[0-9a-fA-F]";
const HIFENIZADO = `${HEX}{8}-${HEX}{4}-${HEX}{4}-${HEX}{4}-${HEX}{12}`;
const FORMAS_DO_UUID = new RegExp(`^(?:${HEX}{32}|${HIFENIZADO}|\\{${HIFENIZADO}\\}|urn:uuid:${HIFENIZADO})$`);

/** O UUID canônico (`str(UUID(texto))`), ou `null` se o pydantic recusaria o texto. */
export function uuidCanonico(texto: string): string | null {
  if (!FORMAS_DO_UUID.test(texto)) return null;
  const h = texto.replace(/^urn:uuid:/, "").replace(/[{}-]/g, "").toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const uuid = z.string({ error: "Selecione um lançamento válido." }).transform((v, ctx) => {
  const c = uuidCanonico(v);
  if (c === null) {
    ctx.addIssue({ code: "custom", message: "Selecione um lançamento válido." });
    return z.NEVER;
  }
  return c;
});

/** `versao: int = Field(ge=1)`: a versão que a tela viu. */
export const versaoSchema = z
  .union([z.number(), z.string().regex(/^\s*\+?\d+\s*$/)], { error: "Atualize a tela e tente de novo." })
  .transform((v) => (typeof v === "number" ? v : Number(v.trim())))
  .refine((v) => Number.isInteger(v) && v >= 1 && v <= 2_147_483_647, "Atualize a tela e tente de novo.");

/** Texto com o tamanho conferido em caracteres antes de aparar, como o `Field(max_length=…)`. */
const textoAparado = (minimo: number, maximo: number, curto: string, longo: string) =>
  z
    .string({ error: curto })
    .refine((v) => len(v) >= minimo, curto)
    .refine((v) => len(v) <= maximo, longo)
    .transform((v) => strip(v));

/** `VinculoCreate`: a seleção de lançamentos do extrato e do razão que a pessoa confirma. */
export const novoVinculoSchema: z.ZodType<NovoVinculo, unknown> = z.object({
  versao: versaoSchema,
  extratoIds: z.array(uuid, { error: "Selecione os lançamentos do extrato." }).min(1, "Selecione ao menos um lançamento do extrato."),
  razaoItens: z
    .array(z.object({ linhaId: uuid, dc: z.enum(["D", "C"], { error: "Escolha débito (D) ou crédito (C)." }) }), {
      error: "Selecione os lançamentos do razão.",
    })
    .min(1, "Selecione ao menos um lançamento do razão."),
  observacao: textoAparado(0, 2000, "A observação precisa ser um texto.", "A observação passa de 2000 caracteres.").default(""),
});

/** `VinculoDesfazer`: o motivo é obrigatório e fica no histórico do vínculo. */
export const desfazerVinculoSchema: z.ZodType<DesfazerVinculo, unknown> = z.object({
  versao: versaoSchema,
  motivo: textoAparado(1, 2000, "Informe o motivo para desfazer a conferência.", "O motivo passa de 2000 caracteres.").refine(
    (v) => v.length > 0,
    "Informe o motivo para desfazer a conferência.",
  ),
});

/** `NomeConciliacao`: só o nome muda; trocar conta, período ou fontes é recusado (campo a mais). */
export const renomearRevisaoSchema: z.ZodType<RenomearRevisao, unknown> = z.strictObject(
  {
    versao: versaoSchema,
    titulo: textoAparado(1, 200, "Informe um nome para a análise.", "O nome passa de 200 caracteres.").refine(
      (v) => v.length > 0,
      "Informe um nome para a análise.",
    ),
  },
  { error: "Só o nome da análise pode ser alterado." },
);

/** `ExclusaoConciliacao`: a exclusão é lógica e também confere a versão. */
export const excluirRevisaoSchema: z.ZodType<{ versao: number }, unknown> = z.strictObject(
  { versao: versaoSchema },
  { error: "Só a versão é enviada na exclusão." },
);
