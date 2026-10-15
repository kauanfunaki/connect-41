// "Pedágio" sai do CMV e vai para as Despesas Fixas (Administrativas) — pedido
// de 15/10/2026: "Pedágio tem que entrar na categoria DESPESAS FIXAS
// (ADMINISTRATIVAS)".
//
// O plano padrão (`planoPadrao.ts`) e o de-para do Omie (`mapeamento-padrao.ts`)
// já nascem com `administrativas`. Isto é o nome que a correção do que já está
// no banco procura; a regra da correção é a comum (`correcaoDaLinha.ts`), e
// quem a aplica é o script `scripts/dre-pedagio-para-administrativas.ts`.

import { chaveDaCategoria } from "@/lib/dre/calculo";
import type { CorrecaoDaLinha } from "@/lib/dre/correcaoDaLinha";

/**
 * O nome é desta categoria? "Pedágio" ou "Pedágios", sem diferença de caixa,
 * acento ou espaço (a chave do de-para da DRE). Nome com mais alguma coisa —
 * "Vale-pedágio", "Pedágio - Sem Parar" — não casa: não foi o que o pedido
 * disse, e sai no relatório como "parecida" para alguém decidir.
 */
export function ehPedagio(nome: string): boolean {
  const k = chaveDaCategoria(nome);
  return k === "pedagio" || k === "pedagios";
}

/** Fala de pedágio, mas não é esta categoria. Não muda; sai no relatório. */
export function pareceComPedagio(nome: string): boolean {
  return !ehPedagio(nome) && chaveDaCategoria(nome).includes("pedag");
}

export const PEDAGIO_NAS_ADMINISTRATIVAS: CorrecaoDaLinha = {
  de: "cmv",
  para: "administrativas",
  ehDaCategoria: ehPedagio,
  pareceComACategoria: pareceComPedagio,
  motivo: "pedágio é despesa fixa administrativa, não CMV (pedido de 15/10/2026)",
};
