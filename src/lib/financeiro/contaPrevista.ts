// A conta corrente prevista do título (lote D, 20/10 — no Omie, a "Conta
// Corrente" do título): por onde a conta deve ser paga ou recebida. Funções
// puras; a leitura no banco mora em `contaPrevistaServidor.ts`.
//
// É sugestão, não registro do dinheiro: a baixa já vem com ela marcada, e
// quem diz de onde o dinheiro saiu é a baixa (`FinanceEntryPayment`). Por isso
// não tem trava de pago ou conciliado — mudar a prevista de uma conta paga não
// mexe em nada que andou.
//
// O cartão de crédito (lote D, 20/10) também pode ser a prevista da conta a
// pagar: com "já pago em", a conta nasce paga no cartão e entra na fatura.

import { ehContaDeAdiantamento } from "./adiantamento";
import { ehCartaoDeCredito, grupoDoTipo, rotuloDoTipo } from "./tiposDeConta";

/** `cartao`: é cartão de crédito — só a conta a pagar o oferece. */
export type ContaBancaria = { id: string; nome: string; cartao?: boolean };

/**
 * Como a conta aparece nos seletores: "Itaú 12345-6". A que não é banco diz o
 * tipo (lote D, 20/10): "Caixa da loja (caixinha)".
 */
export function nomeDaContaBancaria(c: { nickname: string; accountNumber: string; type?: string }): string {
  const nome = `${c.nickname} ${c.accountNumber}`.trim();
  return c.type && grupoDoTipo(c.type) !== "banco" ? `${nome} (${rotuloDoTipo(c.type).toLowerCase()})` : nome;
}

/** A conta informada vale para o lançamento? Da empresa dele e ativa — a atual pode seguir inativa. */
export function contaPrevistaDoLancamento(p: {
  companyId: string;
  informadoId: string | null;
  conta: { id: string; companyId: string; active: boolean; type?: string } | null;
  atualId?: string | null;
  kind?: "PAGAR" | "RECEBER";
}): { ok: true; contaId: string | null } | { ok: false; erro: string } {
  if (!p.informadoId) return { ok: true, contaId: null };
  if (!p.conta || p.conta.id !== p.informadoId || p.conta.companyId !== p.companyId) {
    return { ok: false, erro: "Conta corrente não encontrada nesta empresa." };
  }
  // O adiantamento se escolhe na baixa, com o disponível de quem é a conta; o
  // cartão, só na conta a pagar.
  if (ehContaDeAdiantamento(p.conta.type)) {
    return { ok: false, erro: "O adiantamento não é conta prevista — escolha-o na baixa da conta." };
  }
  if (ehCartaoDeCredito(p.conta.type) && p.kind === "RECEBER") return { ok: false, erro: "Cartão de crédito só paga conta a pagar." };
  if (!p.conta.active && p.conta.id !== p.atualId) {
    return { ok: false, erro: "Conta corrente inativa — escolha outra ou reative em Banco e caixa." };
  }
  return { ok: true, contaId: p.conta.id };
}

/**
 * A conta que a baixa em lote sugere para uma empresa: a prevista, quando
 * todas as contas dela no lote preveem a mesma. Com previstas diferentes (ou
 * alguma sem), não há sugestão honesta — a pessoa escolhe.
 */
export function contaPrevistaEmComum(previstas: (string | null)[]): string | null {
  const unicas = new Set(previstas);
  if (unicas.size !== 1) return null;
  return [...unicas][0] ?? null;
}

/** A conta que a janela da baixa já traz marcada: a prevista, se ainda está entre as ativas; senão a única que houver. */
export function contaSugeridaNaBaixa(contas: ContaBancaria[], previstaId: string | null): string {
  if (previstaId && contas.some((c) => c.id === previstaId)) return previstaId;
  return contas.length === 1 ? contas[0]!.id : "";
}
