"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Checkbox } from "@/components/ui/Checkbox";
import { Accordion } from "@/components/ui/Accordion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CampoDataHora } from "@/components/ui/CampoDataHora";
import { formatInstantDateTime } from "@/lib/format";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Campo, CamposDoChamado, type CategoriaDaTela } from "./CamposDoChamado";
import { mudar, responder } from "@/app/(app)/chamados/actions";
import { FORMATOS } from "@/lib/chamados/formatos";
import { STATUS, ROTULOS, ROTULOS_PRIORIDADE, fechado, parecerSchema, type DadosDoChamado } from "@/lib/chamados/regras";
import type { detalhe } from "@/lib/chamados/consultas";
import { ROTULOS_EVENTO } from "@/lib/chamados/eventos";

type Chamado = Awaited<ReturnType<typeof detalhe>>;
type Usuario = { id: string; name: string; atendente: boolean };
type Props = { chamado: Chamado; usuarios: Usuario[]; categorias: CategoriaDaTela[]; setores: { code: string; label: string }[]; permissoes: { operar: boolean; gerenciar: boolean; responder: boolean; interno: boolean; aprovar: boolean; escrever: boolean } };
const data = (v: Date | string) => formatInstantDateTime(new Date(v));

function FormAcao({ titulo, children, onSubmit, disabled, label = "Salvar" }: { titulo: string; children: React.ReactNode; onSubmit: (f: FormData) => void; disabled: boolean; label?: string }) {
  return <form onSubmit={e => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} className="space-y-3 border-b border-border pb-4"><fieldset disabled={disabled} className="space-y-3"><h3 className="font-semibold text-fg">{titulo}</h3>{children}<Button type="submit" variant="secondary" size="sm">{label}</Button></fieldset></form>;
}
export function DetalheDoChamado({ chamado: t, usuarios, categorias, setores, permissoes: p }: Props) {
  const router = useRouter(); const [busy, setBusy] = useState(false), [erro, setErro] = useState("");
  const [interno, setInterno] = useState(false); const requestId = useRef(crypto.randomUUID());
  const [checklist, setChecklist] = useState(t.checklist);
  const [editar, setEditar] = useState(false), [dados, setDados] = useState<DadosDoChamado>({ title: t.title, description: t.description, categoryId: t.categoryId, requesterSectorCode: t.requesterSectorCode, priority: t.priority, requestData: t.requestData as Record<string, string>, tags: t.tags as string[] });
  const nome = (id: string) => usuarios.find(u => u.id === id)?.name ?? "Usuário indisponível";
  const ciclo = t.cycles[0], encerrado = fechado(t.status);
  const parecer = parecerSchema.safeParse(t.draft.review);
  async function executar(fn: () => Promise<{ ok: true; valor: unknown } | { ok: false; error: string }>) {
    setBusy(true); setErro("");
    try { const r = await fn(); if (!r.ok) throw new Error(r.error); router.refresh(); return true; }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível concluir. Atualize a página."); return false; }
    finally { setBusy(false); }
  }
  const acao = (op: string, valor: unknown) => void executar(() => mudar(t.id, t.version, op, valor));
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2 text-ui"><span className="rounded bg-brand/8 px-3 py-1 text-brand">{ROTULOS[t.status]}</span><span className="text-fg-secondary">{ROTULOS_PRIORIDADE[t.priority]} · {t.category.name} · {setores.find(s => s.code === t.requesterSectorCode)?.label ?? t.requesterSectorCode}</span><Button variant="ghost" size="sm" onClick={() => router.refresh()}>Atualizar</Button></div>
    {erro && <p role="alert" className="rounded-md bg-danger/8 p-3 text-ui text-danger">{erro}</p>}{busy && <p role="status" className="text-ui text-fg-secondary">Salvando alteração…</p>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
      <div className="min-w-0 space-y-5">
        <Card className="p-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-fg">Solicitação</h2>{p.operar && !encerrado && <Button variant="ghost" size="sm" onClick={() => setEditar(!editar)}>{editar ? "Fechar edição" : "Editar dados"}</Button>}</div>
          {editar ? <form onSubmit={e => { e.preventDefault(); acao("dados", dados); }}><fieldset disabled={busy} className="space-y-4"><CamposDoChamado dados={dados} onChange={setDados} categorias={categorias} setores={setores} origemFixa /><Button type="submit">Salvar dados</Button></fieldset></form> : <>
            <p className="whitespace-pre-wrap break-words text-ui text-fg-secondary">{t.description}</p>
            {Object.entries(t.requestData as Record<string, string>).map(([key, valor]) => <div key={key} className="text-ui"><span className="font-semibold text-fg">{categorias.find(c => c.id === t.categoryId)?.formSchema.find(f => f.key === key)?.label ?? key}: </span><span className="whitespace-pre-wrap break-words text-fg-secondary">{valor}</span></div>)}
            {!!(t.tags as string[]).length && <p className="text-helper text-fg-muted">Tags: {(t.tags as string[]).join(", ")}</p>}
          </>}
          <p className="text-helper text-fg-muted">Aberto por {nome(t.createdById)} em {data(t.createdAt)} · Protocolo {t.id}</p>
        </Card>
        <Card className="p-5 space-y-4"><h2 className="font-semibold text-fg">Mensagens</h2>
          {!t.comments.length && <p className="text-ui text-fg-muted">Ainda não há mensagens de atendimento.</p>}
          {t.comments.map(m => <div key={m.id} className={`rounded-md border p-3 ${m.internal ? "border-warning/30 bg-warning/5" : "border-border"}`}><p className="mb-2 text-helper text-fg-muted">{nome(m.authorId)} · {data(m.createdAt)}{m.internal ? " · Somente equipe" : ""}</p><p className="whitespace-pre-wrap break-words text-ui text-fg-secondary">{m.body}</p></div>)}
          {p.responder && <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void executar(() => responder(t.id, t.version, { requestId: requestId.current, body: String(f.get("body") ?? ""), internal: interno })); }} className="space-y-3"><Campo label={interno ? "Nota interna" : "Resposta pública"}><Textarea name="body" required rows={4} maxLength={15000} disabled={busy} /></Campo>{p.operar && <label className="flex items-center gap-2 text-ui text-fg-secondary"><Checkbox checked={interno} disabled={busy} onChange={e => setInterno(e.target.checked)} />Somente a equipe</label>}<Button type="submit" disabled={busy}>Enviar mensagem</Button></form>}
        </Card>
        <Card className="p-5 space-y-3"><h2 className="font-semibold text-fg">Anexos</h2>{!t.attachments.length && <p className="text-ui text-fg-muted">Nenhum anexo.</p>}{t.attachments.map(a => <p key={a.id} className="text-ui"><a className="break-all text-brand hover:underline" href={`/api/chamados/anexos/${a.id}`} download>{a.fileName}</a>{a.internal && <span className="ml-2 text-helper text-warning">Somente equipe</span>}</p>)}
          {p.responder && <form onSubmit={e => {
            e.preventDefault(); const f = new FormData(e.currentTarget); f.set("id", crypto.randomUUID()); f.set("draftId", t.draftId); f.set("ticketId", t.id); f.set("version", String(t.version));
            void executar(async () => { const r = await fetch("/api/chamados/anexos", { method: "POST", body: f }); const d = await r.json(); return r.ok ? { ok: true as const, valor: d } : { ok: false as const, error: d.error }; });
          }} className="space-y-3"><label className="block text-helper text-fg-secondary">Novo anexo (até 10 MB)<input className="mt-2 block max-w-full" aria-label="Novo anexo" name="file" type="file" accept={FORMATOS} required disabled={busy} /></label>{p.operar && <label className="flex items-center gap-2 text-ui text-fg-secondary"><Checkbox name="internal" value="1" disabled={busy} />Anexo somente para a equipe</label>}<Button type="submit" variant="secondary" size="sm" disabled={busy}>Enviar arquivo</Button></form>}
        </Card>
        <Card className="p-5"><Accordion titulo="Conversa da triagem" classeDoCabecalho="font-semibold text-fg"><p className="my-3 text-helper text-fg-muted">As mensagens abaixo complementam a descrição original.</p>{t.draft.messages.map(m => <div key={m.id} className="my-3 rounded-md bg-surface-hover p-3"><p className="text-helper font-semibold text-fg">{m.role === "user" ? "Solicitante" : "Assistente"}</p><p className="whitespace-pre-wrap break-words text-ui text-fg-secondary">{m.body}</p></div>)}{parecer.success && <div className="space-y-2 text-helper text-fg-secondary"><p>{parecer.data.summary}</p>{parecer.data.attachments.map(a => <p key={a.id}><strong>{a.name}:</strong> {a.reason}</p>)}</div>}{!t.draft.messages.length && <p className="mt-3 text-ui text-fg-muted">Chamado enviado sem conversa de triagem.</p>}</Accordion></Card>
        {!!t.reopenRequests.length && <Card className="p-5"><Accordion titulo="Histórico de reaberturas" classeDoCabecalho="font-semibold text-fg">{t.reopenRequests.map(r => <div key={r.id} className="my-3 space-y-2 border-b border-border pb-3 text-ui text-fg-secondary"><p className="text-helper">Pedido por {nome(r.requestedById)} em {data(r.createdAt)} · {r.status === "PENDING" ? "Pendente" : r.status === "APPROVED" ? "Aceito" : "Recusado"}</p><p className="whitespace-pre-wrap break-words">{r.reason}</p>{r.decidedById && <><p className="text-helper">Decisão de {nome(r.decidedById)}{r.decidedAt ? " em " + data(r.decidedAt) : ""}</p><p className="whitespace-pre-wrap break-words">{r.note}</p></>}</div>)}</Accordion></Card>}
        <Card className="p-5"><h2 className="mb-3 font-semibold text-fg">Histórico</h2>{t.events.map(e => <p key={e.id} className="border-b border-border py-2 text-helper text-fg-secondary whitespace-pre-wrap break-words">{data(e.createdAt)}{e.actorId ? " · " + nome(e.actorId) : ""} · {ROTULOS_EVENTO[e.type] ?? "Atualização"}{e.type === "status" ? `: ${ROTULOS[(e.data as { to: keyof typeof ROTULOS }).to]}` : ""}{e.type === "deadline" ? " · Justificativa: " + String((e.data as { motivo?: string }).motivo ?? "") : ""}{e.internal ? " · Interno" : ""}</p>)}</Card>
      </div>
      <div className="min-w-0 space-y-5">
        <Card className="p-5 space-y-3"><h2 className="font-semibold text-fg">Atendimento</h2><p className="text-ui text-fg-secondary">Responsáveis: {t.assignees.length ? t.assignees.map(a => nome(a.userId)).join(", ") : "Aguardando distribuição"}</p>
          {t.assignees.some(a => !usuarios.find(u => u.id === a.userId)?.atendente) && <p className="text-helper text-warning">Há responsável fora do setor atual ou inativo. O gestor deve redistribuir o chamado.</p>}
          <p className="text-ui text-fg-secondary">Participantes: {t.participants.length ? t.participants.map(a => nome(a.userId)).join(", ") : "Nenhum adicional"}</p>
          {ciclo ? <div className="space-y-1 text-helper text-fg-secondary"><p>Ciclo de SLA {ciclo.cycleNumber}</p><p>Iniciado: {data(ciclo.openedAt)}</p><p>Primeira resposta: {ciclo.firstResponseAt ? data(ciclo.firstResponseAt) : "Pendente"}</p><p>Prazo de resolução: {data(ciclo.resolutionDueAt)}{ciclo.manualDeadline ? " (ajustado)" : ""}</p>{ciclo.pausedAt && <p className="text-warning">SLA pausado desde {data(ciclo.pausedAt)}</p>}</div> : <p className="text-helper text-fg-muted">O SLA começa quando o atendimento passa para Em andamento.</p>}
          {t.queueOrder && t.status === "NA_FILA" ? <p className="text-ui text-fg-secondary">Ordem na fila: {t.queueOrder}</p> : null}
          {p.operar && !encerrado && <><Button variant="secondary" size="sm" disabled={busy} onClick={() => acao("assumir", null)}>Assumir chamado</Button><FormAcao titulo="Situação" disabled={busy} onSubmit={f => acao("status", String(f.get("status")))}><Select name="status" aria-label="Nova situação" defaultValue={t.status}>{STATUS.map(s => <option key={s} value={s}>{ROTULOS[s]}</option>)}</Select></FormAcao></>}
          {p.gerenciar && !encerrado && <>
            <FormAcao titulo="Responsáveis" disabled={busy} onSubmit={f => acao("responsaveis", f.getAll("userId"))}><div className="max-h-48 space-y-2 overflow-y-auto">{usuarios.filter(u => u.atendente).map(u => <label key={u.id} className="flex gap-2 text-ui text-fg-secondary"><Checkbox name="userId" value={u.id} defaultChecked={t.assignees.some(a => a.userId === u.id)} />{u.name}</label>)}</div></FormAcao>
            <FormAcao titulo="Participantes adicionais" disabled={busy} onSubmit={f => acao("participantes", f.getAll("userId"))}><div className="max-h-48 space-y-2 overflow-y-auto">{usuarios.map(u => <label key={u.id} className="flex gap-2 text-ui text-fg-secondary"><Checkbox name="userId" value={u.id} defaultChecked={t.participants.some(a => a.userId === u.id)} />{u.name}</label>)}</div></FormAcao>
            {t.status === "NA_FILA" && <FormAcao titulo="Posição na fila" disabled={busy} onSubmit={f => acao("fila", Number(f.get("posicao")))}><Input aria-label="Posição na fila" name="posicao" type="number" min={1} max={100000} defaultValue={t.queueOrder ?? 1} required /></FormAcao>}
            {ciclo && !ciclo.resolvedAt && <FormAcao titulo="Ajustar prazo de resolução" disabled={busy} onSubmit={f => acao("prazo", { prazo: new Date(`${f.get("prazo")}:00-03:00`).toISOString(), motivo: String(f.get("motivo")) })}><Campo label="Novo prazo (Brasília)"><CampoDataHora name="prazo" required /></Campo><Campo label="Justificativa"><Textarea name="motivo" required minLength={5} maxLength={1000} /></Campo></FormAcao>}
          </>}
        </Card>
        {!!checklist.length && p.interno && <Card className="p-5 space-y-3"><h2 className="font-semibold text-fg">Checklist interno</h2>{checklist.map(i => <label key={i.id} className="flex items-start gap-2 text-ui text-fg-secondary"><Checkbox checked={i.done} disabled={busy || !p.operar || encerrado} onChange={e => { const done = e.target.checked; setChecklist(itens => itens.map(item => item.id === i.id ? { ...item, done } : item)); void executar(() => mudar(t.id, t.version, "checklist", { id: i.id, done })).then(ok => { if (!ok) setChecklist(itens => itens.map(item => item.id === i.id ? { ...item, done: !done } : item)); }); }} />{i.label}</label>)}</Card>}
        {(t.approvalRequired || t.approvals.length > 0) && <Card className="p-5 space-y-3"><h2 className="font-semibold text-fg">Aprovação</h2><p className="text-ui text-fg-secondary">{t.approvalStatus === "PENDING" ? "Pendente" : t.approvalStatus === "APPROVED" ? "Aprovado" : t.approvalStatus === "REJECTED" ? "Recusado" : "Não exigida na categoria atual"}</p>{t.approvals.map(a => <p key={a.id} className="text-helper text-fg-secondary">{a.note}{a.decidedById ? ` · ${nome(a.decidedById)}` : ""}</p>)}{p.aprovar && t.status === "AGUARDANDO_APROVACAO" && <FormAcao titulo="Decidir aprovação" disabled={busy} label="Registrar decisão" onSubmit={f => acao("aprovar", { aprovado: f.get("aprovado") === "1", motivo: String(f.get("motivo")) })}><Select name="aprovado" aria-label="Decisão"><option value="1">Aprovar</option><option value="0">Recusar</option></Select><Campo label="Justificativa da decisão"><Textarea name="motivo" required maxLength={2000} /></Campo></FormAcao>}</Card>}
        {t.status === "RESOLVIDO" && p.escrever && <Card className="p-5 space-y-3"><h2 className="font-semibold text-fg">Reabertura</h2>{t.reopenRequests.some(r => r.status === "PENDING") ? <><p className="text-ui text-fg-secondary">Há um pedido de reabertura pendente.</p><p className="whitespace-pre-wrap text-ui text-fg-secondary">{t.reopenRequests.find(r => r.status === "PENDING")?.reason}</p>{p.gerenciar && <FormAcao titulo="Decidir reabertura" disabled={busy} label="Registrar decisão" onSubmit={f => acao("decidir_reabertura", { aprovado: f.get("aprovado") === "1", motivo: String(f.get("motivo")) })}><Select name="aprovado" aria-label="Decisão de reabertura"><option value="1">Reabrir</option><option value="0">Recusar reabertura</option></Select><Campo label="Motivo da decisão"><Textarea name="motivo" required maxLength={2000} /></Campo></FormAcao>}</> : <FormAcao titulo="Solicitar reabertura" disabled={busy} label="Pedir reabertura" onSubmit={f => acao("pedir_reabertura", String(f.get("motivo")))}><Campo label="Por que precisa reabrir?"><Textarea name="motivo" required minLength={5} maxLength={2000} /></Campo></FormAcao>}</Card>}
      </div>
    </div>
  </div>;
}
