import { z } from "zod";

export const contaContabil = z.string().trim().regex(/^\d{0,20}$/, "Informe o código reduzido da conta, só números.");
const data = z.string().default("").refine((v) => {
  if (!v) return true;
  const d = new Date(v + "T12:00:00Z");
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "Data inválida.");
export const regraContabilSchema = z.object({
  empresa: z.string().uuid(),
  id: z.string().uuid().optional(),
  cnpjFornecedor: z.string().trim().regex(/^(\d{11}|\d{14})?$/, "CPF/CNPJ deve ter 11 ou 14 dígitos."),
  nomeFornecedor: z.string().trim().max(180).default(""),
  cfop: z.string().trim().regex(/^(\d{4})?$/, "CFOP deve ter quatro dígitos."),
  contaDebito: contaContabil.default(""),
  contaCredito: contaContabil.default(""),
  codigoHistorico: z.string().trim().regex(/^\d{0,10}$/).default(""),
  historico: z.string().trim().max(255).default(""),
  observacao: z.string().trim().max(500).default(""),
  dataLancamento: data,
  valor: z.string().trim().default("").refine((v) => !v || (/^\d{1,13}([.,]\d{1,2})?$/.test(v) && /[1-9]/.test(v)), "Valor inválido: use um valor positivo como 1234,56, sem milhar."),
  iniciaLote: z.enum(["", "S", "N"]).default(""),
  codigoFilial: z.string().trim().regex(/^\d{0,10}$/).default(""),
  centroCustoDebito: z.string().trim().max(40).default(""),
  centroCustoCredito: z.string().trim().max(40).default(""),
  desconsiderar: z.boolean().default(false),
}).superRefine((v, ctx) => {
  if (!v.cnpjFornecedor && !(v.desconsiderar && v.cfop)) ctx.addIssue({ code: "custom", path: ["cnpjFornecedor"], message: "Informe o fornecedor; exclusão geral exige CFOP." });
  if (!v.desconsiderar && !v.contaCredito) ctx.addIssue({ code: "custom", path: ["contaCredito"], message: "Informe a conta de crédito." });
});
export type DadosDaRegra = z.infer<typeof regraContabilSchema>;

export function dadosPersistidosDaRegra(r: DadosDaRegra) {
  return {
    cnpjFornecedor: r.cnpjFornecedor, nomeFornecedor: r.nomeFornecedor, cfop: r.cfop,
    contaDebito: r.contaDebito, contaCredito: r.contaCredito, codigoHistorico: r.codigoHistorico, historico: r.historico,
    observacao: r.observacao, dataLancamento: r.dataLancamento, valor: r.valor ? r.valor.replace(",", ".") : null,
    iniciaLote: r.iniciaLote, codigoFilial: r.codigoFilial, centroCustoDebito: r.centroCustoDebito, centroCustoCredito: r.centroCustoCredito,
    desconsiderar: r.desconsiderar,
  };
}

export const COLUNAS_DE_REGRAS = {
  cnpj_fornecedor: "cnpjFornecedor", nome_fornecedor: "nomeFornecedor", cfop: "cfop",
  conta_debito: "contaDebito", conta_credito: "contaCredito", historico: "historico",
  observacao: "observacao", codigo_historico: "codigoHistorico", data_lancamento: "dataLancamento",
  valor: "valor", inicia_lote: "iniciaLote", codigo_filial: "codigoFilial",
  centro_custo_debito: "centroCustoDebito", centro_custo_credito: "centroCustoCredito",
  desconsiderar: "desconsiderar",
} as const;

export type PreviaDeRegras = { regras: DadosDaRegra[]; erros: { linha: number; mensagem: string }[]; ignoradas: number; impressao?: string };
export function conferirImportacao(empresa: string, linhas: string[][], contas: { classificacao: string; reduzido: string }[] = []): PreviaDeRegras {
  const [cabecalho = [], ...corpo] = linhas;
  const colunas = cabecalho.map((v) => v.trim().toLowerCase().replace(/^\uFEFF/, ""));
  const resultado: PreviaDeRegras = { regras: [], erros: [], ignoradas: 0 };
  if (!colunas.includes("cnpj_fornecedor")) return { ...resultado, erros: [{ linha: 1, mensagem: "Falta a coluna cnpj_fornecedor." }] };
  if (corpo.length > 5000) return { ...resultado, erros: [{ linha: 1, mensagem: "O limite é de 5.000 linhas por arquivo." }] };
  const chaves = new Set<string>();
  corpo.forEach((linha, i) => {
    const dados: Record<string, unknown> = { empresa };
    for (const [coluna, campo] of Object.entries(COLUNAS_DE_REGRAS)) {
      const indice = colunas.indexOf(coluna);
      if (indice >= 0) dados[campo] = linha[indice]?.trim() ?? "";
    }
    const descarte = String(dados.desconsiderar ?? "").toLowerCase();
    if (!["", "n", "nao", "não", "false", "0", "s", "sim", "true", "1"].includes(descarte)) {
      resultado.erros.push({ linha: i + 2, mensagem: "desconsiderar: use S ou N." }); return;
    }
    dados.desconsiderar = ["s", "sim", "true", "1"].includes(descarte);
    dados.cnpjFornecedor = String(dados.cnpjFornecedor ?? "").replace(/\D/g, "");
    for (const campo of ["contaDebito", "contaCredito"]) {
      const v = String(dados[campo] ?? "");
      if (v.includes(".")) dados[campo] = contas.find((c) => c.classificacao === v)?.reduzido ?? v;
    }
    if (!dados.contaDebito && !dados.contaCredito && !dados.desconsiderar) { resultado.ignoradas++; return; }
    const r = regraContabilSchema.safeParse(dados);
    if (!r.success) { resultado.erros.push({ linha: i + 2, mensagem: r.error.issues.map((e) => e.path.join(".") + ": " + e.message).join("; ") }); return; }
    const chave = r.data.cnpjFornecedor + "|" + r.data.cfop;
    if (chaves.has(chave)) { resultado.erros.push({ linha: i + 2, mensagem: "Fornecedor e CFOP repetidos no arquivo." }); return; }
    chaves.add(chave);
    resultado.regras.push(r.data);
  });
  return resultado;
}

export function csvDeRegras(linhas: Record<string, unknown>[]): string {
  const campos = Object.values(COLUNAS_DE_REGRAS);
  const celula = (v: unknown) => '"' + String(v ?? "").replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"';
  return "\uFEFF" + [Object.keys(COLUNAS_DE_REGRAS).join(";"), ...linhas.map((l) => campos.map((c) => celula(c === "desconsiderar" ? (l[c] ? "S" : "") : l[c])).join(";"))].join("\r\n") + "\r\n";
}
