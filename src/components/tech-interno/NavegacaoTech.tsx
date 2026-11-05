import { Columns3, History, List, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AbasDeLink } from "@/components/ui/AbasDeLink";

// Lista, Kanban e Histórico nas abas do app, como no Ops Center (05/11/2026).
// Antes Lista e Kanban ficavam num seletor e o Histórico num botão do topo.
export type VisaoTech = "lista" | "kanban" | "historico";
export function VisoesDoControle({ ativa, href }: { ativa: VisaoTech; href: (visao: VisaoTech) => string }) {
  return (
    <AbasDeLink
      aria-label="Visão do Controle interno"
      ativa={ativa}
      abas={[
        { chave: "lista", rotulo: "Lista", icone: <List />, href: href("lista") },
        { chave: "kanban", rotulo: "Kanban", icone: <Columns3 />, href: href("kanban") },
        { chave: "historico", rotulo: "Histórico", icone: <History />, href: href("historico") },
      ]}
    />
  );
}

export function AcoesDoControle({ podeEditar, novoHref }: { podeEditar: boolean; novoHref: string }) {
  if (!podeEditar) return null;
  return (
    <Button href={novoHref}>
      <Plus size={14} aria-hidden />
      Novo item
    </Button>
  );
}
