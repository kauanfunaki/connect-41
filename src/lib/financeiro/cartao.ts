// Cartão de crédito (lote D da fila do BPO, 20/10 — no Omie, a conta corrente
// do tipo cartão). Funções puras; a fatura é refeita em `baixa/servidor.ts`, e
// o cadastro e as faturas da tela moram em `cartaoServidor.ts`.
//
// ─── O desenho ───────────────────────────────────────────────────────────────
//
// O cartão é uma conta que não é banco, com o dia em que a fatura fecha e o
// dia em que ela vence:
//
// - **comprar** é dar a baixa da conta a pagar saindo pelo cartão: a DRE de
//   caixa reconhece a despesa ali, na categoria da conta (como o Omie faz), e
//   o banco não se mexe;
// - a compra entra na **fatura** do ciclo — uma conta a pagar ao cartão, que
//   vence no dia do vencimento. O valor dela é a soma das compras, refeito a
//   cada compra que entra ou sai;
// - **pagar a fatura** é dar a baixa dela pelo banco, como qualquer conta: aí o
//   dinheiro sai, e o fluxo de caixa o vê. A fatura fica na categoria de
//   transferência, fora da DRE — a despesa já entrou em cada compra.
//
// A fatura que já tem pagamento não ganha nem perde compra: desfaz-se o
// pagamento dela antes.

import { MESES } from "@/lib/datas/calendario";
import { codigoDoBanco } from "./conciliacao/conta";

export type DiasDoCartao = { fechamento: number; vencimento: number };

/** A fatura de um ciclo: o mês em que vence ("2026-11"), o dia em que fecha e o dia em que vence. */
export type CicloDaFatura = { ciclo: string; fechamentoKey: string; vencimentoKey: string };

const dois = (n: number) => String(n).padStart(2, "0");
const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const seguinte = (ano: number, mes: number): [number, number] => (mes === 12 ? [ano + 1, 1] : [ano, mes + 1]);
const anterior = (ano: number, mes: number): [number, number] => (mes === 1 ? [ano - 1, 12] : [ano, mes - 1]);
/** O dia no mês — o 31 vira o último dia no mês que não tem 31. */
const diaNoMes = (dia: number, ano: number, mes: number) => Math.min(dia, ultimoDia(ano, mes));

function cicloQueFechaEm(ano: number, mes: number, dias: DiasDoCartao): CicloDaFatura {
  // Vencimento depois do fechamento no calendário: vence no mesmo mês em que
  // fecha (fecha 5, vence 15); senão, no mês seguinte (fecha 25, vence 5).
  const [av, mv] = dias.vencimento > dias.fechamento ? [ano, mes] : seguinte(ano, mes);
  return {
    ciclo: `${av}-${dois(mv)}`,
    fechamentoKey: `${ano}-${dois(mes)}-${dois(diaNoMes(dias.fechamento, ano, mes))}`,
    vencimentoKey: `${av}-${dois(mv)}-${dois(diaNoMes(dias.vencimento, av, mv))}`,
  };
}

/**
 * A fatura em que entra a compra deste dia. A compra do dia do fechamento em
 * diante já é da fatura seguinte — é como o banco conta, e o que a tela diz
 * no cadastro.
 */
export function cicloDaCompra(dataKey: string, dias: DiasDoCartao): CicloDaFatura {
  const [ano, mes, dia] = dataKey.split("-").map(Number) as [number, number, number];
  const [af, mf] = dia < diaNoMes(dias.fechamento, ano, mes) ? [ano, mes] : seguinte(ano, mes);
  return cicloQueFechaEm(af, mf, dias);
}

/** O ciclo pelo mês em que a fatura vence — para dizer quando ela fecha. */
export function cicloDoMes(ciclo: string, dias: DiasDoCartao): CicloDaFatura {
  const [av, mv] = ciclo.split("-").map(Number) as [number, number];
  const [af, mf] = dias.vencimento > dias.fechamento ? [av, mv] : anterior(av, mv);
  return cicloQueFechaEm(af, mf, dias);
}

/** "novembro/2026". */
export function mesDoCiclo(ciclo: string): string {
  const [ano, mes] = ciclo.split("-").map(Number) as [number, number];
  return `${MESES[mes - 1]}/${ano}`;
}

export const NOME_DA_CATEGORIA_DA_FATURA = "Fatura de cartão de crédito";

/** A descrição da conta a pagar que é a fatura. */
export function descricaoDaFatura(cartao: string, ciclo: string): string {
  return `Fatura do cartão ${cartao} — ${mesDoCiclo(ciclo)}`;
}

export type SituacaoDaFatura = "Aberta" | "Fechada" | "Paga em parte" | "Paga";

/** Aberta até fechar; fechada esperando o pagamento; paga (ou em parte). */
export function situacaoDaFatura(f: { status: string; baixadoCentavos: number; fechamentoKey: string }, hojeKey: string): SituacaoDaFatura {
  if (f.status === "PAGO") return "Paga";
  if (f.baixadoCentavos > 0) return "Paga em parte";
  return hojeKey < f.fechamentoKey ? "Aberta" : "Fechada";
}

// ─── O cadastro ──────────────────────────────────────────────────────────────

export type CamposDoCartao = {
  nome: string | null | undefined;
  banco: string | null | undefined;
  final: string | null | undefined;
  fechamento: string | null | undefined;
  vencimento: string | null | undefined;
};

export type CartaoValidado = {
  nickname: string;
  bankCode: string;
  /** "final 1234" — o que os seletores mostram depois do nome. */
  accountNumber: string;
  /** Só a chave do unique de banco e número: o cartão não tem extrato a conferir. */
  accountDigits: string;
  cardClosingDay: number;
  cardDueDay: number;
};

/** Banco "000" quando a pessoa não informa o emissor — o mesmo das contas que não são banco. */
export const BANCO_NAO_INFORMADO = "000";

function diaDoMes(texto: string | null | undefined): number | null {
  const t = (texto ?? "").trim();
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 31 ? n : null;
}

export function validarCartao(campos: CamposDoCartao): { ok: true; dados: CartaoValidado } | { ok: false; erro: string } {
  const nickname = (campos.nome ?? "").trim();
  if (nickname === "") return { ok: false, erro: "Dê um nome para o cartão (ex.: Itaú Visa empresarial)." };
  if (nickname.length > 80) return { ok: false, erro: "Nome com mais de 80 caracteres." };

  const bancoTexto = (campos.banco ?? "").trim();
  const bankCode = bancoTexto === "" ? BANCO_NAO_INFORMADO : codigoDoBanco(bancoTexto);
  if (!bankCode) return { ok: false, erro: "Código do banco inválido — use o número COMPE (ex.: 341), ou deixe em branco." };

  const final = (campos.final ?? "").trim();
  if (!/^\d{4}$/.test(final)) return { ok: false, erro: "Informe os quatro últimos números do cartão." };

  const fechamento = diaDoMes(campos.fechamento);
  if (fechamento === null) return { ok: false, erro: "Dia do fechamento entre 1 e 31." };
  const vencimento = diaDoMes(campos.vencimento);
  if (vencimento === null) return { ok: false, erro: "Dia do vencimento entre 1 e 31." };
  if (fechamento === vencimento) return { ok: false, erro: "A fatura não fecha e vence no mesmo dia — confira os dois na fatura do cartão." };

  return {
    ok: true,
    dados: { nickname, bankCode, accountNumber: `final ${final}`, accountDigits: `cartao${final}`, cardClosingDay: fechamento, cardDueDay: vencimento },
  };
}

/** Os quatro números de "final 1234", para a edição. */
export function finalDoCartao(accountNumber: string): string {
  return /(\d{4})$/.exec(accountNumber)?.[1] ?? "";
}
