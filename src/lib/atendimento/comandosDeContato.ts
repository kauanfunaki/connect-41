// Iniciar conversa com um contato, pedir para assumir a de outra pessoa e a
// triagem tirar alguém da conversa (13/11/2026, pedido do Victor).
//
// A regra de ouro: uma conversa aberta tem no máximo uma pessoa falando com o
// cliente. Quem não está com ela só fala depois que ela é passada, encerrada,
// ou que quem atende autoriza o pedido para assumir.

import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import type { Contexto } from "./contexto";
import { ehDaTriagem, podeAssumir, podeDecidirPedidoDeAssumir, podeTirarDaConversa, setoresDaPessoa } from "./acesso";
import { avisarDecisaoDeAssumir, avisarPedidoDeAssumir, avisarRetirada } from "./avisos";
import { alvo, carregar, exigir, nomeDoCliente, nomeDoUsuario } from "./comandos";
import { lerConfiguracao, nomesDosContatos, setoresQueAtendem, telefoneLegivel } from "./dados";
import { ROTULO_DA_SITUACAO, setorAoCeder, situacaoDoContato, type Situacao, type SituacaoDoContato } from "./regras";

const MAX_MOTIVO = 500;
const LIMITE_DA_BUSCA = 20;

const soLeitura = (c: Contexto) => c.ctx.subscriptionReadOnly || c.ctx.role === "READONLY";

/** Os setores que aparecem no Encaminhar (os que atendem pelo Atendimento). */
async function setoresQueAtendemNoEscritorio(c: Contexto): Promise<string[]> {
  const [config, maps] = await Promise.all([lerConfiguracao(c.ctx.tenantId), getSectorMaps(c.ctx.tenantId)]);
  return setoresQueAtendem(config.setores, maps.options.map((o) => o.value), c.cfg.triagem);
}

export type ContatoEncontrado = {
  contatoId: string;
  titulo: string;
  subtitulo: string | null;
  telefone: string;
  /** Pediu PARAR: ninguém começa conversa com ele. */
  saiu: boolean;
  situacao: SituacaoDoContato;
  /** Onde está a conversa aberta: o setor (ou a triagem) e a situação. */
  onde: string | null;
  /** Quem está atendendo, quando há alguém. */
  comQuem: string | null;
  /** A pessoa já pediu para assumir esta conversa. */
  pediEu: boolean;
  /** Outra pessoa já pediu e espera a decisão. */
  outroPediu: boolean;
  /** Sem responsável e a pessoa pode assumir. */
  podeAssumir: boolean;
};

/**
 * Os contatos do Atendimento (quem já escreveu ou foi ligado a uma empresa),
 * pelo nome, pelo nome da empresa ou pelo telefone, com a conversa aberta de
 * cada um e quem está com ela.
 */
export async function buscarContatos(c: Contexto, termo: string): Promise<ContatoEncontrado[]> {
  const t = termo.trim();
  if (t.length < 2) return [];
  const prisma = getPrisma();
  const tenantId = c.ctx.tenantId;
  const digitos = t.replace(/\D/g, "");
  const empresas = await prisma.company.findMany({
    where: { tenantId, OR: [{ name: { contains: t } }, { displayName: { contains: t } }] },
    select: { id: true },
    take: 50,
  });
  const ou: Prisma.AtendimentoContatoWhereInput[] = [{ nome: { contains: t } }, { nomeNoWhatsapp: { contains: t } }];
  if (digitos.length >= 4) ou.push({ waPhone: { contains: digitos } });
  if (empresas.length) ou.push({ companyId: { in: empresas.map((e) => e.id) } });
  const contatos = await prisma.atendimentoContato.findMany({
    where: { tenantId, OR: ou },
    take: LIMITE_DA_BUSCA,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      waPhone: true,
      nomeNoWhatsapp: true,
      nome: true,
      companyId: true,
      personId: true,
      tipo: true,
      conversas: {
        orderBy: { lastMessageAt: "desc" },
        take: 1,
        select: {
          optedOutAt: true,
          ciclos: {
            where: { situacao: { not: "ENCERRADO" } },
            orderBy: { abertoEm: "desc" },
            take: 1,
            select: { id: true, situacao: true, sectorCode: true, assignedToId: true, pedidoAssumirPorId: true },
          },
        },
      },
    },
  });
  const nomeDe = await nomesDosContatos(tenantId, contatos);
  const abertos = contatos.map((x) => x.conversas[0]?.ciclos[0] ?? null);
  const ids = [...new Set(abertos.map((a) => a?.assignedToId).filter((x): x is string => !!x))];
  const [gente, maps] = await Promise.all([
    ids.length ? prisma.user.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, name: true } }) : Promise.resolve([]),
    getSectorMaps(tenantId),
  ]);
  const nome = new Map(gente.map((u) => [u.id, u.name]));
  return contatos.map((x, i) => {
    const a = abertos[i] ?? null;
    const situacao = a ? (a.situacao as Situacao) : null;
    const n = nomeDe(x);
    const lugar = a ? (a.sectorCode ? sectorLabel(maps.labels, a.sectorCode) : `Triagem (${sectorLabel(maps.labels, c.cfg.triagem)})`) : null;
    return {
      contatoId: x.id,
      titulo: n.titulo,
      subtitulo: n.subtitulo,
      telefone: telefoneLegivel(x.waPhone),
      saiu: !!x.conversas[0]?.optedOutAt,
      situacao: situacaoDoContato(a && situacao ? { ...a, situacao } : null, c.ctx.userId),
      onde: a && situacao ? `${lugar} · ${ROTULO_DA_SITUACAO[situacao].toLowerCase()}` : null,
      comQuem: a?.assignedToId ? (nome.get(a.assignedToId) ?? "Alguém da equipe") : null,
      pediEu: !!a && a.pedidoAssumirPorId === c.ctx.userId,
      outroPediu: !!a && !!a.pedidoAssumirPorId && a.pedidoAssumirPorId !== c.ctx.userId,
      podeAssumir: !!a && !!situacao && !a.assignedToId && podeAssumir(c.ctx, c.cfg, { sectorCode: a.sectorCode, assignedToId: null, situacao }),
    };
  });
}

/**
 * Começa (ou retoma) a conversa com o contato, com a pessoa como responsável,
 * e devolve o id do atendimento. Se outra pessoa está atendendo, recusa: aí é
 * pedir para assumir.
 */
export async function iniciarConversa(c: Contexto, contatoId: string): Promise<string> {
  const prisma = getPrisma();
  const tenantId = c.ctx.tenantId;
  exigir(!soLeitura(c), "Seu acesso é só de leitura.");
  const contato = await prisma.atendimentoContato.findFirst({
    where: { id: contatoId, tenantId },
    select: {
      id: true,
      conversas: {
        orderBy: { lastMessageAt: "desc" },
        take: 1,
        select: {
          id: true,
          optedOutAt: true,
          ciclos: {
            where: { situacao: { not: "ENCERRADO" } },
            orderBy: { abertoEm: "desc" },
            take: 1,
            select: { id: true, situacao: true, sectorCode: true, assignedToId: true },
          },
        },
      },
    },
  });
  exigir(!!contato, "Contato não encontrado.");
  const conversa = contato.conversas[0];
  exigir(!!conversa, "Este contato ainda não tem conversa pelo número do escritório.");
  exigir(!conversa.optedOutAt, "Este contato pediu para não receber mensagens (PARAR). Só ele pode voltar a escrever.");
  const aberto = conversa.ciclos[0] ?? null;
  const s = situacaoDoContato(aberto ? { ...aberto, situacao: aberto.situacao as Situacao } : null, c.ctx.userId);
  if (s.tipo === "comigo") return s.cicloId;
  if (s.tipo === "com_outro") {
    const quem = await nomeDoUsuario(tenantId, s.userId);
    exigir(false, `${quem} está atendendo este contato. Peça para assumir ou espere a conversa ser passada ou encerrada.`);
  }
  if (s.tipo === "sem_responsavel" && aberto) {
    const situacao = aberto.situacao as Situacao;
    exigir(
      podeAssumir(c.ctx, c.cfg, { sectorCode: aberto.sectorCode, assignedToId: null, situacao }),
      "A conversa deste contato está com outro setor, sem responsável. Peça à triagem para encaminhar."
    );
    const r = await prisma.atendimentoCiclo.updateMany({
      where: { id: aberto.id, assignedToId: null, situacao },
      data: { assignedToId: c.ctx.userId, assignedAt: new Date(), transferidaParaId: null, transferidaEm: null, situacao: situacao === "TRIAGEM" ? "TRIAGEM" : "EM_ATENDIMENTO" },
    });
    exigir(r.count === 1, "Alguém mexeu nesta conversa agora há pouco. Tente de novo.");
    await prisma.atendimentoMovimento.create({ data: { tenantId, cicloId: aberto.id, tipo: "ASSUMIU", porUserId: c.ctx.userId, paraSector: aberto.sectorCode } });
    await logAudit({ tenantId, userId: c.ctx.userId, action: "atendimento.assumir", entityType: "AtendimentoCiclo", entityId: aberto.id });
    return aberto.id;
  }

  // Livre: abre um atendimento novo com a pessoa, no setor dela (a triagem
  // que não atende em setor nenhum começa na própria triagem).
  // O setor da própria pessoa (o administrador "atende" em todos, mas começa
  // no dele, ou na triagem se não for de nenhum que atende).
  const setores = setoresDaPessoa(c.ctx, c.cfg, await setoresQueAtendemNoEscritorio(c)).filter((s) => c.ctx.sectors.includes(s));
  const setor = setores[0] ?? null;
  exigir(!!setor || ehDaTriagem(c.ctx, c.cfg), "Você não está em nenhum setor que atende pelo Atendimento.");
  const agora = new Date();
  const ciclo = await prisma.atendimentoCiclo.create({
    data: {
      tenantId,
      conversaId: conversa.id,
      situacao: setor ? "EM_ATENDIMENTO" : "TRIAGEM",
      sectorCode: setor,
      assignedToId: c.ctx.userId,
      assignedAt: agora,
      abertoEm: agora,
      movimentos: { create: { tenantId, tipo: "INICIOU", porUserId: c.ctx.userId, paraSector: setor } },
    },
    select: { id: true },
  });
  await logAudit({ tenantId, userId: c.ctx.userId, action: "atendimento.iniciar", entityType: "AtendimentoCiclo", entityId: ciclo.id });
  return ciclo.id;
}

/** Pede a quem está com a conversa para passá-la. Um pedido por vez. */
export async function pedirParaAssumir(c: Contexto, cicloId: string) {
  const prisma = getPrisma();
  const tenantId = c.ctx.tenantId;
  exigir(!soLeitura(c), "Seu acesso é só de leitura.");
  const ciclo = await prisma.atendimentoCiclo.findFirst({
    where: { id: cicloId, tenantId },
    select: { id: true, situacao: true, assignedToId: true, pedidoAssumirPorId: true, conversa: { select: { contato: true } } },
  });
  exigir(!!ciclo && ciclo.situacao !== "ENCERRADO", "Esta conversa não está mais aberta.");
  const dono = ciclo.assignedToId;
  exigir(!!dono, "Ninguém está com esta conversa agora.");
  exigir(dono !== c.ctx.userId, "A conversa já está com você.");
  if (ciclo.pedidoAssumirPorId === c.ctx.userId) return;
  exigir(!ciclo.pedidoAssumirPorId, "Outra pessoa já pediu para assumir esta conversa. Espere a decisão.");
  const r = await prisma.atendimentoCiclo.updateMany({
    where: { id: ciclo.id, pedidoAssumirPorId: null, assignedToId: dono },
    data: { pedidoAssumirPorId: c.ctx.userId, pedidoAssumirEm: new Date() },
  });
  exigir(r.count === 1, "A conversa mudou agora há pouco. Busque o contato de novo.");
  await prisma.atendimentoMovimento.create({ data: { tenantId, cicloId: ciclo.id, tipo: "PEDIU_ASSUMIR", porUserId: c.ctx.userId, paraUserId: dono } });
  await avisarPedidoDeAssumir({
    tenantId,
    cicloId: ciclo.id,
    paraUserId: dono,
    quemPede: await nomeDoUsuario(tenantId, c.ctx.userId),
    cliente: await nomeDoCliente(tenantId, ciclo.conversa.contato),
    actorUserId: c.ctx.userId,
  });
  await logAudit({ tenantId, userId: c.ctx.userId, action: "atendimento.pedir_assumir", entityType: "AtendimentoCiclo", entityId: ciclo.id });
}

/** Quem está com a conversa (ou a triagem) autoriza ou recusa o pedido para assumir. */
export async function decidirPedidoDeAssumir(c: Contexto, cicloId: string, aceitar: boolean) {
  const prisma = getPrisma();
  const tenantId = c.ctx.tenantId;
  const ciclo = await carregar(c, cicloId);
  exigir(podeDecidirPedidoDeAssumir(c.ctx, c.cfg, alvo(ciclo)), "Só quem está com a conversa (ou a triagem) decide o pedido.");
  const quemPediu = ciclo.pedidoAssumirPorId;
  exigir(!!quemPediu, "Não há pedido para decidir.");
  const cliente = await nomeDoCliente(tenantId, ciclo.conversa.contato);
  if (!aceitar) {
    await prisma.atendimentoCiclo.update({ where: { id: ciclo.id }, data: { pedidoAssumirPorId: null, pedidoAssumirEm: null } });
    await prisma.atendimentoMovimento.create({ data: { tenantId, cicloId: ciclo.id, tipo: "RECUSOU", porUserId: c.ctx.userId, paraUserId: quemPediu, nota: "Pedido para assumir" } });
    await avisarDecisaoDeAssumir({ tenantId, cicloId: ciclo.id, paraUserId: quemPediu, aceito: false, cliente, actorUserId: c.ctx.userId });
    await logAudit({ tenantId, userId: c.ctx.userId, action: "atendimento.recusar_assumir", entityType: "AtendimentoCiclo", entityId: ciclo.id, metadata: { quemPediu } });
    return;
  }
  const pessoa = await prisma.user.findFirst({ where: { id: quemPediu, tenantId, active: true }, select: { sectors: { select: { sectorCode: true } } } });
  exigir(!!pessoa, "Quem pediu não está mais ativo no escritório.");
  const atendem = await setoresQueAtendemNoEscritorio(c);
  const setoresDele = pessoa.sectors.map((s) => s.sectorCode);
  // Na triagem, quem é da triagem continua na triagem; senão, o setor de quem assume.
  const ficaNaTriagem = ciclo.situacao === "TRIAGEM" && setoresDele.includes(c.cfg.triagem);
  const setor = ficaNaTriagem ? null : setorAoCeder(ciclo.sectorCode, setoresDele.filter((s) => atendem.includes(s)));
  const situacao = ficaNaTriagem || !setor ? (ciclo.situacao as Situacao) : ciclo.situacao === "AGUARDANDO_CLIENTE" ? "AGUARDANDO_CLIENTE" : "EM_ATENDIMENTO";
  await prisma.atendimentoCiclo.update({
    where: { id: ciclo.id },
    data: {
      assignedToId: quemPediu,
      assignedAt: new Date(),
      sectorCode: setor,
      situacao,
      transferidaParaId: null,
      transferidaEm: null,
      pedidoAssumirPorId: null,
      pedidoAssumirEm: null,
    },
  });
  await prisma.atendimentoMovimento.create({
    data: { tenantId, cicloId: ciclo.id, tipo: "CEDEU", porUserId: c.ctx.userId, paraUserId: quemPediu, deSector: ciclo.sectorCode, paraSector: setor },
  });
  await avisarDecisaoDeAssumir({ tenantId, cicloId: ciclo.id, paraUserId: quemPediu, aceito: true, cliente, actorUserId: c.ctx.userId });
  await logAudit({ tenantId, userId: c.ctx.userId, action: "atendimento.ceder", entityType: "AtendimentoCiclo", entityId: ciclo.id, metadata: { de: ciclo.assignedToId, para: quemPediu } });
}

/**
 * A triagem tira a pessoa da conversa, com o motivo (mau trato ou algo do
 * tipo): a conversa volta para a triagem, sem responsável, e a pessoa é avisada.
 */
export async function tirarDaConversa(c: Contexto, cicloId: string, motivo: string) {
  const prisma = getPrisma();
  const tenantId = c.ctx.tenantId;
  const ciclo = await carregar(c, cicloId);
  exigir(podeTirarDaConversa(c.ctx, c.cfg, alvo(ciclo)), "Só a triagem tira alguém da conversa.");
  const m = motivo.trim().slice(0, MAX_MOTIVO);
  exigir(m.length > 0, "Escreva o motivo: ele fica no histórico e vai para a pessoa.");
  const quem = ciclo.assignedToId!;
  const r = await prisma.atendimentoCiclo.updateMany({
    where: { id: ciclo.id, assignedToId: quem },
    data: {
      assignedToId: null,
      assignedAt: null,
      sectorCode: null,
      situacao: "TRIAGEM",
      transferidaParaId: null,
      transferidaEm: null,
      pedidoAssumirPorId: null,
      pedidoAssumirEm: null,
    },
  });
  exigir(r.count === 1, "A conversa mudou agora há pouco. Atualize a tela.");
  await prisma.atendimentoMovimento.create({ data: { tenantId, cicloId: ciclo.id, tipo: "TIROU", porUserId: c.ctx.userId, paraUserId: quem, deSector: ciclo.sectorCode, nota: m } });
  await avisarRetirada({ tenantId, cicloId: ciclo.id, paraUserId: quem, cliente: await nomeDoCliente(tenantId, ciclo.conversa.contato), motivo: m, actorUserId: c.ctx.userId });
  await logAudit({ tenantId, userId: c.ctx.userId, action: "atendimento.tirar", entityType: "AtendimentoCiclo", entityId: ciclo.id, metadata: { quem, motivo: m } });
}
