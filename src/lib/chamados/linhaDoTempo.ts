// Conversa do chamado como uma linha do tempo só (26/10/2026): mensagens,
// arquivos e eventos em ordem. Compartilhado com o navegador; não importa o banco.
import { formatInstantDateTime, formatarNumero } from "@/lib/format";
import { ROTULOS, ROTULOS_PRIORIDADE, type Prioridade, type Status } from "./regras";
import { ROTULOS_EVENTO } from "./eventos";

type Quando = Date | string;
export type MensagemDaLinha = { id: string; authorId: string; body: string; internal: boolean; createdAt: Quando };
export type AnexoDaLinha = { id: string; fileName: string; mimeType: string; sizeBytes: number; internal: boolean; commentId: string | null; uploadedById: string; createdAt: Quando };
export type EventoDaLinha = { id: string; type: string; actorId: string | null; data: unknown; internal: boolean; createdAt: Quando };
export type ItemDaLinha =
  | { tipo: "mensagem"; id: string; quando: Date; mensagem: MensagemDaLinha; anexos: AnexoDaLinha[] }
  | { tipo: "anexo"; id: string; quando: Date; anexo: AnexoDaLinha }
  | { tipo: "evento"; id: string; quando: Date; evento: EventoDaLinha };

// "comment" e "attachment" só repetiriam a mensagem e o arquivo, que já estão na linha.
const ESPELHOS = new Set(["comment", "attachment"]);
export function montarLinhaDoTempo({ mensagens, anexos, eventos }: { mensagens: MensagemDaLinha[]; anexos: AnexoDaLinha[]; eventos: EventoDaLinha[] }): ItemDaLinha[] {
  const daMensagem = new Map<string, AnexoDaLinha[]>();
  for (const a of anexos) if (a.commentId && mensagens.some(m => m.id === a.commentId)) daMensagem.set(a.commentId, [...daMensagem.get(a.commentId) ?? [], a]);
  const itens: ItemDaLinha[] = [
    ...mensagens.map(m => ({ tipo: "mensagem" as const, id: m.id, quando: new Date(m.createdAt), mensagem: m, anexos: daMensagem.get(m.id) ?? [] })),
    ...anexos.filter(a => !a.commentId || !daMensagem.has(a.commentId)).map(a => ({ tipo: "anexo" as const, id: a.id, quando: new Date(a.createdAt), anexo: a })),
    ...eventos.filter(e => !ESPELHOS.has(e.type)).map(e => ({ tipo: "evento" as const, id: e.id, quando: new Date(e.createdAt), evento: e })),
  ];
  return itens.sort((a, b) => a.quando.getTime() - b.quando.getTime() || a.id.localeCompare(b.id));
}

const lista = (ids: unknown, nome: (id: string) => string) => Array.isArray(ids) ? ids.filter((v): v is string => typeof v === "string").map(nome).join(", ") : null;
/** Quem fez e o quê, numa frase: "Ana alterou a situação para Em andamento". */
export function descreverEvento(e: Pick<EventoDaLinha, "type" | "actorId" | "data">, nome: (id: string) => string): { texto: string; detalhe?: string } {
  const quem = e.actorId ? nome(e.actorId) : "O Connect", d = (e.data ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case "created": return { texto: `${quem} abriu o chamado${d.semAnalise ? " sem a revisão da IA" : ""}` };
    case "status": return { texto: `${quem} alterou a situação para ${ROTULOS[d.to as Status] ?? "outra situação"}` };
    case "assignees": {
      if (d.assumiu) return { texto: `${quem} assumiu o chamado` };
      const nomes = lista(d.userIds, nome);
      return { texto: nomes === null ? `${quem} alterou os responsáveis` : nomes ? `${quem} definiu os responsáveis: ${nomes}` : `${quem} retirou todos os responsáveis` };
    }
    case "participants": {
      const nomes = lista(d.userIds, nome);
      return { texto: nomes === null ? `${quem} alterou os participantes` : nomes ? `${quem} definiu os participantes: ${nomes}` : `${quem} retirou os participantes adicionais` };
    }
    case "priority": return { texto: `${quem} alterou a prioridade para ${ROTULOS_PRIORIDADE[d.priority as Prioridade] ?? "outra prioridade"}` };
    case "checklist": return { texto: `${quem} atualizou o checklist` };
    case "deadline": return { texto: typeof d.prazo === "string" ? `${quem} ajustou o prazo de resolução para ${formatInstantDateTime(new Date(d.prazo))}` : `${quem} ajustou o prazo de resolução`, ...(typeof d.motivo === "string" && d.motivo ? { detalhe: d.motivo } : {}) };
    case "queue": return { texto: typeof d.posicao === "number" ? `${quem} moveu o chamado para a posição ${d.posicao} da fila` : `${quem} mudou a posição na fila` };
    case "approval": return { texto: d.aprovado ? `${quem} aprovou o chamado` : `${quem} recusou o chamado` };
    case "reopen_requested": return { texto: `${quem} pediu a reabertura` };
    case "reopen_decided": return { texto: d.aprovado ? `${quem} aceitou a reabertura` : `${quem} recusou a reabertura` };
    case "sla": return { texto: "O prazo de atendimento venceu" };
    case "category": return { texto: `${quem} alterou a categoria` };
    case "details": return { texto: `${quem} atualizou os dados do chamado` };
    default: return { texto: `${quem} · ${ROTULOS_EVENTO[e.type] ?? "Atualização"}` };
  }
}

export function tamanhoDoArquivo(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${formatarNumero(bytes / 1024 / 1024, 1)} MB`;
}
