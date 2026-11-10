import { randomUUID } from "crypto";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { hit } from "@/lib/rateLimit";
import { isModuleEnabled } from "@/lib/modules";
import { catalogoParaTriagem } from "@/lib/ops/catalogo";
import { MODULO_OPS } from "@/lib/ops/regras";
import { configDoHelpdesk } from "./contexto";
import { prepararCatalogo } from "./catalogo-servidor";
import { A_CLASSIFICAR, caminhoDaCategoria, categoriasClassificaveis } from "./catalogo";
import { classificar, type Classificacao } from "./classificacao";
import { procurarNoOrquestrador, type BuscaNoOrquestrador } from "./triagem";
import { aprovadoresDaCategoria, evento } from "./comandos";
import { despacharEventos } from "./notificacoes";
import { motivoDaFalha } from "./falhaDaIa";
import { categoriaSchema, dadosSchema, emTriagem, resultadoDaTriagem, tituloDaDescricao, validarFormulario, type Categoria, type MotivoSemCategoria, type Triagem } from "./regras";

// A triagem depois do envio (10/11/2026). O chamado da tela nasce em
// "Aguardando triagem" (`enviarRascunho`); aqui, fora da resposta, a IA confere
// se já existe algo no Orquestrador que faça o pedido e classifica o chamado.
// No fim, o chamado vai para a situação de abertura e quem abriu é avisado.
//
// Quem chama: a action da tela, com `after()`, logo depois da resposta; e o
// motor de alertas (`retomarTriagens`), para a que não terminou — o servidor
// reiniciou no meio, o banco caiu na gravação.
//
// Uma vez só, mesmo com duas execuções: a vez é reservada no rascunho do
// chamado (`analysisToken`, a mesma reserva da análise antiga, livre depois do
// envio), a conclusão só grava se o chamado ainda está em triagem, e o evento
// tem chave própria. Falha da IA não segura o chamado: ele vai para A
// classificar, pela equipe, com o motivo no log do servidor.

/** Quanto tempo uma execução segura a vez. As duas chamadas da IA têm 20 s cada, em paralelo. */
const RESERVA_MS = 2 * 60_000;
/** Na retomada, a IA só é chamada para o chamado recente; o antigo vai direto para a equipe. */
const RETOMADA_COM_IA_MS = 60 * 60_000;

type Chamado = { id: string; draftId: string; title: string; description: string; requesterSectorCode: string; createdById: string; priority: string; requestData: unknown; tags: unknown };
type Decisao = { classificacao: Classificacao; busca: BuscaNoOrquestrador; categoria: (Categoria & { id: string }) | null; semCategoria: MotivoSemCategoria | null; caminhos: { id: string; name: string; parentId: string | null }[] };

const log = (tenantId: string, ticketId: string, texto: string) => `[chamados] triagem do chamado ${ticketId} (escritório ${tenantId}): ${texto}`;

export type FimDaTriagem = "concluida" | "em_andamento" | "nada_a_fazer";

export async function triarChamado(tenantId: string, ticketId: string, opcoes: { comIA?: boolean } = {}): Promise<FimDaTriagem> {
  const db = getPrisma();
  if (!(await configDoHelpdesk(tenantId)).enabled) return "nada_a_fazer";
  const t = await db.helpdeskTicket.findFirst({ where: { tenantId, id: ticketId }, select: { id: true, draftId: true, title: true, description: true, requesterSectorCode: true, createdById: true, priority: true, requestData: true, tags: true, status: true } });
  if (!t || !emTriagem(t.status)) return "nada_a_fazer";
  const token = randomUUID(), agora = new Date();
  const reserva = await db.helpdeskDraft.updateMany({ where: { tenantId, id: t.draftId, OR: [{ analysisToken: null }, { analysisStartedAt: { lt: new Date(agora.getTime() - RESERVA_MS) } }] }, data: { analysisToken: token, analysisStartedAt: agora } });
  if (reserva.count !== 1) return "em_andamento";
  try {
    let decisao: Decisao;
    try { decisao = await decidir(tenantId, t, opcoes.comIA ?? true); }
    catch (err) {
      // Erro fora da IA (banco, catálogo): o chamado não fica preso, vai para a equipe.
      console.error(log(tenantId, t.id, `falhou antes de concluir, vai para A classificar: ${motivoDaFalha(err)}`));
      decisao = { classificacao: semClassificacao(motivoDaFalha(err)), busca: { existente: null, falha: null }, categoria: null, semCategoria: "falha", caminhos: [] };
    }
    const triagem = await concluir(tenantId, t, decisao);
    if (!triagem) return "nada_a_fazer";
    await Promise.allSettled([
      logAudit({ tenantId, rotina: "triagemDeChamados", action: "helpdesk.triaged", entityType: "HelpdeskTicket", entityId: t.id, metadata: { resultado: resultadoDaTriagem(triagem), ...(triagem.semCategoria ? { semCategoria: triagem.semCategoria } : {}) } }),
      despacharEventos(tenantId, t.id),
    ]);
    return "concluida";
  } finally {
    await db.helpdeskDraft.updateMany({ where: { tenantId, id: t.draftId, analysisToken: token }, data: { analysisToken: null, analysisStartedAt: null } }).catch(() => {});
  }
}

const semClassificacao = (falha: string): Classificacao => ({ categoryId: null, reason: "", title: "", tags: [], origem: null, falha });

/** As duas perguntas à IA, em paralelo e independentes: uma falhar não apaga a outra. */
async function decidir(tenantId: string, t: Chamado, comIA: boolean): Promise<Decisao> {
  const db = getPrisma();
  await prepararCatalogo(tenantId);
  const linhas = await db.helpdeskCategory.findMany({ where: { tenantId } });
  const cats = linhas.map(cat => ({ ...categoriaSchema.parse(cat), id: cat.id }));
  const pendente = linhas.find(cat => cat.name === A_CLASSIFICAR);
  if (!pendente) throw new Error("Categoria A classificar não encontrada.");
  const dados = dadosSchema.parse({ title: t.title, description: t.description, categoryId: pendente.id, requesterSectorCode: t.requesterSectorCode, priority: t.priority, requestData: t.requestData, tags: t.tags });
  const c = { tenantId, userId: t.createdById, ticketId: t.id };
  const limite = comIA ? hit(`helpdesk-triagem:${tenantId}:${t.createdById}`, 10, 60000) : null;
  let classificacao: Classificacao, busca: BuscaNoOrquestrador;
  if (!comIA) [classificacao, busca] = [semClassificacao("retomada de triagem antiga, sem chamar a IA"), { existente: null, falha: null }];
  else if (!limite?.allowed) [classificacao, busca] = [semClassificacao("limite de triagens por minuto de quem abriu"), { existente: null, falha: null }];
  else [classificacao, busca] = await Promise.all([classificar(c, dados, cats), buscarNoOrquestrador(c, dados)]);

  if (classificacao.falha) console.error(log(tenantId, t.id, `a classificação falhou, vai para A classificar: ${classificacao.falha}`));
  else if (!classificacao.categoryId) console.info(log(tenantId, t.id, "a IA não identificou a categoria (falta de contexto)."));
  if (busca.falha) console.error(log(tenantId, t.id, `a busca no Orquestrador falhou: ${busca.falha}`));

  let categoria = classificacao.categoryId ? categoriasClassificaveis(cats).find(cat => cat.id === classificacao.categoryId) ?? null : null;
  let semCategoria: MotivoSemCategoria | null = categoria ? null : classificacao.falha ? "falha" : "incerto";
  if (categoria) {
    // A pessoa não viu os campos da categoria ao abrir: se ela pede o que o
    // pedido não tem, a equipe classifica e pede o que faltar.
    const anexos = await db.helpdeskAttachment.findMany({ where: { tenantId, ticketId: t.id }, select: { attachmentKey: true, mimeType: true } });
    try { validarFormulario({ ...dados, categoryId: categoria.id }, categoria, anexos); }
    catch { categoria = null; semCategoria = "formulario"; }
  }
  return { classificacao, busca, categoria, semCategoria, caminhos: linhas };
}

async function buscarNoOrquestrador(c: { tenantId: string; userId: string; ticketId: string }, dados: { description: string; requestData: Record<string, string> }): Promise<BuscaNoOrquestrador> {
  try {
    if (!await isModuleEnabled(c.tenantId, MODULO_OPS)) return { existente: null, falha: null };
    return await procurarNoOrquestrador(c, dados, await catalogoParaTriagem(c.tenantId));
  } catch (err) { return { existente: null, falha: motivoDaFalha(err) }; }
}

/** Grava o resultado numa transação só. Devolve nulo se outra execução já concluiu. */
async function concluir(tenantId: string, t: Chamado, d: Decisao): Promise<Triagem | null> {
  return getPrisma().$transaction(async tx => {
    let categoria = d.categoria, semCategoria = d.semCategoria;
    // A categoria pode ter sido desativada ou virado grupo enquanto a IA respondia.
    if (categoria && !categoriasClassificaveis(await tx.helpdeskCategory.findMany({ where: { tenantId }, select: { id: true, name: true, parentId: true, active: true } })).some(cat => cat.id === categoria!.id)) { categoria = null; semCategoria = "incerto"; }
    let aprovadores: string[] = [];
    if (categoria?.requiresApproval) {
      aprovadores = await aprovadoresDaCategoria(tx, tenantId, categoria, t.requesterSectorCode, t.createdById);
      if (!aprovadores.length) { categoria = null; semCategoria = "aprovador"; }
    }
    const pendente = await tx.helpdeskCategory.findFirstOrThrow({ where: { tenantId, name: A_CLASSIFICAR }, select: { id: true } });
    const comAprovacao = !!categoria?.requiresApproval;
    // O título provisório (o começo da descrição) dá lugar ao da IA.
    const titulo = d.classificacao.title.length >= 3 && t.title === tituloDaDescricao(t.description) ? d.classificacao.title : t.title;
    const triagem: Triagem = { existente: d.busca.existente, categoria: categoria ? caminhoDaCategoria(d.caminhos, categoria.id) : null, semCategoria: categoria ? null : semCategoria ?? "falha", justificativa: d.classificacao.reason.slice(0, 500) };
    const r = await tx.helpdeskTicket.updateMany({ where: { tenantId, id: t.id, status: "AGUARDANDO_TRIAGEM" }, data: {
      status: comAprovacao ? "AGUARDANDO_APROVACAO" : "ABERTO", categoryId: categoria?.id ?? pendente.id, title: titulo,
      ...(d.classificacao.tags.length ? { tags: d.classificacao.tags } : {}),
      approvalRequired: comAprovacao, approvalStatus: comAprovacao ? "PENDING" : "NOT_REQUIRED", approverIds: aprovadores, version: { increment: 1 },
    } });
    if (r.count !== 1) return null;
    if (categoria?.checklistTemplate.length) await tx.helpdeskChecklistItem.createMany({ data: categoria.checklistTemplate.map(i => ({ tenantId, ticketId: t.id, key: i.key, label: i.label })) });
    if (comAprovacao) await tx.helpdeskApproval.create({ data: { tenantId, ticketId: t.id, cycleNumber: 1 } });
    await evento(tx, tenantId, t.id, null, "triagem", triagem, false, `triagem:${t.id}`);
    return triagem;
  });
}

/**
 * Retomada pelo motor de alertas (a cada 15 minutos): o chamado que passou do
 * tempo da reserva em "Aguardando triagem" é triado de novo. Recente, com a
 * IA; com mais de uma hora, direto para a equipe.
 */
export async function retomarTriagens(tenantId: string, agora = new Date()): Promise<number> {
  if (!(await configDoHelpdesk(tenantId)).enabled) return 0;
  const presos = await getPrisma().helpdeskTicket.findMany({ where: { tenantId, status: "AGUARDANDO_TRIAGEM", createdAt: { lt: new Date(agora.getTime() - RESERVA_MS) } }, select: { id: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 5 });
  let concluidas = 0;
  for (const p of presos) {
    if (await triarChamado(tenantId, p.id, { comIA: agora.getTime() - p.createdAt.getTime() < RETOMADA_COM_IA_MS }) === "concluida") concluidas++;
  }
  return concluidas;
}
