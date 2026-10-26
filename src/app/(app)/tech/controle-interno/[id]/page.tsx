import { notFound } from "next/navigation";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { MODULO_TECH_INTERNO, destinoDeVolta, type Alteracao } from "@/lib/tech-interno/regras";
import { detalheItem, opcoesTech } from "@/lib/tech-interno/servidor";
import { FormularioItem, FormularioComentario } from "@/components/tech-interno/FormularioItem";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatInstantDateTime, formatCalendarDate } from "@/lib/format";

export default async function DetalheTechPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO), { id } = await params, voltar = destinoDeVolta((await searchParams).voltar);
  const [item, opcoes, podeEditar] = await Promise.all([detalheItem(ctx, id), opcoesTech(ctx), podeNoModulo(ctx, MODULO_TECH_INTERNO, "agir")]);
  if (!item) notFound();
  const eventos = [
    ...item.comments.map(c => ({ id: c.id, createdAt: c.createdAt, authorName: c.authorName, body: c.body, changes: null, version: null })),
    ...item.changes.map(c => ({ id: c.id, createdAt: c.createdAt, authorName: c.authorName, body: null, changes: c.changes as unknown as Alteracao[], version: c.version })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (b.version ?? -1) - (a.version ?? -1));
  const valor = (campo: string, texto: string | null) => !texto ? "Não informado" : campo === "Prazo" ? formatCalendarDate(new Date(texto)) : texto;
  return <PageContainer><PageHeader title={<span className="break-words [overflow-wrap:anywhere]">{item.title}</span>} subtitle={`Criado em ${formatInstantDateTime(item.createdAt)}`} action={<Button variant="secondary" href={voltar}>Voltar para a lista</Button>} />
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 items-start">
      <Card as="section" aria-label="Dados do item" className="min-w-0 p-5">
        <FormularioItem key={`${item.id}:${item.version}`} {...opcoes} podeEditar={podeEditar} voltar={voltar} item={{
          id: item.id, version: item.version, title: item.title, description: item.description, type: item.type, priority: item.priority,
          status: item.status, systemMode: item.systemMode, toolId: item.toolId, assigneeId: item.assigneeId,
          assigneeName: item.assignee?.name ?? null, dueDate: item.dueDate?.toISOString().slice(0, 10) ?? null,
        }} />
      </Card>
      <Card as="section" className="min-w-0 p-5 flex flex-col gap-5">
        <h2 className="text-section-title font-semibold text-fg">Comentários e histórico</h2>
        {podeEditar && <FormularioComentario id={item.id} />}
        <ol className="flex flex-col gap-4" aria-label="Histórico do item">{eventos.map(e => <li key={e.id} className="border-t border-border pt-4 min-w-0">
          <p className="text-ui font-medium text-fg break-words">{e.authorName} <span className="font-normal text-fg-secondary">· {e.body ? "Comentou" : e.version === 0 ? "Criou o item" : "Alterou o item"}</span></p>
          <time dateTime={e.createdAt.toISOString()} className="text-helper text-fg-muted">{formatInstantDateTime(e.createdAt)}</time>
          {e.body && <p className="mt-2 text-ui whitespace-pre-wrap break-words">{e.body}</p>}
          {e.changes && <ul className="mt-2 flex flex-col gap-2 text-helper">{e.changes.map(c => <li key={c.field} className="break-words whitespace-pre-wrap"><span className="font-medium">{c.field}: </span>{e.version !== 0 && <><span className="text-fg-muted">{valor(c.field, c.before)}</span>{" → "}</>}{valor(c.field, c.after)}</li>)}</ul>}
        </li>)}</ol>
      </Card>
    </div>
  </PageContainer>;
}
