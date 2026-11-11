// O banco da Fase 2 da Academia (11/11/2026, Controle interno
// funcionalidade-594): ranking de evolução, placar por setor, Hall dos
// campeões, parabéns entre colegas e conquistas. As regras moram nos arquivos
// puros (`evolucao.ts`, `hall.ts`, `conquistas.ts`); aqui se lê e se grava.
//
// "Aparecer no ranking" desligado vale em tudo daqui: a pessoa não aparece
// para os colegas (evolução, placar, Hall), não recebe nem manda parabéns, e
// vê só os próprios números — como no ranking do mês.
//
// Custo: cada mês é lido pelo índice (tenantId, teste, mes, valendo, nivel),
// como o ranking. O Hall é gravado uma vez por mês encerrado
// (`fecharMesesPendentes`); depois disso, a tela lê só a tabela dele.

import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { notifyUser } from "@/lib/notifications";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { sectorLabel } from "@/lib/sectors";
import { conquistasDe, type ConquistaNaTela } from "./conquistas";
import { MESES_DA_MEDIA_DA_EVOLUCAO, mesesAntes, montarEvolucao, placarPorSetor } from "./evolucao";
import { CATEGORIA_DA_EVOLUCAO, MESES_DO_HALL, ROTULO_DA_CATEGORIA, campeoesDoMes, ehCategoriaDoHall, type CategoriaDoHall } from "./hall";
import type { PosicaoNoRanking } from "./ranking";
import { TESTES, TESTE_DO_DESAFIO, ehMes, ehTeste, mesDoInstante, mesPorExtensoLongo, nomeDoMes, podeFazerTeste, type Teste } from "./regras";
import {
  apareceNoRanking, comNomes, desafioDeHoje, foraDoRanking, premiosDoMes, rankingDoMes, rotulosDosSetores, sequenciaDaPessoa,
} from "./servidor";
import type { NumeroDoCartao } from "@/lib/home/cartoes";
import type { CampeaoNaTela, EvolucaoNaTela, MesDoHall, ParabensDeQuemOlha, PlacarNaTela } from "./tipos";

type Quem = Pick<AuthContext, "userId" | "tenantId" | "homeTenantId" | "role" | "sectors" | "subscriptionReadOnly" | "activeSector">;

/** Quantas linhas de pessoa as telas mostram: o top 10 (e a linha de quem olha, abaixo dele). */
const TOPO = 10;

// ─── Os meses lidos, uma vez por chamada ─────────────────────────────────────

type Memo = Map<string, Promise<PosicaoNoRanking[]>>;

/** O ranking geral (todos os níveis e setores) de um mês, sem quem saiu — lido uma vez por chamada. */
function geralDoMes(memo: Memo, tenantId: string, teste: Teste, mes: string): Promise<PosicaoNoRanking[]> {
  const chave = `${teste}:${mes}`;
  let p = memo.get(chave);
  if (!p) memo.set(chave, (p = rankingDoMes(tenantId, { teste, mes, nivel: null, setor: null }).then((r) => r.ranking)));
  return p;
}

async function evolucaoDoMes(memo: Memo, tenantId: string, teste: Teste, mes: string) {
  const [doMes, ...anteriores] = await Promise.all([mes, ...mesesAntes(mes, MESES_DA_MEDIA_DA_EVOLUCAO)].map((m) => geralDoMes(memo, tenantId, teste, m)));
  return montarEvolucao(teste, doMes, anteriores);
}

// ─── Ranking de evolução ─────────────────────────────────────────────────────

export async function evolucaoParaTela(ctx: Pick<Quem, "tenantId" | "userId">, teste: Teste, mes: string): Promise<EvolucaoNaTela> {
  const [{ ranking, todas }, aparece] = await Promise.all([evolucaoDoMes(new Map(), ctx.tenantId, teste, mes), apareceNoRanking(ctx)]);
  const minha = todas.get(ctx.userId) ?? null;
  if (!aparece) return { teste, mes, foraDoRanking: true, topo: [], eu: null, participantes: ranking.length, minha };
  const topo = ranking.slice(0, TOPO);
  const minhaLinha = ranking.find((l) => l.userId === ctx.userId);
  const [comNome, eu] = await Promise.all([
    comNomes(ctx.tenantId, topo, ctx.userId),
    comNomes(ctx.tenantId, minhaLinha && minhaLinha.posicao > TOPO ? [minhaLinha] : [], ctx.userId),
  ]);
  return { teste, mes, foraDoRanking: false, topo: comNome, eu: eu[0] ?? null, participantes: ranking.length, minha };
}

// ─── Placar por setor ────────────────────────────────────────────────────────

export async function placarParaTela(ctx: Pick<Quem, "tenantId" | "userId" | "sectors">, teste: Teste, mes: string): Promise<PlacarNaTela> {
  const [doMes, aparece, labels] = await Promise.all([geralDoMes(new Map(), ctx.tenantId, teste, mes), apareceNoRanking(ctx), rotulosDosSetores(ctx.tenantId)]);
  if (!aparece) return { teste, mes, foraDoRanking: true, linhas: [], setoresDeFora: 0 };
  const linhas = placarPorSetor(teste, doMes);
  const comResultado = new Set(doMes.flatMap((p) => (p.sectorCode ? [p.sectorCode] : [])));
  return {
    teste, mes, foraDoRanking: false,
    linhas: linhas.map((l) => ({ ...l, setor: sectorLabel(labels, l.sectorCode), meu: ctx.sectors.includes(l.sectorCode) })),
    setoresDeFora: comResultado.size - linhas.length,
  };
}

// ─── Hall dos campeões ───────────────────────────────────────────────────────

/** Os meses encerrados que o Hall cobre, do mais recente para trás. */
export const mesesDoHall = (agora: Date = new Date()) => mesesAntes(mesDoInstante(agora), MESES_DO_HALL);

/**
 * Grava o Hall dos meses encerrados que ainda não foram fechados: o pódio de
 * cada teste e a maior evolução, com o prêmio do mês. Idempotente — duas
 * pessoas abrindo ao mesmo tempo gravam uma vez só (as chaves únicas).
 */
export async function fecharMesesPendentes(tenantId: string, agora: Date = new Date()): Promise<void> {
  const db = getPrisma();
  const meses = mesesDoHall(agora);
  const fechados = new Set((await db.academiaMesFechado.findMany({ where: { tenantId, mes: { in: meses } }, select: { mes: true } })).map((f) => f.mes));
  const pendentes = meses.filter((m) => !fechados.has(m)).reverse();
  if (pendentes.length === 0) return;
  const memo: Memo = new Map();
  for (const mes of pendentes) {
    const [rankings, evolucoes, premios] = await Promise.all([
      Promise.all(TESTES.map((t) => geralDoMes(memo, tenantId, t, mes))),
      Promise.all(TESTES.map((t) => evolucaoDoMes(memo, tenantId, t, mes).then((e) => e.ranking))),
      premiosDoMes(tenantId, mes),
    ]);
    const porTeste = <T,>(lista: T[]) => Object.fromEntries(TESTES.map((t, i) => [t, lista[i]])) as Record<Teste, T>;
    const campeoes = campeoesDoMes(porTeste(rankings), porTeste(evolucoes));
    if (campeoes.length) {
      await db.academiaCampeao.createMany({
        data: campeoes.map((c) => ({
          tenantId, mes, ...c,
          premio: c.categoria === CATEGORIA_DA_EVOLUCAO ? premios.evolucao : premios.podio,
        })),
        skipDuplicates: true,
      });
    }
    try {
      await db.academiaMesFechado.create({ data: { tenantId, mes } });
    } catch (e) {
      if (!isPrismaUniqueError(e)) throw e;
    }
  }
}

/**
 * O Hall na tela: os meses encerrados, do mais recente para trás, com o pódio
 * e a maior evolução. Quem está fora do ranking agora não aparece; quem olha e
 * está fora vê só as próprias linhas.
 */
export async function hallParaTela(ctx: Pick<Quem, "tenantId" | "userId">, agora: Date = new Date()): Promise<{ meses: MesDoHall[]; foraDoRanking: boolean }> {
  await fecharMesesPendentes(ctx.tenantId, agora);
  const meses = mesesDoHall(agora);
  const [linhas, fora, aparece] = await Promise.all([
    getPrisma().academiaCampeao.findMany({
      where: { tenantId: ctx.tenantId, mes: { in: meses }, user: { active: true } },
      select: { mes: true, categoria: true, posicao: true, userId: true, teste: true, valor: true, premio: true, user: { select: { name: true, photoUrl: true } } },
      orderBy: [{ mes: "desc" }, { posicao: "asc" }],
    }),
    foraDoRanking(ctx.tenantId),
    apareceNoRanking(ctx),
  ]);
  const porMes = new Map<string, CampeaoNaTela[]>();
  for (const l of linhas) {
    if (!ehCategoriaDoHall(l.categoria) || !ehTeste(l.teste) || fora.has(l.userId)) continue;
    if (!aparece && l.userId !== ctx.userId) continue;
    const lista = porMes.get(l.mes) ?? [];
    lista.push({
      categoria: l.categoria, posicao: l.posicao, userId: l.userId, nome: l.user.name ?? "—", fotoUrl: l.user.photoUrl ?? null,
      teste: l.teste, valor: l.valor, premio: l.premio, eu: l.userId === ctx.userId,
    });
    porMes.set(l.mes, lista);
  }
  return { meses: meses.flatMap((mes) => (porMes.has(mes) ? [{ mes, campeoes: porMes.get(mes)! }] : [])), foraDoRanking: !aparece };
}

/** O 1º lugar do mês num teste (o do Início), sem quem saiu do ranking; nulo para quem está fora. */
export async function lideresDoMes(ctx: Pick<Quem, "tenantId" | "userId">, teste: Teste, mes: string): Promise<{ nome: string } | null> {
  const [ranking, aparece] = await Promise.all([geralDoMes(new Map(), ctx.tenantId, teste, mes), apareceNoRanking(ctx)]);
  if (!aparece || !ranking[0]) return null;
  const [l] = await comNomes(ctx.tenantId, [ranking[0]], ctx.userId);
  return { nome: l.nome };
}

/**
 * O cartão do Início (Fase 2): o número é a sequência de dias de quem olha;
 * embaixo, o desafio de hoje e quem está na frente da Digitação no mês (o
 * teste principal). Quem está fora do ranking não vê o nome.
 */
export async function cartaoDaAcademia(ctx: Pick<Quem, "tenantId" | "userId">): Promise<NumeroDoCartao> {
  const agora = new Date();
  const mes = mesDoInstante(agora);
  const [desafio, lider] = await Promise.all([desafioDeHoje(ctx, agora), lideresDoMes(ctx, "digitacao", mes)]);
  const hoje = desafio.feitoHoje ? "Desafio de hoje feito" : desafio.usadoHoje ? "Desafio de hoje começado" : "Desafio de hoje a fazer";
  const dias = desafio.sequencia.atual;
  return {
    valor: dias,
    apoio: dias === 1 ? "dia seguido" : "dias seguidos",
    detalhe: lider ? `${hoje} · Na frente em ${nomeDoMes(mes)}: ${lider.nome} (Digitação)` : hoje,
  };
}

// ─── Parabéns ────────────────────────────────────────────────────────────────

/** Quem olha pode mandar parabéns: faz teste no escritório dele e aparece no ranking. */
async function podeMandarParabens(ctx: Quem): Promise<boolean> {
  return podeFazerTeste(ctx) && (await apareceNoRanking(ctx));
}

/** Os parabéns que quem olha já mandou nos meses pedidos, por "mes:tipo". */
export async function parabensDeQuemOlha(ctx: Quem, meses: string[]): Promise<ParabensDeQuemOlha> {
  const [pode, linhas] = await Promise.all([
    podeMandarParabens(ctx),
    getPrisma().academiaParabens.findMany({ where: { deUserId: ctx.userId, mes: { in: meses } }, select: { mes: true, tipo: true, paraUserId: true }, take: 2000 }),
  ]);
  const enviados: Record<string, string[]> = {};
  for (const l of linhas) (enviados[`${l.mes}:${l.tipo}`] ??= []).push(l.paraUserId);
  return { podeMandar: pode, enviados };
}

/** A pessoa está à vista no recorte (no Hall do mês, ou no top 10 do ranking ou da evolução)? */
async function estaAVista(tenantId: string, paraUserId: string, mes: string, tipo: CategoriaDoHall): Promise<boolean> {
  const noHall = await getPrisma().academiaCampeao.findFirst({ where: { tenantId, mes, categoria: tipo, userId: paraUserId }, select: { id: true } });
  if (noHall) return true;
  const memo: Memo = new Map();
  if (tipo !== CATEGORIA_DA_EVOLUCAO) {
    const ranking = await geralDoMes(memo, tenantId, tipo, mes);
    return ranking.some((p) => p.userId === paraUserId && p.posicao <= TOPO);
  }
  for (const teste of TESTES) {
    const { ranking } = await evolucaoDoMes(memo, tenantId, teste, mes);
    if (ranking.some((l) => l.userId === paraUserId && l.posicao <= TOPO)) return true;
  }
  return false;
}

/**
 * "Parabéns" para um colega no Hall ou no ranking: um por quem manda, quem
 * recebe, mês e tipo. Avisa quem recebe no sino (tipo ACADEMIA_PARABENS).
 */
export async function mandarParabens(ctx: Quem, raw: unknown): Promise<{ ok: true } | { erro: string }> {
  const { paraUserId, mes, tipo } = (raw ?? {}) as { paraUserId?: unknown; mes?: unknown; tipo?: unknown };
  if (typeof paraUserId !== "string" || !paraUserId || !ehMes(mes) || !ehCategoriaDoHall(tipo) || mes > mesDoInstante()) return { erro: "Não deu para mandar os parabéns. Recarregue a página." };
  if (paraUserId === ctx.userId) return { erro: "Os parabéns são para os colegas." };
  if (!(await podeMandarParabens(ctx))) return { erro: "Para mandar parabéns, ligue “Aparecer no ranking” (e faça os testes no seu escritório)." };
  const db = getPrisma();
  const [para, de, fora] = await Promise.all([
    db.user.findFirst({ where: { id: paraUserId, tenantId: ctx.tenantId, active: true }, select: { id: true } }),
    db.user.findUnique({ where: { id: ctx.userId }, select: { name: true } }),
    foraDoRanking(ctx.tenantId),
  ]);
  if (!para || fora.has(paraUserId) || !(await estaAVista(ctx.tenantId, paraUserId, mes, tipo))) return { erro: "Esta pessoa não está mais no ranking deste recorte." };
  try {
    await db.academiaParabens.create({ data: { tenantId: ctx.tenantId, deUserId: ctx.userId, paraUserId, mes, tipo } });
  } catch (e) {
    if (isPrismaUniqueError(e)) return { erro: "Você já mandou parabéns por este resultado." };
    throw e;
  }
  const oQue = tipo === CATEGORIA_DA_EVOLUCAO ? "a sua evolução" : `o seu resultado em ${ROTULO_DA_CATEGORIA[tipo]}`;
  // O aviso não pode desfazer os parabéns: se o sino falhar, fica no log.
  try {
    await notifyUser(paraUserId, {
      tenantId: ctx.tenantId,
      type: "ACADEMIA_PARABENS",
      message: `${de?.name ?? "Um colega"} deu parabéns por ${oQue} na Academia (${mesPorExtensoLongo(mes)}).`,
      actorUserId: ctx.userId,
    });
  } catch (err) {
    console.error("[academia] aviso dos parabéns", err);
  }
  return { ok: true };
}

// ─── Conquistas ──────────────────────────────────────────────────────────────

/** As conquistas de quem olha e os parabéns que ela recebeu no mês. */
export async function conquistasDaPessoa(ctx: Pick<Quem, "tenantId" | "userId">, agora: Date = new Date()): Promise<{ conquistas: ConquistaNaTela[]; parabensNoMes: number }> {
  await fecharMesesPendentes(ctx.tenantId, agora);
  const db = getPrisma();
  const doTeste = (teste: string) => ({ userId: ctx.userId, teste, valendo: true });
  const [algum, desafios, sequencia, ppm, perfeita, atalhos, noHall, parabens] = await Promise.all([
    db.academiaResultado.findFirst({ where: { userId: ctx.userId, teste: { in: [...TESTES] }, valendo: true }, select: { id: true } }),
    db.academiaResultado.count({ where: { userId: ctx.userId, teste: TESTE_DO_DESAFIO } }),
    sequenciaDaPessoa(ctx.userId, agora),
    db.academiaResultado.aggregate({ where: doTeste("digitacao"), _max: { ppm: true } }),
    db.academiaResultado.findFirst({ where: { ...doTeste("logica"), precisao: { gte: 100 } }, select: { id: true } }),
    db.academiaResultado.aggregate({ where: doTeste("atalhos"), _max: { acertos: true } }),
    db.academiaCampeao.findMany({ where: { userId: ctx.userId }, select: { categoria: true, posicao: true }, take: 500 }),
    db.academiaParabens.count({ where: { paraUserId: ctx.userId, mes: mesDoInstante(agora) } }),
  ]);
  const dosTestes = noHall.filter((c) => c.categoria !== CATEGORIA_DA_EVOLUCAO);
  return {
    conquistas: conquistasDe({
      temResultado: Boolean(algum),
      desafiosFeitos: desafios,
      maiorSequencia: sequencia.maior,
      maiorPpm: ppm._max.ppm,
      logicaPerfeita: Boolean(perfeita),
      maiorAcertoNosAtalhos: atalhos._max.acertos,
      podios: dosTestes.length,
      primeirosLugares: dosTestes.filter((c) => c.posicao === 1).length,
      maioresEvolucoes: noHall.length - dosTestes.length,
    }),
    parabensNoMes: parabens,
  };
}
