// O banco da Academia (10/11/2026, pedido do Kauan): portão das telas, as
// rodadas (sessão com nonce e validade, servida e corrigida aqui), o ranking
// do mês, o resumo da pessoa e a administração. A regra mora nos arquivos
// puros ao lado; aqui só se lê, confere e grava.
//
// Produção é grande e o MySQL é lento: toda leitura de ranking é de UM mês e
// de UM teste, pelo índice (tenantId, teste, mes, valendo, nivel), com teto de
// linhas. Uma tentativa valendo por dia, por nível e por teste — então um mês
// tem no máximo ~93 linhas por pessoa e teste.

import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, type AuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { logAudit } from "@/lib/audit";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import {
  MODULO_ACADEMIA, NIVEIS, QUESTOES_POR_RODADA, ROTULO_DO_NIVEL, ROTULO_DO_TESTE, TESTES, TESTE_DO_DESAFIO, VALIDADE_DA_SESSAO_MS,
  VALIDADE_DO_DESAFIO_MS, diaDoInstante, diaValendoDaSessao, ehNivel, mesDoInstante, motivoSemTeste, podeAdministrarAcademia,
  podeFazerTeste, setorDoResultado, type Nivel, type Teste,
} from "./regras";
import { avaliarDigitacao } from "./digitacao";
import { gerarTextoDeNumeros } from "./numeros";
import { avaliarLogica, embaralhar, lerAlternativas, questaoSchema } from "./logica";
import { atalhoPorId, avaliarAtalhos, sortearPedidos } from "./atalhos";
import { indiceDoDesafio, sequenciaDeDias, type Sequencia } from "./sequencia";
import { metaDaPessoa } from "./metaServidor";
import {
  melhorDoMes, montarRanking, posicaoDe, recorteDoRanking, semQuemSaiu,
  type LinhaDoResultado, type PosicaoNoRanking,
} from "./ranking";
import type {
  DesafioDeHoje, LinhaDaTela, QuestaoNaTela, RankingNaTela, ResultadoDoEnvio, ResumoDaAcademia, ResumoDoTeste, RodadaServida, TextoNaTela,
} from "./tipos";

type Quem = Pick<AuthContext, "userId" | "tenantId" | "homeTenantId" | "role" | "sectors" | "subscriptionReadOnly" | "activeSector">;

// ─── Portão ──────────────────────────────────────────────────────────────────

/**
 * A Academia é de toda a equipe do escritório (não do portal do cliente), com
 * o módulo ligado. Somente leitura vê, mas não faz teste (`podeFazerTeste`).
 */
export async function abrirAcademia(): Promise<{ ctx: AuthContext; podeAdministrar: boolean; podeFazer: boolean }> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULO_ACADEMIA))) notFound();
  return { ctx, podeAdministrar: podeAdministrarAcademia(ctx), podeFazer: podeFazerTeste(ctx) };
}

async function ligada(ctx: Pick<Quem, "tenantId" | "userId">): Promise<boolean> {
  return Boolean(ctx.tenantId && ctx.userId) && isModuleEnabled(ctx.tenantId, MODULO_ACADEMIA);
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

/** Teto de segurança da leitura de um mês (bem acima do possível com uma tentativa por dia). */
const TETO_DE_LINHAS = 20_000;

type Filtro = { teste: Teste; mes: string; nivel: Nivel | null; setor: string | null };

async function linhasDoMes(tenantId: string, f: Filtro): Promise<LinhaDoResultado[]> {
  const linhas = await getPrisma().academiaResultado.findMany({
    where: {
      tenantId, teste: f.teste, mes: f.mes, valendo: true,
      ...(f.nivel ? { nivel: f.nivel } : {}),
      ...(f.setor ? { sectorCode: f.setor } : {}),
      // Quem saiu da equipe sai do ranking (o histórico fica, sem aparecer).
      user: { active: true },
    },
    select: { userId: true, nivel: true, sectorCode: true, ppm: true, acertos: true, total: true, precisao: true, duracaoMs: true },
    take: TETO_DE_LINHAS,
  });
  return linhas.flatMap((l) => (ehNivel(l.nivel) ? [{ ...l, nivel: l.nivel, precisao: Number(l.precisao) }] : []));
}

/** Quem desligou "Aparecer no ranking" neste escritório (lista curta). */
export async function foraDoRanking(tenantId: string): Promise<Set<string>> {
  const prefs = await getPrisma().academiaPreferencia.findMany({ where: { tenantId, aparecerNoRanking: false }, select: { userId: true } });
  return new Set(prefs.map((p) => p.userId));
}

export async function apareceNoRanking(ctx: Pick<Quem, "userId">): Promise<boolean> {
  const p = await getPrisma().academiaPreferencia.findUnique({ where: { userId: ctx.userId }, select: { aparecerNoRanking: true } });
  return p?.aparecerNoRanking ?? true;
}

/** Os rótulos dos setores, uma leitura por requisição (o Início monta seis recortes). */
export const rotulosDosSetores = cache(async (tenantId: string) => (await getSectorMaps(tenantId)).labels);

/** Nome, foto e o rótulo do setor só das linhas que vão para a tela. */
export async function comNomes<T extends { userId: string; sectorCode: string | null }>(
  tenantId: string,
  posicoes: T[],
  userId: string | null,
): Promise<(T & { nome: string; fotoUrl: string | null; setor: string | null; eu: boolean })[]> {
  if (posicoes.length === 0) return [];
  const [pessoas, labels] = await Promise.all([
    getPrisma().user.findMany({ where: { tenantId, id: { in: posicoes.map((p) => p.userId) } }, select: { id: true, name: true, photoUrl: true } }),
    rotulosDosSetores(tenantId),
  ]);
  const porId = new Map(pessoas.map((p) => [p.id, p]));
  return posicoes.map((p) => ({
    ...p,
    nome: porId.get(p.userId)?.name ?? "—",
    fotoUrl: porId.get(p.userId)?.photoUrl ?? null,
    setor: p.sectorCode ? sectorLabel(labels, p.sectorCode) : null,
    eu: p.userId === userId,
  }));
}

/** O ranking de um mês e de um teste, sem quem saiu. Para a tela, a API e o certificado. */
export async function rankingDoMes(tenantId: string, f: Filtro): Promise<{ ranking: PosicaoNoRanking[]; linhas: LinhaDoResultado[] }> {
  const [linhas, fora] = await Promise.all([linhasDoMes(tenantId, f), foraDoRanking(tenantId)]);
  return { ranking: montarRanking(f.teste, semQuemSaiu(linhas, fora), f.nivel), linhas };
}

/** A tabela do ranking: o top `n` e a linha de quem olha (nunca o fim da lista). */
export async function rankingParaTela(ctx: Pick<Quem, "tenantId" | "userId">, f: Filtro, n = 10): Promise<RankingNaTela> {
  const [{ ranking, linhas }, aparece] = await Promise.all([rankingDoMes(ctx.tenantId, f), apareceNoRanking(ctx)]);
  const minhas = linhas.filter((l) => l.userId === ctx.userId);
  const meusNumeros = minhas.length ? montarRanking(f.teste, minhas, f.nivel)[0] ?? null : null;
  if (!aparece) {
    return { ...f, foraDoRanking: true, topo: [], eu: null, participantes: ranking.length, meusNumeros };
  }
  const corte = recorteDoRanking(ranking, ctx.userId, n);
  const [topo, eu] = await Promise.all([comNomes(ctx.tenantId, corte.topo, ctx.userId), comNomes(ctx.tenantId, corte.eu ? [corte.eu] : [], ctx.userId)]);
  return { ...f, foraDoRanking: false, topo, eu: eu[0] ?? null, participantes: corte.participantes, meusNumeros };
}

// ─── O resumo da pessoa (Início e o painel do topo) ──────────────────────────

/** Os níveis com a tentativa valendo de hoje já usada, por teste. */
async function usadosHoje(ctx: Pick<Quem, "userId">, agora: Date): Promise<Record<Teste, Nivel[]>> {
  const sessoes = await getPrisma().academiaSessao.findMany({
    where: { userId: ctx.userId, diaValendo: diaDoInstante(agora) },
    select: { teste: true, nivel: true },
  });
  const r: Record<Teste, Nivel[]> = { digitacao: [], numeros: [], logica: [], atalhos: [] };
  for (const s of sessoes) if ((TESTES as readonly string[]).includes(s.teste) && ehNivel(s.nivel)) r[s.teste as Teste].push(s.nivel);
  return r;
}

/** Há textos e questões ativos em cada nível? (Números são gerados: sempre.) */
async function disponibilidade(tenantId: string): Promise<ResumoDaAcademia["disponivel"]> {
  const db = getPrisma();
  const [textos, questoes] = await Promise.all([
    db.academiaTexto.groupBy({ by: ["nivel"], where: { tenantId, ativo: true }, _count: { _all: true } }),
    db.academiaQuestao.groupBy({ by: ["nivel"], where: { tenantId, ativo: true }, _count: { _all: true } }),
  ]);
  const tem = (grupos: { nivel: string; _count: { _all: number } }[]) =>
    Object.fromEntries(NIVEIS.map((n) => [n, grupos.some((g) => g.nivel === n && g._count._all > 0)])) as Record<Nivel, boolean>;
  const sempre = { facil: true, medio: true, dificil: true };
  // Atalhos (Fase 2): o banco é do código, então sempre há o que servir.
  return { digitacao: tem(textos), numeros: sempre, logica: tem(questoes), atalhos: sempre };
}

/** Para a tela de um teste: os níveis já usados hoje e onde há o que servir — sem ler ranking. */
export async function estadoDoTeste(ctx: Pick<Quem, "tenantId" | "userId">, teste: Teste): Promise<{ usadosHoje: Nivel[]; disponivel: Record<Nivel, boolean> }> {
  const [usados, disponivel] = await Promise.all([usadosHoje(ctx, new Date()), disponibilidade(ctx.tenantId)]);
  return { usadosHoje: usados[teste], disponivel: disponivel[teste] };
}

/**
 * Os prêmios do mês: o do pódio (top 3 de cada teste) e o da maior evolução
 * (Fase 2). Texto vazio vira nulo.
 */
export async function premiosDoMes(tenantId: string, mes: string): Promise<{ podio: string | null; evolucao: string | null }> {
  const p = await getPrisma().academiaPremio.findUnique({ where: { tenantId_mes: { tenantId, mes } }, select: { texto: true, textoEvolucao: true } });
  return { podio: p?.texto || null, evolucao: p?.textoEvolucao || null };
}

export async function premioDoMes(tenantId: string, mes: string): Promise<string | null> {
  return (await premiosDoMes(tenantId, mes)).podio;
}

// ─── Desafio do dia e sequência (Fase 2) ─────────────────────────────────────

/** Os dias com o desafio feito (a pessoa faz no máximo um por dia). */
async function diasDoDesafio(userId: string): Promise<string[]> {
  const linhas = await getPrisma().academiaResultado.findMany({
    where: { userId, teste: TESTE_DO_DESAFIO, dia: { not: null } },
    select: { dia: true },
    orderBy: { dia: "desc" },
    take: 2000,
  });
  return linhas.flatMap((l) => (l.dia ? [l.dia] : []));
}

/** A sequência de dias de quem olha. Barata: uma leitura pelo índice (userId, teste, dia). */
export async function sequenciaDaPessoa(userId: string, agora: Date = new Date()): Promise<Sequencia> {
  return sequenciaDeDias(await diasDoDesafio(userId), diaDoInstante(agora));
}

/** O texto do desafio do dia: o mesmo para todo o escritório (`indiceDoDesafio`). */
async function textoDoDesafio(tenantId: string, dia: string): Promise<{ id: string; nivel: string; conteudo: string } | null> {
  const db = getPrisma();
  const where = { tenantId, ativo: true };
  const quantos = await db.academiaTexto.count({ where });
  if (quantos === 0) return null;
  return db.academiaTexto.findFirst({ where, orderBy: { id: "asc" }, skip: indiceDoDesafio(dia, quantos), select: { id: true, nivel: true, conteudo: true } });
}

export async function desafioDeHoje(ctx: Pick<Quem, "tenantId" | "userId">, agora: Date = new Date()): Promise<DesafioDeHoje> {
  const dia = diaDoInstante(agora);
  const db = getPrisma();
  const [quantos, hoje, sessao, sequencia] = await Promise.all([
    db.academiaTexto.count({ where: { tenantId: ctx.tenantId, ativo: true } }),
    db.academiaResultado.findFirst({ where: { userId: ctx.userId, teste: TESTE_DO_DESAFIO, dia }, select: { ppm: true, precisao: true } }),
    db.academiaSessao.findFirst({ where: { userId: ctx.userId, teste: TESTE_DO_DESAFIO, diaValendo: dia }, select: { id: true } }),
    sequenciaDaPessoa(ctx.userId, agora),
  ]);
  return {
    disponivel: quantos > 0,
    feitoHoje: Boolean(hoje),
    usadoHoje: Boolean(sessao),
    resultado: hoje ? { ppm: hoje.ppm ?? 0, precisao: Number(hoje.precisao) } : null,
    sequencia,
  };
}

/**
 * Começa o desafio do dia: uma vez por dia, valendo, com o texto do dia. Como
 * no teste valendo, começar conta — a sessão grava o dia, e a chave única
 * (userId, teste, nivel, diaValendo) deixa entrar uma só.
 */
export async function comecarDesafio(ctx: Quem): Promise<RodadaServida | { erro: string }> {
  if (!(await ligada(ctx))) return { erro: "A Academia não está disponível." };
  if (!podeFazerTeste(ctx)) return { erro: motivoSemTeste(ctx) };
  const db = getPrisma();
  const agora = new Date();
  const dia = diaDoInstante(agora);
  const usada = await db.academiaSessao.findFirst({ where: { userId: ctx.userId, teste: TESTE_DO_DESAFIO, diaValendo: dia }, select: { id: true } });
  if (usada) return { erro: "Você já fez o desafio de hoje. Amanhã tem outro!" };
  const escolhido = await textoDoDesafio(ctx.tenantId, dia);
  if (!escolhido || !ehNivel(escolhido.nivel)) return { erro: "Ainda não há textos de digitação para o desafio. Peça a quem administra a Academia para cadastrar." };
  const texto = escolhido.conteudo.replace(/\r\n/g, "\n").trim();
  const nonce = randomBytes(16).toString("hex");
  const expiraEm = new Date(agora.getTime() + VALIDADE_DO_DESAFIO_MS);
  try {
    const sessao = await db.academiaSessao.create({
      data: {
        tenantId: ctx.tenantId, userId: ctx.userId, teste: TESTE_DO_DESAFIO, nivel: escolhido.nivel, valendo: true, diaValendo: dia, nonce,
        payload: { tipo: "texto", texto, textoId: escolhido.id }, startedAt: agora, expiresAt: expiraEm,
      },
      select: { id: true },
    });
    return { teste: "digitacao", desafio: true, sessaoId: sessao.id, nonce, nivel: escolhido.nivel, valendo: true, texto, expiraEm: expiraEm.toISOString() };
  } catch (e) {
    if (isPrismaUniqueError(e)) return { erro: "Você já fez o desafio de hoje. Amanhã tem outro!" };
    throw e;
  }
}

/**
 * O resumo do mês da pessoa: o melhor de cada teste, a posição no ranking
 * geral de cada um, a tentativa de hoje por nível e o prêmio. `topo` > 0 traz
 * também o começo de cada ranking (o Início mostra 5).
 */
export async function resumoDaAcademia(ctx: Pick<Quem, "tenantId" | "userId">, opcoes: { topo?: number; agora?: Date } = {}): Promise<ResumoDaAcademia> {
  const agora = opcoes.agora ?? new Date();
  const mes = mesDoInstante(agora);
  const [porTeste, aparece, usados, premios, disponivel, desafio, meta] = await Promise.all([
    Promise.all(TESTES.map((teste) => rankingDoMes(ctx.tenantId, { teste, mes, nivel: null, setor: null }))),
    apareceNoRanking(ctx),
    usadosHoje(ctx, agora),
    premiosDoMes(ctx.tenantId, mes),
    disponibilidade(ctx.tenantId),
    desafioDeHoje(ctx, agora),
    metaDaPessoa(ctx, agora),
  ]);

  const testes = {} as Record<Teste, ResumoDoTeste>;
  let melhorPosicao: ResumoDaAcademia["melhorPosicao"] = null;
  for (const [i, teste] of TESTES.entries()) {
    const { ranking, linhas } = porTeste[i];
    const melhor = melhorDoMes(teste, linhas.filter((l) => l.userId === ctx.userId));
    const minha = aparece ? posicaoDe(ranking, ctx.userId) : null;
    let topo: LinhaDaTela[] = [];
    let eu: LinhaDaTela | null = null;
    if (aparece && opcoes.topo) {
      const corte = recorteDoRanking(ranking, ctx.userId, opcoes.topo);
      const [doTopo, minhaLinha] = await Promise.all([comNomes(ctx.tenantId, corte.topo, ctx.userId), comNomes(ctx.tenantId, corte.eu ? [corte.eu] : [], ctx.userId)]);
      topo = doTopo;
      eu = minhaLinha[0] ?? null;
    }
    testes[teste] = {
      teste,
      melhor: melhor && { nivel: melhor.nivel, ppm: melhor.ppm, acertos: melhor.acertos, total: melhor.total, precisao: melhor.precisao },
      posicao: minha?.posicao ?? null,
      participantes: ranking.length,
      usadosHoje: usados[teste],
      topo,
      eu,
    };
    if (minha && (!melhorPosicao || minha.posicao < melhorPosicao.posicao)) melhorPosicao = { teste, posicao: minha.posicao, participantes: ranking.length };
  }
  return { mes, aparece, premio: premios.podio, premioDaEvolucao: premios.evolucao, testes, melhorPosicao, disponivel, desafio, meta };
}

// ─── Rodadas ─────────────────────────────────────────────────────────────────

const comecarSchema = z.object({ teste: z.enum(TESTES), nivel: z.enum(NIVEIS), valendo: z.boolean() });

type Payload =
  | { tipo: "texto"; texto: string; textoId?: string; semente?: number }
  | { tipo: "questoes"; questoes: { id: string; correta: number }[] }
  // Atalhos (Fase 2): os ids dos pedidos, na ordem servida. As teclas certas
  // ficam no código (`BANCO_DE_ATALHOS`), e não na tela.
  | { tipo: "atalhos"; pedidos: string[] };

/**
 * Serve uma rodada: escolhe o texto (ou gera o de números, ou sorteia as
 * questões), grava a sessão com nonce e validade e devolve o que a tela
 * mostra — nunca a alternativa certa.
 *
 * Valendo, a sessão grava o dia: a chave única recusa a segunda do mesmo dia
 * no mesmo nível (ver `diaValendoDaSessao`). O conteúdo é escolhido antes de
 * gravar: sem texto no nível, a tentativa do dia não é gasta.
 */
export async function comecarRodada(ctx: Quem, raw: unknown): Promise<RodadaServida | { erro: string }> {
  if (!(await ligada(ctx))) return { erro: "A Academia não está disponível." };
  if (!podeFazerTeste(ctx)) return { erro: motivoSemTeste(ctx) };
  const parsed = comecarSchema.safeParse(raw);
  if (!parsed.success) return { erro: "Escolha o teste e o nível." };
  const { teste, nivel, valendo } = parsed.data;
  const db = getPrisma();
  const agora = new Date();
  const diaValendo = diaValendoDaSessao(valendo, agora);

  if (diaValendo) {
    const usada = await db.academiaSessao.findFirst({ where: { userId: ctx.userId, teste, nivel, diaValendo }, select: { id: true } });
    if (usada) return { erro: jaUsada(teste, nivel) };
  }

  let payload: Payload;
  let paraTela:
    | { texto: string }
    | { questoes: Extract<RodadaServida, { teste: "logica" }>["questoes"] }
    | { pedidos: Extract<RodadaServida, { teste: "atalhos" }>["pedidos"] };
  if (teste === "atalhos") {
    const pedidos = sortearPedidos(nivel, () => randomInt(1_000_000) / 1_000_000);
    payload = { tipo: "atalhos", pedidos };
    paraTela = {
      pedidos: pedidos.flatMap((id) => {
        const a = atalhoPorId(id);
        return a ? [{ id: a.id, acao: a.acao, onde: a.onde }] : [];
      }),
    };
  } else if (teste === "numeros") {
    const semente = randomInt(2 ** 31 - 1);
    const texto = gerarTextoDeNumeros(nivel, semente);
    payload = { tipo: "texto", texto, semente };
    paraTela = { texto };
  } else if (teste === "digitacao") {
    const where = { tenantId: ctx.tenantId, nivel, ativo: true };
    const quantos = await db.academiaTexto.count({ where });
    if (quantos === 0) return { erro: semConteudo(teste, nivel) };
    const escolhido = await db.academiaTexto.findFirst({ where, orderBy: { id: "asc" }, skip: randomInt(quantos), select: { id: true, conteudo: true } });
    if (!escolhido) return { erro: semConteudo(teste, nivel) };
    const texto = escolhido.conteudo.replace(/\r\n/g, "\n").trim();
    payload = { tipo: "texto", texto, textoId: escolhido.id };
    paraTela = { texto };
  } else {
    const ids = await db.academiaQuestao.findMany({ where: { tenantId: ctx.tenantId, nivel, ativo: true }, select: { id: true }, take: 2000 });
    if (ids.length === 0) return { erro: semConteudo(teste, nivel) };
    const sorteadas = embaralhar(ids.map((q) => q.id)).slice(0, QUESTOES_POR_RODADA);
    const lidas = await db.academiaQuestao.findMany({
      where: { tenantId: ctx.tenantId, id: { in: sorteadas } },
      select: { id: true, enunciado: true, imagemUrl: true, alternativas: true, correta: true },
    });
    const porId = new Map(lidas.map((q) => [q.id, q]));
    const questoes = sorteadas.flatMap((id) => {
      const q = porId.get(id);
      return q ? [q] : [];
    });
    payload = { tipo: "questoes", questoes: questoes.map((q) => ({ id: q.id, correta: q.correta })) };
    paraTela = { questoes: questoes.map((q) => ({ id: q.id, enunciado: q.enunciado, imagemUrl: q.imagemUrl, alternativas: lerAlternativas(q.alternativas) })) };
  }

  const nonce = randomBytes(16).toString("hex");
  const expiraEm = new Date(agora.getTime() + VALIDADE_DA_SESSAO_MS[teste]);
  try {
    const sessao = await db.academiaSessao.create({
      data: { tenantId: ctx.tenantId, userId: ctx.userId, teste, nivel, valendo, diaValendo, nonce, payload, startedAt: agora, expiresAt: expiraEm },
      select: { id: true },
    });
    const base = { sessaoId: sessao.id, nonce, nivel, valendo, expiraEm: expiraEm.toISOString() };
    if ("pedidos" in paraTela) return { ...base, teste: "atalhos", pedidos: paraTela.pedidos };
    return "texto" in paraTela
      ? { ...base, teste: teste as "digitacao" | "numeros", texto: paraTela.texto }
      : { ...base, teste: "logica", questoes: paraTela.questoes };
  } catch (e) {
    // Duas abas começando juntas: a chave única deixa entrar só uma.
    if (isPrismaUniqueError(e)) return { erro: jaUsada(teste, nivel) };
    throw e;
  }
}

const jaUsada = (teste: Teste, nivel: Nivel) =>
  `Você já usou hoje a tentativa valendo de ${ROTULO_DO_TESTE[teste]} no nível ${ROTULO_DO_NIVEL[nivel]}. Volte amanhã, tente outro nível ou treine à vontade no Treino livre.`;
const semConteudo = (teste: Teste, nivel: Nivel) =>
  `Ainda não há ${teste === "logica" ? "questões" : "textos"} de ${ROTULO_DO_TESTE[teste]} no nível ${ROTULO_DO_NIVEL[nivel]}. Peça a quem administra a Academia para cadastrar.`;

const telemetriaSchema = z
  .object({
    colagens: z.number().int().min(0), maiorSalto: z.number().int().min(0), teclas: z.number().int().min(0),
    intervaloMedioMs: z.number().min(0), desvioDoIntervaloMs: z.number().min(0), sintetico: z.boolean(),
    pressoes: z.number().int().min(0), pressaoMediaMs: z.number().min(0), desvioDaPressaoMs: z.number().min(0),
  })
  .partial();
const envioDaDigitacaoSchema = z.object({
  sessaoId: z.string().min(1).max(64),
  nonce: z.string().length(32),
  digitado: z.string().max(5000),
  duracaoMs: z.number().finite().min(0).max(30 * 60_000),
  telemetria: telemetriaSchema.optional(),
});
const envioDaLogicaSchema = z.object({
  sessaoId: z.string().min(1).max(64),
  nonce: z.string().length(32),
  respostas: z.array(z.number().int().min(0).max(20).nullable()).max(50),
  duracaoMs: z.number().finite().min(0).max(30 * 60_000),
});
const envioDosAtalhosSchema = z.object({
  sessaoId: z.string().min(1).max(64),
  nonce: z.string().length(32),
  respostas: z.array(z.string().max(40).nullable()).max(200),
  duracaoMs: z.number().finite().min(0).max(30 * 60_000),
});

const mesmoNonce = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Confere a sessão e a marca como enviada, de uma vez: o `updateMany` com
 * `submittedAt: null` deixa passar um envio só, mesmo com dois cliques.
 * Envio recusado pela correção também fecha a sessão — sem reenviar com outros
 * números.
 */
type TesteDaSessao = Teste | typeof TESTE_DO_DESAFIO;
type SessaoFechada = { id: string; teste: TesteDaSessao; nivel: Nivel; valendo: boolean; payload: Payload | null; startedAt: Date };

async function fecharSessao(ctx: Quem, sessaoId: string, nonce: string, testes: readonly TesteDaSessao[], agora: Date): Promise<{ erro: string } | { sessao: SessaoFechada }> {
  const db = getPrisma();
  const s = await db.academiaSessao.findFirst({
    where: { id: sessaoId, tenantId: ctx.tenantId, userId: ctx.userId },
    select: { id: true, teste: true, nivel: true, valendo: true, nonce: true, payload: true, startedAt: true, expiresAt: true, submittedAt: true },
  });
  if (!s || !(testes as readonly string[]).includes(s.teste) || !ehNivel(s.nivel) || !mesmoNonce(s.nonce, nonce)) return { erro: "Rodada não encontrada. Comece de novo." };
  if (s.submittedAt) return { erro: "Esta rodada já foi enviada." };
  if (agora.getTime() > s.expiresAt.getTime()) return { erro: "O tempo desta rodada acabou. Comece outra." };
  const { count } = await db.academiaSessao.updateMany({ where: { id: s.id, submittedAt: null }, data: { submittedAt: agora } });
  if (count === 0) return { erro: "Esta rodada já foi enviada." };
  return { sessao: { id: s.id, teste: s.teste as TesteDaSessao, nivel: s.nivel, valendo: s.valendo, payload: s.payload as unknown as Payload | null, startedAt: s.startedAt } };
}

/** O mês e o dia do resultado, em São Paulo — o dia conta a sequência do desafio (Fase 2). */
const quandoDoResultado = (agora: Date) => ({ mes: mesDoInstante(agora), dia: diaDoInstante(agora) });

/** Digitação, números e o desafio do dia (que é digitação, com o texto do dia). */
export async function enviarDigitacao(ctx: Quem, raw: unknown): Promise<ResultadoDoEnvio> {
  if (!(await ligada(ctx))) return { ok: false, erro: "A Academia não está disponível." };
  const parsed = envioDaDigitacaoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, erro: "Envio inválido. Comece de novo." };
  const agora = new Date();
  const fechada = await fecharSessao(ctx, parsed.data.sessaoId, parsed.data.nonce, ["digitacao", "numeros", TESTE_DO_DESAFIO], agora);
  if ("erro" in fechada) return { ok: false, erro: fechada.erro };
  const { sessao } = fechada;
  if (sessao.payload?.tipo !== "texto") return { ok: false, erro: "Rodada não encontrada. Comece de novo." };
  const desafio = sessao.teste === TESTE_DO_DESAFIO;
  const teste: "digitacao" | "numeros" = sessao.teste === "numeros" ? "numeros" : "digitacao";

  const r = avaliarDigitacao({
    teste,
    servido: sessao.payload.texto,
    digitado: parsed.data.digitado,
    duracaoDoNavegadorMs: parsed.data.duracaoMs,
    decorridoNoServidorMs: agora.getTime() - sessao.startedAt.getTime(),
    telemetria: parsed.data.telemetria,
  });
  if (!r.ok) return { ok: false, erro: `Resultado descartado: ${r.motivo}` };

  await getPrisma().academiaResultado.create({
    data: {
      tenantId: ctx.tenantId, userId: ctx.userId, sectorCode: setorDoResultado(ctx), teste: sessao.teste, nivel: sessao.nivel,
      ...quandoDoResultado(agora), ppm: r.ppm, precisao: r.precisao, duracaoMs: r.duracaoMs, valendo: sessao.valendo, sessaoId: sessao.id,
    },
  });
  const base = { ok: true as const, teste, nivel: sessao.nivel, valendo: sessao.valendo, ppm: r.ppm, acertos: null, total: null, precisao: r.precisao, duracaoMs: r.duracaoMs };
  return desafio ? { ...base, desafio: { sequencia: await sequenciaDaPessoa(ctx.userId, agora) } } : base;
}

/** Atalhos (Fase 2): as teclas apertadas, na ordem dos pedidos servidos. */
export async function enviarAtalhos(ctx: Quem, raw: unknown): Promise<ResultadoDoEnvio> {
  if (!(await ligada(ctx))) return { ok: false, erro: "A Academia não está disponível." };
  const parsed = envioDosAtalhosSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, erro: "Envio inválido. Comece de novo." };
  const agora = new Date();
  const fechada = await fecharSessao(ctx, parsed.data.sessaoId, parsed.data.nonce, ["atalhos"], agora);
  if ("erro" in fechada) return { ok: false, erro: fechada.erro };
  const { sessao } = fechada;
  if (sessao.payload?.tipo !== "atalhos") return { ok: false, erro: "Rodada não encontrada. Comece de novo." };

  const r = avaliarAtalhos({
    pedidos: sessao.payload.pedidos,
    respostas: parsed.data.respostas,
    duracaoDoNavegadorMs: parsed.data.duracaoMs,
    decorridoNoServidorMs: agora.getTime() - sessao.startedAt.getTime(),
  });
  if (!r.ok) return { ok: false, erro: `Resultado descartado: ${r.motivo}` };
  if (r.total === 0) return { ok: false, erro: "Nenhum atalho respondido: a rodada não conta." };

  await getPrisma().academiaResultado.create({
    data: {
      tenantId: ctx.tenantId, userId: ctx.userId, sectorCode: setorDoResultado(ctx), teste: "atalhos", nivel: sessao.nivel,
      ...quandoDoResultado(agora), acertos: r.acertos, total: r.total, precisao: r.precisao, duracaoMs: r.duracaoMs, valendo: sessao.valendo, sessaoId: sessao.id,
    },
  });
  return {
    ok: true, teste: "atalhos", nivel: sessao.nivel, valendo: sessao.valendo, ppm: null, acertos: r.acertos, total: r.total,
    precisao: r.precisao, duracaoMs: r.duracaoMs, correcao: r.correcao,
  };
}

export async function enviarLogica(ctx: Quem, raw: unknown): Promise<ResultadoDoEnvio> {
  if (!(await ligada(ctx))) return { ok: false, erro: "A Academia não está disponível." };
  const parsed = envioDaLogicaSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, erro: "Envio inválido. Comece de novo." };
  const agora = new Date();
  const fechada = await fecharSessao(ctx, parsed.data.sessaoId, parsed.data.nonce, ["logica"], agora);
  if ("erro" in fechada) return { ok: false, erro: fechada.erro };
  const { sessao } = fechada;
  if (sessao.payload?.tipo !== "questoes") return { ok: false, erro: "Rodada não encontrada. Comece de novo." };

  const r = avaliarLogica({
    corretas: sessao.payload.questoes.map((q) => q.correta),
    respostas: parsed.data.respostas,
    duracaoDoNavegadorMs: parsed.data.duracaoMs,
    decorridoNoServidorMs: agora.getTime() - sessao.startedAt.getTime(),
  });
  if (!r.ok) return { ok: false, erro: `Resultado descartado: ${r.motivo}` };

  await getPrisma().academiaResultado.create({
    data: {
      tenantId: ctx.tenantId, userId: ctx.userId, sectorCode: setorDoResultado(ctx), teste: "logica", nivel: sessao.nivel,
      ...quandoDoResultado(agora), acertos: r.acertos, total: r.total, precisao: r.precisao, duracaoMs: r.duracaoMs, valendo: sessao.valendo, sessaoId: sessao.id,
    },
  });
  return { ok: true, teste: "logica", nivel: sessao.nivel, valendo: sessao.valendo, ppm: null, acertos: r.acertos, total: r.total, precisao: r.precisao, duracaoMs: r.duracaoMs };
}

// ─── Preferência ─────────────────────────────────────────────────────────────

/** "Aparecer no ranking" é da própria pessoa — como as preferências de notificação. */
export async function gravarPreferencia(ctx: Quem, aparecer: boolean): Promise<{ ok: true } | { erro: string }> {
  if (!(await ligada(ctx))) return { erro: "A Academia não está disponível." };
  if (ctx.subscriptionReadOnly) return { erro: "O escritório está em modo somente leitura." };
  await getPrisma().academiaPreferencia.upsert({
    where: { userId: ctx.userId },
    create: { tenantId: ctx.homeTenantId, userId: ctx.userId, aparecerNoRanking: aparecer },
    update: { aparecerNoRanking: aparecer },
  });
  return { ok: true };
}

// ─── Administração ───────────────────────────────────────────────────────────

async function podeAdministrar(ctx: Quem): Promise<boolean> {
  return podeAdministrarAcademia(ctx) && (await ligada(ctx));
}
const SEM_PERMISSAO = { erro: "Só quem administra a Academia (Administrador, Super Admin ou a coordenação da Tech) pode alterar isto." };

export async function listarTextos(tenantId: string): Promise<TextoNaTela[]> {
  const textos = await getPrisma().academiaTexto.findMany({
    where: { tenantId }, orderBy: [{ ativo: "desc" }, { createdAt: "desc" }], take: 500,
    select: { id: true, nivel: true, conteudo: true, ativo: true, origemHubId: true, createdAt: true },
  });
  return textos.flatMap((t) => (ehNivel(t.nivel) ? [{ id: t.id, nivel: t.nivel, conteudo: t.conteudo, ativo: t.ativo, doHub: Boolean(t.origemHubId), criadoEm: t.createdAt.toISOString() }] : []));
}

export const TAMANHO_DO_TEXTO = { minimo: 40, maximo: 1500 } as const;
const textoSchema = z.object({
  id: z.string().max(64).optional(),
  nivel: z.enum(NIVEIS, { error: "Escolha o nível." }),
  conteudo: z
    .string({ error: "Escreva o texto." })
    .transform((s) => s.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim())
    .pipe(z.string().min(TAMANHO_DO_TEXTO.minimo, `Use pelo menos ${TAMANHO_DO_TEXTO.minimo} caracteres.`).max(TAMANHO_DO_TEXTO.maximo, `Use até ${TAMANHO_DO_TEXTO.maximo} caracteres.`)),
  ativo: z.boolean().default(true),
});

export async function salvarTexto(ctx: Quem, raw: unknown): Promise<{ ok: true } | { erro: string }> {
  if (!(await podeAdministrar(ctx))) return SEM_PERMISSAO;
  const parsed = textoSchema.safeParse(raw);
  if (!parsed.success) return { erro: parsed.error.issues[0].message };
  const { id, ...dados } = parsed.data;
  const db = getPrisma();
  if (id) {
    const { count } = await db.academiaTexto.updateMany({ where: { id, tenantId: ctx.tenantId }, data: dados });
    if (count === 0) return { erro: "Texto não encontrado." };
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "academia.texto.update", entityType: "AcademiaTexto", entityId: id, metadata: { nivel: dados.nivel, ativo: dados.ativo } });
    return { ok: true };
  }
  const criado = await db.academiaTexto.create({ data: { tenantId: ctx.tenantId, createdById: ctx.userId, ...dados }, select: { id: true } });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "academia.texto.create", entityType: "AcademiaTexto", entityId: criado.id, metadata: { nivel: dados.nivel } });
  return { ok: true };
}

export async function listarQuestoes(tenantId: string): Promise<QuestaoNaTela[]> {
  const questoes = await getPrisma().academiaQuestao.findMany({
    where: { tenantId }, orderBy: [{ ativo: "desc" }, { createdAt: "desc" }], take: 500,
    select: { id: true, nivel: true, enunciado: true, imagemUrl: true, alternativas: true, correta: true, ativo: true, origemHubId: true },
  });
  return questoes.flatMap((q) =>
    ehNivel(q.nivel)
      ? [{ id: q.id, nivel: q.nivel, enunciado: q.enunciado, imagemUrl: q.imagemUrl, alternativas: lerAlternativas(q.alternativas), correta: q.correta, ativo: q.ativo, doHub: Boolean(q.origemHubId) }]
      : [],
  );
}

export async function salvarQuestao(ctx: Quem, raw: unknown): Promise<{ ok: true } | { erro: string }> {
  if (!(await podeAdministrar(ctx))) return SEM_PERMISSAO;
  const id = typeof (raw as { id?: unknown })?.id === "string" ? ((raw as { id: string }).id) : null;
  const parsed = questaoSchema.safeParse(raw);
  if (!parsed.success) return { erro: parsed.error.issues[0].message };
  const q = parsed.data;
  // Só o que tem conteúdo vai para o banco: nada de `{}` nem chave vazia.
  const alternativas = q.alternativas.map((a) => ({ ...(a.texto ? { texto: a.texto } : {}), ...(a.imagemUrl ? { imagemUrl: a.imagemUrl } : {}) }));
  const dados = { nivel: q.nivel, enunciado: q.enunciado, imagemUrl: q.imagemUrl ?? null, alternativas, correta: q.correta, ativo: q.ativo };
  const db = getPrisma();
  if (id) {
    const { count } = await db.academiaQuestao.updateMany({ where: { id, tenantId: ctx.tenantId }, data: dados });
    if (count === 0) return { erro: "Questão não encontrada." };
    await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "academia.questao.update", entityType: "AcademiaQuestao", entityId: id, metadata: { nivel: q.nivel, ativo: q.ativo } });
    return { ok: true };
  }
  const criada = await db.academiaQuestao.create({ data: { tenantId: ctx.tenantId, createdById: ctx.userId, ...dados }, select: { id: true } });
  await logAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: "academia.questao.create", entityType: "AcademiaQuestao", entityId: criada.id, metadata: { nivel: q.nivel } });
  return { ok: true };
}

/** Os prêmios dos meses pedidos (o do pódio e o da maior evolução), para a tela de administração. */
export async function premiosDosMeses(tenantId: string, meses: string[]): Promise<Record<string, { podio: string; evolucao: string }>> {
  const linhas = await getPrisma().academiaPremio.findMany({ where: { tenantId, mes: { in: meses } }, select: { mes: true, texto: true, textoEvolucao: true } });
  return Object.fromEntries(linhas.map((l) => [l.mes, { podio: l.texto, evolucao: l.textoEvolucao ?? "" }]));
}

const premioSchema = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Escolha o mês."),
  texto: z.string().trim().max(200, "Use até 200 caracteres."),
  // Fase 2: o prêmio da maior evolução. Sem o campo (tela antiga), fica como está.
  textoEvolucao: z.string().trim().max(200, "Use até 200 caracteres.").optional(),
});

/** Grava os prêmios do mês; os dois vazios tiram o prêmio do mês. */
export async function salvarPremio(ctx: Quem, raw: unknown): Promise<{ ok: true } | { erro: string }> {
  if (!(await podeAdministrar(ctx))) return SEM_PERMISSAO;
  const parsed = premioSchema.safeParse(raw);
  if (!parsed.success) return { erro: parsed.error.issues[0].message };
  const { mes, texto } = parsed.data;
  const db = getPrisma();
  const atual = await db.academiaPremio.findUnique({ where: { tenantId_mes: { tenantId: ctx.tenantId, mes } }, select: { textoEvolucao: true } });
  const textoEvolucao = parsed.data.textoEvolucao ?? atual?.textoEvolucao ?? "";
  if (!texto && !textoEvolucao) {
    await db.academiaPremio.deleteMany({ where: { tenantId: ctx.tenantId, mes } });
  } else {
    const dados = { texto, textoEvolucao: textoEvolucao || null, updatedById: ctx.userId };
    await db.academiaPremio.upsert({
      where: { tenantId_mes: { tenantId: ctx.tenantId, mes } },
      create: { tenantId: ctx.tenantId, mes, ...dados },
      update: dados,
    });
  }
  await logAudit({
    tenantId: ctx.tenantId, userId: ctx.userId, action: "academia.premio.update", entityType: "AcademiaPremio", entityId: mes,
    metadata: { mes, texto: texto || null, textoEvolucao: textoEvolucao || null },
  });
  return { ok: true };
}
