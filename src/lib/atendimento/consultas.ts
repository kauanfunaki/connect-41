// O que as telas do Atendimento leem: a lista, as contagens e a conversa aberta.
//
// A lista vem inteira para o navegador (tudo o que a pessoa pode ver nos
// recortes dela) e é recortada lá, como no WhatsApp do Recrutamento: trocar de
// aba ou de conversa não vai ao servidor, e o layout não remonta.

import { getPrisma } from "@/lib/prisma";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { canManageSector } from "@/lib/auth/papeis";
import type { Prisma } from "@/generated/prisma/client";
import { nomeExibicao } from "@/lib/companyName";
import type { Contexto } from "./contexto";
import {
  ehDaTriagem,
  podeAgirNoCiclo,
  podeAssumir,
  podeDecidirPedido,
  podeEncaminharDireto,
  podePedirEncaminhamento,
  podeResponder,
  podeVerCiclo,
  setoresDaPessoa,
  veTudo,
} from "./acesso";
import { desfechosDoEscritorio, lerConfiguracao, mensagensPadraoPara, nomesDosContatos, setoresQueAtendem, telefoneLegivel } from "./dados";
import { abreNaTela } from "./midia";
import { DIAS_DAS_ENCERRADAS, variaveisDoModelo, previa, recortesDe, type CartaoParaRecorte, type Recorte, type Situacao } from "./regras";
import { conexaoPeloId, podeEnviarNaConversa } from "./transporte";

const LIMITE_DA_LISTA = 300;
const LIMITE_DE_MENSAGENS = 300;

/** Os setores em que a pessoa atende, e os que ela gere. */
async function escopo(c: Contexto) {
  const config = await lerConfiguracao(c.ctx.tenantId);
  const maps = await getSectorMaps(c.ctx.tenantId);
  const ativos = maps.options.map((o) => o.value);
  const atendem = setoresQueAtendem(config.setores, ativos, c.cfg.triagem);
  const meus = setoresDaPessoa(c.ctx, c.cfg, atendem);
  const geridos = meus.filter((s) => canManageSector(c.ctx, s));
  return { config, maps, atendem, meus, geridos, triagem: ehDaTriagem(c.ctx, c.cfg), veTudo: veTudo(c.ctx, c.cfg) };
}

/** Tudo o que a pessoa pode ver na lista, numa consulta só (a união dos recortes dela). */
function filtroDaPessoa(c: Contexto, e: Awaited<ReturnType<typeof escopo>>): Prisma.AtendimentoCicloWhereInput {
  const tenantId = c.ctx.tenantId;
  const desde = new Date(Date.now() - DIAS_DAS_ENCERRADAS * 24 * 60 * 60 * 1000);
  const recentes: Prisma.AtendimentoCicloWhereInput = { OR: [{ situacao: { not: "ENCERRADO" } }, { encerradoEm: { gte: desde } }] };
  if (e.triagem || e.veTudo) return { tenantId, ...recentes };
  return {
    tenantId,
    AND: [
      recentes,
      { OR: [{ assignedToId: c.ctx.userId }, { transferidaParaId: c.ctx.userId }, ...(e.meus.length ? [{ sectorCode: { in: e.meus } }] : [])] },
    ],
  };
}

export type CartaoDaLista = CartaoParaRecorte & {
  cicloId: string;
  titulo: string;
  subtitulo: string | null;
  tipoContato: "DESCONHECIDO" | "CLIENTE" | "NOVO";
  setor: { code: string; label: string; cor: string } | null;
  responsavel: string | null;
  quando: string | null;
  previa: string;
  esperandoResposta: boolean;
  /** Transferida para quem está vendo, esperando que assuma: o cartão fica em destaque. */
  transferidaParaMim: boolean;
  /** O nome de quem recebeu a transferência e ainda não assumiu. */
  transferidaPara: string | null;
  /** Mensagens do cliente desde a última resposta da equipe (o número da bolinha). */
  semResposta: number;
};

export type ListaDoAtendimento = {
  cartoes: CartaoDaLista[];
  recortes: Recorte[];
  meus: string[];
  geridos: string[];
  userId: string;
  ehTriagem: boolean;
  /** Escolhida nas configurações para ver todos os atendimentos. */
  veTudo: boolean;
  triagem: { code: string; label: string };
};

export async function listar(c: Contexto): Promise<ListaDoAtendimento> {
  const prisma = getPrisma();
  const e = await escopo(c);

  const ciclos = await prisma.atendimentoCiclo.findMany({
    where: filtroDaPessoa(c, e),
    orderBy: [{ conversa: { lastMessageAt: "desc" } }],
    take: LIMITE_DA_LISTA,
    select: {
      id: true,
      situacao: true,
      sectorCode: true,
      assignedToId: true,
      transferidaParaId: true,
      conversa: {
        select: {
          id: true,
          lastMessageAt: true,
          contato: { select: { waPhone: true, nomeNoWhatsapp: true, nome: true, companyId: true, personId: true, tipo: true } },
        },
      },
      pedidos: { where: { status: "PENDENTE" }, select: { id: true }, take: 1 },
    },
  });

  const conversaIds = [...new Set(ciclos.map((x) => x.conversa.id))];
  const [ultimas, responsaveis, nomeDe] = await Promise.all([
    conversaIds.length
      ? prisma.atendimentoMensagem.findMany({
          where: { conversaId: { in: conversaIds }, interna: false },
          orderBy: { createdAt: "desc" },
          distinct: ["conversaId"],
          select: { conversaId: true, body: true, direcao: true },
        })
      : [],
    prisma.user.findMany({
      where: { tenantId: c.ctx.tenantId, id: { in: [...new Set(ciclos.flatMap((x) => [x.assignedToId, x.transferidaParaId]).filter((x): x is string => !!x))] } },
      select: { id: true, name: true },
    }),
    nomesDosContatos(c.ctx.tenantId, ciclos.map((x) => x.conversa.contato)),
  ]);
  const ultimaPor = new Map(ultimas.map((m) => [m.conversaId, m]));
  const semRespostaPor = await contarSemResposta(ultimas.filter((m) => m.direcao === "ENTRADA").map((m) => m.conversaId));
  const nomePor = new Map(responsaveis.map((u) => [u.id, u.name]));

  const cartoes: CartaoDaLista[] = ciclos.map((x) => {
    const n = nomeDe(x.conversa.contato);
    const ultima = ultimaPor.get(x.conversa.id);
    return {
      cicloId: x.id,
      titulo: n.titulo,
      subtitulo: n.subtitulo,
      tipoContato: x.conversa.contato.tipo,
      situacao: x.situacao as Situacao,
      sectorCode: x.sectorCode,
      assignedToId: x.assignedToId,
      pedidoPendente: x.pedidos.length > 0,
      transferidaParaId: x.transferidaParaId,
      transferidaParaMim: !!x.transferidaParaId && x.transferidaParaId === c.ctx.userId,
      transferidaPara: x.transferidaParaId ? (nomePor.get(x.transferidaParaId) ?? null) : null,
      setor: x.sectorCode ? { code: x.sectorCode, label: sectorLabel(e.maps.labels, x.sectorCode), cor: e.maps.colors[x.sectorCode] ?? "#586577" } : null,
      responsavel: x.assignedToId ? (nomePor.get(x.assignedToId) ?? null) : null,
      quando: x.conversa.lastMessageAt?.toISOString() ?? null,
      previa: ultima ? previa(ultima.body) : "",
      esperandoResposta: ultima?.direcao === "ENTRADA",
      semResposta: ultima?.direcao === "ENTRADA" ? Math.max(1, semRespostaPor.get(x.conversa.id) ?? 1) : 0,
    };
  });

  return {
    cartoes,
    recortes: recortesDe(e),
    meus: e.meus,
    geridos: e.geridos,
    userId: c.ctx.userId,
    ehTriagem: e.triagem,
    veTudo: e.veTudo,
    triagem: { code: c.cfg.triagem, label: sectorLabel(e.maps.labels, c.cfg.triagem) },
  };
}

/** O número do menu: o que espera alguém agir (triagem, pedidos e "sem responsável" dos meus setores). */
/**
 * Quantas mensagens o cliente mandou depois da última resposta da equipe, por
 * conversa (12/11/2026: a bolinha mostrava sempre 1). Notas internas não contam
 * como resposta.
 */
async function contarSemResposta(conversaIds: string[]): Promise<Map<string, number>> {
  if (conversaIds.length === 0) return new Map();
  const prisma = getPrisma();
  const saidas = await prisma.atendimentoMensagem.groupBy({
    by: ["conversaId"],
    where: { conversaId: { in: conversaIds }, direcao: "SAIDA", interna: false },
    _max: { createdAt: true },
  });
  const ultimaSaida = new Map(saidas.map((s) => [s.conversaId, s._max.createdAt]));
  const contagem = await prisma.atendimentoMensagem.groupBy({
    by: ["conversaId"],
    where: {
      direcao: "ENTRADA",
      OR: conversaIds.map((id) => {
        const desde = ultimaSaida.get(id);
        return desde ? { conversaId: id, createdAt: { gt: desde } } : { conversaId: id };
      }),
    },
    _count: { _all: true },
  });
  return new Map(contagem.map((x) => [x.conversaId, x._count._all]));
}

/**
 * Uma marca barata do que mudou na caixa: a última mensagem do escritório e
 * quantos atendimentos há em cada situação. A tela confere a cada poucos
 * segundos e só recarrega a lista quando a marca muda (12/11/2026: conversa
 * nova só aparecia recarregando a página).
 */
export async function marcaDaCaixa(tenantId: string): Promise<string> {
  const prisma = getPrisma();
  const [ultima, porSituacao] = await Promise.all([
    prisma.atendimentoConversa.aggregate({ where: { tenantId }, _max: { lastMessageAt: true } }),
    prisma.atendimentoCiclo.groupBy({ by: ["situacao"], where: { tenantId }, _count: { _all: true } }),
  ]);
  const situacoes = porSituacao
    .map((s) => `${s.situacao}:${s._count._all}`)
    .sort()
    .join(",");
  return `${ultima._max.lastMessageAt?.toISOString() ?? "-"}|${situacoes}`;
}

export async function contarParaMenu(c: Contexto): Promise<number> {
  const prisma = getPrisma();
  const e = await escopo(c);
  const tenantId = c.ctx.tenantId;
  const filtros: Prisma.AtendimentoCicloWhereInput[] = [];
  if (e.triagem) filtros.push({ situacao: "TRIAGEM" }, { situacao: { not: "ENCERRADO" }, pedidos: { some: { status: "PENDENTE" } } });
  if (e.meus.length > 0) filtros.push({ situacao: "NO_SETOR", sectorCode: { in: e.meus } });
  // Transferida para a pessoa e ainda não assumida (12/11/2026).
  filtros.push({ transferidaParaId: c.ctx.userId, situacao: { not: "ENCERRADO" } });
  if (filtros.length === 0) return 0;
  return prisma.atendimentoCiclo.count({ where: { tenantId, OR: filtros } });
}

// ─── A conversa aberta ───────────────────────────────────────────────────────

export async function lerDetalhe(c: Contexto, cicloId: string) {
  const prisma = getPrisma();
  const tenantId = c.ctx.tenantId;
  const ciclo = await prisma.atendimentoCiclo.findFirst({
    where: { id: cicloId, tenantId },
    include: {
      conversa: { include: { contato: true } },
      movimentos: { orderBy: { createdAt: "desc" }, take: 50 },
      pedidos: { where: { status: "PENDENTE" }, take: 1 },
    },
  });
  if (!ciclo) return null;
  const alvo = { sectorCode: ciclo.sectorCode, assignedToId: ciclo.assignedToId, situacao: ciclo.situacao as Situacao };
  if (!podeVerCiclo(c.ctx, c.cfg, alvo)) return null;

  const e = await escopo(c);
  const contato = ciclo.conversa.contato;
  const setorDaConversa = ciclo.sectorCode ?? c.cfg.triagem;

  const [mensagens, conexao, nomeDe, empresa, desfechos, padrao, pessoasDoSetor, temPortal, modelos] = await Promise.all([
    prisma.atendimentoMensagem.findMany({
      where: { conversaId: ciclo.conversaId },
      orderBy: { createdAt: "desc" },
      take: LIMITE_DE_MENSAGENS,
      select: { id: true, cicloId: true, direcao: true, body: true, status: true, erro: true, senderUserId: true, assinatura: true, interna: true, automatica: true, midiaTipo: true, midiaPath: true, midiaNome: true, midiaMime: true, createdAt: true },
    }),
    conexaoPeloId(tenantId, ciclo.conversa.integrationId),
    nomesDosContatos(tenantId, [contato]),
    contato.companyId
      ? prisma.company.findFirst({ where: { id: contato.companyId, tenantId }, select: { id: true, name: true, displayName: true, cnpj: true } })
      : null,
    desfechosDoEscritorio(tenantId),
    mensagensPadraoPara(tenantId, setorDaConversa),
    prisma.user.findMany({
      where: { tenantId, active: true, sectors: { some: { sectorCode: { in: [setorDaConversa, ...e.atendem] } } } },
      select: { id: true, name: true, sectors: { select: { sectorCode: true } } },
      orderBy: { name: "asc" },
    }),
    contato.companyId ? prisma.portalUserCompany.count({ where: { tenantId, companyId: contato.companyId } }) : Promise.resolve(0),
    prisma.atendimentoModelo.findMany({ where: { tenantId, ativo: true }, orderBy: { rotulo: "asc" }, select: { id: true, rotulo: true, texto: true } }),
  ]);

  const idsDeGente = new Set<string>();
  for (const m of mensagens) if (m.senderUserId) idsDeGente.add(m.senderUserId);
  for (const mv of ciclo.movimentos) {
    if (mv.porUserId) idsDeGente.add(mv.porUserId);
    if (mv.paraUserId) idsDeGente.add(mv.paraUserId);
  }
  if (ciclo.assignedToId) idsDeGente.add(ciclo.assignedToId);
  if (ciclo.transferidaParaId) idsDeGente.add(ciclo.transferidaParaId);
  for (const p of ciclo.pedidos) idsDeGente.add(p.pedidoPorId);
  const gente = await prisma.user.findMany({ where: { tenantId, id: { in: [...idsDeGente] } }, select: { id: true, name: true } });
  const nomeDaPessoa = new Map(gente.map((u) => [u.id, u.name]));
  const rotulo = (code: string | null) => (code ? sectorLabel(e.maps.labels, code) : null);

  const agora = new Date();
  const janela = conexao
    ? podeEnviarNaConversa(ciclo.conversa, conexao.provedor, agora)
    : ({ ok: false, motivo: "O número do escritório está desconectado. Confira nas configurações do Atendimento." } as const);
  const janelaAte =
    conexao && ciclo.conversa.lastInboundAt && conexao.provedor.politica.janelaLivreHoras !== null
      ? new Date(ciclo.conversa.lastInboundAt.getTime() + conexao.provedor.politica.janelaLivreHoras * 3600_000).toISOString()
      : null;

  const n = nomeDe(contato);
  const pedido = ciclo.pedidos[0] ?? null;

  return {
    ciclo: {
      id: ciclo.id,
      situacao: ciclo.situacao as Situacao,
      setor: ciclo.sectorCode ? { code: ciclo.sectorCode, label: rotulo(ciclo.sectorCode)!, cor: e.maps.colors[ciclo.sectorCode] ?? "#586577" } : null,
      responsavel: ciclo.assignedToId ? { id: ciclo.assignedToId, nome: nomeDaPessoa.get(ciclo.assignedToId) ?? "Alguém da equipe" } : null,
      transferidaPara: ciclo.transferidaParaId
        ? { id: ciclo.transferidaParaId, nome: nomeDaPessoa.get(ciclo.transferidaParaId) ?? "Alguém da equipe", paraMim: ciclo.transferidaParaId === c.ctx.userId }
        : null,
      abertoEm: ciclo.abertoEm.toISOString(),
    },
    contato: {
      titulo: n.titulo,
      subtitulo: n.subtitulo,
      telefone: telefoneLegivel(contato.waPhone),
      nomeNoWhatsapp: contato.nomeNoWhatsapp,
      tipo: contato.tipo,
      nome: contato.nome,
      interesse: contato.interesse,
      empresa: empresa ? { id: empresa.id, nome: nomeExibicao(empresa), cnpj: empresa.cnpj } : null,
      temPortal: temPortal > 0,
    },
    mensagens: mensagens.reverse().map((m) => ({
      id: m.id,
      doCicloAtual: m.cicloId === ciclo.id,
      direcao: m.direcao,
      texto: m.body,
      status: m.status,
      erro: m.erro,
      assinatura: m.assinatura ?? (m.senderUserId ? (nomeDaPessoa.get(m.senderUserId) ?? null) : null),
      interna: m.interna,
      automatica: m.automatica,
      midia: !!m.midiaTipo,
      arquivo: m.midiaPath ? { nome: m.midiaNome ?? "arquivo", mime: m.midiaMime ?? "", imagem: abreNaTela(m.midiaMime) } : null,
      quando: m.createdAt.toISOString(),
    })),
    caminho: ciclo.movimentos.map((mv) => ({
      id: mv.id,
      tipo: mv.tipo,
      quando: mv.createdAt.toISOString(),
      por: mv.porUserId ? (nomeDaPessoa.get(mv.porUserId) ?? null) : null,
      para: mv.paraUserId ? (nomeDaPessoa.get(mv.paraUserId) ?? null) : null,
      de: rotulo(mv.deSector),
      paraSetor: rotulo(mv.paraSector),
      nota: mv.nota,
    })),
    pedido: pedido
      ? {
          id: pedido.id,
          de: rotulo(pedido.deSector),
          para: rotulo(pedido.paraSector),
          paraCode: pedido.paraSector,
          motivo: pedido.motivo,
          por: nomeDaPessoa.get(pedido.pedidoPorId) ?? "Alguém da equipe",
          quando: pedido.createdAt.toISOString(),
        }
      : null,
    janela: { ok: janela.ok, motivo: janela.ok ? null : janela.motivo, ate: janelaAte },
    setores: e.atendem.map((code) => ({ code, label: rotulo(code)!, cor: e.maps.colors[code] ?? "#586577" })),
    setorDaTriagem: { code: c.cfg.triagem, label: rotulo(c.cfg.triagem)! },
    pessoasDoSetor: pessoasDoSetor
      .filter((p) => p.id !== ciclo.assignedToId && p.sectors.some((s) => s.sectorCode === setorDaConversa))
      .map((p) => ({ id: p.id, nome: p.name })),
    pessoasPorSetor: Object.fromEntries(
      e.atendem.map((code) => [code, pessoasDoSetor.filter((p) => p.sectors.some((s) => s.sectorCode === code)).map((p) => ({ id: p.id, nome: p.name }))])
    ) as Record<string, { id: string; nome: string }[]>,
    desfechos: desfechos.map((d) => ({ id: d.id, label: d.label })),
    modelos: modelos.map((m) => ({ id: m.id, rotulo: m.rotulo, texto: m.texto, variaveis: variaveisDoModelo(m.texto) })),
    enviaArquivo: !!conexao?.provedor.enviarMidia,
    mensagensPadrao: padrao.map((m) => ({ id: m.id, titulo: m.titulo, texto: m.texto, setor: rotulo(m.sectorCode) })),
    pode: {
      assumir: podeAssumir(c.ctx, c.cfg, alvo),
      responder: podeResponder(c.ctx, c.cfg, alvo),
      agir: podeAgirNoCiclo(c.ctx, c.cfg, alvo),
      encaminharDireto: podeEncaminharDireto(c.ctx, c.cfg, alvo),
      pedirEncaminhamento: podePedirEncaminhamento(c.ctx, c.cfg, alvo) && !pedido,
      decidirPedido: !!pedido && podeDecidirPedido(c.ctx, c.cfg),
      vincular: podeAgirNoCiclo(c.ctx, c.cfg, alvo),
      convidar: ehDaTriagem(c.ctx, c.cfg) && !c.ctx.subscriptionReadOnly && c.ctx.role !== "READONLY" && ciclo.situacao !== "ENCERRADO",
    },
    eu: { id: c.ctx.userId },
  };
}

export type DetalheDoAtendimento = NonNullable<Awaited<ReturnType<typeof lerDetalhe>>>;

/** Empresas para ligar um contato, pelo nome ou CNPJ. */
/**
 * As empresas ativas do escritório, para o "Quem é?" escolher numa lista que
 * filtra enquanto se digita (12/11/2026). Carregadas só quando o painel abre.
 */
export async function empresasParaVincular(c: Contexto) {
  const prisma = getPrisma();
  const [empresas, portais] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId: c.ctx.tenantId, status: "ACTIVE" },
      select: { id: true, name: true, displayName: true, cnpj: true, logoUrl: true, parentCompanyId: true },
      orderBy: { name: "asc" },
    }),
    prisma.portalUserCompany.groupBy({ by: ["companyId"], where: { tenantId: c.ctx.tenantId }, _count: { _all: true } }),
  ]);
  const comPortal = new Set(portais.map((p) => p.companyId));
  return empresas.map((x) => ({
    id: x.id,
    nome: nomeExibicao(x),
    cnpj: x.cnpj,
    logoUrl: x.logoUrl,
    parentCompanyId: x.parentCompanyId,
    temPortal: comPortal.has(x.id),
  }));
}
