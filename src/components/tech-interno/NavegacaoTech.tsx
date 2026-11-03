import { CalendarDays, History, List, Plus, Server, SquareKanban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AbasDeLink } from "@/components/ui/AbasDeLink";

// O Histórico é uma visão do módulo, ao lado de Lista, Kanban e Agenda
// (29/10/2026): fica onde a pessoa já troca de visão, com o ícone de cada uma.
// Nas abas do app (`AbasDeLink`, 03/11/2026), como GitHub e Chamados, no
// lugar das pílulas: aba troca a tela, pílula parecia filtro.
export type VisaoTech = "lista" | "kanban" | "agenda" | "historico";
export function VisoesDoControle({ ativa, href }: { ativa: VisaoTech; href: (visao: VisaoTech) => string }) {
  return <AbasDeLink aria-label="Visualização do Controle interno" ativa={ativa} abas={[
    { chave: "lista", rotulo: "Lista", icone: <List size={14} aria-hidden />, href: href("lista") },
    { chave: "kanban", rotulo: "Kanban", icone: <SquareKanban size={14} aria-hidden />, href: href("kanban") },
    { chave: "agenda", rotulo: "Agenda", icone: <CalendarDays size={14} aria-hidden />, href: href("agenda") },
    { chave: "historico", rotulo: "Histórico", icone: <History size={14} aria-hidden />, href: href("historico") },
  ]} />;
}

export function AcoesDoControle({ podeEditar, podeGerirOps, novoHref }: { podeEditar: boolean; podeGerirOps: boolean; novoHref: string }) {
  return <div className="flex flex-wrap gap-2">
    {/* Os sistemas são os do Ops Center (29/10/2026): o cadastro fica lá. */}
    {podeGerirOps && <Button href="/ops?view=sites" variant="secondary"><Server size={14} aria-hidden />Sistemas no Ops Center</Button>}
    {podeEditar && <Button href={novoHref}><Plus size={14} aria-hidden />Novo item</Button>}
  </div>;
}
