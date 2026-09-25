// Linha do extrato ↔ baixa já conciliada no Omie. Função pura.
//
// O Omie é a fonte da conciliação (decisão do Kauan, 25/09): se o BPO já
// conciliou lá, a linha do extrato importada no Connect não volta para a fila
// de ninguém. Mas casamento automático errado é o pior defeito de uma
// conciliação (ver `casamento.ts`), então a regra aqui é mais estreita que a
// da sugestão:
//
// - mesma conta (a conta do Connect ligada à conta corrente do Omie);
// - mesmo valor, no centavo, com o sinal do lado certo (saída ↔ a pagar);
// - mesmo dia: a data da linha do extrato é a data da baixa no Omie;
// - **um para um**: a linha tem exatamente um lançamento assim, e o
//   lançamento é candidato de exatamente uma linha. Dois boletos iguais pagos
//   no mesmo dia ficam para gente — escolher um deles seria chute.

export type LinhaParaOmie = { id: string; centavos: number; dataKey: string };
export type BaixaConciliada = { id: string; kind: "PAGAR" | "RECEBER"; centavos: number; pagoEmKey: string };

export function parearPeloOmie(linhas: LinhaParaOmie[], baixas: BaixaConciliada[]): { transacaoId: string; lancamentoId: string }[] {
  const chave = (kind: "PAGAR" | "RECEBER", centavos: number, dataKey: string) => `${kind}|${centavos}|${dataKey}`;

  const baixasPorChave = new Map<string, string[]>();
  for (const b of baixas) {
    if (b.centavos <= 0) continue;
    const k = chave(b.kind, b.centavos, b.pagoEmKey);
    baixasPorChave.set(k, [...(baixasPorChave.get(k) ?? []), b.id]);
  }
  const linhasPorChave = new Map<string, string[]>();
  for (const l of linhas) {
    if (l.centavos === 0) continue;
    const k = chave(l.centavos < 0 ? "PAGAR" : "RECEBER", Math.abs(l.centavos), l.dataKey);
    linhasPorChave.set(k, [...(linhasPorChave.get(k) ?? []), l.id]);
  }

  const pares: { transacaoId: string; lancamentoId: string }[] = [];
  for (const [k, ids] of linhasPorChave) {
    const candidatas = baixasPorChave.get(k) ?? [];
    if (ids.length === 1 && candidatas.length === 1) pares.push({ transacaoId: ids[0], lancamentoId: candidatas[0] });
  }
  return pares;
}
