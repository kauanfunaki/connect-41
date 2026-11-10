// Excluir a tarefa com as atividades dentro (10/11/2026).
//
// Até aqui `excluirLista` recusava a tarefa que tivesse atividade ("Exclua as N
// atividades desta tarefa antes de excluí-la"), e quem queria se livrar de uma
// tarefa cheia apagava atividade por atividade. Agora a tarefa sai com tudo o
// que tem dentro — atividades, subatividades de todos os níveis, comentários,
// histórico, horas e anexos (`apagarTarefaComAtividades`, em
// `exclusaoDeAtividade.ts`). Por ser exclusão em massa, a confirmação diz os
// números e pede o nome da tarefa digitado, que a action confere de novo.
//
// Puro, sem banco: a tabela de tarefas (servidor) e o menu de excluir
// (cliente) importam daqui.

import { formatarNumero } from "@/lib/format";

export type ConteudoDaTarefa = { atividades: number; subatividades: number };

/**
 * Quantas atividades (as de cima, sem pai) e quantas subatividades (todos os
 * níveis abaixo delas) a tarefa tem, pela lista plana dos itens dela.
 */
export function contarArvoreDaTarefa(itens: readonly { parentItemId: string | null }[]): ConteudoDaTarefa {
  const atividades = itens.filter((i) => i.parentItemId === null).length;
  return { atividades, subatividades: itens.length - atividades };
}

export function tarefaTemConteudo(c: ConteudoDaTarefa): boolean {
  return c.atividades + c.subatividades > 0;
}

const n = (v: number) => formatarNumero(v, 0);

/**
 * A frase do que vai junto: "Vão junto as 12 atividades desta tarefa e as 30
 * subatividades dentro delas, de todos os níveis, com os comentários, os
 * anexos e o histórico." Sem o "não pode ser desfeita" — a janela diz isso
 * embaixo do campo do nome.
 */
export function oQueVaiJuntoDaTarefa({ atividades, subatividades }: ConteudoDaTarefa): string {
  const deCima = atividades === 1 ? "a atividade desta tarefa" : `as ${n(atividades)} atividades desta tarefa`;
  const dentro = atividades === 1 ? "dentro dela" : "dentro delas";
  const abaixo =
    subatividades === 0
      ? ""
      : subatividades === 1
        ? ` e a subatividade ${dentro}`
        : ` e as ${n(subatividades)} subatividades ${dentro}, de todos os níveis`;
  const verbo = atividades === 1 && subatividades === 0 ? "Vai" : "Vão";
  return `${verbo} junto ${deCima}${abaixo}, com os comentários, os anexos e o histórico.`;
}

export type ConfirmacaoDaTarefa = { titulo: string; descricao: string; rotuloDoBotao: string };

/**
 * A janela forte da tarefa com conteúdo: o nome no título, os números na
 * frase. Tarefa vazia devolve `null` e fica com a confirmação simples.
 */
export function confirmacaoDaExclusaoDaTarefa(nome: string, conteudo: ConteudoDaTarefa): ConfirmacaoDaTarefa | null {
  if (!tarefaTemConteudo(conteudo)) return null;
  return {
    titulo: `Excluir a tarefa "${nome}" com tudo o que tem dentro?`,
    descricao: oQueVaiJuntoDaTarefa(conteudo),
    rotuloDoBotao: "Excluir tarefa e atividades",
  };
}

/** A recusa da action quando o nome digitado não confere. */
export const NOME_DA_TAREFA_NAO_CONFERE = "O nome digitado não confere com o da tarefa. Nada foi apagado.";

/**
 * A recusa quando o nome nem veio: a tela abriu a confirmação simples (a
 * tarefa estava vazia) e alguém criou atividade nela no meio do caminho.
 */
export const TAREFA_GANHOU_ATIVIDADES =
  "Esta tarefa tem atividades dentro. Recarregue a página para ver quantas vão junto e confirmar com o nome da tarefa. Nada foi apagado.";
