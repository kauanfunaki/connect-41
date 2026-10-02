// Leitura e gravação das conversas do chat de IA.
//
// Toda consulta leva `tenantId` **e** `userId` no `where`: a conversa é da
// pessoa, e id de conversa de outra pessoa responde "não encontrada", igual a
// um id que não existe.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { TurnoAnterior } from "@/lib/ia/laco";
import { nomeExibicao } from "@/lib/companyName";
import { citacoesDoTexto, type Citado } from "./citacoes";
import { corteDaRetencao, inicioDoDiaEmSaoPaulo, lerPropostas, MARCA_DE_SUBSTITUIDA, tituloDaConversa, type PropostaGravada } from "./regras";

export type Dono = { tenantId: string; userId: string };

export type MensagemNaTela = {
  id: string;
  papel: "usuario" | "assistente";
  texto: string;
  propostas: PropostaGravada[];
  truncada: boolean;
  falhou: boolean;
  contexto: string | null;
  criadaEm: string;
  /** Quem a resposta cita, com foto — chave "tipo:id" (ver `citacoes.ts`). */
  citados: Record<string, Citado>;
};

export type ConversaNaLista = { id: string; titulo: string; agentCode: string; atualizadaEm: string };

/** Quantas mensagens de uma conversa a tela carrega. */
const LIMITE_NA_TELA = 200;

export async function perguntasDeHoje(dono: Dono, agora: Date): Promise<number> {
  return getPrisma().agentMessage.count({
    where: {
      role: "USUARIO",
      createdAt: { gte: inicioDoDiaEmSaoPaulo(agora) },
      conversation: { tenantId: dono.tenantId, userId: dono.userId },
    },
  });
}

/** Apaga as conversas do escritório paradas há mais de 90 dias. Barato: índice em `updatedAt`. */
export async function apagarConversasVencidas(tenantId: string, agora: Date): Promise<void> {
  try {
    await getPrisma().agentConversation.deleteMany({ where: { tenantId, updatedAt: { lt: corteDaRetencao(agora) } } });
  } catch (err) {
    console.error("[chat-ia] limpeza de conversas", err);
  }
}

/** A conversa da pessoa, ou uma nova com este agente. */
export async function conversaParaPerguntar(
  dono: Dono,
  conversaId: string | null,
  agentCode: string,
  pergunta: string
): Promise<{ id: string; agentCode: string } | null> {
  const prisma = getPrisma();
  if (conversaId) {
    return prisma.agentConversation.findFirst({
      where: { id: conversaId, tenantId: dono.tenantId, userId: dono.userId },
      select: { id: true, agentCode: true },
    });
  }
  return prisma.agentConversation.create({
    data: { tenantId: dono.tenantId, userId: dono.userId, agentCode, title: tituloDaConversa(pergunta) },
    select: { id: true, agentCode: true },
  });
}

/** As trocas anteriores, em texto, para mandar junto da pergunta. */
export async function historicoDaConversa(conversaId: string): Promise<TurnoAnterior[]> {
  const linhas = await getPrisma().agentMessage.findMany({
    where: { conversationId: conversaId, failed: false },
    select: { role: true, content: true },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  return linhas.reverse().map((m) => ({ papel: m.role === "USUARIO" ? "usuario" : "assistente", texto: m.content }));
}

export async function gravarMensagem(input: {
  conversaId: string;
  papel: "usuario" | "assistente";
  texto: string;
  propostas?: PropostaGravada[];
  runId?: string | null;
  truncada?: boolean;
  falhou?: boolean;
  contexto?: string | null;
}): Promise<MensagemNaTela> {
  const prisma = getPrisma();
  const [m] = await prisma.$transaction([
    prisma.agentMessage.create({
      data: {
        conversationId: input.conversaId,
        role: input.papel === "usuario" ? "USUARIO" : "ASSISTENTE",
        content: input.texto,
        proposals: input.propostas && input.propostas.length > 0 ? (input.propostas as unknown as Prisma.InputJsonValue) : undefined,
        runId: input.runId ?? null,
        truncated: input.truncada ?? false,
        failed: input.falhou ?? false,
        contextLabel: input.contexto ?? null,
      },
    }),
    // Toca a conversa: é o `updatedAt` que ordena a lista e conta a retenção.
    prisma.agentConversation.update({ where: { id: input.conversaId }, data: { updatedAt: new Date() } }),
  ]);
  return paraTela(m);
}

function paraTela(m: {
  id: string;
  role: "USUARIO" | "ASSISTENTE";
  content: string;
  proposals: unknown;
  truncated: boolean;
  failed: boolean;
  contextLabel: string | null;
  createdAt: Date;
}): MensagemNaTela {
  return {
    id: m.id,
    papel: m.role === "USUARIO" ? "usuario" : "assistente",
    texto: m.content,
    propostas: lerPropostas(m.proposals),
    truncada: m.truncated,
    falhou: m.failed,
    contexto: m.contextLabel,
    criadaEm: m.createdAt.toISOString(),
    citados: {},
  };
}

export async function listarConversas(dono: Dono): Promise<ConversaNaLista[]> {
  const linhas = await getPrisma().agentConversation.findMany({
    where: { tenantId: dono.tenantId, userId: dono.userId },
    select: { id: true, title: true, agentCode: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  return linhas.map((c) => ({ id: c.id, titulo: c.title, agentCode: c.agentCode, atualizadaEm: c.updatedAt.toISOString() }));
}

export async function mensagensDaConversa(
  dono: Dono,
  conversaId: string
): Promise<{ agentCode: string; mensagens: MensagemNaTela[] } | null> {
  const c = await getPrisma().agentConversation.findFirst({
    where: { id: conversaId, tenantId: dono.tenantId, userId: dono.userId },
    select: {
      agentCode: true,
      // As substituídas (editar/refazer) não voltam para a tela.
      messages: {
        where: { OR: [{ contextLabel: null }, { contextLabel: { not: MARCA_DE_SUBSTITUIDA } }] },
        orderBy: { createdAt: "desc" },
        take: LIMITE_NA_TELA,
      },
    },
  });
  if (!c) return null;
  return { agentCode: c.agentCode, mensagens: await comCitadosEmLote(dono.tenantId, c.messages.reverse().map(paraTela)) };
}

export async function apagarConversa(dono: Dono, conversaId: string): Promise<boolean> {
  const r = await getPrisma().agentConversation.deleteMany({
    where: { id: conversaId, tenantId: dono.tenantId, userId: dono.userId },
  });
  return r.count > 0;
}

/** A mensagem do assistente com as propostas, se for da pessoa. */
export async function mensagemComPropostas(dono: Dono, mensagemId: string) {
  return getPrisma().agentMessage.findFirst({
    where: { id: mensagemId, role: "ASSISTENTE", conversation: { tenantId: dono.tenantId, userId: dono.userId } },
    select: { id: true, proposals: true, conversation: { select: { agentCode: true } } },
  });
}

export async function marcarPropostaAplicada(mensagemId: string, propostas: PropostaGravada[], indice: number): Promise<void> {
  const novas = propostas.map((p, i) => (i === indice ? { ...p, aplicada: true } : p));
  await getPrisma().agentMessage.update({
    where: { id: mensagemId },
    data: { proposals: novas as unknown as Prisma.InputJsonValue },
  });
}

/** O "Não" do cartão de decisão — fica gravado no Json, sem migration. */
export async function marcarPropostaRecusada(mensagemId: string, propostas: PropostaGravada[], indice: number): Promise<void> {
  const novas = propostas.map((p, i) => (i === indice ? { ...p, recusada: true } : p));
  await getPrisma().agentMessage.update({
    where: { id: mensagemId },
    data: { proposals: novas as unknown as Prisma.InputJsonValue },
  });
}

/**
 * Editar a pergunta ou refazer a resposta (02/10/2026): a mensagem e tudo o que
 * veio depois dela, na mesma conversa, ficam substituídos — saem da tela e do
 * histórico mandado à IA, mas não são apagados, e as perguntas continuam
 * contando no limite do dia. Só na conversa da própria pessoa.
 */
export async function substituirAPartirDe(dono: Dono, mensagemId: string): Promise<boolean> {
  const prisma = getPrisma();
  const m = await prisma.agentMessage.findFirst({
    where: { id: mensagemId, conversation: { tenantId: dono.tenantId, userId: dono.userId } },
    select: { conversationId: true, createdAt: true },
  });
  if (!m) return false;
  await prisma.agentMessage.updateMany({
    where: { conversationId: m.conversationId, createdAt: { gte: m.createdAt } },
    data: { failed: true, contextLabel: MARCA_DE_SUBSTITUIDA },
  });
  return true;
}

// ─── Pessoas e empresas citadas, com foto (02/10/2026) ───────────────────────
//
// A resposta gravada só tem citação que a execução viu (`filtrarCitacoes` no
// responder). Aqui elas ganham nome e foto, buscados em lote e sempre no
// escritório: id de fora do tenant (ou apagado) não acha nada e a tela mostra
// só o nome.

export async function citadosDosTextos(tenantId: string, textos: string[]): Promise<Record<string, Citado>> {
  const todas = textos.flatMap(citacoesDoTexto);
  if (todas.length === 0) return {};
  const ids = (tipo: Citado["tipo"]) => [...new Set(todas.filter((c) => c.tipo === tipo).map((c) => c.id))];
  const prisma = getPrisma();
  const [usuarios, pessoas, empresas] = await Promise.all([
    ids("usuario").length ? prisma.user.findMany({ where: { tenantId, id: { in: ids("usuario") } }, select: { id: true, name: true, photoUrl: true } }) : [],
    ids("pessoa").length ? prisma.person.findMany({ where: { tenantId, id: { in: ids("pessoa") } }, select: { id: true, name: true, photoUrl: true } }) : [],
    ids("empresa").length
      ? prisma.company.findMany({ where: { tenantId, id: { in: ids("empresa") } }, select: { id: true, name: true, displayName: true, logoUrl: true } })
      : [],
  ]);
  const r: Record<string, Citado> = {};
  for (const u of usuarios) r[`usuario:${u.id}`] = { tipo: "usuario", nome: u.name, foto: u.photoUrl, href: null };
  for (const p of pessoas) r[`pessoa:${p.id}`] = { tipo: "pessoa", nome: p.name, foto: p.photoUrl, href: `/pessoas/${p.id}` };
  for (const e of empresas) r[`empresa:${e.id}`] = { tipo: "empresa", nome: nomeExibicao(e), foto: e.logoUrl, href: `/empresas/${e.id}` };
  return r;
}

export async function comCitados(tenantId: string, m: MensagemNaTela): Promise<MensagemNaTela> {
  if (m.papel !== "assistente") return m;
  return { ...m, citados: await citadosDosTextos(tenantId, [m.texto]) };
}

/** Várias de uma vez: uma consulta por tipo para a conversa inteira. */
export async function comCitadosEmLote(tenantId: string, ms: MensagemNaTela[]): Promise<MensagemNaTela[]> {
  const citados = await citadosDosTextos(
    tenantId,
    ms.filter((m) => m.papel === "assistente").map((m) => m.texto)
  );
  if (Object.keys(citados).length === 0) return ms;
  return ms.map((m) => (m.papel === "assistente" ? { ...m, citados } : m));
}
