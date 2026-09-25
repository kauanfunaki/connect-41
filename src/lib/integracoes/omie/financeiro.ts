// Contas a pagar e a receber do Omie → financeiro do Connect (25/09).
//
// É o fluxo que o BPO já usa no Omie: a nota vira conta lá dentro, a conta tem
// situação (em aberto, paga, recebida) e categoria, e a DRE sai disso. Em vez
// de o Connect derivar a conta da nota de novo, ele **lê a conta pronta**.
//
// ─── De onde vem ─────────────────────────────────────────────────────────────
//
// `financas/mf` `ListarMovimentos` (movimentos financeiros), e não
// `ListarContasPagar`/`ListarContasReceber`: só os movimentos trazem a **data
// do pagamento** e o valor pago — sem isso a DRE financeira (caixa) não sai.
// Campos pela documentação do Omie, conferida em 25/09:
//   detalhes: nCodTitulo, cNumTitulo, dDtEmissao, dDtVenc, dDtPagamento,
//             nCodCliente, cCPFCNPJCliente, cNatureza (P|R), cStatus,
//             nValorTitulo, cCodCateg, cNumDocFiscal
//   resumo:   cLiquidado (S|N), nValPago, nValAberto
//   categorias: rateio [{ cCodCateg, nValor, nPerc }]
// E `geral/categorias` `ListarCategorias` para o nome e o grupo de cada código:
//   { codigo, descricao, conta_receita, conta_despesa, conta_inativa,
//     totalizadora, categoria_superior }
//
// **Ainda não visto numa resposta real** — por isso a importação tem prévia
// (nada é gravado até alguém conferir) e tudo aqui lê com tolerância: campo com
// outro nome vira contador de "fora", não erro nem dado inventado.

import { instanteDoOmie } from "./notas";
import { MOTIVO_DA_LINHA, type MotivoDaLinhaFora } from "./conciliacao";

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const digitos = (v: unknown): string => texto(v).replace(/\D/g, "");

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = texto(v);
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

/** A primeira lista da resposta — o nome do campo muda de método para método no Omie. */
function primeiraLista(corpo: unknown, preferidos: string[]): unknown[] {
  const o = obj(corpo);
  for (const k of preferidos) if (Array.isArray(o[k])) return o[k] as unknown[];
  for (const v of Object.values(o)) if (Array.isArray(v)) return v;
  return [];
}

function totalDePaginas(corpo: unknown, ...campos: string[]): number {
  const o = obj(corpo);
  for (const c of campos) {
    const n = Number(o[c]);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return 1;
}

// ─── Categorias ─────────────────────────────────────────────────────────────

export type CategoriaDoOmie = {
  codigo: string;
  nome: string;
  /** Nome do grupo (a categoria totalizadora de cima), quando a lista o traz. */
  grupo: string | null;
  kind: "PAGAR" | "RECEBER" | null;
  inativa: boolean;
};

export function paginaDeCategorias(corpo: unknown): { itens: unknown[]; totalDePaginas: number } {
  return {
    itens: primeiraLista(corpo, ["categoria_cadastro", "categorias"]),
    totalDePaginas: totalDePaginas(corpo, "total_de_paginas"),
  };
}

/**
 * As categorias que recebem lançamento (não as totalizadoras), com o nome do
 * grupo de cima. O grupo sai da própria lista: a totalizadora é outra linha
 * dela, e `categoria_superior` aponta para o código dessa linha.
 */
export function lerCategorias(itens: unknown[]): CategoriaDoOmie[] {
  const linhas = itens.map(obj);
  const nomePorCodigo = new Map(linhas.map((l) => [texto(l.codigo), texto(l.descricao)]));
  const saida: CategoriaDoOmie[] = [];
  for (const l of linhas) {
    const codigo = texto(l.codigo);
    const nome = texto(l.descricao) || texto(l.descricao_padrao);
    if (!codigo || !nome || texto(l.totalizadora) === "S") continue;
    const receita = texto(l.conta_receita) === "S";
    const despesa = texto(l.conta_despesa) === "S";
    saida.push({
      codigo,
      nome: nome.slice(0, 120),
      grupo: nomePorCodigo.get(texto(l.categoria_superior)) || null,
      kind: receita && !despesa ? "RECEBER" : despesa && !receita ? "PAGAR" : null,
      inativa: texto(l.conta_inativa) === "S",
    });
  }
  return saida;
}

// ─── Movimentos (títulos) ───────────────────────────────────────────────────

export type TituloDoOmie = {
  omieTitleId: string;
  kind: "PAGAR" | "RECEBER";
  situacao: "ABERTO" | "PAGO" | "CANCELADO";
  /** Pagamento parcial: fica em aberto no Connect, que ainda não tem baixa parcial. */
  parcial: boolean;
  emissao: Date | null;
  vencimento: Date;
  pagamento: Date | null;
  competencia: string;
  valor: number;
  categoriaCodigo: string | null;
  contraparteDocumento: string | null;
  contraparteCodigo: string | null;
  descricao: string | null;
};

export type MotivoDoTituloFora =
  | "sem_titulo" // movimento sem nCodTitulo: não é conta (lançamento de conta corrente etc.)
  | "natureza" // nem P nem R
  | "sem_vencimento"
  | "sem_valor"
  | "pago_sem_data"; // pago mas sem data de pagamento: não dá para pôr no caixa

export const MOTIVO_DO_TITULO: Record<MotivoDoTituloFora, string> = {
  sem_titulo: "sem título (lançamentos de conta corrente)",
  natureza: "sem natureza a pagar/receber",
  sem_vencimento: "sem vencimento",
  sem_valor: "sem valor",
  pago_sem_data: "pagos sem data de pagamento",
};

export function paginaDeMovimentos(corpo: unknown): { itens: unknown[]; totalDePaginas: number } {
  return {
    itens: primeiraLista(corpo, ["movimentos"]),
    totalDePaginas: totalDePaginas(corpo, "nTotPaginas", "total_de_paginas"),
  };
}

const PAGO = new Set(["PAGO", "RECEBIDO", "LIQUIDADO"]);

export function mapearMovimento(item: unknown): TituloDoOmie | { fora: MotivoDoTituloFora } {
  const m = obj(item);
  const d = obj(m.detalhes);
  const r = obj(m.resumo);

  const id = texto(d.nCodTitulo);
  if (!id || id === "0") return { fora: "sem_titulo" };
  const natureza = texto(d.cNatureza).toUpperCase();
  const kind = natureza === "P" ? "PAGAR" : natureza === "R" ? "RECEBER" : null;
  if (!kind) return { fora: "natureza" };

  const vencimento = instanteDoOmie(d.dDtVenc, null);
  if (!vencimento) return { fora: "sem_vencimento" };
  const valor = numero(d.nValorTitulo);
  if (valor === null || valor <= 0) return { fora: "sem_valor" };

  const status = texto(d.cStatus).toUpperCase().replace(/\s|_/g, "");
  const liquidado = texto(r.cLiquidado).toUpperCase() === "S";
  const situacao = status === "CANCELADO" ? "CANCELADO" : PAGO.has(status) || liquidado ? "PAGO" : "ABERTO";
  const pagamento = situacao === "PAGO" ? instanteDoOmie(d.dDtPagamento, null) : null;
  if (situacao === "PAGO" && !pagamento) return { fora: "pago_sem_data" };

  const emissao = instanteDoOmie(d.dDtEmissao, null);
  // Competência = mês da emissão, como o Omie escreve (horário de Brasília);
  // sem emissão, o do vencimento.
  const [, mes, ano] = texto(emissao ? d.dDtEmissao : d.dDtVenc).split("/");

  // Categoria: a do título; com rateio, a de maior valor — o Connect guarda uma
  // por lançamento.
  let categoriaCodigo = texto(d.cCodCateg) || null;
  if (!categoriaCodigo && Array.isArray(m.categorias)) {
    const rateio = (m.categorias as unknown[]).map(obj).sort((a, b) => (numero(b.nValor) ?? 0) - (numero(a.nValor) ?? 0));
    categoriaCodigo = texto(rateio[0]?.cCodCateg) || null;
  }

  const documento = digitos(d.cCPFCNPJCliente);
  const numeroTitulo = texto(d.cNumTitulo);
  const notaFiscal = texto(d.cNumDocFiscal);
  return {
    omieTitleId: id.slice(0, 20),
    kind,
    situacao,
    parcial: status === "PAGTOPARCIAL" || (situacao === "ABERTO" && (numero(r.nValPago) ?? 0) > 0),
    emissao,
    vencimento,
    pagamento,
    competencia: `${ano}-${mes}`,
    valor: Math.round(valor * 100) / 100,
    categoriaCodigo,
    contraparteDocumento: documento.length === 11 || documento.length === 14 ? documento : null,
    contraparteCodigo: texto(d.nCodCliente) || null,
    descricao: [numeroTitulo && `Título ${numeroTitulo}`, notaFiscal && `NF ${notaFiscal}`].filter(Boolean).join(" · ").slice(0, 255) || null,
  };
}

/** O resumo de uma leitura, para gente — como o das notas. */
export function mensagemDoFinanceiro(c: Record<string, number>, gravou: boolean): string {
  const n = (k: string) => c[k] ?? 0;
  const partes = [
    gravou ? `${n("novos")} contas novas` : `${n("novos")} contas entrariam`,
    n("atualizados") ? `${n("atualizados")} ${gravou ? "atualizadas" : "seriam atualizadas"}` : null,
    n("iguais") ? `${n("iguais")} sem mudança` : null,
    n("parciais") ? `${n("parciais")} com pagamento parcial (ficam em aberto)` : null,
    n("sem_categoria") ? `${n("sem_categoria")} sem categoria` : null,
    n("categorias_novas") ? `${n("categorias_novas")} categorias do Omie ${gravou ? "criadas" : "a criar"} no plano da empresa` : null,
    n("preservados") ? `${n("preservados")} não mexidas (em acordo ou baixadas por perda no Connect)` : null,
    ...(Object.keys(MOTIVO_DO_TITULO) as MotivoDoTituloFora[])
      .filter((m) => n(`fora_${m}`) > 0)
      .map((m) => `${n(`fora_${m}`)} ${MOTIVO_DO_TITULO[m]}`),
  ].filter(Boolean);

  // Conciliação: só aparece quando a leitura chegou às linhas de conta.
  const conciliacao = [
    n("contas_ligadas") ? `${n("contas_ligadas")} conta(s) bancária(s) ligada(s) ao Omie` : null,
    n("contas_sem_par_no_omie") ? `${n("contas_sem_par_no_omie")} sem conta correspondente no Omie` : null,
    n("baixas_conciliadas") || n("baixas_nao_conciliadas")
      ? `${n("baixas_conciliadas")} baixas conciliadas no Omie e ${n("baixas_nao_conciliadas")} ainda não`
      : null,
    n("baixas_sem_titulo_no_connect") ? `${n("baixas_sem_titulo_no_connect")} baixas de títulos fora da janela` : null,
    n("contas_criadas") ? `${n("contas_criadas")} conta(s) do Omie ${gravou ? "criadas" : "a criar"} no Connect` : null,
    n("transferencias_novas")
      ? `${n("transferencias_novas")} transferências entre contas ${gravou ? "lançadas" : "a lançar"}`
      : null,
    n("lancamentos_de_conta_novos")
      ? `${n("lancamentos_de_conta_novos")} lançamentos de conta sem título (tarifa, rendimento…) ${gravou ? "lançados" : "a lançar"}`
      : null,
    n("extrato_conciliado_pelo_omie") ? `${n("extrato_conciliado_pelo_omie")} linhas do extrato conciliadas pelo Omie` : null,
    ...(Object.keys(MOTIVO_DA_LINHA) as MotivoDaLinhaFora[])
      .filter((m) => n(`conta_fora_${m}`) > 0)
      .map((m) => `${n(`conta_fora_${m}`)} ${MOTIVO_DA_LINHA[m]}`),
  ].filter(Boolean);

  return (
    `${n("lidos")} movimentos lidos em ${n("paginas")} página(s): ${partes.join(", ")}.` +
    (conciliacao.length ? ` Conciliação: ${conciliacao.join(", ")}.` : "")
  );
}
