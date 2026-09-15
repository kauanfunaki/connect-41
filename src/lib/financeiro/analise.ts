// A aba de análise de contas a pagar e a receber: faixas de atraso e ranking
// de contrapartes. Funções puras, sobre as linhas que `listarContas` já monta.
//
// A análise mora como aba de `/pagar` e `/receber`, e não como tela própria:
// as duas telas continuam donas das contas. Análise que vive longe da lista é
// análise que diverge dela no primeiro filtro novo.

import { diasEntre } from "./periodo";
import type { SituacaoDaConta } from "./contas";

export const FAIXAS_DE_ATRASO = [
  { chave: "a_vencer", rotulo: "A vencer" },
  { chave: "d1_15", rotulo: "1 a 15 dias" },
  { chave: "d16_30", rotulo: "16 a 30 dias" },
  { chave: "d31_60", rotulo: "31 a 60 dias" },
  { chave: "d61_90", rotulo: "61 a 90 dias" },
  { chave: "acima_90", rotulo: "Mais de 90 dias" },
] as const;

export type ChaveDaFaixa = (typeof FAIXAS_DE_ATRASO)[number]["chave"];

/**
 * Em que faixa uma conta em aberto está.
 *
 * "Vence hoje" fica em **a vencer**: ainda não custou multa. É a mesma leitura
 * de `situacaoDaConta`, que separa vencida de vence-hoje pelo mesmo motivo.
 */
export function faixaDoAtraso(vencimentoKey: string, hojeKey: string): ChaveDaFaixa {
  const dias = diasEntre(vencimentoKey, hojeKey);
  if (dias <= 0) return "a_vencer";
  if (dias <= 15) return "d1_15";
  if (dias <= 30) return "d16_30";
  if (dias <= 60) return "d31_60";
  if (dias <= 90) return "d61_90";
  return "acima_90";
}

export type ContaParaAnalise = {
  situacao: SituacaoDaConta;
  valorCentavos: number;
  vencimentoKey: string;
  contraparteNome: string;
};

export type FaixaCalculada = { chave: ChaveDaFaixa; rotulo: string; centavos: number; quantidade: number };

/**
 * Soma o que está em aberto por faixa.
 *
 * Paga e cancelada ficam de fora pela situação, não pelo status: é a mesma
 * régua da lista, e a soma das faixas tem de bater com o "Em aberto" do topo.
 */
export function faixasDeAtraso(contas: ContaParaAnalise[], hojeKey: string): FaixaCalculada[] {
  const faixas = FAIXAS_DE_ATRASO.map((f) => ({ chave: f.chave, rotulo: f.rotulo, centavos: 0, quantidade: 0 }));
  const porChave = new Map(faixas.map((f) => [f.chave, f]));
  for (const c of contas) {
    if (c.situacao === "PAGA" || c.situacao === "CANCELADA") continue;
    const f = porChave.get(faixaDoAtraso(c.vencimentoKey, hojeKey))!;
    f.centavos += c.valorCentavos;
    f.quantidade += 1;
  }
  return faixas;
}

export type PosicaoNoRanking = {
  contraparteNome: string;
  emAberto: number;
  vencido: number;
  quantidade: number;
  /** Fração de 0 a 1 do total em aberto. */
  participacao: number;
};

/**
 * Quem concentra o que está em aberto, do maior para o menor.
 *
 * Agrupa por **nome**, não por id: a linha que a tela recebe já vem sem id de
 * contraparte, e duas fichas com o mesmo nome são, para quem lê o ranking, o
 * mesmo fornecedor.
 */
export function rankingDeContrapartes(contas: ContaParaAnalise[], limite = 10): PosicaoNoRanking[] {
  const porNome = new Map<string, { emAberto: number; vencido: number; quantidade: number }>();
  let total = 0;
  for (const c of contas) {
    if (c.situacao === "PAGA" || c.situacao === "CANCELADA") continue;
    const atual = porNome.get(c.contraparteNome) ?? { emAberto: 0, vencido: 0, quantidade: 0 };
    atual.emAberto += c.valorCentavos;
    if (c.situacao === "VENCIDA") atual.vencido += c.valorCentavos;
    atual.quantidade += 1;
    porNome.set(c.contraparteNome, atual);
    total += c.valorCentavos;
  }
  return [...porNome.entries()]
    .map(([contraparteNome, v]) => ({
      contraparteNome,
      ...v,
      participacao: total === 0 ? 0 : v.emAberto / total,
    }))
    .sort((a, b) => b.emAberto - a.emAberto || a.contraparteNome.localeCompare(b.contraparteNome))
    .slice(0, limite);
}
