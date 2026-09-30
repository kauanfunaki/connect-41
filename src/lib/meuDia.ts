// As contas do Meu dia (30/09) — a tela /tarefas virou a primeira do
// expediente, pedido do Kauan: "como a tela de gestão que mede todos os
// processos rodando no momento, mas numa escala reduzida para o funcionário
// (coordenadores também)".
//
// Por isso ela lê os mesmos itens de trabalho da Gestão, com a mesma
// classificação (`classificar`), recortados para a pessoa (ou para o time do
// coordenador). Aqui só se separa em blocos e se conta — puro, testado.

import { ordemDeAtencao, precisaDeAtencao, type Classificacao, type ItemDeTrabalho } from "@/lib/gestao/regras";

type Item = { item: ItemDeTrabalho; c: Classificacao };

export type ResumoDoDia = {
  atrasados: number;
  vencendo: number;
  parados: number;
  andamento: number;
  aComecar: number;
  concluidosNaSemana: number;
};

const SEMANA = 7 * 24 * 60 * 60 * 1000;

function aberto(x: Item): boolean {
  return x.c.coluna !== "CONCLUIDO";
}

export function resumirDia(itens: Item[], agora: Date): ResumoDoDia {
  const r: ResumoDoDia = { atrasados: 0, vencendo: 0, parados: 0, andamento: 0, aComecar: 0, concluidosNaSemana: 0 };
  for (const x of itens) {
    if (!aberto(x)) {
      if (x.item.concluidoEm && agora.getTime() - x.item.concluidoEm.getTime() <= SEMANA) r.concluidosNaSemana++;
      continue;
    }
    if (x.c.prazo?.situacao === "VENCIDO") r.atrasados++;
    else if (x.c.prazo?.situacao === "VENCENDO") r.vencendo++;
    if (x.c.coluna === "PARADO") r.parados++;
    else if (x.c.coluna === "ANDAMENTO") r.andamento++;
    else if (x.c.coluna === "INICIADO") r.aComecar++;
  }
  return r;
}

/** O que pede a pessoa agora: prazo vencido ou vencendo, ou parado além do limite. */
export function pedeAgora(itens: Item[]): Item[] {
  return itens.filter((x) => aberto(x) && precisaDeAtencao(x.c)).sort(ordemDeAtencao);
}

/** Andando sem alerta — o mais recente primeiro, que é onde a pessoa estava. */
export function andando(itens: Item[]): Item[] {
  return itens
    .filter((x) => aberto(x) && !precisaDeAtencao(x.c) && x.c.coluna === "ANDAMENTO")
    .sort((a, b) => b.item.ultimaMovimentacao.getTime() - a.item.ultimaMovimentacao.getTime());
}

/** Na fila para começar (e os parados de propósito, esperando alguém) — prazo mais perto primeiro. */
export function paraComecar(itens: Item[]): Item[] {
  const prazo = (x: Item) => x.item.prazo?.getTime() ?? Number.POSITIVE_INFINITY;
  return itens
    .filter((x) => aberto(x) && !precisaDeAtencao(x.c) && x.c.coluna !== "ANDAMENTO")
    .sort((a, b) => prazo(a) - prazo(b) || a.item.ultimaMovimentacao.getTime() - b.item.ultimaMovimentacao.getTime());
}
