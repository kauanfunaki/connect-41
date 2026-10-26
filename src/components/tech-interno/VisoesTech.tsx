"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ClipboardList } from "lucide-react";
import { mudarSituacaoTech } from "@/app/(app)/tech/controle-interno/actions";
import { SITUACOES, TIPOS, PRIORIDADES, EM_ABERTO, ROTA_TECH_INTERNO, comVolta } from "@/lib/tech-interno/regras";
import { intervaloMes } from "@/lib/tech-interno/agenda";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { formatCalendarDate } from "@/lib/format";

export type ItemVisualTech = {
  id: string; title: string; status: keyof typeof SITUACOES; type: keyof typeof TIPOS;
  priority: number; dueDate: string | null; version: number; assignee: string | null; system: string;
};
export function VisoesTech({ items, view, month, today, canEdit, voltar = ROTA_TECH_INTERNO }: { items: ItemVisualTech[]; view: "kanban" | "agenda"; month: string; today: string; canEdit: boolean; voltar?: string }) {
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
  function card(item: ItemVisualTech, editable = false) {
    const late = item.dueDate && item.dueDate < today && (EM_ABERTO as readonly string[]).includes(item.status);
    return <article key={item.id} draggable={editable && canEdit && !pending} onDragStart={e => e.dataTransfer.setData("text/plain", item.id)} className="rounded-md border border-border bg-surface p-3 space-y-2 min-w-0">
      <Link href={comVolta(`${ROTA_TECH_INTERNO}/${item.id}`, voltar)} className="block font-medium text-fg hover:text-brand break-words">{item.title}</Link>
      <p className="text-helper text-fg-secondary">{TIPOS[item.type]} · {PRIORIDADES[item.priority]}</p>
      <p className="text-helper text-fg-muted break-words">{item.system} · {item.assignee ?? "Sem responsável"}</p>
      <p className={`text-helper ${late ? "text-danger font-medium" : "text-fg-muted"}`}>{item.dueDate ? `${item.dueDate.split("-").reverse().join("/")}${late ? " · Atrasado" : ""}` : "Sem prazo"}</p>
      {editable && canEdit && <label className="block text-helper text-fg-secondary">Situação<Select aria-label={`Situação de ${item.title}`} disabled={pending} value={item.status} onChange={e => move(item, e.target.value)} className="mt-1 w-full">{Object.entries(SITUACOES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</Select></label>}
    </article>;
  }
  const calendar = intervaloMes(month);
  const days = Array.from({ length: calendar.dias }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const dated = new Map(days.map(day => [day, items.filter(item => item.dueDate === day)]));
  const undated = items.filter(item => !item.dueDate);
  const dataLegivel = (day: string) => formatCalendarDate(new Date(day), { day: "numeric", month: "long", year: "numeric" });
  if (view === "kanban" && !items.length) return <EmptyState icon={<ClipboardList />} title="Nenhum item neste recorte" description="Cadastre uma pendência ou ajuste os filtros para encontrar outros itens."
    action={canEdit ? <Button href={comVolta(`${ROTA_TECH_INTERNO}/novo`, voltar)}>Novo item</Button> : undefined} />;
  return <div className="space-y-4 p-4" aria-busy={pending}>
    {view === "kanban" ? <div className="flex gap-4 overflow-x-auto pb-3" aria-label="Kanban do Tech">{Object.entries(SITUACOES).map(([status, label]) => {
      const column = items.filter(item => item.status === status);
      return <section key={status} aria-label={label} className="w-72 shrink-0 rounded-lg bg-surface-2 p-3 space-y-3" onDragOver={e => { if (canEdit && !pending) e.preventDefault(); }} onDrop={e => { e.preventDefault(); const item = items.find(i => i.id === e.dataTransfer.getData("text/plain")); if (item) move(item, status); }}>
        <h2 className="font-semibold text-ui text-fg">{label} <span className="text-fg-muted">({column.length})</span></h2>{column.map(item => card(item, true))}{!column.length && <p className="text-helper text-fg-muted">Nenhum item</p>}
      </section>;
    })}</div> : <>
      <div className="hidden md:block overflow-x-auto"><div className="grid grid-cols-7 min-w-[840px] gap-2" aria-label="Agenda mensal por prazo">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(day => <div key={day} className="text-helper text-fg-muted font-medium p-2">{day}</div>)}
        {Array.from({ length: calendar.semana }, (_, i) => <div key={`vazio-${i}`} />)}
        {days.map(day => <section key={day} aria-label={dataLegivel(day)} className={`min-h-28 rounded-md p-2 space-y-2 border ${day === today ? "border-brand bg-brand-subtle" : "border-border bg-surface-2"}`}><h2 className="text-helper font-semibold text-fg">{Number(day.slice(-2))}</h2>{dated.get(day)!.map(item => card(item))}</section>)}
      </div></div>
      <div className="space-y-4 md:hidden">{days.filter(day => dated.get(day)!.length).map(day => <section key={day}><h2 className="font-semibold text-ui text-fg mb-2">{day.split("-").reverse().join("/")}</h2><div className="space-y-2">{dated.get(day)!.map(item => card(item))}</div></section>)}</div>
      {!items.some(i => i.dueDate) && <p className="text-helper text-fg-muted">Nenhum prazo neste mês e neste recorte.</p>}
      <section aria-label="Itens sem prazo"><h2 className="font-semibold text-fg mb-3">Sem prazo ({undated.length})</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{undated.map(item => card(item))}</div>{!undated.length && <p className="text-helper text-fg-muted">Nenhum item sem prazo neste recorte.</p>}</section>
    </>}
  </div>;
}
