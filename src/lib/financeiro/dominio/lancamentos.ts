// Os lançamentos contábeis que as baixas do financeiro viram na Domínio (fila
// do BPO, 21/10). Funções puras; a leitura é `servidor.ts` e o arquivo,
// `planilha.ts`.
//
// ─── O que entra ────────────────────────────────────────────────────────────
//
// As baixas do período — o dinheiro que de fato andou —, não as contas: a
// provisão (despesa × fornecedor) das notas de compra já vem do SPED
// Generator, e lançá-la daqui duplicaria. Cada baixa vira:
//
// - o principal: na conta a pagar, D a conta da contrapartida, C o banco; na
//   conta a receber, D o banco, C a contrapartida. A contrapartida é a conta
//   do fornecedor/cliente no de-para, se houver — o modelo em que a baixa
//   liquida o que o SPED Generator provisionou —, senão a da categoria (a
//   despesa ou a receita direto). Conta rateada sai numa linha por parte;
// - juros e multa, na categoria de encargos da baixa, contra o banco;
// - o desconto, na categoria de desconto da baixa, contra o banco no sentido
//   contrário — o banco anda o principal menos o desconto.
//
// ─── O que não se adivinha ──────────────────────────────────────────────────
//
// Conta contábil é do Contábil. Linha sem conta no de-para (a categoria, o
// banco) não entra no arquivo: vira pendência com o porquê, como no SPED
// Generator. O código de histórico vai vazio, que é o padrão do Contábil nas
// notas, e o complemento leva o que a baixa diz.

import type { LinhaDaDominio } from "./planilha";
import { partesDoRateio } from "../rateio";

export type TipoDoDePara = "CATEGORIA" | "CONTA_BANCARIA" | "CONTRAPARTE";

/** O de-para da empresa: id do cadastro → código reduzido da Domínio. */
export type DeParaDaEmpresa = Record<TipoDoDePara, ReadonlyMap<string, string>>;

export type BaixaParaExportar = {
  id: string;
  /** "AAAA-MM-DD" — o dia da baixa. */
  dataKey: string;
  kind: "PAGAR" | "RECEBER";
  principalCentavos: number;
  jurosCentavos: number;
  multaCentavos: number;
  descontoCentavos: number;
  bankAccountId: string | null;
  bankAccountNome: string | null;
  interestCategoryId: string | null;
  interestCategoryNome: string | null;
  discountCategoryId: string | null;
  discountCategoryNome: string | null;
  conta: {
    counterpartyId: string;
    contraparteNome: string;
    categoryId: string | null;
    categoriaNome: string | null;
    descricao: string | null;
    documento: string | null;
    /** As partes do rateio, com o valor de cada uma; vazio é a conta inteira na categoria dela. */
    rateio: { categoryId: string | null; categoriaNome: string | null; centavos: number }[];
  };
};

export type Pendencia = {
  baixaId: string;
  dataKey: string;
  contraparteNome: string;
  centavos: number;
  motivo: string;
};

export type Exportacao = { linhas: LinhaDaDominio[]; pendencias: Pendencia[] };

/** Texto sem quebra, sem ";" (é o separador do .txt), no tamanho que a Domínio aceita. */
function limpo(texto: string, max = 255): string {
  return texto.replace(/[;\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** "PAGTO NF 123 OFICINA DO PAULO - REVISÃO" — o que a baixa diz, em maiúsculas como os históricos da Domínio. */
export function complementoDaBaixa(b: BaixaParaExportar, prefixo?: string): string {
  const partes = [prefixo ?? (b.kind === "PAGAR" ? "PAGTO" : "RECEBTO")];
  if (b.conta.documento) partes.push(`DOC ${b.conta.documento}`);
  partes.push(b.conta.contraparteNome);
  if (b.conta.descricao) partes.push(`- ${b.conta.descricao}`);
  return limpo(partes.join(" ")).toUpperCase();
}

/**
 * As linhas da Domínio de um conjunto de baixas, e o que ficou de fora.
 * Uma baixa com alguma conta faltando sai inteira para as pendências — meia
 * baixa no arquivo deixaria o banco da Domínio sem fechar com o extrato.
 */
export function lancamentosDasBaixas(baixas: readonly BaixaParaExportar[], dePara: DeParaDaEmpresa, codigoFilial: string): Exportacao {
  const linhas: LinhaDaDominio[] = [];
  const pendencias: Pendencia[] = [];

  for (const b of baixas) {
    const caixa = b.principalCentavos + b.jurosCentavos + b.multaCentavos - b.descontoCentavos;
    const pendente = (motivo: string) => pendencias.push({ baixaId: b.id, dataKey: b.dataKey, contraparteNome: b.conta.contraparteNome, centavos: caixa, motivo });

    if (!b.bankAccountId) {
      pendente("Baixa sem conta bancária — informe por onde o dinheiro passou, em Contas a pagar e a receber.");
      continue;
    }
    const banco = dePara.CONTA_BANCARIA.get(b.bankAccountId);
    if (!banco) {
      pendente(`A conta bancária ${b.bankAccountNome ?? "da baixa"} não tem conta contábil no de-para.`);
      continue;
    }

    // A contrapartida do principal: a conta da contraparte, ou a da categoria (por parte do rateio).
    const daContraparte = dePara.CONTRAPARTE.get(b.conta.counterpartyId) ?? null;
    const partes: { conta: string | null; nome: string | null; centavos: number }[] = daContraparte
      ? [{ conta: daContraparte, nome: b.conta.contraparteNome, centavos: b.principalCentavos }]
      : b.conta.rateio.length > 0
        ? partesDoRateio(b.principalCentavos, b.conta.rateio).map((p) => ({
            conta: p.linha.categoryId ? (dePara.CATEGORIA.get(p.linha.categoryId) ?? null) : null,
            nome: p.linha.categoriaNome,
            centavos: p.centavos,
          }))
        : [{ conta: b.conta.categoryId ? (dePara.CATEGORIA.get(b.conta.categoryId) ?? null) : null, nome: b.conta.categoriaNome, centavos: b.principalCentavos }];
    const semConta = partes.find((p) => p.centavos > 0 && !p.conta);
    if (semConta) {
      pendente(
        semConta.nome
          ? `A categoria ${semConta.nome} não tem conta contábil no de-para.`
          : "Conta sem categoria — classifique a conta, ou dê uma conta contábil à contraparte no de-para."
      );
      continue;
    }

    const encargos = b.jurosCentavos + b.multaCentavos;
    const contaDosEncargos = encargos > 0 ? (b.interestCategoryId ? (dePara.CATEGORIA.get(b.interestCategoryId) ?? null) : null) : null;
    if (encargos > 0 && !contaDosEncargos) {
      pendente(`Juros e multa: a categoria ${b.interestCategoryNome ?? "de encargos"} não tem conta contábil no de-para.`);
      continue;
    }
    const contaDoDesconto = b.descontoCentavos > 0 ? (b.discountCategoryId ? (dePara.CATEGORIA.get(b.discountCategoryId) ?? null) : null) : null;
    if (b.descontoCentavos > 0 && !contaDoDesconto) {
      pendente(`Desconto: a categoria ${b.discountCategoryNome ?? "de desconto"} não tem conta contábil no de-para.`);
      continue;
    }

    const pagar = b.kind === "PAGAR";
    // Pagar: a contrapartida no débito e o banco no crédito; receber, o contrário.
    const linha = (contrapartida: string, centavos: number, complemento: string, invertido = false) => {
      if (centavos <= 0) return;
      const saiDoBanco = pagar !== invertido;
      linhas.push({
        dataKey: b.dataKey,
        debito: saiDoBanco ? contrapartida : banco,
        credito: saiDoBanco ? banco : contrapartida,
        centavos,
        codigoHistorico: "",
        complemento,
        codigoFilial,
        baixaId: b.id,
      });
    };
    for (const p of partes) linha(p.conta!, p.centavos, complementoDaBaixa(b));
    if (contaDosEncargos) linha(contaDosEncargos, encargos, complementoDaBaixa(b, pagar ? "JUROS/MULTA PAGTO" : "JUROS/MULTA RECEBTO"));
    // O desconto anda ao contrário do principal: o banco deixou de pagar (ou de receber) essa parte.
    if (contaDoDesconto) linha(contaDoDesconto, b.descontoCentavos, complementoDaBaixa(b, pagar ? "DESCONTO OBTIDO" : "DESCONTO CONCEDIDO"), true);
  }

  linhas.sort((a, b) => a.dataKey.localeCompare(b.dataKey));
  return { linhas, pendencias };
}
