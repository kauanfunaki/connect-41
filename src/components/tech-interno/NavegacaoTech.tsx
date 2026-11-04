import { CalendarDays, Columns3, History, List, Plus, Server } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

// Lista e Kanban num seletor, como em Quadros (lote C dos ajustes de
// 03/11/2026). Eram quatro abas: a Agenda saiu para a Agenda geral (os prazos
// dos itens aparecem lá, no setor do Tech) e o Histórico, para a Auditoria —
// as ações do controle interno já iam para a trilha, na área "Tech".
export type VisaoTech = "lista" | "kanban";
export function VisoesDoControle({ ativa, href }: { ativa: VisaoTech; href: (visao: VisaoTech) => string }) {
  return (
    <SegmentedControl
      label="Visão do Controle interno"
      active={ativa}
      items={[
        { key: "lista", label: "Lista", icon: <List size={14} aria-hidden />, href: href("lista") },
        { key: "kanban", label: "Kanban", icon: <Columns3 size={14} aria-hidden />, href: href("kanban") },
      ]}
    />
  );
}

export function AcoesDoControle({
  podeEditar,
  podeGerirOps,
  novoHref,
  agendaHref,
  historicoHref,
}: {
  podeEditar: boolean;
  podeGerirOps: boolean;
  novoHref: string;
  /** A Agenda geral filtrada no setor do Tech. */
  agendaHref: string;
  /** A Auditoria na área Tech; nulo para quem não abre a Auditoria. */
  historicoHref: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button href={agendaHref} variant="secondary">
        <CalendarDays size={14} aria-hidden />
        Prazos na Agenda
      </Button>
      {historicoHref && (
        <Button href={historicoHref} variant="secondary">
          <History size={14} aria-hidden />
          Histórico
        </Button>
      )}
      {/* Os sistemas são os do Ops Center (29/10/2026): o cadastro fica lá. */}
      {podeGerirOps && (
        <Button href="/ops?view=sites" variant="secondary">
          <Server size={14} aria-hidden />
          Sistemas no Ops Center
        </Button>
      )}
      {podeEditar && (
        <Button href={novoHref}>
          <Plus size={14} aria-hidden />
          Novo item
        </Button>
      )}
    </div>
  );
}
