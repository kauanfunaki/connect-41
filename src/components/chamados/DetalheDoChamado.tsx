"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Paperclip, RefreshCw, Timer } from "lucide-react";
import { Checkbox } from "@/components/ui/Checkbox";
import { Accordion } from "@/components/ui/Accordion";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { CampoDataHora } from "@/components/ui/CampoDataHora";
import { formatInstantDateTime } from "@/lib/format";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Campo, CamposDoChamado, nomeDaCategoria, type CategoriaDaTela } from "./CamposDoChamado";
import { CaixaDeMensagem } from "./CaixaDeMensagem";
import { LinhaDoTempo, LinkDoAnexo } from "./LinhaDoTempo";
import { SeletorDePessoas } from "./SeletorDePessoas";
import { mudar } from "@/app/(app)/chamados/actions";
import { STATUS, ROTULOS, ROTULOS_PRIORIDADE, fechado, parecerSchema, type DadosDoChamado } from "@/lib/chamados/regras";
import type { detalhe } from "@/lib/chamados/consultas";
import { montarLinhaDoTempo } from "@/lib/chamados/linhaDoTempo";

type Chamado = Awaited<ReturnType<typeof detalhe>>;
type Usuario = { id: string; name: string; atendente: boolean };
type Props = { chamado: Chamado; eu: string; usuarios: Usuario[]; categorias: CategoriaDaTela[]; setores: { code: string; label: string }[]; permissoes: { operar: boolean; gerenciar: boolean; responder: boolean; interno: boolean; aprovar: boolean; escrever: boolean } };
const data = (v: Date | string) => formatInstantDateTime(new Date(v));

function FormAcao({ titulo, children, onSubmit, disabled, label = "Salvar" }: { titulo: string; children: React.ReactNode; onSubmit: (f: FormData) => void; disabled: boolean; label?: string }) {
  return <form onSubmit={e => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }} className="space-y-3 border-b border-border pb-4"><fieldset disabled={disabled} className="space-y-3"><h3 className="font-semibold text-fg">{titulo}</h3>{children}<Button type="submit" variant="secondary" size="sm">{label}</Button></fieldset></form>;
}
export function DetalheDoChamado({ chamado: t, eu, usuarios, categorias, setores, permissoes: p }: Props) {
  const router = useRouter(); const [busy, setBusy] = useState(false), [erro, setErro] = useState("");
  const [checklist, setChecklist] = useState(t.checklist), [situacao, setSituacao] = useState<string>(t.status);
  const [editar, setEditar] = useState(false), [dados, setDados] = useState<DadosDoChamado>({ title: t.title, description: t.description, categoryId: t.categoryId, requesterSectorCode: t.requesterSectorCode, priority: t.priority, requestData: t.requestData as Record<string, string>, tags: t.tags as string[] });
  const nome = (id: string) => usuarios.find(u => u.id === id)?.name ?? "Usuário indisponível";
  const ciclo = t.cycles[0], encerrado = fechado(t.status);
  const parecer = parecerSchema.safeParse(t.draft.review);
  // Cada parecer já vira mensagem do assistente (resumo + perguntas); repetir o
  // resumo embaixo duplicava o texto quando a análise aprovava o chamado.
  const resumoNaConversa = parecer.success && t.draft.messages.some(m => m.role === "assistant" && m.body.startsWith(parecer.data.summary));
  // Os arquivos da abertura ficam com a solicitação; os seguintes, na conversa.
  const daAbertura = t.attachments.filter(a => a.createdAt <= t.createdAt);
  const linha = montarLinhaDoTempo({ mensagens: t.comments, anexos: t.attachments.filter(a => a.createdAt > t.createdAt), eventos: t.events });
  const responsaveis = t.assignees.map(a => a.userId), participantes = t.participants.map(a => a.userId), atendentes = usuarios.filter(u => u.atendente);
  async function executar(fn: () => Promise<{ ok: true; valor: unknown } | { ok: false; error: string }>) {
    setBusy(true); setErro("");
    try { const r = await fn(); if (!r.ok) throw new Error(r.error); router.refresh(); return true; }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível concluir. Atualize a página."); return false; }
    finally { setBusy(false); }
  }
  const acao = (op: string, valor: unknown) => void executar(() => mudar(t.id, t.version, op, valor));
  // Resolver e cancelar encerram o chamado: passam pela confirmação (auditoria de
  // UX, 30/10/2026). A situação grava a cada troca, e percorrer a lista pelo
  // teclado podia encerrar o chamado no meio do caminho.
  const [finalPedido, setFinalPedido] = useState<"RESOLVIDO" | "CANCELADO" | null>(null);
  function trocarSituacao(nova: string) { const anterior = situacao; setSituacao(nova); void executar(() => mudar(t.id, t.version, "status", nova)).then(ok => { if (!ok) setSituacao(anterior); }); }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2 text-ui"><span className="rounded bg-brand/8 px-3 py-1 text-brand">{ROTULOS[t.status]}</span><span className="rounded bg-surface-hover px-3 py-1 text-fg" aria-label="Grupo e categoria">{nomeDaCategoria(categorias, t.categoryId) || t.category.name}</span><span className="text-fg-secondary">{ROTULOS_PRIORIDADE[t.priority]} · {setores.find(s => s.code === t.requesterSectorCode)?.label ?? t.requesterSectorCode}</span><IconButton title="Atualizar" size="sm" onClick={() => router.refresh()}><RefreshCw size={14} /></IconButton></div>
    {erro && <p role="alert" className="rounded-md bg-danger/8 p-3 text-ui text-danger">{erro}</p>}{busy && <p role="status" className="text-ui text-fg-secondary">Salvando alteração…</p>}
    <ConfirmDialog open={finalPedido !== null} title={finalPedido === "CANCELADO" ? "Cancelar o chamado?" : "Marcar o chamado como resolvido?"}
      description={finalPedido === "CANCELADO" ? "O chamado é encerrado sem solução e sai da fila. O solicitante é avisado." : "O chamado é encerrado e o solicitante é avisado. Ele pode pedir reabertura depois."}
      confirmLabel={finalPedido === "CANCELADO" ? "Cancelar o chamado" : "Marcar como resolvido"} cancelLabel="Voltar" destructive={finalPedido === "CANCELADO"}
      onConfirm={() => { if (finalPedido) trocarSituacao(finalPedido); setFinalPedido(null); }} onCancel={() => setFinalPedido(null)} />
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
      <div className="min-w-0 space-y-5">
        <Card className="p-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-fg">Solicitação</h2>{p.operar && !encerrado && <Button variant="ghost" size="sm" onClick={() => setEditar(!editar)}>{editar ? "Fechar edição" : "Editar dados"}</Button>}</div>
          {editar ? <form onSubmit={e => { e.preventDefault(); acao("dados", dados); }}><fieldset disabled={busy} className="space-y-4"><CamposDoChamado dados={dados} onChange={setDados} categorias={categorias} setores={setores} origemFixa /><Button type="submit">Salvar dados</Button></fieldset></form> : <>
            <p className="whitespace-pre-wrap break-words text-ui text-fg-secondary">{t.description}</p>
            {Object.entries(t.requestData as Record<string, string>).map(([key, valor]) => <div key={key} className="text-ui"><span className="font-semibold text-fg">{categorias.find(c => c.id === t.categoryId)?.formSchema.find(f => f.key === key)?.label ?? key}: </span><span className="whitespace-pre-wrap break-words text-fg-secondary">{valor}</span></div>)}
            {!!(t.tags as string[]).length && <p className="text-helper text-fg-muted">Tags: {(t.tags as string[]).join(", ")}</p>}
          </>}
          {!!daAbertura.length && <div className="flex flex-wrap items-center gap-2"><Paperclip size={14} aria-label="Arquivos da abertura" className="text-fg-muted" />{daAbertura.map(a => <LinkDoAnexo key={a.id} anexo={a} />)}</div>}
          <p className="text-helper text-fg-muted">Aberto por {nome(t.createdById)} em {data(t.createdAt)} · Protocolo {t.id}</p>
        </Card>
        <Card className="p-5 space-y-4"><h2 className="font-semibold text-fg">Mensagens</h2>
          {linha.length ? <LinhaDoTempo itens={linha} nome={nome} /> : <p className="text-ui text-fg-muted">Ainda não há mensagens de atendimento.</p>}
          {p.responder && <CaixaDeMensagem chamado={{ id: t.id, draftId: t.draftId, version: t.version }} podeInterno={p.operar} />}
        </Card>
        {/* A conversa com a IA é material da equipe, como as notas internas. */}
        {p.interno && <Card className="p-5"><Accordion titulo="Conversa da triagem" classeDoCabecalho="font-semibold text-fg"><p className="my-3 text-helper text-fg-muted">As mensagens abaixo complementam a descrição original.</p>{t.draft.messages.map(m => <div key={m.id} className="my-3 rounded-md bg-surface-hover p-3"><p className="text-helper font-semibold text-fg">{m.role === "user" ? "Solicitante" : "Assistente"}</p><p className="whitespace-pre-wrap break-words text-ui text-fg-secondary">{m.body}</p></div>)}{parecer.success && <div className="space-y-2 text-helper text-fg-secondary">{!resumoNaConversa && <p>{parecer.data.summary}</p>}{parecer.data.attachments.map(a => <p key={a.id}><strong>{a.name}:</strong> {a.reason}</p>)}</div>}{!t.draft.messages.length && <p className="mt-3 text-ui text-fg-muted">Chamado enviado sem conversa de triagem.</p>}</Accordion></Card>}
        {!!t.reopenRequests.length && <Card className="p-5"><Accordion titulo="Histórico de reaberturas" classeDoCabecalho="font-semibold text-fg">{t.reopenRequests.map(r => <div key={r.id} className="my-3 space-y-2 border-b border-border pb-3 text-ui text-fg-secondary"><p className="text-helper">Pedido por {nome(r.requestedById)} em {data(r.createdAt)} · {r.status === "PENDING" ? "Pendente" : r.status === "APPROVED" ? "Aceito" : "Recusado"}</p><p className="whitespace-pre-wrap break-words">{r.reason}</p>{r.decidedById && <><p className="text-helper">Decisão de {nome(r.decidedById)}{r.decidedAt ? " em " + data(r.decidedAt) : ""}</p><p className="whitespace-pre-wrap break-words">{r.note}</p></>}</div>)}</Accordion></Card>}
      </div>
      <div className="min-w-0 space-y-5">
        <Card className="p-5 space-y-4"><h2 className="font-semibold text-fg">Atendimento</h2>
          {p.operar && !encerrado ? <Campo label="Situação"><Select value={situacao} disabled={busy} onChange={e => { const nova = e.target.value; if (nova === "RESOLVIDO" || nova === "CANCELADO") setFinalPedido(nova); else trocarSituacao(nova); }}>{STATUS.map(s => <option key={s} value={s}>{ROTULOS[s]}</option>)}</Select></Campo> : null}
          <SeletorDePessoas titulo="Responsáveis" selecionados={responsaveis} nome={nome} vazio="" disabled={busy || encerrado}
            opcoes={p.gerenciar ? atendentes : atendentes.filter(u => u.id === eu)}
            onAdicionar={p.operar && !encerrado ? id => p.gerenciar ? acao("responsaveis", [...responsaveis, id]) : acao("assumir", null) : undefined}
            onRetirar={p.gerenciar && !encerrado ? id => acao("responsaveis", responsaveis.filter(r => r !== id)) : undefined} />
          {t.assignees.some(a => !usuarios.find(u => u.id === a.userId)?.atendente) && <p className="text-helper text-warning">Há responsável fora do setor atual ou inativo. O gestor deve redistribuir o chamado.</p>}
          <SeletorDePessoas titulo="Participantes" selecionados={participantes} opcoes={usuarios} nome={nome} vazio="Nenhum adicional" disabled={busy || encerrado}
            onAdicionar={p.gerenciar && !encerrado ? id => acao("participantes", [...participantes, id]) : undefined}
            onRetirar={p.gerenciar && !encerrado ? id => acao("participantes", participantes.filter(r => r !== id)) : undefined} />
          <div className="space-y-1 border-t border-border pt-3 text-helper text-fg-secondary"><h3 className="mb-1.5 flex items-center gap-1.5 font-semibold"><Timer size={14} aria-hidden className="text-fg-muted" />{ciclo ? `Ciclo de SLA ${ciclo.cycleNumber}` : "SLA"}</h3>{ciclo ? <><p>Iniciado: {data(ciclo.openedAt)}</p><p>Primeira resposta: {ciclo.firstResponseAt ? data(ciclo.firstResponseAt) : "Pendente"}</p><p>Prazo de resolução: {data(ciclo.resolutionDueAt)}{ciclo.manualDeadline ? " (ajustado)" : ""}</p>{ciclo.pausedAt && <p className="text-warning">SLA pausado desde {data(ciclo.pausedAt)}</p>}</> : <p className="text-fg-muted">O SLA começa quando o atendimento passa para Em andamento.</p>}</div>
          {p.gerenciar && !encerrado && ciclo && !ciclo.resolvedAt && <Accordion titulo={<span className="inline-flex items-center gap-1.5"><CalendarClock size={14} aria-hidden />Ajustar prazo</span>} classeDoCabecalho="text-ui font-semibold text-fg" classeDoConteudo="pt-3"><FormAcao titulo="Novo prazo de resolução" disabled={busy} onSubmit={f => acao("prazo", { prazo: new Date(`${f.get("prazo")}:00-03:00`).toISOString(), motivo: String(f.get("motivo")) })}><Campo label="Novo prazo (Brasília)"><CampoDataHora name="prazo" required /></Campo><Campo label="Justificativa"><Textarea name="motivo" required minLength={5} maxLength={1000} /></Campo></FormAcao></Accordion>}
        </Card>
        {!!checklist.length && p.interno && <Card className="p-5 space-y-3"><h2 className="font-semibold text-fg">Checklist interno</h2>{checklist.map(i => <label key={i.id} className="flex items-start gap-2 text-ui text-fg-secondary"><Checkbox checked={i.done} disabled={busy || !p.operar || encerrado} onChange={e => { const done = e.target.checked; setChecklist(itens => itens.map(item => item.id === i.id ? { ...item, done } : item)); void executar(() => mudar(t.id, t.version, "checklist", { id: i.id, done })).then(ok => { if (!ok) setChecklist(itens => itens.map(item => item.id === i.id ? { ...item, done: !done } : item)); }); }} />{i.label}</label>)}</Card>}
        {(t.approvalRequired || t.approvals.length > 0) && <Card className="p-5 space-y-3"><h2 className="font-semibold text-fg">Aprovação</h2><p className="text-ui text-fg-secondary">{t.approvalStatus === "PENDING" ? "Pendente" : t.approvalStatus === "APPROVED" ? "Aprovado" : t.approvalStatus === "REJECTED" ? "Recusado" : "Não exigida na categoria atual"}</p>{t.approvals.map(a => <p key={a.id} className="text-helper text-fg-secondary">{a.note}{a.decidedById ? ` · ${nome(a.decidedById)}` : ""}</p>)}{p.aprovar && t.status === "AGUARDANDO_APROVACAO" && <FormAcao titulo="Decidir aprovação" disabled={busy} label="Registrar decisão" onSubmit={f => acao("aprovar", { aprovado: f.get("aprovado") === "1", motivo: String(f.get("motivo")) })}><Select name="aprovado" aria-label="Decisão"><option value="1">Aprovar</option><option value="0">Recusar</option></Select><Campo label="Justificativa da decisão"><Textarea name="motivo" required maxLength={2000} /></Campo></FormAcao>}</Card>}
        {t.status === "RESOLVIDO" && p.escrever && <Card className="p-5 space-y-3"><h2 className="font-semibold text-fg">Reabertura</h2>{t.reopenRequests.some(r => r.status === "PENDING") ? <><p className="text-ui text-fg-secondary">Há um pedido de reabertura pendente.</p><p className="whitespace-pre-wrap text-ui text-fg-secondary">{t.reopenRequests.find(r => r.status === "PENDING")?.reason}</p>{p.gerenciar && <FormAcao titulo="Decidir reabertura" disabled={busy} label="Registrar decisão" onSubmit={f => acao("decidir_reabertura", { aprovado: f.get("aprovado") === "1", motivo: String(f.get("motivo")) })}><Select name="aprovado" aria-label="Decisão de reabertura"><option value="1">Reabrir</option><option value="0">Recusar reabertura</option></Select><Campo label="Motivo da decisão"><Textarea name="motivo" required maxLength={2000} /></Campo></FormAcao>}</> : <FormAcao titulo="Solicitar reabertura" disabled={busy} label="Pedir reabertura" onSubmit={f => acao("pedir_reabertura", String(f.get("motivo")))}><Campo label="Por que precisa reabrir?"><Textarea name="motivo" required minLength={5} maxLength={2000} /></Campo></FormAcao>}</Card>}
      </div>
    </div>
  </div>;
}
