import { AlarmClock, ArrowRightLeft, CalendarClock, CircleDot, FilePlay, Flag, ListChecks, ListOrdered, Lock, Paperclip, Pencil, RotateCcw, ShieldCheck, ShieldX, Tag, Ticket, UserPlus, Users, type LucideIcon } from "lucide-react";
import { IconeDoArquivo as IconeDosArquivos } from "@/components/arquivos/IconeDoArquivo";
import { formatInstantDateTime } from "@/lib/format";
import { descreverEvento, tamanhoDoArquivo, type AnexoDaLinha, type ItemDaLinha } from "@/lib/chamados/linhaDoTempo";

const data = (v: Date | string) => formatInstantDateTime(new Date(v));
export const iniciais = (nome: string) => nome.trim().split(/\s+/).filter(Boolean).map(p => p[0]).filter((_, i, partes) => i === 0 || i === partes.length - 1).join("").toLocaleUpperCase("pt-BR") || "?";
export function Avatar({ nome, className = "size-7 text-micro" }: { nome: string; className?: string }) {
  return <span aria-hidden className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-subtle font-semibold text-brand ${className}`}>{iniciais(nome)}</span>;
}
// O ícone dos Arquivos, com a cor por tipo (PDF, planilha, imagem): eram dois
// desenhos para a mesma coisa (auditoria de UX, 30/10/2026). Vídeo, que só o
// chamado recebe, fica aqui.
export function IconeDoArquivo({ nome, size = 14 }: { nome: string; size?: number }) {
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "webm"].includes(ext)) return <FilePlay size={size} aria-hidden className="shrink-0 text-fg-muted" />;
  return <IconeDosArquivos nome={nome} size={size} />;
}
export function LinkDoAnexo({ anexo }: { anexo: Pick<AnexoDaLinha, "id" | "fileName" | "sizeBytes" | "internal"> }) {
  return <a href={`/api/chamados/anexos/${anexo.id}`} download className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1 text-helper text-fg-secondary transition-colors hover:border-border-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"><IconeDoArquivo nome={anexo.fileName} /><span className="min-w-0 truncate font-medium text-brand">{anexo.fileName}</span><span className="shrink-0 text-fg-muted">{tamanhoDoArquivo(anexo.sizeBytes)}</span>{anexo.internal && <Lock size={12} aria-label="Somente a equipe" className="shrink-0 text-warning-fg" />}</a>;
}

const ICONE_DO_EVENTO: Record<string, LucideIcon> = { created: Ticket, status: ArrowRightLeft, assignees: UserPlus, participants: Users, priority: Flag, checklist: ListChecks, deadline: CalendarClock, queue: ListOrdered, reopen_requested: RotateCcw, reopen_decided: RotateCcw, sla: AlarmClock, category: Tag, details: Pencil };
const Interno = () => <span className="inline-flex items-center gap-1 text-warning-fg"><Lock size={11} aria-hidden />Somente a equipe</span>;

// Mensagens em cartão, arquivos e eventos em uma linha com ícone (26/10/2026).
export function LinhaDoTempo({ itens, nome }: { itens: ItemDaLinha[]; nome: (id: string) => string }) {
  return <ol aria-label="Conversa e histórico do chamado" className="space-y-3">{itens.map(item => {
    if (item.tipo === "mensagem") {
      const m = item.mensagem;
      return <li key={item.id} className="flex gap-2.5"><Avatar nome={nome(m.authorId)} className="mt-0.5 size-8 text-helper" />
        <div className={`min-w-0 flex-1 rounded-lg border p-3 ${m.internal ? "border-warning/30 bg-warning/5" : "border-border bg-surface"}`}>
          <p className="mb-1 flex flex-wrap items-center gap-x-2 text-helper text-fg-muted"><span className="font-semibold text-fg">{nome(m.authorId)}</span><time dateTime={new Date(m.createdAt).toISOString()}>{data(m.createdAt)}</time>{m.internal && <Interno />}</p>
          {m.body && <p className="whitespace-pre-wrap break-words text-ui text-fg-secondary">{m.body}</p>}
          {!!item.anexos.length && <div className={`flex flex-wrap gap-2 ${m.body ? "mt-2" : ""}`}>{item.anexos.map(a => <LinkDoAnexo key={a.id} anexo={a} />)}</div>}
        </div></li>;
    }
    if (item.tipo === "anexo") {
      const a = item.anexo;
      return <li key={item.id} className="flex items-start gap-2.5 pl-1 text-helper text-fg-secondary"><span aria-hidden className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-hover text-fg-muted"><Paperclip size={13} /></span>
        <div className="min-w-0 flex-1 space-y-1"><p className="flex flex-wrap items-center gap-x-2"><span>{nome(a.uploadedById)} enviou um arquivo</span><time className="text-fg-muted" dateTime={new Date(a.createdAt).toISOString()}>{data(a.createdAt)}</time></p><LinkDoAnexo anexo={a} /></div></li>;
    }
    const e = item.evento, { texto, detalhe } = descreverEvento(e, nome);
    const Icone = e.type === "approval" ? ((e.data as { aprovado?: boolean })?.aprovado ? ShieldCheck : ShieldX) : ICONE_DO_EVENTO[e.type] ?? CircleDot;
    return <li key={item.id} className="flex items-start gap-2.5 pl-1 text-helper text-fg-secondary"><span aria-hidden className={`mt-px inline-flex size-6 shrink-0 items-center justify-center rounded-full ${e.internal ? "bg-warning/10 text-warning-fg" : "bg-surface-hover text-fg-muted"}`}><Icone size={13} /></span>
      <div className="min-w-0 flex-1 pt-0.5"><p className="flex flex-wrap items-center gap-x-2"><span className="break-words">{texto}</span><time className="text-fg-muted" dateTime={new Date(e.createdAt).toISOString()}>{data(e.createdAt)}</time>{e.internal && <Interno />}</p>{detalhe && <p className="mt-0.5 whitespace-pre-wrap break-words text-fg-muted">{detalhe}</p>}</div></li>;
  })}</ol>;
}
