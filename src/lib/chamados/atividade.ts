// A atividade recente de cada chamado na lista (03/11/2026): os últimos
// eventos em frases curtas, com o papel de quem agiu no lugar do nome —
// "Suporte assumiu o chamado", "Requerente comentou". O comentário vai junto,
// resumido, para a dica ao lado da frase. Compartilhado com o navegador; não
// importa o banco.
import { saoPauloParts } from "@/lib/agenda";
import { descreverEvento, type EventoDaLinha } from "./linhaDoTempo";

export type Papel = "Requerente" | "Suporte" | "Usuário";
/** Quem é quem no chamado: quem abriu, os responsáveis e a equipe do setor responsável. */
export type Autoria = { createdById: string; responsaveis: string[]; equipe: ReadonlySet<string> };

/** Quem abriu é o Requerente, mesmo sendo da equipe; responsável ou equipe é o Suporte; o resto (o gestor do setor, um aprovador), Usuário. */
export function papelDoAutor(actorId: string, a: Autoria): Papel {
  if (actorId === a.createdById) return "Requerente";
  if (a.responsaveis.includes(actorId) || a.equipe.has(actorId)) return "Suporte";
  return "Usuário";
}

export type Atividade = { id: string; texto: string; quando: Date; comentario?: string };

const LIMITE_DO_COMENTARIO = 280;
function resumir(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > LIMITE_DO_COMENTARIO ? `${limpo.slice(0, LIMITE_DO_COMENTARIO - 1).trimEnd()}…` : limpo;
}

/** Os eventos (já na ordem e no recorte que a tela quer) em frases; `comentarios` leva o texto de cada comentário pelo id. */
export function atividadesRecentes(eventos: EventoDaLinha[], a: Autoria, nome: (id: string) => string, comentarios: ReadonlyMap<string, string>): Atividade[] {
  return eventos.map(e => {
    const papel = e.actorId ? papelDoAutor(e.actorId, a) : undefined;
    const quando = new Date(e.createdAt);
    if (e.type === "comment") {
      const d = (e.data ?? {}) as Record<string, unknown>;
      const corpo = typeof d.commentId === "string" ? comentarios.get(d.commentId)?.trim() : undefined;
      return { id: e.id, quando, texto: `${papel ?? "O Connect"} ${e.internal ? "deixou uma nota interna" : "comentou"}`, ...(corpo ? { comentario: resumir(corpo) } : {}) };
    }
    return { id: e.id, quando, texto: descreverEvento(e, nome, papel).texto };
  });
}

/** O tom da última atividade: verde nas últimas 24 h, âmbar passados 3 dias sem movimento. */
export function idadeDaAtividade(quando: Date, agora: Date): "recente" | "normal" | "parada" {
  const horas = (agora.getTime() - quando.getTime()) / 3_600_000;
  return horas < 24 ? "recente" : horas > 72 ? "parada" : "normal";
}

const diaEmMs = (dateKey: string) => Date.UTC(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)) - 1, Number(dateKey.slice(8, 10)));
/** "em 7 dias", "amanhã", "hoje", "venceu hoje", "venceu há 3 dias" — em dias do escritório (São Paulo). */
export function prazoRelativo(vence: Date, agora: Date): string {
  const dias = Math.round((diaEmMs(saoPauloParts(vence).dateKey) - diaEmMs(saoPauloParts(agora).dateKey)) / 86_400_000);
  if (dias === 0) return vence < agora ? "venceu hoje" : "hoje";
  if (dias === 1) return "amanhã";
  if (dias > 1) return `em ${dias} dias`;
  return dias === -1 ? "venceu ontem" : `venceu há ${-dias} dias`;
}
