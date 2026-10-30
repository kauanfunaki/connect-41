import { CalendarDays, History, List, Plus, Server, SquareKanban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

// O Histórico é uma visão do módulo, ao lado de Lista, Kanban e Agenda
// (29/10/2026): fica onde a pessoa já troca de visão, com o ícone de cada uma.
export type VisaoTech = "lista" | "kanban" | "agenda" | "historico";
export function VisoesDoControle({ ativa, href }: { ativa: VisaoTech; href: (visao: VisaoTech) => string }) {
  return <SegmentedControl label="Visualização do Controle interno" active={ativa} items={[
    { key: "lista", label: "Lista", icon: <List size={14} aria-hidden />, href: href("lista") },
    { key: "kanban", label: "Kanban", icon: <SquareKanban size={14} aria-hidden />, href: href("kanban") },
    { key: "agenda", label: "Agenda", icon: <CalendarDays size={14} aria-hidden />, href: href("agenda") },
    { key: "historico", label: "Histórico", icon: <History size={14} aria-hidden />, title: "Quem mudou o quê, e quando", href: href("historico") },
  ]} />;
}

export function AcoesDoControle({ podeEditar, podeGerirOps, novoHref }: { podeEditar: boolean; podeGerirOps: boolean; novoHref: string }) {
  return <div className="flex flex-wrap gap-2">
    {/* Os sistemas são os do Ops Center (29/10/2026): o cadastro fica lá. */}
    {podeGerirOps && <Button href="/ops?view=sites" variant="secondary"><Server size={14} aria-hidden />Sistemas no Ops Center</Button>}
    {podeEditar && <Button href={novoHref}><Plus size={14} aria-hidden />Novo item</Button>}
  </div>;
}
