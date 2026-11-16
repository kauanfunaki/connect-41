import { CalendarRange, Columns3, History, List, PackageCheck, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { ROTA_TECH_INTERNO } from "@/lib/tech-interno/regras";

// Lista, Kanban e Histórico nas abas do app, como no Ops Center (05/11/2026).
// Antes Lista e Kanban ficavam num seletor e o Histórico num botão do topo.
// Entregas é a quarta visão (16/11/2026, melhoria-706): era a tela "Entregas
// da Tech" do menu do Tech, redundante com o Controle interno.
export type VisaoTech = "lista" | "kanban" | "historico" | "entregas";

/** As visões que têm endereço próprio, sem os filtros da lista (Histórico e Entregas). */
export function enderecoDaVisao(visao: string): string | null {
  return visao === "historico" || visao === "entregas" ? `${ROTA_TECH_INTERNO}/${visao}` : null;
}

export function VisoesDoControle({ ativa, href }: { ativa: VisaoTech; href: (visao: VisaoTech) => string }) {
  return (
    <AbasDeLink
      aria-label="Visão do Controle interno"
      ativa={ativa}
      abas={[
        { chave: "lista", rotulo: "Lista", icone: <List />, href: href("lista") },
        { chave: "kanban", rotulo: "Kanban", icone: <Columns3 />, href: href("kanban") },
        { chave: "historico", rotulo: "Histórico", icone: <History />, href: href("historico") },
        { chave: "entregas", rotulo: "Entregas", icone: <PackageCheck />, href: href("entregas") },
      ]}
    />
  );
}

// "Resumo" (06/11/2026): o que foi concluído, está em andamento e está
// planejado no período. Para todos que veem o Controle interno; "Novo item",
// só para quem edita. `antes` é o atalho de uma visão (a Produtividade, nas
// Entregas): entra na frente, para Resumo e Novo item não mudarem de lugar.
export function AcoesDoControle({ podeEditar, novoHref, antes }: { podeEditar: boolean; novoHref: string; antes?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2">
      {antes}
      <Button href="/controle-interno/resumo" variant="secondary">
        <CalendarRange size={14} aria-hidden />
        Resumo
      </Button>
      {podeEditar && (
        <Button href={novoHref}>
          <Plus size={14} aria-hidden />
          Novo item
        </Button>
      )}
    </div>
  );
}
