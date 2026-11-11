// O que as pessoas fazem no Atendimento. Cada comando confere a permissão de
// novo no servidor (a tela só esconde botões), grava o caminho da conversa e
// fica na Auditoria. Erros saem como frase para a tela.

import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import type { Contexto } from "./contexto";
import {
  podeAgirNoCiclo,
  podeAssumir,
  podeConfigurar,
  podeDecidirPedido,
  podeEncaminharDireto,
  podePedirEncaminhamento,
  podeResponder,
} from "./acesso";
import { avisarDecisao, avisarEncaminhamento, avisarPedido, avisarTransferencia } from "./avisos";
import { desfechosDoEscritorio, lerConfiguracao, nomesDosContatos, setoresQueAtendem } from "./dados";
import {
  DESFECHO_OUTRO,
  MAX_DESFECHO,
  MAX_MOTIVO,
  MAX_NOTA,
  MAX_RESUMO,
  assinaturaDe,
  diasDoHorario,
  type Situacao,
} from "./regras";
import { conexaoPeloId, enviarNoAtendimento, podeEnviarNaConversa } from "./transporte";

const MAX_TEXTO = 4_000;

export function exigir(condicao: boolean, frase: string): asserts condicao {
  if (!condicao) throw new Error(frase);
}

export async function carregar(c: Contexto, cicloId: string) {
  const ciclo = await getPrisma().atendimentoCiclo.findFirst({
    where: { id: cicloId, tenantId: c.ctx.tenantId },
    include: { conversa: { include: { contato: true } } },
  });
  exigir(!!ciclo, "Conversa não encontrada.");
  return ciclo;
}

export const alvo = (ciclo: { sectorCode: string | null; assignedToId: string | null; situacao: string }) => ({
  sectorCode: ciclo.sectorCode,
  assignedToId: ciclo.assignedToId,
  situacao: ciclo.situacao as Situacao,
});

export async function nomeDoUsuario(tenantId: string, userId: string) {
  const u = await getPrisma().user.findFirst({ where: { id: userId, tenantId }, select: { name: true } });
  return u?.name ?? "Equipe";
}

export async function rotuloDoSetor(tenantId: string, code: string | null) {
  if (!code) return null;
  const maps = await getSectorMaps(tenantId);
  return sectorLabel(maps.labels, code);
}

export async function nomeDoCliente(tenantId: string, contato: Parameters<Awaited<ReturnType<typeof nomesDosContatos>>>[0]) {
  return (await nomesDosContatos(tenantId, [contato]))(contato).titulo;
}

async function setoresValidos(c: Contexto) {
  const [config, maps] = await Promise.all([lerConfiguracao(c.ctx.tenantId), getSectorMaps(c.ctx.tenantId)]);
  return setoresQueAtendem(config.setores, maps.options.map((o) => o.value), c.cfg.triagem);
}

/**
 * Manda uma mensagem ao cliente em nome de alguém, se a conversa aceita. Usado
 * nos avisos opcionais (encaminhou, encerrou): falhar aqui não desfaz a ação.
 */
async function mandarSePuder(c: Contexto, ciclo: Awaited<ReturnType<typeof carregar>>, texto: string, comoUserId: string, setor: string | null) {
  const conexao = await conexaoPeloId(c.ctx.tenantId, ciclo.conversa.integrationId);
  if (!conexao || !podeEnviarNaConversa(ciclo.conversa, conexao.provedor, new Date()).ok) return false;
  const assinatura = assinaturaDe(await nomeDoUsuario(c.ctx.tenantId, comoUserId), await rotuloDoSetor(c.ctx.tenantId, setor));
  const r = await enviarNoAtendimento({
    tenantId: c.ctx.tenantId,
    conversaId: ciclo.conversaId,
    cicloId: ciclo.id,
    waPhone: ciclo.conversa.waPhone,
    conexao,
    texto,
    assinatura,
    senderUserId: comoUserId,
  });
  return r.ok;
}

// ─── Assumir, responder, nota ────────────────────────────────────────────────

export async function assumir(c: Contexto, cicloId: string) {
  const ciclo = await carregar(c, cicloId);
  exigir(podeAssumir(c.ctx, c.cfg, alvo(ciclo)), "Você não pode assumir esta conversa.");
  const situacao: Situacao = ciclo.situacao === "TRIAGEM" ? "TRIAGEM" : "EM_ATENDIMENTO";
  const prisma = getPrisma();
  // Guarda contra dois assumindo ao mesmo tempo: só grava se ninguém mexeu.
  const r = await prisma.atendimentoCiclo.updateMany({
    where: { id: ciclo.id, assignedToId: ciclo.assignedToId, situacao: ciclo.situacao },
    data: { assignedToId: c.ctx.userId, assignedAt: new Date(), situacao },
  });
  exigir(r.count === 1, "Alguém mexeu nesta conversa agora há pouco. Atualize a tela.");
  await prisma.atendimentoMovimento.create({
    data: { tenantId: c.ctx.tenantId, cicloId: ciclo.id, tipo: "ASSUMIU", porUserId: c.ctx.userId, paraSector: ciclo.sectorCode },
  });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.assumir", entityType: "AtendimentoCiclo", entityId: ciclo.id, metadata: { antes: ciclo.assignedToId } });
}

export async function responder(c: Contexto, cicloId: string, texto: string) {
  const limpo = texto.trim();
  exigir(limpo.length > 0, "Escreva a mensagem.");
  exigir(limpo.length <= MAX_TEXTO, "Mensagem longa demais.");
  const ciclo = await carregar(c, cicloId);
  exigir(podeResponder(c.ctx, c.cfg, alvo(ciclo)), "Assuma a conversa para responder.");
  const conexao = await conexaoPeloId(c.ctx.tenantId, ciclo.conversa.integrationId);
  exigir(!!conexao, "O número do escritório está desconectado.");
  const pode = podeEnviarNaConversa(ciclo.conversa, conexao.provedor, new Date());
  exigir(pode.ok, pode.ok ? "" : pode.motivo);

  const setor = ciclo.sectorCode ?? c.cfg.triagem;
  const assinatura = assinaturaDe(await nomeDoUsuario(c.ctx.tenantId, c.ctx.userId), await rotuloDoSetor(c.ctx.tenantId, setor));
  const r = await enviarNoAtendimento({
    tenantId: c.ctx.tenantId,
    conversaId: ciclo.conversaId,
    cicloId: ciclo.id,
    waPhone: ciclo.conversa.waPhone,
    conexao,
    texto: limpo,
    assinatura,
    senderUserId: c.ctx.userId,
  });
  if (r.ok && ciclo.situacao === "EM_ATENDIMENTO") {
    await getPrisma().atendimentoCiclo.update({ where: { id: ciclo.id }, data: { situacao: "AGUARDANDO_CLIENTE" } });
  }
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.responder", entityType: "AtendimentoCiclo", entityId: ciclo.id, metadata: { ok: r.ok } });
  exigir(r.ok, r.ok ? "" : `A mensagem não saiu: ${r.erro}`);
}

export async function anotar(c: Contexto, cicloId: string, texto: string) {
  const limpo = texto.trim();
  exigir(limpo.length > 0, "Escreva a nota.");
  exigir(limpo.length <= MAX_NOTA, "Nota longa demais.");
  const ciclo = await carregar(c, cicloId);
  exigir(podeAgirNoCiclo(c.ctx, c.cfg, alvo(ciclo)), "Você não pode escrever nesta conversa.");
  const assinatura = assinaturaDe(await nomeDoUsuario(c.ctx.tenantId, c.ctx.userId), await rotuloDoSetor(c.ctx.tenantId, ciclo.sectorCode ?? c.cfg.triagem));
  await getPrisma().atendimentoMensagem.create({
    data: { tenantId: c.ctx.tenantId, conversaId: ciclo.conversaId, cicloId: ciclo.id, direcao: "SAIDA", body: limpo, interna: true, senderUserId: c.ctx.userId, assinatura },
  });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.nota", entityType: "AtendimentoCiclo", entityId: ciclo.id });
}

// ─── Encaminhar, pedir, decidir, transferir ──────────────────────────────────

export async function encaminhar(
  c: Contexto,
  p: { cicloId: string; sectorCode: string; paraUserId: string | null; nota: string; avisarCliente: string | null }
) {
  const ciclo = await carregar(c, p.cicloId);
  exigir(podeEncaminharDireto(c.ctx, c.cfg, alvo(ciclo)), "Só a triagem encaminha direto. Use o pedido de encaminhamento.");
  exigir((await setoresValidos(c)).includes(p.sectorCode), "Escolha um setor da lista.");
  const prisma = getPrisma();
  if (p.paraUserId) {
    const u = await prisma.user.findFirst({ where: { id: p.paraUserId, tenantId: c.ctx.tenantId, active: true, sectors: { some: { sectorCode: p.sectorCode } } } });
    exigir(!!u, "Essa pessoa não é do setor escolhido.");
  }
  const nota = p.nota.trim().slice(0, MAX_NOTA) || null;
  await prisma.atendimentoCiclo.update({
    where: { id: ciclo.id },
    data: {
      sectorCode: p.sectorCode,
      assignedToId: p.paraUserId,
      assignedAt: p.paraUserId ? new Date() : null,
      situacao: p.paraUserId ? "EM_ATENDIMENTO" : "NO_SETOR",
      // O setor que a triagem escolheu na primeira vez, ao lado da sugestão da Ceci.
      ...(ciclo.situacao === "TRIAGEM" && !ciclo.triagemSectorCode ? { triagemSectorCode: p.sectorCode } : {}),
    },
  });
  await prisma.atendimentoMovimento.create({
    data: { tenantId: c.ctx.tenantId, cicloId: ciclo.id, tipo: "ENCAMINHOU", deSector: ciclo.sectorCode, paraSector: p.sectorCode, porUserId: c.ctx.userId, paraUserId: p.paraUserId, nota },
  });
  if (nota) await anotarComo(c, ciclo, `Encaminhou para ${await rotuloDoSetor(c.ctx.tenantId, p.sectorCode)}: ${nota}`);
  if (p.avisarCliente?.trim()) await mandarSePuder(c, ciclo, p.avisarCliente.trim().slice(0, MAX_TEXTO), c.ctx.userId, ciclo.sectorCode ?? c.cfg.triagem);
  await avisarEncaminhamento({
    tenantId: c.ctx.tenantId,
    cicloId: ciclo.id,
    sectorCode: p.sectorCode,
    paraUserId: p.paraUserId,
    quem: await nomeDoCliente(c.ctx.tenantId, ciclo.conversa.contato),
    nota,
    actorUserId: c.ctx.userId,
  });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.encaminhar", entityType: "AtendimentoCiclo", entityId: ciclo.id, metadata: { de: ciclo.sectorCode, para: p.sectorCode } });
}

/** A nota interna que acompanha uma ação (encaminhar, pedir), em nome de quem fez. */
async function anotarComo(c: Contexto, ciclo: { id: string; conversaId: string; sectorCode: string | null }, texto: string) {
  const assinatura = assinaturaDe(await nomeDoUsuario(c.ctx.tenantId, c.ctx.userId), await rotuloDoSetor(c.ctx.tenantId, ciclo.sectorCode ?? c.cfg.triagem));
  await getPrisma().atendimentoMensagem.create({
    data: { tenantId: c.ctx.tenantId, conversaId: ciclo.conversaId, cicloId: ciclo.id, direcao: "SAIDA", body: texto.slice(0, MAX_NOTA), interna: true, senderUserId: c.ctx.userId, assinatura },
  });
}

export async function pedirEncaminhamento(c: Contexto, p: { cicloId: string; paraSector: string | null; motivo: string; avisarCliente: boolean }) {
  const ciclo = await carregar(c, p.cicloId);
  exigir(podePedirEncaminhamento(c.ctx, c.cfg, alvo(ciclo)), "Você não pode pedir a troca de setor desta conversa.");
  const motivo = p.motivo.trim();
  exigir(motivo.length > 0, "Escreva o motivo: a Controladoria lê antes de aprovar.");
  exigir(motivo.length <= MAX_MOTIVO, "Motivo longo demais.");
  if (p.paraSector) {
    exigir((await setoresValidos(c)).includes(p.paraSector), "Escolha um setor da lista.");
    exigir(p.paraSector !== ciclo.sectorCode, "A conversa já está nesse setor.");
  }
  const prisma = getPrisma();
  const pendente = await prisma.atendimentoPedido.count({ where: { cicloId: ciclo.id, status: "PENDENTE" } });
  exigir(pendente === 0, "Já existe um pedido esperando a Controladoria.");
  await prisma.atendimentoPedido.create({
    data: { tenantId: c.ctx.tenantId, cicloId: ciclo.id, deSector: ciclo.sectorCode!, paraSector: p.paraSector, motivo, avisarCliente: p.avisarCliente, pedidoPorId: c.ctx.userId },
  });
  const para = p.paraSector ? await rotuloDoSetor(c.ctx.tenantId, p.paraSector) : "A definir";
  await prisma.atendimentoMovimento.create({
    data: { tenantId: c.ctx.tenantId, cicloId: ciclo.id, tipo: "PEDIU", deSector: ciclo.sectorCode, paraSector: p.paraSector, porUserId: c.ctx.userId, nota: motivo },
  });
  await anotarComo(c, ciclo, `Pediu encaminhamento para ${para}: ${motivo}`);
  await avisarPedido({
    tenantId: c.ctx.tenantId,
    cicloId: ciclo.id,
    triagem: c.cfg.triagem,
    quem: await nomeDoCliente(c.ctx.tenantId, ciclo.conversa.contato),
    de: (await rotuloDoSetor(c.ctx.tenantId, ciclo.sectorCode)) ?? "",
    para: para ?? "A definir",
    actorUserId: c.ctx.userId,
  });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.pedir", entityType: "AtendimentoCiclo", entityId: ciclo.id, metadata: { de: ciclo.sectorCode, para: p.paraSector } });
}

export async function decidirPedido(c: Contexto, p: { pedidoId: string; aprovar: boolean; sectorCode: string | null; nota: string }) {
  exigir(podeDecidirPedido(c.ctx, c.cfg), "Só a triagem decide os pedidos de encaminhamento.");
  const prisma = getPrisma();
  const pedido = await prisma.atendimentoPedido.findFirst({ where: { id: p.pedidoId, tenantId: c.ctx.tenantId } });
  exigir(!!pedido && pedido.status === "PENDENTE", "Este pedido já foi decidido.");
  const ciclo = await carregar(c, pedido.cicloId);
  const nota = p.nota.trim().slice(0, MAX_NOTA) || null;
  const quem = await nomeDoCliente(c.ctx.tenantId, ciclo.conversa.contato);

  if (!p.aprovar) {
    await prisma.atendimentoPedido.update({ where: { id: pedido.id }, data: { status: "RECUSADO", decididoPorId: c.ctx.userId, decididoEm: new Date(), nota } });
    await prisma.atendimentoMovimento.create({ data: { tenantId: c.ctx.tenantId, cicloId: ciclo.id, tipo: "RECUSOU", porUserId: c.ctx.userId, nota } });
    await avisarDecisao({ tenantId: c.ctx.tenantId, cicloId: ciclo.id, paraUserId: pedido.pedidoPorId, aprovado: false, quem, setor: null, actorUserId: c.ctx.userId });
    await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.recusar", entityType: "AtendimentoPedido", entityId: pedido.id });
    return;
  }

  const setor = p.sectorCode ?? pedido.paraSector;
  exigir(!!setor, "Escolha o setor: o pedido veio como “A definir”.");
  exigir((await setoresValidos(c)).includes(setor), "Escolha um setor da lista.");
  await prisma.atendimentoPedido.update({
    where: { id: pedido.id },
    data: { status: "APROVADO", decididoPorId: c.ctx.userId, decididoEm: new Date(), setorAprovado: setor, nota },
  });
  await prisma.atendimentoCiclo.update({ where: { id: ciclo.id }, data: { sectorCode: setor, assignedToId: null, assignedAt: null, situacao: "NO_SETOR" } });
  await prisma.atendimentoMovimento.create({
    data: { tenantId: c.ctx.tenantId, cicloId: ciclo.id, tipo: "APROVOU", deSector: ciclo.sectorCode, paraSector: setor, porUserId: c.ctx.userId, nota },
  });
  const rotulo = await rotuloDoSetor(c.ctx.tenantId, setor);
  if (pedido.avisarCliente) {
    await mandarSePuder(c, ciclo, `Vou passar o seu atendimento para o setor ${rotulo}. Eles falam com você por aqui.`, pedido.pedidoPorId, pedido.deSector);
  }
  await avisarEncaminhamento({ tenantId: c.ctx.tenantId, cicloId: ciclo.id, sectorCode: setor, paraUserId: null, quem, nota: pedido.motivo, actorUserId: c.ctx.userId });
  await avisarDecisao({ tenantId: c.ctx.tenantId, cicloId: ciclo.id, paraUserId: pedido.pedidoPorId, aprovado: true, quem, setor: rotulo, actorUserId: c.ctx.userId });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.aprovar", entityType: "AtendimentoPedido", entityId: pedido.id, metadata: { de: ciclo.sectorCode, para: setor } });
}

export async function transferir(c: Contexto, cicloId: string, paraUserId: string) {
  const ciclo = await carregar(c, cicloId);
  exigir(podeAgirNoCiclo(c.ctx, c.cfg, alvo(ciclo)), "Você não pode transferir esta conversa.");
  const setor = ciclo.sectorCode ?? c.cfg.triagem;
  const prisma = getPrisma();
  const u = await prisma.user.findFirst({ where: { id: paraUserId, tenantId: c.ctx.tenantId, active: true, sectors: { some: { sectorCode: setor } } } });
  exigir(!!u, "Transfira para alguém do mesmo setor. Para outro setor, peça o encaminhamento.");
  await prisma.atendimentoCiclo.update({
    where: { id: ciclo.id },
    data: { assignedToId: paraUserId, assignedAt: new Date(), ...(ciclo.situacao === "NO_SETOR" ? { situacao: "EM_ATENDIMENTO" } : {}) },
  });
  await prisma.atendimentoMovimento.create({ data: { tenantId: c.ctx.tenantId, cicloId: ciclo.id, tipo: "TRANSFERIU", porUserId: c.ctx.userId, paraUserId } });
  await avisarTransferencia({ tenantId: c.ctx.tenantId, cicloId: ciclo.id, paraUserId, quem: await nomeDoCliente(c.ctx.tenantId, ciclo.conversa.contato), actorUserId: c.ctx.userId });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.transferir", entityType: "AtendimentoCiclo", entityId: ciclo.id, metadata: { de: ciclo.assignedToId, para: paraUserId } });
}

// ─── Encerrar e vincular ─────────────────────────────────────────────────────

export async function encerrar(c: Contexto, p: { cicloId: string; desfechoId: string; desfechoOutro: string; resumo: string; despedida: string | null }) {
  const ciclo = await carregar(c, p.cicloId);
  exigir(podeAgirNoCiclo(c.ctx, c.cfg, alvo(ciclo)), "Você não pode encerrar esta conversa.");
  let desfechoId: string | null = null;
  let desfechoTexto: string;
  if (p.desfechoId === DESFECHO_OUTRO) {
    desfechoTexto = p.desfechoOutro.trim();
    exigir(desfechoTexto.length > 0, "Escreva qual foi o desfecho.");
    exigir(desfechoTexto.length <= MAX_DESFECHO, "Desfecho longo demais.");
  } else {
    const d = (await desfechosDoEscritorio(c.ctx.tenantId)).find((x) => x.id === p.desfechoId);
    exigir(!!d, "Escolha um desfecho da lista.");
    desfechoId = d.id;
    desfechoTexto = d.label;
  }
  const resumo = p.resumo.trim().slice(0, MAX_RESUMO) || null;
  if (p.despedida?.trim()) await mandarSePuder(c, ciclo, p.despedida.trim().slice(0, MAX_TEXTO), c.ctx.userId, ciclo.sectorCode ?? c.cfg.triagem);
  const prisma = getPrisma();
  await prisma.atendimentoCiclo.update({
    where: { id: ciclo.id },
    data: { situacao: "ENCERRADO", encerradoEm: new Date(), encerradoPorId: c.ctx.userId, desfechoId, desfechoTexto, resumo },
  });
  await prisma.atendimentoPedido.updateMany({ where: { cicloId: ciclo.id, status: "PENDENTE" }, data: { status: "RECUSADO", decididoPorId: c.ctx.userId, decididoEm: new Date(), nota: "Atendimento encerrado." } });
  await prisma.atendimentoMovimento.create({ data: { tenantId: c.ctx.tenantId, cicloId: ciclo.id, tipo: "ENCERROU", porUserId: c.ctx.userId, nota: desfechoTexto } });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.encerrar", entityType: "AtendimentoCiclo", entityId: ciclo.id, metadata: { desfecho: desfechoTexto } });
}

export async function vincularContato(
  c: Contexto,
  p: { cicloId: string } & ({ tipo: "CLIENTE"; companyId: string } | { tipo: "NOVO"; nome: string; interesse: string })
) {
  const ciclo = await carregar(c, p.cicloId);
  exigir(podeAgirNoCiclo(c.ctx, c.cfg, alvo(ciclo)), "Você não pode alterar este contato.");
  const prisma = getPrisma();
  if (p.tipo === "CLIENTE") {
    const empresa = await prisma.company.findFirst({ where: { id: p.companyId, tenantId: c.ctx.tenantId }, select: { id: true } });
    exigir(!!empresa, "Empresa não encontrada.");
    await prisma.atendimentoContato.update({ where: { id: ciclo.conversa.contatoId }, data: { tipo: "CLIENTE", companyId: empresa.id } });
  } else {
    const nome = p.nome.trim().slice(0, 120);
    exigir(nome.length > 0, "Escreva o nome do contato.");
    await prisma.atendimentoContato.update({
      where: { id: ciclo.conversa.contatoId },
      data: { tipo: "NOVO", nome, interesse: p.interesse.trim().slice(0, 60) || null, companyId: null, personId: null },
    });
  }
  await prisma.atendimentoMovimento.create({ data: { tenantId: c.ctx.tenantId, cicloId: ciclo.id, tipo: "VINCULOU", porUserId: c.ctx.userId, nota: p.tipo === "CLIENTE" ? "Ligou a uma empresa" : "Marcou como contato novo" } });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.vincular", entityType: "AtendimentoContato", entityId: ciclo.conversa.contatoId, metadata: { tipo: p.tipo } });
}

// ─── Configurações ───────────────────────────────────────────────────────────

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function salvarConfiguracao(
  c: Contexto,
  p: {
    integrationId: string | null;
    diasDaSemana: number[];
    abreAs: string;
    fechaAs: string;
    boasVindas: string;
    foraDoHorario: string;
    respostasAutomaticas: boolean;
    diasParaReabrir: number;
    setores: string[];
    ceciLigada: boolean;
  }
) {
  exigir(podeConfigurar(c.ctx, c.cfg), "Só o administrador ou o gestor da triagem muda as configurações.");
  exigir(HORA.test(p.abreAs) && HORA.test(p.fechaAs), "Use o formato 08:00 nos horários.");
  exigir(p.abreAs < p.fechaAs, "O horário de abrir vem antes do de fechar.");
  exigir(Number.isInteger(p.diasParaReabrir) && p.diasParaReabrir >= 0 && p.diasParaReabrir <= 60, "Os dias para reabrir vão de 0 a 60.");
  const prisma = getPrisma();
  if (p.integrationId) {
    const conexao = await conexaoPeloId(c.ctx.tenantId, p.integrationId);
    exigir(!!conexao, "Escolha uma conexão ligada.");
  }
  const maps = await getSectorMaps(c.ctx.tenantId);
  const ativos = new Set(maps.options.map((o) => o.value));
  const setores = p.setores.filter((s) => ativos.has(s) && s !== c.cfg.triagem);
  await lerConfiguracao(c.ctx.tenantId);
  await prisma.atendimentoConfig.update({
    where: { tenantId: c.ctx.tenantId },
    data: {
      integrationId: p.integrationId,
      diasDaSemana: diasDoHorario(p.diasDaSemana.join(",")).join(","),
      abreAs: p.abreAs,
      fechaAs: p.fechaAs,
      boasVindas: p.boasVindas.trim().slice(0, 1000) || null,
      foraDoHorario: p.foraDoHorario.trim().slice(0, 1000) || null,
      respostasAutomaticas: p.respostasAutomaticas === true,
      diasParaReabrir: p.diasParaReabrir,
      setores: setores.length > 0 ? setores : undefined,
      ceciLigada: p.ceciLigada,
      updatedById: c.ctx.userId,
    },
  });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.configurar", entityType: "AtendimentoConfig", entityId: c.ctx.tenantId });
}

export async function criarDesfecho(c: Contexto, label: string) {
  exigir(podeConfigurar(c.ctx, c.cfg), "Só o administrador ou o gestor da triagem muda os desfechos.");
  const l = label.trim();
  exigir(l.length > 0 && l.length <= 60, "O desfecho tem de 1 a 60 caracteres.");
  const prisma = getPrisma();
  const lista = await desfechosDoEscritorio(c.ctx.tenantId, true);
  exigir(!lista.some((d) => d.label.toLowerCase() === l.toLowerCase()), "Esse desfecho já existe.");
  const d = await prisma.atendimentoDesfecho.create({ data: { tenantId: c.ctx.tenantId, label: l, ordem: lista.length } });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.desfecho.criar", entityType: "AtendimentoDesfecho", entityId: d.id, metadata: { label: l } });
}

export async function editarDesfecho(c: Contexto, id: string, p: { label?: string; ativo?: boolean }) {
  exigir(podeConfigurar(c.ctx, c.cfg), "Só o administrador ou o gestor da triagem muda os desfechos.");
  const prisma = getPrisma();
  const d = await prisma.atendimentoDesfecho.findFirst({ where: { id, tenantId: c.ctx.tenantId } });
  exigir(!!d, "Desfecho não encontrado.");
  const label = p.label?.trim();
  if (label !== undefined) exigir(label.length > 0 && label.length <= 60, "O desfecho tem de 1 a 60 caracteres.");
  await prisma.atendimentoDesfecho.update({ where: { id }, data: { ...(label ? { label } : {}), ...(p.ativo !== undefined ? { ativo: p.ativo } : {}) } });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.desfecho.editar", entityType: "AtendimentoDesfecho", entityId: id, metadata: { antes: d.label, depois: label ?? d.label, ativo: p.ativo } });
}

export async function reordenarDesfechos(c: Contexto, ids: string[]) {
  exigir(podeConfigurar(c.ctx, c.cfg), "Só o administrador ou o gestor da triagem muda os desfechos.");
  const prisma = getPrisma();
  const atuais = await prisma.atendimentoDesfecho.findMany({ where: { tenantId: c.ctx.tenantId }, select: { id: true } });
  const validos = new Set(atuais.map((d) => d.id));
  exigir(ids.length === validos.size && ids.every((i) => validos.has(i)), "A lista mudou. Atualize a tela.");
  await prisma.$transaction(ids.map((id, ordem) => prisma.atendimentoDesfecho.update({ where: { id }, data: { ordem } })));
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.desfecho.ordenar", entityType: "AtendimentoDesfecho", entityId: c.ctx.tenantId });
}

export async function salvarMensagemPadrao(c: Contexto, p: { id: string | null; titulo: string; sectorCode: string | null; texto: string; ativo: boolean }) {
  const titulo = p.titulo.trim();
  const texto = p.texto.trim();
  exigir(titulo.length > 0 && titulo.length <= 80, "O título tem de 1 a 80 caracteres.");
  exigir(texto.length > 0 && texto.length <= MAX_TEXTO, "Escreva o texto da mensagem.");
  const prisma = getPrisma();
  const podeTodos = podeConfigurar(c.ctx, c.cfg);
  // O gestor de um setor cuida das mensagens do setor dele; as de todos, só quem configura.
  const podeEsse = p.sectorCode ? podeTodos || (c.ctx.role === "SECTOR_ADMIN" && c.ctx.sectors.includes(p.sectorCode)) : podeTodos;
  exigir(podeEsse, "Você não pode mudar as mensagens padrão desse setor.");
  if (p.sectorCode) {
    const maps = await getSectorMaps(c.ctx.tenantId);
    exigir(maps.options.some((o) => o.value === p.sectorCode), "Escolha um setor ativo.");
  }
  if (p.id) {
    const atual = await prisma.atendimentoMensagemPadrao.findFirst({ where: { id: p.id, tenantId: c.ctx.tenantId } });
    exigir(!!atual, "Mensagem não encontrada.");
    await prisma.atendimentoMensagemPadrao.update({ where: { id: p.id }, data: { titulo, texto, sectorCode: p.sectorCode, ativo: p.ativo } });
    await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.mensagem_padrao.editar", entityType: "AtendimentoMensagemPadrao", entityId: p.id });
  } else {
    const m = await prisma.atendimentoMensagemPadrao.create({ data: { tenantId: c.ctx.tenantId, titulo, texto, sectorCode: p.sectorCode, ativo: p.ativo } });
    await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.mensagem_padrao.criar", entityType: "AtendimentoMensagemPadrao", entityId: m.id });
  }
}

export async function removerMensagemPadrao(c: Contexto, id: string) {
  const prisma = getPrisma();
  const atual = await prisma.atendimentoMensagemPadrao.findFirst({ where: { id, tenantId: c.ctx.tenantId } });
  exigir(!!atual, "Mensagem não encontrada.");
  const podeEsse = podeConfigurar(c.ctx, c.cfg) || (!!atual.sectorCode && c.ctx.role === "SECTOR_ADMIN" && c.ctx.sectors.includes(atual.sectorCode));
  exigir(podeEsse, "Você não pode remover essa mensagem.");
  await prisma.atendimentoMensagemPadrao.delete({ where: { id } });
  await logAudit({ tenantId: c.ctx.tenantId, userId: c.ctx.userId, action: "atendimento.mensagem_padrao.remover", entityType: "AtendimentoMensagemPadrao", entityId: id, metadata: { titulo: atual.titulo } });
}
