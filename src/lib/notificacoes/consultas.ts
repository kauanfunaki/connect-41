// As notificações de uma pessoa, prontas para o sino e a central (02/10/2026).
//
// Tudo filtrado por `tenantId` + `userId`: notificação é da pessoa, e nenhuma
// consulta daqui alcança a de outra pessoa ou de outro escritório.

import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { linkDaNotificacao } from "@/lib/notificacaoLink";
import { nomeExibicao } from "@/lib/companyName";
import { telefoneLegivel } from "@/lib/whatsapp/conversas";
import { doTipo, filtroDaAba, ocultosValidos, type Aba, type AbaOuTodas, type IconeDaNotificacao, type Tom } from "./catalogo";

export type TipoDoChip = "empresa" | "pessoa" | "card" | "processo" | "solicitacao" | "conversa" | "pendencia";

export type NotificacaoNaTela = {
  id: string;
  tipo: string;
  aba: Aba;
  icone: IconeDaNotificacao;
  tom: Tom;
  titulo: string;
  mensagem: string;
  lida: boolean;
  href: string | null;
  /** ISO — a tela formata no fuso de São Paulo. */
  criadaEm: string;
  chip: { rotulo: string; tipo: TipoDoChip } | null;
  /** Quem causou (05/10/2026): a foto no lugar do ícone. Nulo nos alertas automáticos. */
  autor: { nome: string; foto: string | null } | null;
  arquivada: boolean;
};

export type FiltrosDasNotificacoes = {
  aba: AbaOuTodas;
  status: "todas" | "nao_lidas";
  q: string;
  /** A caixa das arquivadas (05/10/2026): todas as abas juntas, sem os filtros de aba e de lida. */
  arquivadas?: boolean;
  cursor?: string | null;
  limite?: number;
};

export type Dono = { tenantId: string; userId: string };

const LIMITE_PADRAO = 30;
const LIMITE_MAXIMO = 100;

/** O que o chip mostra, pelo tipo e pela entidade — na mesma ordem do `linkDaNotificacao`. */
export function entidadeDoChip(n: {
  type: string;
  entityType?: string | null;
  entityId?: string | null;
}): { tipo: TipoDoChip; id: string } | null {
  const id = n.entityId;
  if (!id) return null;
  if (n.type.startsWith("WHATSAPP_")) return { tipo: "conversa", id };
  if (n.type.startsWith("PROCESS_")) return { tipo: "processo", id };
  if (n.type.startsWith("SOLICITACAO_")) return { tipo: "solicitacao", id };
  if (n.type === "client_request_answered") return { tipo: "pendencia", id };
  if (n.entityType === "COMPANY") return { tipo: "empresa", id };
  if (n.entityType === "PERSON") return { tipo: "pessoa", id };
  // Menção e comentário em card sem empresa nem pessoa guardam o id do card.
  if (n.type === "MENTION" || n.type === "COMMENT") return { tipo: "card", id };
  return null;
}

/** "2026-10-02T14:00:00.000Z|<id>" — a última linha da página, para pedir a próxima. */
export function montarCursor(n: { createdAt: Date; id: string }): string {
  return `${n.createdAt.toISOString()}|${n.id}`;
}

export function lerCursor(c: string | null | undefined): { em: Date; id: string } | null {
  if (!c) return null;
  const [iso, id] = c.split("|");
  const em = new Date(iso ?? "");
  return id && !Number.isNaN(em.getTime()) ? { em, id } : null;
}

/**
 * O `where` de uma aba. Arquivada fica fora das abas; na caixa das arquivadas
 * entra tudo o que a pessoa arquivou, de qualquer aba e de tipo oculto também —
 * foi ela que guardou ali.
 */
export function ondeDasNotificacoes(
  dono: Dono,
  f: Pick<FiltrosDasNotificacoes, "aba" | "status" | "q" | "arquivadas">,
  ocultos: string[] = []
): Prisma.NotificationWhereInput {
  const busca = f.q.trim().slice(0, 100);
  const base = { tenantId: dono.tenantId, userId: dono.userId, ...(busca ? { message: { contains: busca } } : {}) };
  if (f.arquivadas) return { ...base, archivedAt: { not: null } };
  const tipos = filtroDaAba(f.aba, ocultos);
  return {
    ...base,
    archivedAt: null,
    ...(tipos ? { type: tipos } : {}),
    ...(f.status === "nao_lidas" ? { read: false } : {}),
  };
}

/** Os tipos que a pessoa desligou nas preferências — só os que ainda valem no catálogo. */
export async function tiposOcultos(dono: Dono): Promise<string[]> {
  const linhas = await getPrisma().notificationHiddenType.findMany({
    where: { tenantId: dono.tenantId, userId: dono.userId },
    select: { type: true },
  });
  return ocultosValidos(linhas.map((l) => l.type));
}

/** O número do sino: não lidas, fora as arquivadas e as dos tipos ocultos. */
export async function contarNaoLidasVisiveis(dono: Dono, ocultos: string[]): Promise<number> {
  return getPrisma().notification.count({
    where: { tenantId: dono.tenantId, userId: dono.userId, read: false, archivedAt: null, ...(ocultos.length ? { type: { notIn: ocultos } } : {}) },
  });
}

export async function consultarNotificacoes(
  dono: Dono,
  f: FiltrosDasNotificacoes,
  ocultos: string[] = []
): Promise<{ itens: NotificacaoNaTela[]; proximoCursor: string | null }> {
  const limite = Math.min(Math.max(f.limite ?? LIMITE_PADRAO, 1), LIMITE_MAXIMO);
  const cursor = lerCursor(f.cursor);
  const where = ondeDasNotificacoes(dono, f, ocultos);
  const linhas = await getPrisma().notification.findMany({
    where: cursor
      ? { AND: [where, { OR: [{ createdAt: { lt: cursor.em } }, { createdAt: cursor.em, id: { lt: cursor.id } }] }] }
      : where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limite + 1,
  });
  const pagina = linhas.slice(0, limite);
  const [chips, autores] = await Promise.all([chipsDasNotificacoes(dono.tenantId, pagina), autoresDasNotificacoes(pagina)]);
  return {
    itens: pagina.map((n) => {
      const t = doTipo(n.type);
      return {
        id: n.id,
        tipo: n.type,
        aba: t.aba,
        icone: t.icone,
        tom: t.tom,
        titulo: t.titulo,
        mensagem: n.message,
        lida: n.read,
        href: linkDaNotificacao(n),
        criadaEm: n.createdAt.toISOString(),
        chip: chips.get(n.id) ?? null,
        autor: (n.actorUserId && autores.get(n.actorUserId)) || null,
        arquivada: n.archivedAt !== null,
      };
    }),
    proximoCursor: linhas.length > limite ? montarCursor(pagina[pagina.length - 1]) : null,
  };
}

/** Não lidas por aba — as contagens das abas do sino e da central. Arquivada e tipo oculto não contam. */
export async function naoLidasPorAba(dono: Dono, ocultos: string[] = []): Promise<Record<AbaOuTodas, number>> {
  const grupos = await getPrisma().notification.groupBy({
    by: ["type"],
    where: { tenantId: dono.tenantId, userId: dono.userId, read: false, archivedAt: null },
    _count: { _all: true },
  });
  const escondidos = new Set(ocultos);
  const r: Record<AbaOuTodas, number> = { todas: 0, para_mim: 0, clientes: 0, alertas: 0 };
  for (const g of grupos) {
    if (escondidos.has(g.type)) continue;
    const n = g._count._all;
    r.todas += n;
    r[doTipo(g.type).aba] += n;
  }
  return r;
}

/**
 * O nome e a foto de quem causou cada notificação, em lote (05/10/2026).
 *
 * Pelo id, sem filtrar pelo escritório: quem age pode ser o suporte entrando
 * em outro escritório, com usuário do escritório de origem. Os ids vêm das
 * notificações da própria pessoa, gravados pelo servidor — e nome e foto são o
 * que a equipe já vê de quem age no escritório.
 */
async function autoresDasNotificacoes(linhas: { actorUserId: string | null }[]): Promise<Map<string, { nome: string; foto: string | null }>> {
  const ids = [...new Set(linhas.map((n) => n.actorUserId).filter((x): x is string => !!x))];
  if (ids.length === 0) return new Map();
  const usuarios = await getPrisma().user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, photoUrl: true } });
  return new Map(usuarios.map((u) => [u.id, { nome: u.name, foto: u.photoUrl }]));
}

/**
 * O nome no chip de cada notificação, buscado em lote — uma consulta por tipo
 * de entidade, sempre filtrada pelo escritório. A mensagem já cita o nome em
 * texto, então o chip não mostra nada que a pessoa já não lesse; o link é que
 * respeita o escopo, e quem barra é a tela de destino.
 */
async function chipsDasNotificacoes(
  tenantId: string,
  linhas: { id: string; type: string; entityType: string | null; entityId: string | null }[]
): Promise<Map<string, { rotulo: string; tipo: TipoDoChip }>> {
  const alvos = linhas.map((n) => ({ n, e: entidadeDoChip(n) })).filter((x): x is { n: (typeof linhas)[number]; e: { tipo: TipoDoChip; id: string } } => x.e !== null);
  const ids = (tipo: TipoDoChip) => [...new Set(alvos.filter((x) => x.e.tipo === tipo).map((x) => x.e.id))];
  const prisma = getPrisma();
  const vazio = Promise.resolve([] as never[]);

  const [empresas, pessoas, cards, processos, solicitacoes, conversas, pendencias] = await Promise.all([
    ids("empresa").length ? prisma.company.findMany({ where: { tenantId, id: { in: ids("empresa") } }, select: { id: true, name: true, displayName: true } }) : vazio,
    ids("pessoa").length ? prisma.person.findMany({ where: { tenantId, id: { in: ids("pessoa") } }, select: { id: true, name: true } }) : vazio,
    ids("card").length ? prisma.pipelineItem.findMany({ where: { tenantId, id: { in: ids("card") } }, select: { id: true, title: true } }) : vazio,
    ids("processo").length
      ? prisma.process.findMany({ where: { tenantId, id: { in: ids("processo") } }, select: { id: true, title: true, company: { select: { name: true, displayName: true } } } })
      : vazio,
    ids("solicitacao").length ? prisma.serviceRequest.findMany({ where: { tenantId, id: { in: ids("solicitacao") } }, select: { id: true, number: true } }) : vazio,
    ids("conversa").length ? prisma.whatsappThread.findMany({ where: { tenantId, id: { in: ids("conversa") } }, select: { id: true, waPhone: true, personId: true } }) : vazio,
    ids("pendencia").length ? prisma.clientRequest.findMany({ where: { tenantId, id: { in: ids("pendencia") } }, select: { id: true, title: true } }) : vazio,
  ]);

  // Conversa ligada a uma pessoa mostra o nome; sem vínculo, o telefone.
  const pessoasDasConversas = conversas.map((c) => c.personId).filter((x): x is string => !!x);
  const nomesDasConversas = pessoasDasConversas.length
    ? await prisma.person.findMany({ where: { tenantId, id: { in: pessoasDasConversas } }, select: { id: true, name: true } })
    : [];
  const nomeDaPessoa = new Map([...pessoas, ...nomesDasConversas].map((p) => [p.id, p.name]));

  const rotulos = new Map<string, string>();
  for (const e of empresas) rotulos.set(`empresa:${e.id}`, nomeExibicao(e));
  for (const p of pessoas) rotulos.set(`pessoa:${p.id}`, p.name);
  for (const c of cards) rotulos.set(`card:${c.id}`, c.title?.trim() || "Card sem título");
  for (const p of processos) rotulos.set(`processo:${p.id}`, p.title?.trim() || nomeExibicao(p.company));
  for (const s of solicitacoes) rotulos.set(`solicitacao:${s.id}`, `Solicitação nº ${s.number}`);
  for (const c of conversas) rotulos.set(`conversa:${c.id}`, (c.personId && nomeDaPessoa.get(c.personId)) || telefoneLegivel(c.waPhone));
  for (const p of pendencias) rotulos.set(`pendencia:${p.id}`, p.title);

  const r = new Map<string, { rotulo: string; tipo: TipoDoChip }>();
  for (const { n, e } of alvos) {
    const rotulo = rotulos.get(`${e.tipo}:${e.id}`);
    if (rotulo) r.set(n.id, { rotulo, tipo: e.tipo });
  }
  return r;
}
