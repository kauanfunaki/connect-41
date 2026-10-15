// "Impostos Retidos Serviços Tomados (PIS/COFINS/CSLL/IRRF)" sai dos impostos
// sobre a receita e vai para o CMV — pedido do Kauan, 14/10/2026: "ela não pode
// ficar junto com os impostos sobre a receita; ela fica junto com as categorias
// CMV SOBRE RECEITA BRUTA".
//
// O plano padrão (`planoPadrao.ts`) e o de-para do Omie (`mapeamento-padrao.ts`)
// já nascem com `cmv`. Isto é o nome que a correção do que já está no banco
// procura; a regra da correção é a comum (`correcaoDaLinha.ts`), e quem a
// aplica é o script `scripts/dre-impostos-retidos-para-cmv.ts`.

import { chaveDaCategoria } from "@/lib/dre/calculo";
import type { CorrecaoDaLinha } from "@/lib/dre/correcaoDaLinha";

const BASE = "impostos retidos servicos tomados";
const SIGLAS = new Set(["pis", "cofins", "csll", "cssl", "irrf"]);

/**
 * O nome é desta categoria? Ignora caixa, acento e espaço (a chave do de-para
 * da DRE), com ou sem as siglas no fim: "Impostos Retidos Serviços Tomados",
 * "… (PIS/COFINS/CSLL/IRRF)", "… - PIS/COFINS".
 *
 * Sigla que não é destes quatro impostos (ISS, INSS) não casa: imposto retido
 * de outro tipo não foi o que o pedido disse, e sai no relatório como
 * "parecida" para alguém decidir.
 */
export function ehImpostosRetidosServicosTomados(nome: string): boolean {
  const k = chaveDaCategoria(nome);
  if (k === BASE) return true;
  if (!k.startsWith(BASE)) return false;
  const resto = k.slice(BASE.length);
  if (/^[a-z0-9]/.test(resto)) return false; // "tomadosx" é outra palavra
  const siglas = resto.split(/[^a-z]+/).filter(Boolean);
  return siglas.length > 0 && siglas.every((s) => SIGLAS.has(s));
}

/**
 * Parece imposto retido, mas não é esta categoria — "ISS Retido", "Retenção de
 * INSS". Não muda; sai no relatório para ninguém achar que foi esquecida.
 */
export function pareceImpostoRetido(nome: string): boolean {
  if (ehImpostosRetidosServicosTomados(nome)) return false;
  return /retid|retenc/.test(chaveDaCategoria(nome));
}

export const IMPOSTOS_RETIDOS_NO_CMV: CorrecaoDaLinha = {
  de: "impostos",
  para: "cmv",
  ehDaCategoria: ehImpostosRetidosServicosTomados,
  pareceComACategoria: pareceImpostoRetido,
  motivo: "imposto retido de serviço tomado fica no CMV, não nos impostos sobre a receita (pedido de 14/10/2026)",
};
