// A conta corrente prevista do título (lote D, 20/10 — no Omie, a "Conta
// Corrente" do título): por onde a conta deve ser paga ou recebida. Funções
// puras; a leitura no banco mora em `contaPrevistaServidor.ts`.
//
// É sugestão, não registro do dinheiro: a baixa já vem com ela marcada, e
// quem diz de onde o dinheiro saiu é a baixa (`FinanceEntryPayment`). Por isso
// não tem trava de pago ou conciliado — mudar a prevista de uma conta paga não
// mexe em nada que andou.

export type ContaBancaria = { id: string; nome: string };

/** Como a conta bancária aparece nos seletores: "Itaú 12345-6". */
export function nomeDaContaBancaria(c: { nickname: string; accountNumber: string }): string {
  return `${c.nickname} ${c.accountNumber}`;
}

/** A conta informada vale para o lançamento? Da empresa dele e ativa — a atual pode seguir inativa. */
export function contaPrevistaDoLancamento(p: {
  companyId: string;
  informadoId: string | null;
  conta: { id: string; companyId: string; active: boolean } | null;
  atualId?: string | null;
}): { ok: true; contaId: string | null } | { ok: false; erro: string } {
  if (!p.informadoId) return { ok: true, contaId: null };
  if (!p.conta || p.conta.id !== p.informadoId || p.conta.companyId !== p.companyId) {
    return { ok: false, erro: "Conta corrente não encontrada nesta empresa." };
  }
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
