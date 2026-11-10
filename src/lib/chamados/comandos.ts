import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { isFullWrite } from "@/lib/auth/papeis";
import { logAudit } from "@/lib/audit";
import { configDoHelpdesk, exigirAbertura, exigirEscrita, exigirGestao, exigirOperacao, type Contexto } from "./contexto";
import { podeResponder, podeVer } from "./acesso";
import { categoriaAtual, categorias, rascunho, strings } from "./consultas";
import { categoriaSchema, dadosSchema, dadosRascunhoSchema, validarFormulario, tituloDaDescricao, emTriagem, fechado, pausado, aguardandoSolicitante, STATUS, PRIORIDADES, type Categoria, type Status, type DadosDoChamado } from "./regras";
import { anexosDoChamado } from "./armazenamento";
import { prepararCatalogo } from "./catalogo-servidor";
import { A_CLASSIFICAR, categoriasClassificaveis } from "./catalogo";
import { SLA_PADRAO, somarMinutosUteis, minutosUteisEntre } from "./sla";
import { despacharEventos } from "./notificacoes";

type Tx = Prisma.TransactionClient;
export const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const desatualizado = () => new Error("O chamado ou rascunho mudou. Atualize a página para continuar.");
const identidade = z.string().min(1).max(191);
const ids = z.array(identidade).max(50).transform(v => [...new Set(v)]);
export async function evento(tx: Tx, tenantId: string, ticketId: string, actorId: string | null, type: string, data: unknown = {}, internal = false, dedupKey?: string) {
  return tx.helpdeskEvent.create({ data: { tenantId, ticketId, actorId, type, data: json(data), internal, dedupKey } });
}
export async function travarEscritorio(tx: Tx, tenantId: string) {
  await tx.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
}
export async function depois(c: Contexto, id: string, action: string) {
  // Falhas de entrega não transformam uma gravação confirmada em "falha":
  // eventos pendentes serão retomados pelo motor de alertas.
  await Promise.allSettled([
    logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: action === "created" ? "helpdesk.created" : "helpdesk.updated", entityType: "HelpdeskTicket", entityId: id, metadata: { operacao: action } }),
    despacharEventos(c.ctx.tenantId, id),
  ]);
}
// Apaga rascunhos abertos da própria pessoa e, depois do banco, os arquivos
// deles: um rascunho descartado não tem mais quem retome os anexos.
async function apagarRascunhos(c: Contexto, ids?: string[]) {
  const where = { tenantId: c.ctx.tenantId, createdById: c.ctx.userId, submittedAt: null, ...(ids ? { id: { in: ids } } : {}) };
  const anexos = await getPrisma().helpdeskAttachment.findMany({ where: { tenantId: c.ctx.tenantId, ticketId: null, draft: where }, select: { fileUrl: true } });
  const r = await getPrisma().helpdeskDraft.deleteMany({ where });
  if (anexos.length) await anexosDoChamado.apagarArquivos(anexos.map(a => a.fileUrl));
  return r.count;
}
export async function criarRascunho(c: Contexto) {
  exigirAbertura(c);
  await prepararCatalogo(c.ctx.tenantId);
  // Fica só o último rascunho (27/10/2026): começar outro descarta o anterior.
  await apagarRascunhos(c);
  return getPrisma().helpdeskDraft.create({ data: { tenantId: c.ctx.tenantId, createdById: c.ctx.userId, payload: {} }, select: { id: true, version: true } });
}
export async function excluirRascunho(c: Contexto, id: string) {
  exigirAbertura(c);
  if (!await apagarRascunhos(c, [identidade.parse(id)])) throw new Error("Rascunho não encontrado ou já enviado.");
}
async function conferirOrigem(c: Contexto, dados: DadosDoChamado) {
  const valido = isFullWrite(c.ctx.role) || c.ctx.sectors.includes(dados.requesterSectorCode);
  const setor = await getPrisma().sector.findFirst({ where: { tenantId: c.ctx.tenantId, code: dados.requesterSectorCode, active: true } });
  if (!valido || !setor) throw new Error("Setor solicitante não autorizado.");
}
export async function salvarRascunho(c: Contexto, id: string, version: number, input: unknown) {
  exigirAbertura(c);
  const dados = dadosRascunhoSchema.parse(input); await conferirOrigem(c, dados);
  // Categoria e tags são da triagem, que roda depois do envio (10/11/2026): o
  // navegador não as define. O título vazio vira o começo da descrição no envio.
  dados.categoryId = ""; dados.tags = [];
  const result = await getPrisma().helpdeskDraft.updateMany({ where: { id, tenantId: c.ctx.tenantId, createdById: c.ctx.userId, version, submittedAt: null }, data: { payload: json(dados), version: { increment: 1 } } });
  if (result.count !== 1) throw desatualizado();
  return { version: version + 1 };
}
/** Quem aprova a categoria para o setor solicitante, sem o próprio solicitante. Também usado pela triagem. */
export async function aprovadoresDaCategoria(tx: Tx, tenantId: string, cat: Categoria, requesterSectorCode: string, solicitante: string) {
  const users = await tx.user.findMany({ where: { tenantId, active: true, role: { not: "READONLY" }, ...(cat.approvalMode === "SPECIFIC_USERS" ? { id: { in: cat.approvalUserIds } } : { OR: [{ role: { in: ["ADMIN", "SUPER_ADMIN"] } }, { role: "SECTOR_ADMIN", sectors: { some: { sectorCode: requesterSectorCode } } }] }) }, select: { id: true } });
  return users.filter(u => u.id !== solicitante).map(u => u.id);
}
/**
 * Abre o chamado a partir do rascunho. Dois modos (10/11/2026):
 * - `triagem` (a tela Novo chamado): o chamado nasce na hora, em "Aguardando
 *   triagem", com a categoria A classificar e o título tirado da descrição. A
 *   triagem (Orquestrador e classificação) roda depois da resposta — a action
 *   agenda `triarChamado` com `after()` — e o motor de alertas retoma a que não
 *   terminar.
 * - `confirmado` (a Ceci do chat): a categoria já foi confirmada pela pessoa; o
 *   chamado abre direto, com formulário, aprovação e checklist da categoria.
 */
export async function finalizarRascunho(c: Contexto, id: string, version: number, modo: "triagem" | "confirmado") {
  c = { ...c, config: await configDoHelpdesk(c.ctx.tenantId) };
  if (!c.config.enabled) throw new Error("O módulo de chamados não está disponível neste escritório.");
  const d = await rascunho(c, id);
  if (d.ticket) return { ticketId: d.ticket.id };
  exigirAbertura(c);
  if (d.version !== version) throw desatualizado();
  const triagem = modo === "triagem", tenantId = c.ctx.tenantId;
  let dados: DadosDoChamado;
  if (triagem) {
    // Rascunhos de antes da classificação automática também precisam da categoria de contingência.
    await prepararCatalogo(tenantId);
    const pendente = await getPrisma().helpdeskCategory.findFirst({ where: { tenantId, name: A_CLASSIFICAR, active: true }, select: { id: true } });
    if (!pendente) throw new Error("A categoria A classificar está indisponível. Peça ao gestor para reativá-la.");
    const bruto = dadosRascunhoSchema.parse(d.payload);
    dados = dadosSchema.parse({ ...bruto, title: bruto.title || tituloDaDescricao(bruto.description), categoryId: pendente.id, tags: [] });
  } else {
    dados = dadosSchema.parse(d.payload);
    validarFormulario(dados, (await categoriaAtual(tenantId, dados.categoryId)).categoria, d.attachments);
  }
  await conferirOrigem(c, dados);
  const ticketId = await getPrisma().$transaction(async tx => {
    await travarEscritorio(tx, tenantId);
    const existente = await tx.helpdeskTicket.findFirst({ where: { tenantId, draftId: id } });
    if (existente) return existente.id;
    const reservou = await tx.helpdeskDraft.updateMany({ where: { id, tenantId, createdById: c.ctx.userId, version, submittedAt: null }, data: { submittedAt: new Date(), version: { increment: 1 }, analysisToken: null } });
    if (reservou.count !== 1) throw desatualizado();
    // Revalida dentro da transação: categoria e anexos podem ter mudado enquanto
    // a finalização esperava a trava.
    const cat = categoriaSchema.parse(await tx.helpdeskCategory.findFirstOrThrow({ where: { tenantId, id: dados.categoryId } }));
    const anexos = await tx.helpdeskAttachment.findMany({ where: { tenantId, draftId: id, ticketId: null } });
    validarFormulario(dados, cat, anexos);
    // Na triagem, aprovação e checklist esperam a categoria de verdade (`triarChamado`).
    const comAprovacao = !triagem && cat.requiresApproval;
    let aprovadores: string[] = [];
    if (comAprovacao) {
      aprovadores = await aprovadoresDaCategoria(tx, tenantId, cat, dados.requesterSectorCode, c.ctx.userId);
      if (!aprovadores.length) throw new Error("Não há aprovador ativo para esta categoria/setor. Peça ao administrador para configurar um aprovador diferente do solicitante.");
    }
    const ticket = await tx.helpdeskTicket.create({ data: { tenantId, draftId: id, title: dados.title, description: dados.description, categoryId: dados.categoryId, requesterSectorCode: dados.requesterSectorCode, createdById: c.ctx.userId, priority: dados.priority, requestData: json(dados.requestData), tags: dados.tags, approverIds: aprovadores, approvalRequired: comAprovacao, approvalStatus: comAprovacao ? "PENDING" : "NOT_REQUIRED", status: triagem ? "AGUARDANDO_TRIAGEM" : comAprovacao ? "AGUARDANDO_APROVACAO" : "ABERTO" } });
    await tx.helpdeskAttachment.updateMany({ where: { tenantId, draftId: id, ticketId: null }, data: { ticketId: ticket.id } });
    if (!triagem && cat.checklistTemplate.length) await tx.helpdeskChecklistItem.createMany({ data: cat.checklistTemplate.map(i => ({ tenantId, ticketId: ticket.id, key: i.key, label: i.label })) });
    if (comAprovacao) await tx.helpdeskApproval.create({ data: { tenantId, ticketId: ticket.id, cycleNumber: 1 } });
    await evento(tx, tenantId, ticket.id, c.ctx.userId, "created", triagem ? { triagem: true } : { revisadoPelaPessoa: true, classificacao: (d.payload as Record<string, unknown>)._classificacao });
    return ticket.id;
  });
  await depois(c, ticketId, "created"); return { ticketId };
}
/** O envio da tela Novo chamado: o chamado nasce em "Aguardando triagem". */
export function enviarRascunho(c: Contexto, id: string, version: number) {
  return finalizarRascunho(c, id, version, "triagem");
}
// A Ceci do chat (03/11/2026): a pessoa confirmou categoria, título e descrição
// no cartão da conversa. É o rascunho e a finalização da tela Novo chamado, com
// as mesmas regras de abertura, origem, categoria e formulário. Duas diferenças,
// de propósito: a classificação gravada é a categoria confirmada na conversa (a
// triagem não roda), e o rascunho que a pessoa deixou aberto na tela fica — o
// da Ceci já sai enviado, e some se a finalização recusar.
export async function abrirPelaCeci(c: Contexto, input: unknown) {
  exigirAbertura(c);
  const dados = dadosSchema.parse(input); await conferirOrigem(c, dados);
  await prepararCatalogo(c.ctx.tenantId);
  if (!categoriasClassificaveis(await categorias(c, true)).some(cat => cat.id === dados.categoryId)) throw new Error("Escolha uma categoria ativa da árvore de chamados, e não um grupo.");
  validarFormulario(dados, (await categoriaAtual(c.ctx.tenantId, dados.categoryId)).categoria, []);
  const classificacao = { categoryId: dados.categoryId, reason: "Escolhida na conversa com a Ceci e confirmada por quem abriu.", title: dados.title, tags: dados.tags, origem: "ceci" };
  const d = await getPrisma().helpdeskDraft.create({ data: { tenantId: c.ctx.tenantId, createdById: c.ctx.userId, payload: json({ ...dados, _classificacao: classificacao }) }, select: { id: true, version: true } });
  try { return await finalizarRascunho(c, d.id, d.version, "confirmado"); }
  catch (err) { await apagarRascunhos(c, [d.id]); throw err; }
}

export async function paraAgir(tx: Tx, c: Contexto, id: string, version: number) {
  exigirEscrita(c);
  const t = await tx.helpdeskTicket.findFirst({ where: { id, tenantId: c.ctx.tenantId }, include: { participants: true, assignees: true, cycles: { orderBy: { cycleNumber: "desc" }, take: 1 } } });
  if (!t || !podeVer(c.ctx, c.config, { ...t, approverIds: strings(t.approverIds) })) throw new Error("Chamado não encontrado.");
  const r = await tx.helpdeskTicket.updateMany({ where: { id, tenantId: c.ctx.tenantId, version }, data: { version: { increment: 1 } } });
  if (r.count !== 1) throw desatualizado();
  return t;
}
async function mudarStatus(tx: Tx, c: Contexto, t: Awaited<ReturnType<typeof paraAgir>>, novo: Status) {
  const agora = new Date(), ciclo = t.cycles[0];
  if (t.approvalStatus === "PENDING" && !["AGUARDANDO_APROVACAO", "CANCELADO"].includes(novo)) throw new Error("Este chamado aguarda aprovação.");
  if (novo === "AGUARDANDO_APROVACAO" && t.approvalStatus !== "PENDING") throw new Error("Não há aprovação pendente.");
  let queueOrder: number | null = null;
  if (novo === "NA_FILA") {
    const max = await tx.helpdeskTicket.aggregate({ where: { tenantId: c.ctx.tenantId, status: "NA_FILA" }, _max: { queueOrder: true } });
    queueOrder = t.status === "NA_FILA" ? t.queueOrder : (max._max.queueOrder ?? 0) + 1;
  }
  if (novo === "EM_ANDAMENTO" && (!ciclo || ciclo.resolvedAt)) {
    const politica = await tx.helpdeskSlaPolicy.findUnique({ where: { tenantId_priority: { tenantId: c.ctx.tenantId, priority: t.priority } } }) ?? SLA_PADRAO[t.priority];
    await tx.helpdeskSlaCycle.create({ data: { tenantId: c.ctx.tenantId, ticketId: t.id, cycleNumber: (ciclo?.cycleNumber ?? 0) + 1, openedAt: agora, firstResponseDueAt: somarMinutosUteis(agora, politica.firstResponseMinutes), resolutionDueAt: somarMinutosUteis(agora, politica.resolutionMinutes), firstResponseAt: agora } });
  } else if (ciclo && !ciclo.resolvedAt) {
    if (fechado(novo)) {
      const minutos = ciclo.pausedAt ? minutosUteisEntre(ciclo.pausedAt, agora) : 0;
      await tx.helpdeskSlaCycle.update({ where: { id: ciclo.id }, data: { resolvedAt: agora, pausedAt: null, pausedMinutes: { increment: minutos }, ...(!ciclo.manualDeadline && minutos ? { resolutionDueAt: somarMinutosUteis(ciclo.resolutionDueAt, minutos) } : {}) } });
    }
    else if (pausado(novo) && !ciclo.pausedAt) await tx.helpdeskSlaCycle.update({ where: { id: ciclo.id }, data: { pausedAt: agora } });
    else if (!pausado(novo) && ciclo.pausedAt) {
      const minutos = minutosUteisEntre(ciclo.pausedAt, agora);
      await tx.helpdeskSlaCycle.update({ where: { id: ciclo.id }, data: { pausedAt: null, pausedMinutes: { increment: minutos }, ...(!ciclo.manualDeadline ? { resolutionDueAt: somarMinutosUteis(ciclo.resolutionDueAt, minutos) } : {}) } });
    }
  }
  await tx.helpdeskTicket.update({ where: { id: t.id }, data: { status: novo, queueOrder, closedAt: fechado(novo) ? agora : null } });
  await evento(tx, c.ctx.tenantId, t.id, c.ctx.userId, "status", { from: t.status, to: novo });
}

export async function comentar(c: Contexto, id: string, version: number, input: unknown) {
  // Arquivos enviados junto com a mensagem (26/10/2026): sobem antes pela rota de
  // anexos e chegam aqui pelos ids, para ficarem presos à mensagem na conversa.
  const { attachmentIds, ...dados } = z.object({ requestId: z.uuid(), body: z.string().trim().max(15000).default(""), internal: z.boolean().default(false), attachmentIds: ids.default([]) }).parse(input);
  if (!dados.body && !attachmentIds.length) throw new Error("Escreva uma mensagem ou anexe um arquivo.");
  await getPrisma().$transaction(async tx => {
    await travarEscritorio(tx, c.ctx.tenantId);
    if (await tx.helpdeskComment.findFirst({ where: { tenantId: c.ctx.tenantId, ticketId: id, requestId: dados.requestId, authorId: c.ctx.userId } })) return;
    const t = await paraAgir(tx, c, id, version);
    if (!podeResponder(c.ctx, c.config, { ...t, approverIds: strings(t.approverIds) }, t.status, dados.internal)) throw new Error("Não é possível responder neste estado ou com este acesso.");
    const comentario = await tx.helpdeskComment.create({ data: { tenantId: c.ctx.tenantId, ticketId: id, authorId: c.ctx.userId, ...dados } });
    if (attachmentIds.length && (await tx.helpdeskAttachment.updateMany({ where: { tenantId: c.ctx.tenantId, ticketId: id, id: { in: attachmentIds }, uploadedById: c.ctx.userId, commentId: null, internal: dados.internal }, data: { commentId: comentario.id } })).count !== attachmentIds.length) throw new Error("Os arquivos não puderam ser ligados à mensagem. Atualize a página e tente novamente.");
    if (!dados.internal && aguardandoSolicitante(t.status) && !c.ctx.sectors.includes(c.config.sectorCode) && !isFullWrite(c.ctx.role)) await mudarStatus(tx, c, t, "EM_ANDAMENTO");
    await evento(tx, c.ctx.tenantId, id, c.ctx.userId, "comment", { commentId: comentario.id, anexos: attachmentIds.length }, dados.internal);
  });
  await depois(c, id, "comment");
}

export async function alterar(c: Contexto, id: string, version: number, operacao: string, valor: unknown) {
  await getPrisma().$transaction(async tx => {
    await travarEscritorio(tx, c.ctx.tenantId);
    const t = await paraAgir(tx, c, id, version);
    const tenantId = c.ctx.tenantId;
    if (operacao === "aprovar") {
      if (t.createdById === c.ctx.userId) throw new Error("O solicitante não aprova a própria abertura.");
      if (!isFullWrite(c.ctx.role) && !strings(t.approverIds).includes(c.ctx.userId)) throw new Error("Você não é aprovador deste chamado.");
      const d = z.object({ aprovado: z.boolean(), motivo: z.string().trim().min(1).max(2000) }).parse(valor);
      if (t.approvalStatus !== "PENDING" || t.status !== "AGUARDANDO_APROVACAO") throw new Error("A aprovação já foi decidida ou o chamado foi encerrado.");
      const a = await tx.helpdeskApproval.findFirstOrThrow({ where: { tenantId, ticketId: id, status: "PENDING" }, orderBy: { cycleNumber: "desc" } });
      const status = d.aprovado ? "APPROVED" : "REJECTED";
      await tx.helpdeskApproval.update({ where: { id: a.id }, data: { status, note: d.motivo, decidedAt: new Date(), decidedById: c.ctx.userId } });
      await tx.helpdeskTicket.update({ where: { id }, data: { approvalStatus: status } });
      await mudarStatus(tx, c, { ...t, approvalStatus: status }, d.aprovado ? "ABERTO" : "CANCELADO");
      await evento(tx, tenantId, id, c.ctx.userId, "approval", { aprovado: d.aprovado });
    } else if (operacao === "pedir_reabertura") {
      const reason = z.string().trim().min(5).max(2000).parse(valor);
      if (t.status !== "RESOLVIDO") throw new Error("Só um chamado resolvido pode receber pedido de reabertura.");
      if (await tx.helpdeskReopenRequest.count({ where: { tenantId, ticketId: id, status: "PENDING" } })) throw new Error("Já existe um pedido de reabertura pendente.");
      await tx.helpdeskReopenRequest.create({ data: { tenantId, ticketId: id, requestedById: c.ctx.userId, reason } });
      await evento(tx, tenantId, id, c.ctx.userId, "reopen_requested");
    } else if (operacao === "decidir_reabertura") {
      exigirGestao(c);
      const d = z.object({ aprovado: z.boolean(), motivo: z.string().trim().min(1).max(2000) }).parse(valor);
      const r = await tx.helpdeskReopenRequest.findFirst({ where: { tenantId, ticketId: id, status: "PENDING" } });
      if (!r || t.status !== "RESOLVIDO") throw new Error("Pedido de reabertura indisponível.");
      await tx.helpdeskReopenRequest.update({ where: { id: r.id }, data: { status: d.aprovado ? "APPROVED" : "REJECTED", decidedById: c.ctx.userId, decidedAt: new Date(), note: d.motivo } });
      if (d.aprovado) await mudarStatus(tx, c, t, "EM_ANDAMENTO");
      await evento(tx, tenantId, id, c.ctx.userId, "reopen_decided", { aprovado: d.aprovado });
    } else {
      exigirOperacao(c);
      if (fechado(t.status)) throw new Error("O chamado está encerrado.");
      // Enquanto a triagem roda (10/11/2026), situação e dados são dela: é ela que
      // grava a categoria, o título e a situação de abertura. O resto (assumir,
      // participantes, prioridade, mensagem) segue liberado.
      if (emTriagem(t.status) && (operacao === "status" || operacao === "dados")) throw new Error("A triagem automática ainda está analisando este chamado. Aguarde alguns segundos e tente de novo.");
      if (operacao === "status") {
        const novo = z.enum(STATUS).parse(valor);
        if (emTriagem(novo)) throw new Error("Só a triagem automática põe o chamado em Aguardando triagem.");
        await mudarStatus(tx, c, t, novo);
      }
      else if (operacao === "assumir") {
        await tx.helpdeskAssignee.upsert({ where: { tenantId_ticketId_userId: { tenantId, ticketId: id, userId: c.ctx.userId } }, create: { tenantId, ticketId: id, userId: c.ctx.userId }, update: {} });
        await evento(tx, tenantId, id, c.ctx.userId, "assignees", { assumiu: true });
      } else if (operacao === "responsaveis" || operacao === "participantes") {
        exigirGestao(c); const escolhidos = ids.parse(valor);
        const validos = await tx.user.findMany({ where: { tenantId, active: true, id: { in: escolhidos }, ...(operacao === "responsaveis" ? { role: { not: "READONLY" }, sectors: { some: { sectorCode: c.config.sectorCode } } } : {}) }, select: { id: true } });
        if (validos.length !== escolhidos.length) throw new Error("Usuário inválido, de outro escritório ou fora do setor responsável.");
        if (operacao === "responsaveis") {
          await tx.helpdeskAssignee.deleteMany({ where: { tenantId, ticketId: id } });
          if (escolhidos.length) await tx.helpdeskAssignee.createMany({ data: escolhidos.map(userId => ({ tenantId, ticketId: id, userId })) });
        } else {
          await tx.helpdeskParticipant.deleteMany({ where: { tenantId, ticketId: id } });
          if (escolhidos.length) await tx.helpdeskParticipant.createMany({ data: escolhidos.map(userId => ({ tenantId, ticketId: id, userId })) });
        }
        await evento(tx, tenantId, id, c.ctx.userId, operacao === "responsaveis" ? "assignees" : "participants", { userIds: escolhidos });
      } else if (operacao === "prioridade") {
        await tx.helpdeskTicket.update({ where: { id }, data: { priority: z.enum(PRIORIDADES).parse(valor) } });
        await evento(tx, tenantId, id, c.ctx.userId, "priority", { priority: valor });
      } else if (operacao === "dados") {
        const d = dadosSchema.parse(valor);
        if (d.requesterSectorCode !== t.requesterSectorCode) throw new Error("O setor de origem é preservado no chamado.");
        const catRow = await tx.helpdeskCategory.findFirstOrThrow({ where: { tenantId, id: d.categoryId } });
        const cat = categoriaSchema.parse(catRow);
        validarFormulario(d, cat, await tx.helpdeskAttachment.findMany({ where: { tenantId, ticketId: id } }));
        if (d.categoryId !== t.categoryId && t.approvalStatus === "PENDING") throw new Error("Decida a aprovação pendente antes de mudar a categoria.");
        if (d.categoryId !== t.categoryId && cat.requiresApproval) {
          const aprovadores = (await tx.user.findMany({ where: { tenantId, active: true, role: { not: "READONLY" }, ...(cat.approvalMode === "SPECIFIC_USERS" ? { id: { in: cat.approvalUserIds, not: t.createdById } } : { id: { not: t.createdById }, OR: [{ role: { in: ["ADMIN", "SUPER_ADMIN"] } }, { role: "SECTOR_ADMIN", sectors: { some: { sectorCode: t.requesterSectorCode } } }] }) }, select: { id: true } })).map(u => u.id);
          if (!aprovadores.length) throw new Error("Não há aprovador ativo para a nova categoria.");
          const ultima = await tx.helpdeskApproval.aggregate({ where: { tenantId, ticketId: id }, _max: { cycleNumber: true } });
          await tx.helpdeskApproval.create({ data: { tenantId, ticketId: id, cycleNumber: (ultima._max.cycleNumber ?? 0) + 1 } });
          await tx.helpdeskTicket.update({ where: { id }, data: { approvalRequired: true, approvalStatus: "PENDING", approverIds: aprovadores } });
          await mudarStatus(tx, c, { ...t, approvalStatus: "PENDING" }, "AGUARDANDO_APROVACAO");
        } else if (d.categoryId !== t.categoryId) {
          await tx.helpdeskTicket.update({ where: { id }, data: { approvalRequired: false, approvalStatus: "NOT_REQUIRED", approverIds: [] } });
        }
        await tx.helpdeskTicket.update({ where: { id }, data: { title: d.title, description: d.description, categoryId: d.categoryId, requestData: json(d.requestData), tags: d.tags, priority: d.priority } });
        await evento(tx, tenantId, id, c.ctx.userId, d.categoryId === t.categoryId ? "details" : "category");
      } else if (operacao === "checklist") {
        const d = z.object({ id: identidade, done: z.boolean() }).parse(valor);
        if (!(await tx.helpdeskChecklistItem.updateMany({ where: { id: d.id, tenantId, ticketId: id }, data: { done: d.done, doneById: d.done ? c.ctx.userId : null, doneAt: d.done ? new Date() : null } })).count) throw new Error("Item não encontrado.");
        await evento(tx, tenantId, id, c.ctx.userId, "checklist", {}, true);
      } else if (operacao === "prazo") {
        exigirGestao(c); const d = z.object({ prazo: z.iso.datetime({ offset: true }), motivo: z.string().trim().min(5).max(1000) }).parse(valor);
        const ciclo = t.cycles[0]; if (!ciclo || ciclo.resolvedAt) throw new Error("O atendimento ainda não possui SLA ativo.");
        if (new Date(d.prazo) <= ciclo.openedAt) throw new Error("O prazo precisa ser posterior ao início do atendimento.");
        await tx.helpdeskSlaCycle.update({ where: { id: ciclo.id }, data: { resolutionDueAt: new Date(d.prazo), manualDeadline: true } });
        await evento(tx, tenantId, id, c.ctx.userId, "deadline", d);
      } else if (operacao === "fila") {
        exigirGestao(c); const posicao = z.number().int().min(1).max(100000).parse(valor);
        if (t.status !== "NA_FILA") throw new Error("O chamado não está na fila.");
        const fila = await tx.helpdeskTicket.findMany({ where: { tenantId, status: "NA_FILA", id: { not: id } }, orderBy: [{ queueOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true } });
        fila.splice(Math.min(posicao - 1, fila.length), 0, { id });
        for (const [i, item] of fila.entries()) await tx.helpdeskTicket.update({ where: { id: item.id }, data: { queueOrder: i + 1, ...(item.id !== id ? { version: { increment: 1 } } : {}) } });
        await evento(tx, tenantId, id, c.ctx.userId, "queue", { posicao });
      } else throw new Error("Operação desconhecida.");
    }
  });
  await depois(c, id, operacao);
}
