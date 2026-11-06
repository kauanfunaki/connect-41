"use client";

import { CheckSquare, ListTree, Link2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { abrirSecaoDoDetalhe } from "@/components/kanban/DetailSection";

export type AtalhoDoDetalhe = "subatividades" | "relacionadas" | "checklist" | "anexos";

const ATALHOS: { id: AtalhoDoDetalhe; rotulo: string; Icone: typeof CheckSquare }[] = [
  { id: "subatividades", rotulo: "Subatividade", Icone: ListTree },
  { id: "relacionadas", rotulo: "Vínculo", Icone: Link2 },
  { id: "checklist", rotulo: "Checklist", Icone: CheckSquare },
  { id: "anexos", rotulo: "Anexo", Icone: Paperclip },
];

/**
 * O id da seção no detalhe — o `KanbanItemDetail` (servidor) escreve o mesmo
 * "secao-…" na `DetailSection`; função de arquivo de cliente não roda lá.
 */
function idDaSecao(atalho: AtalhoDoDetalhe): string {
  return `secao-${atalho}`;
}

/**
 * Os atalhos embaixo da descrição (05/11/2026, como no ClickUp): "+ Subatividade",
 * "+ Vínculo", "+ Checklist" e "+ Anexo" abrem a seção certa e põem o foco no
 * campo dela — as seções começam fechadas, e sem isto a tarefa recém-criada
 * não dizia por onde começar.
 */
export function AtalhosDoDetalhe({ atalhos }: { atalhos: AtalhoDoDetalhe[] }) {
  const visiveis = ATALHOS.filter((a) => atalhos.includes(a.id));
  if (visiveis.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Adicionar à atividade">
      {visiveis.map(({ id, rotulo, Icone }) => (
        <Button key={id} type="button" variant="ghost" size="xs" onClick={() => abrirSecaoDoDetalhe(idDaSecao(id))} aria-controls={idDaSecao(id)}>
          <Icone size={12} aria-hidden /> {rotulo}
        </Button>
      ))}
    </div>
  );
}
