import { z } from "zod";

// Decimal fixo. Valores persistidos e transportados como texto; nenhuma conta fiscal usa float.
export function unidades(valor: string, casas = 2): bigint {
  if (!/^-?\d+(\.\d+)?$/.test(valor)) throw new Error(`Número decimal inválido: ${valor}`);
  const negativo = valor.startsWith("-");
  const [inteiro, fracao = ""] = valor.replace(/^-/, "").split(".");
  const n = BigInt(inteiro) * BigInt(10) ** BigInt(casas) + BigInt((fracao + "0".repeat(casas)).slice(0, casas) || "0") + (Number(fracao[casas] ?? "0") >= 5 ? BigInt(1) : BigInt(0));
  return negativo ? -n : n;
}
export function decimal(n: bigint, casas = 2): string {
  const a = n < BigInt(0) ? -n : n;
  const d = BigInt(10) ** BigInt(casas);
  return `${n < BigInt(0) ? "-" : ""}${a / d}.${String(a % d).padStart(casas, "0")}`;
}
export const somar = (valores: readonly string[]) => decimal(valores.reduce((s, v) => s + unidades(v), BigInt(0)));
export function reaisExatos(valor: string | null): string {
  if (valor === null) return "Não levantado";
  const [inteiro, fracao] = decimal(unidades(valor)).split(".");
  return `${inteiro.startsWith("-") ? "-" : ""}R$ ${inteiro.replace(/^-/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${fracao}`;
}
export function percentual(base: string, aliquota: string): string {
  const n = unidades(base) * unidades(aliquota, 4);
  return decimal((n + (n < BigInt(0) ? -BigInt(500000) : BigInt(500000))) / BigInt(1000000));
}
export const dinheiroSchema = z.string().regex(/^\d{1,14}(\.\d{1,2})?$/, "Informe um valor decimal positivo (ex.: 1234.56).");
export const periodoSchema = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/);
export const obrigacaoSchema = z.enum(["icms_ipi", "contribuicoes"]);
export type Obrigacao = z.infer<typeof obrigacaoSchema>;
export const tributoSchema = z.object({ cst: z.string().regex(/^\d{0,3}$/).default(""), base: dinheiroSchema.nullable(), aliquota: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/).nullable(), valor: dinheiroSchema.nullable() });
export const tributacaoSchema = z.object({ icms: tributoSchema.optional(), ipi: tributoSchema.optional(), pis: tributoSchema.optional(), cofins: tributoSchema.optional() }).refine(v => Object.keys(v).length > 0, "Informe os tributos a decidir.");
export const itemSchema = z.object({
  ordem: z.number().int().positive(), codigo: z.string().max(120), descricao: z.string().max(500), ncm: z.string().max(8).default(""),
  cfop: z.string().regex(/^\d{4}$/).nullable(), tipoItem: z.string().default("99"), quantidade: z.string().default("1"),
  valor: dinheiroSchema, icms: tributoSchema, ipi: tributoSchema, pis: tributoSchema, cofins: tributoSchema,
});
export type ItemFiscal = z.infer<typeof itemSchema>;
export const documentoSchema = z.object({
  identidade: z.string().max(160), tipo: z.enum(["NFE", "NFCE", "CTE", "NFSE"]), numero: z.string(), serie: z.string().default(""),
  emitente: z.string(), destinatario: z.string(), nomeEmitente: z.string(), nomeDestinatario: z.string().default(""),
  emitidoEm: z.string(), competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), valor: dinheiroSchema,
  cancelado: z.boolean().default(false), fonte: z.enum(["xml", "txt"]), completo: z.boolean(), itens: z.array(itemSchema),
  referencias: z.record(z.string(), z.string()).default({}),
});
export type DocumentoFiscal = z.infer<typeof documentoSchema>;
export const perfilSchema = z.object({
  uf: z.string().regex(/^[A-Z]{2}$/), regime: z.enum(["simples", "presumido", "real"]),
  obrigacoes: z.array(obrigacaoSchema).min(1), inscricaoEstadual: z.string().max(30).default(""),
});
export type PerfilFiscal = z.infer<typeof perfilSchema>;
export const apoioSchema = z.object({
  identidade: z.string().min(1).max(160), competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  categoria: z.enum(["rpa", "recibo", "recibo_motorista", "contrato_motorista", "contrato_locacao", "contrato_locacao_imovel", "fatura"]),
  documento: z.string().regex(/^(\d{11}|\d{14})$/), nome: z.string().min(1).max(180),
  dataPagamento: z.iso.date().nullable(), bruto: dinheiroSchema, liquido: dinheiroSchema,
  credito: z.enum(["", "S", "N"]).default(""), natureza: z.string().max(8).default(""),
  decisao: z.enum(["pendente", "aceito", "rejeitado"]).default("pendente"), motivo: z.string().max(500).default(""),
  contratoInformado: z.boolean().default(false), anexoId: z.string().uuid().nullable().default(null),
}).refine(a => unidades(a.liquido) <= unidades(a.bruto), "O líquido não pode superar o bruto.");
export type ApoioFiscal = z.infer<typeof apoioSchema>;
export const classificacaoSchema = z.object({ tipoItem: z.string().regex(/^\d{2}$/), definicao: z.string().regex(/^\d{3}$/).nullable(), creditoPisCofins: z.enum(["", "S", "N"]), observacao: z.string().max(500) });
export type Classificacao = z.infer<typeof classificacaoSchema>;
export const ajusteSchema = z.object({
  id: z.string().uuid(), companyId: z.string(), competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), obrigacao: obrigacaoSchema,
  tributo: z.enum(["icms", "ipi", "pis", "cofins"]), codigo: z.string().min(1).max(10), descricao: z.string().min(5).max(255),
  natureza: z.enum(["debito", "credito", "estorno_credito", "estorno_debito", "deducao", "debito_especial"]), valor: dinheiroSchema,
  camposEstaduais: z.record(z.string(), z.string()).default({}),
}).refine(a => a.obrigacao === "contribuicoes" ? ["pis", "cofins"].includes(a.tributo) : ["icms", "ipi"].includes(a.tributo), "Tributo incompatível com a obrigação.");
export type AjusteFiscal = z.infer<typeof ajusteSchema>;
export const parametrosSchema = z.object({
  saldoIcms: dinheiroSchema.nullable().default(null), saldoIpi: dinheiroSchema.nullable().default(null), saldoPis: dinheiroSchema.nullable().default(null), saldoCofins: dinheiroSchema.nullable().default(null),
  receitaBruta: dinheiroSchema.nullable().default(null), receitaNaoCumulativa: dinheiroSchema.nullable().default(null), receitaCumulativa: dinheiroSchema.nullable().default(null),
  aliquotaApoioPis: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/).nullable().default(null),
  aliquotaApoioCofins: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/).nullable().default(null),
  aliquotaMotoristaPis: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/).nullable().default(null),
  aliquotaMotoristaCofins: z.string().regex(/^\d{1,3}(\.\d{1,4})?$/).nullable().default(null),
  semMovimento: z.boolean().default(false),
});
export type ParametrosFiscais = z.infer<typeof parametrosSchema>;
export type DecisaoFiscal = { chave: string; tipo: string; dados: Record<string, unknown>; autor: string; em: string };
export type DocumentoEscriturado = DocumentoFiscal & { id: string; companyId: string; cnpjEmpresa: string; sentido: "entrada" | "saida"; nomeArquivo: string };
export type ApoioEscriturado = ApoioFiscal & { id: string; companyId: string; autor: string; em: string };
export type ContextoLocal = { tenantId: string; companyId: string; cnpj: string; raiz: string; competencia: string; consolidado: boolean; revisao: number };
export type ProdutoFiscal = { chave: string; fornecedor: string; codigo: string; descricao: string; ncm: string; tipoItem: string; cfop: string | null; valor: string; icms: string; decidido: boolean; simples: boolean; ocorrencias: number; meses: Record<string, string>; documentos: string[]; classificacao: Classificacao | null; creditoDecidido: string | null };
export const chaveProduto = (fornecedor: string, codigo: string) => `${fornecedor}|${codigo}`;
export const chaveCredito = (cnpj: string, mes: string, produto: string) => `${cnpj}|${mes}|${produto}`;
export function mesAnterior(mes: string): string { const [a, m] = mes.split("-").map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; }
export function mesesDoPeriodo(periodo: string): string[] { return periodo.length === 7 ? [periodo] : Array.from({ length: 12 }, (_, i) => `${periodo}-${String(i + 1).padStart(2, "0")}`); }
/** Mesmo rateio do roteador Python: ICMS como peso, empate quando todos são zero, resíduo no último mês. */
export function ratearCredito(total: string, pesos: Record<string, string>): Record<string, string> {
  const meses = Object.keys(pesos).sort();
  if (!meses.length) throw new Error("Não há competências para ratear.");
  const soma = meses.reduce((s, m) => s + unidades(pesos[m]), BigInt(0));
  const denominador = soma || BigInt(meses.length);
  let restante = unidades(total);
  return Object.fromEntries(meses.map((m, i) => {
    const peso = soma ? unidades(pesos[m]) : BigInt(1);
    const calculada = (unidades(total) * peso + denominador / BigInt(2)) / denominador;
    const parcela = i === meses.length - 1 || calculada > restante ? restante : calculada;
    restante -= parcela;
    return [m, decimal(parcela)];
  }));
}

