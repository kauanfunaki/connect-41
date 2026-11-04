"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ClipboardList } from "lucide-react";
import { mudarSituacaoTech } from "@/app/(app)/controle-interno/actions";
import { SITUACOES, TIPOS, PRIORIDADES, EM_ABERTO, ROTA_TECH_INTERNO, LINK_DO_ITEM, comVolta } from "@/lib/tech-interno/regras";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { CORES_DA_SITUACAO, CORES_DO_TIPO } from "@/lib/tech-interno/cores";
import { SituacaoTech } from "./SituacaoTech";

export type ItemVisualTech = {
  id: string; title: string; status: keyof typeof SITUACOES; type: keyof typeof TIPOS;
  priority: number; dueDate: string | null; version: number; assignee: string | null; system: string;
};
/**
 * O Kanban do controle interno. Na tela inteira e sem rolagem de lado desde o
 * lote C dos ajustes de 03/11/2026: as cinco colunas dividem a largura, e cada
 * uma rola por dentro. No celular, as colunas voltam a ficar lado a lado, com
 * rolagem. A agenda que morava aqui saiu para a Agenda geral.
 */
export function VisoesTech({ items, today, canEdit, voltar = ROTA_TECH_INTERNO }: { items: ItemVisualTech[]; today: string; canEdit: boolean; voltar?: string }) {
  const router = useRouter(), [pending, startTransition] = useTransition(), toast = useToast();
  function move(item: ItemVisualTech, status: string) {
    if (!canEdit || pending || item.status === status) return;
    startTransition(async () => {
      try {
        const result = await mudarSituacaoTech(item.id, status, item.version);
        if ("error" in result) { toast.error(result.error); return; }
        toast.success("Situação atualizada."); router.refresh();
      } catch { toast.error("Não foi possível confirmar a mudança. Atualize a página antes de tentar novamente."); }
    });
  }
  function card(item: ItemVisualTech) {
    const late = item.dueDate && item.dueDate < today && (EM_ABERTO as readonly string[]).includes(item.status), cor = CORES_DO_TIPO[item.type];
    // A cor do tipo na borda e no fundo distingue os cartões de relance (26/10/2026).
    return <article key={item.id} draggable={canEdit && !pending} onDragStart={e => e.dataTransfer.setData("text/plain", item.id)} className="relative rounded-md border border-l-4 p-3 space-y-2 min-w-0 cursor-pointer transition-[filter] hover:brightness-[.98]"
      style={{ borderColor: `color-mix(in srgb, ${cor} 28%, var(--c41-border))`, borderLeftColor: cor, backgroundColor: `color-mix(in srgb, ${cor} 7%, var(--c41-surface))` }}>
      <p className="text-helper font-semibold" style={{ color: cor }}>{TIPOS[item.type]} <span className="font-normal text-fg-secondary">· {PRIORIDADES[item.priority]}</span></p>
      <Link href={comVolta(`${ROTA_TECH_INTERNO}/${item.id}`, voltar)} draggable={false} className={`block font-medium text-fg hover:text-brand break-words ${LINK_DO_ITEM}`}>{item.title}</Link>
      <p className="text-helper text-fg-muted break-words">{item.system} · {item.assignee ?? "Sem responsável"}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SituacaoTech key={`${item.id}:${item.version}`} forma="selo" id={item.id} titulo={item.title} status={item.status} version={item.version} podeEditar={canEdit} />
        <span className={`text-helper ${late ? "text-danger font-medium" : "text-fg-muted"}`}>{item.dueDate ? `${item.dueDate.split("-").reverse().join("/")}${late ? " · Atrasado" : ""}` : "Sem prazo"}</span>
      </div>
    </article>;
  }
  const legenda = <ul aria-label="Cores por tipo" className="flex flex-wrap gap-x-4 gap-y-1 text-helper text-fg-secondary">{Object.entries(TIPOS).map(([tipo, label]) => <li key={tipo} className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: CORES_DO_TIPO[tipo as keyof typeof TIPOS] }} />{label}</li>)}</ul>;
  if (!items.length) return <EmptyState icon={<ClipboardList />} title="Nenhum item neste recorte" description="Cadastre uma pendência ou ajuste os filtros para encontrar outros itens."
    action={canEdit ? <Button href={comVolta(`${ROTA_TECH_INTERNO}/novo`, voltar)}>Novo item</Button> : undefined} />;
  const situacoes = Object.entries(SITUACOES) as [keyof typeof SITUACOES, string][];
  return <div className="flex h-full min-h-0 flex-col gap-3 p-4" aria-busy={pending}>
    {legenda}
    <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto md:grid md:overflow-visible" style={{ gridTemplateColumns: `repeat(${situacoes.length}, minmax(0, 1fr))` }} aria-label="Kanban do Tech">
      {situacoes.map(([status, label]) => {
        const column = items.filter(item => item.status === status);
        return <section key={status} aria-label={label} className="flex min-h-0 w-72 shrink-0 flex-col rounded-lg border-t-4 bg-surface-2 md:w-auto" style={{ borderTopColor: CORES_DA_SITUACAO[status].fundo }}
          onDragOver={e => { if (canEdit && !pending) e.preventDefault(); }} onDrop={e => { e.preventDefault(); const item = items.find(i => i.id === e.dataTransfer.getData("text/plain")); if (item) move(item, status); }}>
          <h2 className="flex shrink-0 items-center gap-2 px-3 pt-3 pb-2 font-semibold text-ui text-fg"><span aria-hidden className="size-3 rounded-sm" style={{ backgroundColor: CORES_DA_SITUACAO[status].fundo }} />{label} <span className="text-fg-muted">({column.length})</span></h2>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-3">{column.map(item => card(item))}{!column.length && <p className="text-helper text-fg-muted">Nenhum item</p>}</div>
        </section>;
      })}
    </div>
  </div>;
}
