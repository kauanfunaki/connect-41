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
} from "./acesso";
import { desfechosDoEscritorio, lerConfiguracao, mensagensPadraoPara, nomesDosContatos, setoresQueAtendem, telefoneLegivel } from "./dados";
import { DIAS_DAS_ENCERRADAS, previa, recortesDe, type CartaoParaRecorte, type Recorte, type Situacao } from "./regras";
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
  return { config, maps, atendem, meus, geridos, triagem: ehDaTriagem(c.ctx, c.cfg) };
}

/** Tudo o que a pessoa pode ver na lista, numa consulta só (a união dos recortes dela). */
function filtroDaPessoa(c: Contexto, e: Awaited<ReturnType<typeof escopo>>): Prisma.AtendimentoCicloWhereInput {
  const tenantId = c.ctx.tenantId;
  const desde = new Date(Date.now() - DIAS_DAS_ENCERRADAS * 24 * 60 * 60 * 1000);
  const recentes: Prisma.AtendimentoCicloWhereInput = { OR: [{ situacao: { not: "ENCERRADO" } }, { encerradoEm: { gte: desde } }] };
  if (e.triagem) return { tenantId, ...recentes };
  return {
    tenantId,
    AND: [recentes, { OR: [{ assignedToId: c.ctx.userId }, ...(e.meus.length ? [{ sectorCode: { in: e.meus } }] : [])] }],
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
};

export type ListaDoAtendimento = {
  cartoes: CartaoDaLista[];
  recortes: Recorte[];
  meus: string[];
  geridos: string[];
  userId: string;
  ehTriagem: boolean;
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
      where: { tenantId: c.ctx.tenantId, id: { in: [...new Set(ciclos.map((x) => x.assignedToId).filter((x): x is string => !!x))] } },
      select: { id: true, name: true },
    }),
    nomesDosContatos(c.ctx.tenantId, ciclos.map((x) => x.conversa.contato)),
  ]);
  const ultimaPor = new Map(ultimas.map((m) => [m.conversaId, m]));
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
      setor: x.sectorCode ? { code: x.sectorCode, label: sectorLabel(e.maps.labels, x.sectorCode), cor: e.maps.colors[x.sectorCode] ?? "#586577" } : null,
      responsavel: x.assignedToId ? (nomePor.get(x.assignedToId) ?? null) : null,
      quando: x.conversa.lastMessageAt?.toISOString() ?? null,
      previa: ultima ? previa(ultima.body) : "",
      esperandoResposta: ultima?.direcao === "ENTRADA",
    };
  });

  return {
    cartoes,
    recortes: recortesDe(e),
    meus: e.meus,
    geridos: e.geridos,
    userId: c.ctx.userId,
    ehTriagem: e.triagem,
    triagem: { code: c.cfg.triagem, label: sectorLabel(e.maps.labels, c.cfg.triagem) },
  };
}

/** O número do menu: o que espera alguém agir (triagem, pedidos e "sem responsável" dos meus setores). */
export async function contarParaMenu(c: Contexto): Promise<number> {
  const prisma = getPrisma();
  const e = await escopo(c);
  const tenantId = c.ctx.tenantId;
  const filtros: Prisma.AtendimentoCicloWhereInput[] = [];
  if (e.triagem) filtros.push({ situacao: "TRIAGEM" }, { situacao: { not: "ENCERRADO" }, pedidos: { some: { status: "PENDENTE" } } });
  if (e.meus.length > 0) filtros.push({ situacao: "NO_SETOR", sectorCode: { in: e.meus } });
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

  const [mensagens, conexao, nomeDe, empresa, desfechos, padrao, pessoasDoSetor, temPortal] = await Promise.all([
    prisma.atendimentoMensagem.findMany({
      where: { conversaId: ciclo.conversaId },
      orderBy: { createdAt: "desc" },
      take: LIMITE_DE_MENSAGENS,
      select: { id: true, cicloId: true, direcao: true, body: true, status: true, erro: true, senderUserId: true, assinatura: true, interna: true, automatica: true, midiaTipo: true, createdAt: true },
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
  ]);

  const idsDeGente = new Set<string>();
  for (const m of mensagens) if (m.senderUserId) idsDeGente.add(m.senderUserId);
  for (const mv of ciclo.movimentos) {
    if (mv.porUserId) idsDeGente.add(mv.porUserId);
    if (mv.paraUserId) idsDeGente.add(mv.paraUserId);
  }
  if (ciclo.assignedToId) idsDeGente.add(ciclo.assignedToId);
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
    mensagensPadrao: padrao.map((m) => ({ id: m.id, titulo: m.titulo, texto: m.texto, setor: rotulo(m.sectorCode) })),
    pode: {
      assumir: podeAssumir(c.ctx, c.cfg, alvo),
      responder: podeResponder(c.ctx, c.cfg, alvo),
      agir: podeAgirNoCiclo(c.ctx, c.cfg, alvo),
      encaminharDireto: podeEncaminharDireto(c.ctx, c.cfg, alvo),
      pedirEncaminhamento: podePedirEncaminhamento(c.ctx, c.cfg, alvo) && !pedido,
      decidirPedido: !!pedido && podeDecidirPedido(c.ctx, c.cfg),
      vincular: podeAgirNoCiclo(c.ctx, c.cfg, alvo),
    },
    eu: { id: c.ctx.userId },
  };
}

export type DetalheDoAtendimento = NonNullable<Awaited<ReturnType<typeof lerDetalhe>>>;

/** Empresas para ligar um contato, pelo nome ou CNPJ. */
export async function buscarEmpresas(c: Contexto, termo: string) {
  const t = termo.trim();
  if (t.length < 2) return [];
  const prisma = getPrisma();
  const empresas = await prisma.company.findMany({
    where: { tenantId: c.ctx.tenantId, OR: [{ name: { contains: t } }, { displayName: { contains: t } }, { cnpj: { contains: t } }] },
    select: { id: true, name: true, displayName: true, cnpj: true },
    take: 8,
    orderBy: { name: "asc" },
  });
  const portais = empresas.length
    ? await prisma.portalUserCompany.groupBy({
        by: ["companyId"],
        where: { tenantId: c.ctx.tenantId, companyId: { in: empresas.map((x) => x.id) } },
        _count: { _all: true },
      })
    : [];
  const comPortal = new Set(portais.map((p) => p.companyId));
  return empresas.map((x) => ({ id: x.id, nome: nomeExibicao(x), cnpj: x.cnpj, temPortal: comPortal.has(x.id) }));
}
