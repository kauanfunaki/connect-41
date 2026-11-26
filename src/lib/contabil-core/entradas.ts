// A validação de tudo o que chega das telas do Contábil Core (Fase 2, 09/11/2026), com os mesmos
// limites e normalizações dos schemas Pydantic do original (`src/schemas/*.py`). Nada chega ao banco
// sem passar por aqui: o tamanho de cada texto é o da coluna, D/C e os conjuntos fechados são
// conferidos, e id é UUID.

import { z } from "zod";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Texto do formulário: aparado; vazio vira `null` quando o campo é opcional. */
const texto = (min: number, max: number, nome: string) =>
  z
    .string({ error: `Informe ${nome}.` })
    .trim()
    .min(min, `${nome[0].toUpperCase()}${nome.slice(1)} precisa de pelo menos ${min} caracteres.`)
    .max(max, `${nome[0].toUpperCase()}${nome.slice(1)} passa de ${max} caracteres.`);

const opcional = (max: number, nome: string) =>
  z
    .string()
    .trim()
    .max(max, `${nome[0].toUpperCase()}${nome.slice(1)} passa de ${max} caracteres.`)
    .nullish()
    .transform((v) => (v ? v : null));

const id = (nome: string) => z.string({ error: `Escolha ${nome}.` }).trim().toLowerCase().regex(UUID, `Escolha ${nome}.`);
const idOpcional = (nome: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine((v) => v === null || UUID.test(v), `Escolha ${nome}.`);

const booleano = z.union([z.boolean(), z.string()]).nullish().transform((v) => v === true || v === "on" || v === "true" || v === "1");
const dc = z.string().trim().toUpperCase().refine((v) => v === "D" || v === "C", "Escolha débito (D) ou crédito (C).") as unknown as z.ZodType<"D" | "C">;

// ─── Agência (conta bancária) ─────────────────────────────────────────────

/** Código COMPE → sigla, como `_BANCOS_CONHECIDOS` do original. */
const BANCOS_CONHECIDOS: Record<string, string> = {
  "001": "BB", "033": "SANTANDER", "077": "INTER", "104": "CEF", "237": "BRADESCO", "341": "ITAU",
  "356": "BMG", "389": "MERCANTIL", "422": "SAFRA", "745": "CITIBANK", "756": "SICOOB", "084": "UNIPRIME",
  "748": "SICREDI", "336": "C6", "260": "NU", "290": "PAGSEGURO",
};

export const agenciaSchema = z.object({
  bancoSigla: z
    .string({ error: "Informe o banco." })
    .trim()
    .toUpperCase()
    .transform((v) => BANCOS_CONHECIDOS[v] ?? v)
    .refine((v) => v.length >= 2 && v.length <= 20, "Sigla do banco deve ter entre 2 e 20 caracteres."),
  agencia: z.string({ error: "Informe a agência." }).trim().regex(/^\d{1,10}$/, "Agência deve conter apenas dígitos (máx. 10)."),
  numero: z.string({ error: "Informe o número da conta." }).trim().regex(/^[\p{L}\p{N}_-]{1,20}$/u, "Número da conta inválido."),
  digito: opcional(5, "o dígito"),
  contaContabilId: idOpcional("a conta contábil"),
});
export type EntradaAgencia = z.infer<typeof agenciaSchema>;

// ─── Plano de contas ──────────────────────────────────────────────────────

export const TIPOS_DE_CONTA = ["ativo", "passivo", "patrimonio_liquido", "receita", "despesa", "custo", "resultado"] as const;
const ALIASES_TIPO: Record<string, string> = { pl: "patrimonio_liquido" };

export const contaSchema = z.object({
  contaNumero: z
    .union([z.number(), z.string()])
    .nullish()
    .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 2_147_483_647), "O código reduzido é um número inteiro."),
  codigo: z.string({ error: "Informe o código." }).trim().max(30, "O código passa de 30 caracteres.").regex(/^\d+(\.\d+)*$/, "Código inválido. Use dígitos separados por ponto. Ex: 1, 1.1, 4.2.01"),
  descricao: texto(2, 300, "a descrição"),
  tipo: z
    .string({ error: "Escolha o tipo." })
    .trim()
    .toLowerCase()
    .transform((v) => ALIASES_TIPO[v] ?? v)
    .refine((v) => (TIPOS_DE_CONTA as readonly string[]).includes(v), "Tipo de conta inválido."),
  tipoSa: z.string().trim().toUpperCase().default("A").refine((v) => v === "A" || v === "S", "Escolha analítica (A) ou sintética (S)."),
  paiId: idOpcional("a conta pai"),
});
export type EntradaConta = z.infer<typeof contaSchema>;

// ─── Contraparte ──────────────────────────────────────────────────────────

export const TIPOS_DE_CONTRAPARTE = ["fornecedor", "cliente", "ambos"] as const;

export const contraparteSchema = z.object({
  tipo: z.string().trim().toLowerCase().refine((v) => (TIPOS_DE_CONTRAPARTE as readonly string[]).includes(v), "Escolha fornecedor, cliente ou ambos."),
  documento: z
    .string({ error: "Informe o CPF ou CNPJ." })
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 11 || v.length === 14, "Documento deve ser um CPF (11 dígitos) ou CNPJ (14 dígitos)."),
  razaoSocial: texto(2, 300, "a razão social"),
  nomeFantasia: opcional(300, "o nome fantasia"),
  contaContabilId: id("a conta contábil"),
});
export type EntradaContraparte = z.infer<typeof contraparteSchema>;

// ─── Regra ────────────────────────────────────────────────────────────────

export const regraSchema = z.object({
  contaId: id("a conta contábil"),
  /** Vazio = a regra vale para todos os bancos da empresa (o caso comum). */
  agenciaId: idOpcional("a conta bancária"),
  descricao: texto(2, 500, "a descrição"),
  historico: texto(2, 500, "o histórico do extrato"),
  dc,
  tipo: z.string().trim().toLowerCase().default("automatica").refine((v) => v === "automatica" || v === "manual", "Tipo de regra inválido."),
  manterHistorico: booleano,
});
export type EntradaRegra = z.infer<typeof regraSchema>;

// ─── NEO: classificação manual ────────────────────────────────────────────

export const classificacaoManualSchema = z
  .object({
    transacaoIds: z
      .array(id("a transação"))
      .min(1, "Selecione ao menos uma transação.")
      .max(200, "Selecione no máximo 200 transações por vez.")
      .transform((ids) => [...new Set(ids)]),
    contaId: id("a conta contábil"),
    descricao: opcional(500, "o histórico"),
    manterHistorico: booleano,
  })
  .refine((v) => v.manterHistorico || (v.descricao?.trim().length ?? 0) >= 2, {
    message: "Informe o histórico contábil ou mantenha o histórico do banco.",
  });
export type EntradaClassificacaoManual = z.infer<typeof classificacaoManualSchema>;

// ─── Competência, exportação e NEO ────────────────────────────────────────

const competencia = z
  .string()
  .trim()
  .refine((v) => {
    const m = /^(\d{4})-(\d{2})$/.exec(v);
    return !!m && Number(m[1]) > 0 && Number(m[2]) >= 1 && Number(m[2]) <= 12;
  }, "Competência deve estar no formato AAAA-MM, com mês entre 01 e 12.");

/** Valor de filtro (`valor_min`/`valor_max` do `ExportJobCreate`): decimal, zero ou mais. */
const valorDoFiltro = (nome: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d+(?:\.\d+)?$/.test(v), `${nome} deve ser um número maior ou igual a zero.`);

/**
 * A exportação (Fase 2; tipos e filtros do extrato na Fase D1, 26/11/2026). O tipo e o formato são
 * conferidos depois, por `conferirPedido`, com as frases e a ordem do original. A competência é o período,
 * como na exportação do Domínio da Fase 2; só o extrato pode sair sem ela (a aba Extrato filtra sem mês).
 */
export const exportacaoSchema = z
  .object({
    tipo: z.string().trim().nullish().transform((v) => v || "lancamentos_importacao"),
    formato: z.string().trim(),
    mes: competencia.nullish().or(z.literal("")).transform((v) => (v ? v : null)),
    agenciaId: idOpcional("a conta bancária"),
    usarHistoricoExtrato: booleano,
    incluirContasInativas: booleano,
    status: opcional(12, "a situação"),
    busca: opcional(500, "a busca"),
    dc: z.enum(["D", "C"], { error: "Escolha débito (D) ou crédito (C)." }).nullish().transform((v) => v ?? null),
    valorMin: valorDoFiltro("O valor mínimo"),
    valorMax: valorDoFiltro("O valor máximo"),
  })
  .refine((v) => v.mes !== null || v.tipo === "extrato", { message: "Informe a competência.", path: ["mes"] });
export type EntradaExportacao = z.infer<typeof exportacaoSchema>;

/** "Conflitos e qualidade" (Fase D1): competência e conta bancária opcionais, como o `GET /neo/divergencias`. */
export const divergenciasSchema = z.object({
  mes: competencia.nullish().or(z.literal("")).transform((v) => (v ? v : null)),
  agenciaId: idOpcional("a conta bancária"),
});

/** O painel da empresa (Fase D1): a série de 1 a 24 meses, 12 se não vier (o `meses` do `GET /stats`). */
export const painelSchema = z.object({
  meses: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : "12"))
    .refine((v) => /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 24, "Escolha de 1 a 24 meses.")
    .transform(Number),
});

/** A carteira do escritório (Fase D1): a competência, ou a do mês corrente se não vier. */
export const carteiraSchema = z.object({
  mes: competencia.nullish().or(z.literal("")).transform((v) => (v ? v : null)),
});

/** Data de calendário "AAAA-MM-DD" que existe (o `date` do pydantic: ano de 1 em diante). Vazia é "sem limite". */
const diaOpcional = (nome: string) =>
  z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => {
      if (v === null) return true;
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      if (!m || Number(m[1]) < 1) return false;
      const d = new Date(Date.UTC(2000, Number(m[2]) - 1, Number(m[3])));
      d.setUTCFullYear(Number(m[1]));
      return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
    }, `${nome[0].toUpperCase()}${nome.slice(1)} deve ser uma data válida (AAAA-MM-DD).`);

/**
 * Os relatórios (Fase D2): o período em datas, inclusivas e opcionais, como o `data_de`/`data_ate` do original
 * (que na DRE e no Balancete aceitava também a hora; aqui é sempre o dia inteiro). O formato `xlsx` baixa a
 * planilha do relatório.
 */
export const relatorioSchema = z.object({
  de: diaOpcional("a data inicial"),
  ate: diaOpcional("a data final"),
  formato: z
    .string()
    .trim()
    .nullish()
    .transform((v) => v || null)
    .refine((v) => v === null || v === "xlsx", "Formato deve ser 'xlsx'."),
});

export const processarNeoSchema = z.object({
  agenciaId: idOpcional("a conta bancária"),
  mes: competencia.nullish().or(z.literal("")).transform((v) => (v ? v : null)),
});

/** A primeira mensagem de erro da validação, para a tela. */
export function primeiroErro(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Dados inválidos.";
}

export function ehUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}
