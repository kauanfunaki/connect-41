// Parcelamento de encargos (27/11/2026, funcionalidade-764).
//
// Como na Domínio (Processos › Parcelamento de Encargos): o controle das
// parcelas de INSS (Receita Federal ou PGFN) e de FGTS (Caixa) que a empresa
// parcelou — número do parcelamento, valor consolidado, quantidade de parcelas,
// vencimentos e o que já foi pago. O pedido e as guias continuam no e-CAC, no
// Regularize ou na Caixa (a consulta pelo Integra Contador é paga e não é
// usada aqui): o DP informa o parcelamento e marca as parcelas pagas, com o
// valor efetivamente pago (a parcela do INSS é corrigida pela Selic).
//
// Puro, sem banco.

import { r2 } from "@/lib/rescisao/constantes";
import { lerNumero } from "./entrada";

export const TIPOS_DE_PARCELAMENTO: Record<string, string> = {
  INSS_RFB: "INSS · Receita Federal",
  INSS_PGFN: "INSS · PGFN (dívida ativa)",
  FGTS: "FGTS · Caixa",
};

export type Parcelamento = { tipo: string; numero: string; valorConsolidado: number; quantidade: number; primeiroVencimento: string; observacao: string | null };
export type Parcela = { numero: number; vencimento: string; valor: number };

const ehData = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export function lerParcelamento(e: { tipo: string; numero: string; valorConsolidado: string; quantidade: string; primeiroVencimento: string; observacao: string }): { ok: true; parcelamento: Parcelamento } | { ok: false; erro: string } {
  if (!TIPOS_DE_PARCELAMENTO[e.tipo]) return { ok: false, erro: "Escolha o tipo do parcelamento (INSS na Receita, INSS na PGFN ou FGTS)." };
  const numero = e.numero.trim().slice(0, 40);
  if (!numero) return { ok: false, erro: "Informe o número do parcelamento (ou do processo)." };
  const valorConsolidado = lerNumero(e.valorConsolidado);
  if (valorConsolidado === null || valorConsolidado <= 0) return { ok: false, erro: "Informe o valor consolidado do parcelamento." };
  const quantidade = Number(e.quantidade);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 240) return { ok: false, erro: "A quantidade de parcelas vai de 1 a 240." };
  if (!ehData(e.primeiroVencimento)) return { ok: false, erro: "Informe o vencimento da primeira parcela." };
  return { ok: true, parcelamento: { tipo: e.tipo, numero, valorConsolidado: r2(valorConsolidado), quantidade, primeiroVencimento: e.primeiroVencimento, observacao: e.observacao.trim().slice(0, 300) || null } };
}

/** O vencimento da parcela n: o mesmo dia do primeiro, mês a mês (no fim do mês quando o dia não existe). */
export function vencimentoDaParcela(primeiro: string, n: number): string {
  const [a, m, d] = primeiro.split("-").map(Number);
  const mesAlvo = m - 1 + (n - 1);
  const ano = a + Math.floor(mesAlvo / 12);
  const mes = (mesAlvo % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

/** As parcelas iguais do valor consolidado; os centavos que sobram vão na última. */
export function gerarParcelas(p: Pick<Parcelamento, "valorConsolidado" | "quantidade" | "primeiroVencimento">): Parcela[] {
  const base = Math.floor((p.valorConsolidado / p.quantidade) * 100) / 100;
  const parcelas: Parcela[] = [];
  for (let n = 1; n <= p.quantidade; n++) parcelas.push({ numero: n, vencimento: vencimentoDaParcela(p.primeiroVencimento, n), valor: base });
  const resto = r2(p.valorConsolidado - base * p.quantidade);
  parcelas[parcelas.length - 1].valor = r2(base + resto);
  return parcelas;
}

export type ParcelaGravada = Parcela & { pagaEm: string | null; valorPago: number | null };

/** O resumo do parcelamento na data: pagas, em aberto, vencidas, o saldo e a próxima a vencer. */
export function situacaoDoParcelamento(parcelas: readonly ParcelaGravada[], hoje: string) {
  const pagas = parcelas.filter((p) => p.pagaEm);
  const abertas = parcelas.filter((p) => !p.pagaEm).sort((a, b) => a.numero - b.numero);
  const vencidas = abertas.filter((p) => p.vencimento < hoje);
  return {
    pagas: pagas.length,
    total: parcelas.length,
    pago: r2(pagas.reduce((s, p) => s + (p.valorPago ?? p.valor), 0)),
    saldo: r2(abertas.reduce((s, p) => s + p.valor, 0)),
    vencidas: vencidas.length,
    proxima: abertas.find((p) => p.vencimento >= hoje) ?? null,
    quitado: abertas.length === 0,
  };
}

/** Lê o pagamento de uma parcela: a data e o valor pago (com a correção, se houver). */
export function lerPagamento(e: { pagaEm: string; valorPago: string }, parcela: { valor: number }): { ok: true; pagaEm: string; valorPago: number } | { ok: false; erro: string } {
  if (!ehData(e.pagaEm)) return { ok: false, erro: "Informe a data do pagamento." };
  const valorPago = e.valorPago.trim() ? lerNumero(e.valorPago) : parcela.valor;
  if (valorPago === null || valorPago <= 0) return { ok: false, erro: "O valor pago tem de ser maior que zero." };
  return { ok: true, pagaEm: e.pagaEm, valorPago: r2(valorPago) };
}
