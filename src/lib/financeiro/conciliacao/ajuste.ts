// A diferença entre a linha do extrato e a conta, resolvida na própria
// conciliação (fila do BPO, 19/10 — "juros e desconto direto na conciliação").
//
// Antes, a linha de R$ 1.023 não casava com a conta de R$ 1.000: era preciso
// sair da conciliação, baixar a conta com juros pelo botão Pagar e voltar para
// ligar a baixa. Agora, com uma conta marcada, a diferença vira:
//
// - **juros e multa**, quando a linha passa da conta — a conta quita, e o
//   total da baixa é o da linha;
// - **desconto**, quando a linha fica abaixo e o credor abateu o resto — a
//   conta quita também;
// - **baixa parcial**, quando a linha fica abaixo e o resto ainda vai ser pago
//   — a conta continua em aberto com o saldo.
//
// Funções puras; a gravação é `confirmarConciliacao`.

import { moeda } from "../formato";

export type AjusteDaConciliacao =
  | { tipo: "encargos"; jurosCentavos: number; multaCentavos: number }
  | { tipo: "desconto" }
  | { tipo: "parcial" };

export type BaixaDoAjuste = {
  principalCentavos: number;
  jurosCentavos: number;
  multaCentavos: number;
  descontoCentavos: number;
  /** O que andou na conta: sempre o valor da linha do extrato. */
  caixaCentavos: number;
};

/**
 * A baixa que a linha do extrato faz na conta, com a diferença resolvida como
 * a pessoa escolheu. Recusa a escolha que não combina com o sentido da
 * diferença — desconto numa linha maior que a conta, juros numa menor.
 */
export function baixaDoAjuste(
  saldoCentavos: number,
  linhaCentavos: number,
  ajuste: AjusteDaConciliacao
): { ok: true; baixa: BaixaDoAjuste } | { ok: false; erro: string } {
  const linha = Math.abs(linhaCentavos);
  if (saldoCentavos <= 0) return { ok: false, erro: "Esta conta não tem saldo em aberto." };
  const diferenca = linha - saldoCentavos;
  if (diferenca === 0) return { ok: false, erro: "A linha fecha com a conta — não há diferença a lançar." };

  if (ajuste.tipo === "encargos") {
    if (diferenca < 0) return { ok: false, erro: "A linha é menor que a conta: a diferença é desconto ou baixa parcial, não juros." };
    const { jurosCentavos: juros, multaCentavos: multa } = ajuste;
    if (!Number.isSafeInteger(juros) || !Number.isSafeInteger(multa) || juros < 0 || multa < 0) return { ok: false, erro: "Juros ou multa inválido." };
    if (juros + multa !== diferenca) {
      return { ok: false, erro: `Juros e multa somam ${moeda(juros + multa)}, e a linha passa da conta em ${moeda(diferenca)}.` };
    }
    return { ok: true, baixa: { principalCentavos: saldoCentavos, jurosCentavos: juros, multaCentavos: multa, descontoCentavos: 0, caixaCentavos: linha } };
  }

  if (diferenca > 0) return { ok: false, erro: "A linha é maior que a conta: a diferença é juros ou multa." };
  if (ajuste.tipo === "desconto") {
    return { ok: true, baixa: { principalCentavos: saldoCentavos, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: -diferenca, caixaCentavos: linha } };
  }
  return { ok: true, baixa: { principalCentavos: linha, jurosCentavos: 0, multaCentavos: 0, descontoCentavos: 0, caixaCentavos: linha } };
}

/** O ajuste vindo da tela — dado de fora: forma conferida campo a campo. */
export function lerAjuste(valor: unknown): AjusteDaConciliacao | null {
  if (typeof valor !== "object" || valor === null) return null;
  const v = valor as Record<string, unknown>;
  if (v.tipo === "desconto" || v.tipo === "parcial") return { tipo: v.tipo };
  if (v.tipo === "encargos" && typeof v.jurosCentavos === "number" && typeof v.multaCentavos === "number") {
    return { tipo: "encargos", jurosCentavos: v.jurosCentavos, multaCentavos: v.multaCentavos };
  }
  return null;
}
