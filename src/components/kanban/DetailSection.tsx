"use client";

import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";

type Props = {
  title: string;
  /** Resumo curto à direita do título — ex.: "3", "0/7". */
  summary?: React.ReactNode;
  /** Começa aberta. Padrão é fechada, inclusive com conteúdo. */
  defaultOpen?: boolean;
  children: React.ReactNode;
};

// Seção colapsável do rodapé do detalhamento de tarefa (Subtarefas, Tarefas
// relacionadas, Checklist, Anexos, Horas apontadas).
//
// Fecha por padrão MESMO com conteúdo — as quatro seções abertas ao mesmo
// tempo empurravam a descrição e os campos da tarefa pra fora da tela, e na
// maior parte das vezes o que se quer ver ao abrir uma tarefa é o topo. O
// resumo no cabeçalho é o que evita que fechado vire "escondido".
//
// No desenho aprovado da lista longa (15/10/2026): o `BlocoRecolhivel`, com o
// resumo encostado à direita da linha. Era um abre-e-fecha escrito aqui, sem
// borda, com a contagem colada ao título.
export function DetailSection({ title, summary, defaultOpen = false, children }: Props) {
  return (
    <BlocoRecolhivel titulo={title} resumo={summary} abertoInicial={defaultOpen} classeDoConteudo="px-4 pb-4">
      {children}
    </BlocoRecolhivel>
  );
}
