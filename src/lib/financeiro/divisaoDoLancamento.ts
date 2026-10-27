// Rateio, retenção e parcelamento juntos no lançamento manual (lote M1 do
// mercado, 23/10/2026). Até aqui o servidor recusava qualquer par dos três
// ("Rateio e retenção juntos ainda não…") e mandava fazer o resto na edição,
// conta a conta.
//
// ─── O que a pessoa digita e o que cada conta guarda ─────────────────────────
//
// Na tela, tudo é sobre o **bruto** — o valor da nota: as parcelas somam o
// bruto, as retenções são do bruto, e as linhas do rateio fecham o bruto
// (`CamposDoRateio` confere contra o campo de valor). Cada conta que nasce
// guarda a parte dela:
//
// - **Parcelas:** o bruto de cada uma é o que a pessoa conferiu na tela.
// - **Retenções:** cada tributo se reparte entre as parcelas na proporção do
//   bruto delas — a retenção acontece a cada pagamento (decidido pelo Kauan em
//   23/10/2026). Cada parcela gera as contas dos impostos dela.
// - **Líquido:** o bruto da parcela menos as retenções dela; é o valor da conta.
// - **Rateio:** as linhas na proporção do líquido da conta — o mesmo critério
//   da edição, em que o rateio fecha o valor da conta (o líquido). Linha que
//   fica sem centavo nenhum, numa parcela pequena, sai da conta.
//
// O maior resto (`repartir`) fecha cada divisão no centavo: a soma das
// retenções de um tributo é a digitada, e o rateio de cada conta é o valor dela.
//
// Função pura; a gravação é `criarLancamentoManual`.

import { formatarReaisDeCentavos } from "@/lib/format";
import { partesDoRateio, repartir, resumoDoRateio, type LinhaDoRateio } from "./rateio";
import { somaDasRetencoes, TRIBUTO, type RetencaoInformada } from "./retencoes";

export type ContaDaDivisao = {
  /** 1 para a primeira conta; na série, o índice da parcela. */
  indice: number;
  brutoCentavos: number;
  /** As retenções desta conta, só as que ficaram com algum centavo. */
  retencoes: RetencaoInformada[];
  /** O valor da conta: o bruto menos as retenções dela. */
  liquidoCentavos: number;
  /** O rateio desta conta, fechando o líquido. Vazio: sem rateio. */
  rateio: LinhaDoRateio[];
  /** Categoria, centro e projeto que a conta guarda (o resumo do rateio dela). */
  resumo: ReturnType<typeof resumoDoRateio> | null;
};

/**
 * Divide o lançamento nas contas que nascem dele. Sem parcelas, uma conta só
 * com o bruto inteiro. Recusa a divisão em que alguma conta ficaria sem valor
 * a pagar ao fornecedor — o mesmo limite de `liquidoDaConta`, parcela a
 * parcela.
 */
export function dividirLancamento(p: {
  brutoCentavos: number;
  /** As parcelas como a pessoa conferiu; ausente, uma conta só. Somam o bruto. */
  parcelas?: { indice: number; centavos: number }[] | null;
  retencoes: RetencaoInformada[];
  /** As linhas do rateio, fechando o bruto; vazio, sem rateio. */
  rateio: LinhaDoRateio[];
}): { ok: true; contas: ContaDaDivisao[] } | { ok: false; erro: string } {
  const partes = p.parcelas && p.parcelas.length > 0 ? p.parcelas : [{ indice: 1, centavos: p.brutoCentavos }];
  const brutos = partes.map((x) => x.centavos);

  // Cada tributo repartido entre as contas pelo bruto delas.
  const porTributo = p.retencoes.map((r) => ({ tributo: r.tributo, partes: repartir(r.centavos, brutos) }));

  const contas: ContaDaDivisao[] = [];
  for (const [i, parte] of partes.entries()) {
    const retencoes = porTributo.map((t) => ({ tributo: t.tributo, centavos: t.partes[i]! })).filter((r) => r.centavos > 0);
    const liquido = parte.centavos - somaDasRetencoes(retencoes);
    if (liquido <= 0) {
      const onde = partes.length > 1 ? `a parcela ${parte.indice}` : "a conta";
      const retido = retencoes.map((r) => `${TRIBUTO[r.tributo].rotulo} ${formatarReaisDeCentavos(r.centavos)}`).join(", ");
      return {
        ok: false,
        erro: `As retenções (${retido}) não cabem n${onde} de ${formatarReaisDeCentavos(parte.centavos)} — o fornecedor ficaria sem nada a receber.`,
      };
    }
    const rateio =
      p.rateio.length > 0
        ? partesDoRateio(liquido, p.rateio)
            .filter((x) => x.centavos > 0)
            .map((x) => ({ ...x.linha, centavos: x.centavos }))
        : [];
    // Com uma linha só sobrando, a conta é dessa linha: não é rateio.
    const comRateio = rateio.length >= 2 ? rateio : [];
    contas.push({
      indice: parte.indice,
      brutoCentavos: parte.centavos,
      retencoes,
      liquidoCentavos: liquido,
      rateio: comRateio,
      resumo: rateio.length > 0 ? resumoDoRateio(rateio) : null,
    });
  }
  return { ok: true, contas };
}
