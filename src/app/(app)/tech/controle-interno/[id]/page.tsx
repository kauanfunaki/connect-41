import { notFound } from "next/navigation";
import { abrirTelaDoModulo, podeNoModulo } from "@/lib/auth/modulo";
import { MessageSquare, PencilLine, Plus } from "lucide-react";
import { MODULO_TECH_INTERNO, SITUACOES, destinoDeVolta, resumoDoRegistro, chaveDoSistema, type Alteracao } from "@/lib/tech-interno/regras";
import { CORES_DA_SITUACAO } from "@/lib/tech-interno/cores";
import { detalheItem, opcoesTech } from "@/lib/tech-interno/servidor";
import { FormularioItem, FormularioComentario } from "@/components/tech-interno/FormularioItem";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatInstantDateTime } from "@/lib/format";

export default async function DetalheTechPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ctx } = await abrirTelaDoModulo(MODULO_TECH_INTERNO), { id } = await params, voltar = destinoDeVolta((await searchParams).voltar);
  const [item, opcoes, podeEditar] = await Promise.all([detalheItem(ctx, id), opcoesTech(ctx), podeNoModulo(ctx, MODULO_TECH_INTERNO, "agir")]);
  if (!item) notFound();
  const eventos = [
    ...item.comments.map(c => ({ id: c.id, createdAt: c.createdAt, authorName: c.authorName, body: c.body, changes: null, version: null })),
    ...item.changes.map(c => ({ id: c.id, createdAt: c.createdAt, authorName: c.authorName, body: null, changes: c.changes as unknown as Alteracao[], version: c.version })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (b.version ?? -1) - (a.version ?? -1));
  const corDaSituacao = (rotulo: string | null) => Object.entries(SITUACOES).find(([, r]) => r === rotulo)?.[0] as keyof typeof SITUACOES | undefined;
  return <PageContainer><PageHeader title={<span className="break-words [overflow-wrap:anywhere]">{item.title}</span>} subtitle={`Criado em ${formatInstantDateTime(item.createdAt)}`} action={<Button variant="secondary" href={voltar}>Voltar para a lista</Button>} />
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 items-start">
      <Card as="section" aria-label="Dados do item" className="min-w-0 p-5">
        <FormularioItem key={`${item.id}:${item.version}`} {...opcoes} podeEditar={podeEditar} voltar={voltar} item={{
          id: item.id, version: item.version, title: item.title, description: item.description, type: item.type, priority: item.priority,
          status: item.status, systemMode: item.systemMode, systemKey: chaveDoSistema(item), assigneeId: item.assigneeId,
          assigneeName: item.assignee?.name ?? null, dueDate: item.dueDate?.toISOString().slice(0, 10) ?? null,
        }} />
      </Card>
      <Card as="section" className="min-w-0 p-5 flex flex-col gap-5">
        <h2 className="text-section-title font-semibold text-fg">Comentários e histórico</h2>
        {podeEditar && <FormularioComentario id={item.id} />}
        {/* Cada ação fica registrada com autor e horário: comentários, criação,
            situação, responsável, prazo e demais campos (26/10/2026). */}
        <ol className="flex flex-col" aria-label="Histórico do item">{eventos.map(e => {
          const Icone = e.body ? MessageSquare : e.version === 0 ? Plus : PencilLine, resumo = e.changes && resumoDoRegistro(e.changes, e.version ?? 0);
          return <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0 min-w-0 before:absolute before:left-[13px] before:top-8 before:bottom-1 before:w-px before:bg-border last:before:hidden">
            <span aria-hidden className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-secondary"><Icone size={14} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-ui text-fg break-words"><span className="font-medium">{e.authorName}</span> <span className="text-fg-secondary">{resumo ? resumo.frase : "comentou"}</span></p>
              <time dateTime={e.createdAt.toISOString()} className="text-helper text-fg-muted">{formatInstantDateTime(e.createdAt)}</time>
              {e.body && <p className="mt-2 rounded-md bg-surface-2 p-3 text-ui whitespace-pre-wrap break-words">{e.body}</p>}
              {!!resumo?.detalhes.length && <ul className="mt-2 flex flex-col gap-1 text-helper text-fg-secondary">{resumo.detalhes.map((d, i) => <li key={i} className="break-words">{d}</li>)}</ul>}
              {e.changes?.some(c => c.field === "Situação") && (() => { const s = corDaSituacao(e.changes.find(c => c.field === "Situação")!.after); return s ? <span className="mt-2 inline-block rounded px-2 py-0.5 text-helper font-semibold" style={{ backgroundColor: CORES_DA_SITUACAO[s].fundo, color: CORES_DA_SITUACAO[s].tinta }}>{SITUACOES[s]}</span> : null; })()}
            </div>
          </li>;
        })}</ol>
      </Card>
    </div>
  </PageContainer>;
}
