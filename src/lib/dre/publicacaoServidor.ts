// A publicação da DRE para o cliente — leitura e gravação (05/11/2026). A regra
// pura (a foto, as diferenças) mora em `publicacao.ts`.
//
// ─── O mês que nunca foi publicado ──────────────────────────────────────────
//
// Antes deste PR o portal lia tudo ao vivo. Para nada sumir do portal no dia
// do deploy, cada empresa ganha uma **foto inicial**: na primeira vez que ela
// é aberta depois do deploy — na DRE da equipe, no portal, ou antes de
// qualquer importação ou classificação —, o Connect publica sozinho a foto de
// todos os meses com movimento, que é exatamente o que o cliente já via. A
// marca (`DrePublicacaoEmpresa`) diz que a empresa já passou por isso, e
// existe mesmo para empresa sem mês nenhum.
//
// Depois da foto inicial, mês sem publicação é mês que o cliente não vê: o
// portal o trata como sem movimento, e a DRE da equipe mostra a faixa do
// rascunho com "Publicar para o cliente".
//
// O que muda entre o deploy e a primeira abertura da empresa (uma baixa feita
// em Contas a pagar, por exemplo) entra na foto inicial — é o que o portal
// mostraria ao vivo nesse intervalo, como antes.

import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { dreDoAnoDaEmpresa, dreDoMes, mesesComMovimento } from "@/lib/dre/data";
import type { MesDoAno } from "@/lib/dre/anual";
import type { ModeloDoDre } from "@/lib/dre/estrutura";
import { competenciasDaEmpresa, serieEconomica } from "@/lib/dre/dataEconomica";
import { modeloDaEmpresa } from "@/lib/dre/modeloDaEmpresa";
import { opcoesDoCliente } from "@/lib/dre/doCliente";
import type { DreEconomica } from "@/lib/dre/economica";
import { acumuladoDoAno, competenciaDe, partesDaCompetencia } from "@/lib/financeiro/periodo";
import { diferencasDaDre, fotoDoJson, fotoTemMovimento, regimeDoResultado, type FotoDaDre, type RegimeNaFoto } from "@/lib/dre/publicacao";
import type { Publicacao } from "@/lib/dre/doClientePublicado";

/** Mês só com perda ou diferença de acordo ainda tem resultado a mostrar (como em `doCliente.ts`). */
function temResultadoEconomico(d: DreEconomica | undefined): boolean {
  return !!d && (d.lancamentos > 0 || d.cobranca.perdas !== 0 || d.cobranca.acrescimosDeAcordo !== 0 || d.cobranca.descontosDeAcordo !== 0);
}

function regimeEconomico(d: DreEconomica | undefined): RegimeNaFoto {
  return d ? regimeDoResultado(d.resultado, temResultadoEconomico(d)) : { porGrupo: {}, porCategoria: {}, temMovimento: false };
}

/**
 * A foto de agora de um mês ("AAAA-MM"): o que o cliente veria se a equipe
 * publicasse neste instante. Mesmos loaders e opções da DRE do cliente.
 */
export async function fotoAtualDoMes(tenantId: string, companyId: string, competencia: string): Promise<FotoDaDre> {
  const modelo = await modeloDaEmpresa(tenantId, companyId);
  const opcoes = opcoesDoCliente(modelo);
  const [caixa, serie] = await Promise.all([
    dreDoMes(tenantId, companyId, partesDaCompetencia(competencia), opcoes),
    serieEconomica(tenantId, companyId, [competencia], { tipo: "todos" }, opcoes),
  ]);
  return {
    versao: 1,
    modelo: modelo.codigo,
    caixa: regimeDoResultado(caixa.resultado, caixa.lancamentos > 0),
    competencia: regimeEconomico(serie.get(competencia)),
  };
}

const SELECAO = { competencia: true, foto: true, inicial: true, publicadoEm: true, publicadoPorNome: true } as const;

function lida(l: { competencia: string; foto: unknown; inicial: boolean; publicadoEm: Date; publicadoPorNome: string | null }): Publicacao | null {
  const foto = fotoDoJson(l.foto);
  return foto ? { competencia: l.competencia, foto, inicial: l.inicial, publicadoEm: l.publicadoEm, publicadoPorNome: l.publicadoPorNome } : null;
}

/** As fotos publicadas da empresa nos meses pedidos (ou em todos), por competência. */
export async function publicacoesDaEmpresa(
  tenantId: string,
  companyId: string,
  competencias?: string[]
): Promise<Map<string, Publicacao>> {
  const linhas = await getPrisma().drePublicacao.findMany({
    where: { tenantId, companyId, ...(competencias ? { competencia: { in: competencias } } : {}) },
    select: SELECAO,
  });
  const mapa = new Map<string, Publicacao>();
  for (const l of linhas) {
    const p = lida(l);
    if (p) mapa.set(p.competencia, p);
  }
  return mapa;
}

/**
 * A foto inicial da empresa, uma vez só (ver o cabeçalho). Devolve `true` quando
 * tirou a foto agora.
 *
 * Duas abas abrindo a mesma empresa ao mesmo tempo tiram a foto duas vezes; a
 * chave única por empresa e mês descarta a segunda (`skipDuplicates`), e a
 * marca, criada por último, também.
 */
export async function garantirFotoInicial(tenantId: string, companyId: string): Promise<boolean> {
  const prisma = getPrisma();
  const marca = await prisma.drePublicacaoEmpresa.findUnique({ where: { companyId }, select: { companyId: true } });
  if (marca) return false;

  const modelo = await modeloDaEmpresa(tenantId, companyId);
  const opcoes = opcoesDoCliente(modelo);
  const [mesesDeCaixa, competenciasComLancamento] = await Promise.all([
    mesesComMovimento(tenantId, companyId),
    competenciasDaEmpresa(tenantId, companyId),
  ]);

  // O caixa, ano a ano: quatro consultas por ano em vez de quatro por mês.
  const caixa = new Map<string, RegimeNaFoto>();
  const anos = [...new Set(mesesDeCaixa.map((m) => m.ano))];
  const porAno = await Promise.all(anos.map((ano) => dreDoAnoDaEmpresa(tenantId, companyId, ano, opcoes)));
  anos.forEach((ano, i) => {
    for (const m of porAno[i]!.meses) {
      if (!m.temMovimento) continue;
      caixa.set(competenciaDe(ano, m.mes), { porGrupo: m.porGrupo, porCategoria: m.porCategoria ?? {}, temMovimento: true });
    }
  });

  // A competência dos mesmos meses e dos que só têm lançamento por competência.
  const todas = [...new Set([...caixa.keys(), ...competenciasComLancamento])].sort();
  const serie = todas.length > 0 ? await serieEconomica(tenantId, companyId, todas, { tipo: "todos" }, opcoes) : new Map<string, DreEconomica>();

  const fotos = todas
    .map((competencia) => ({
      competencia,
      foto: {
        versao: 1 as const,
        modelo: modelo.codigo,
        caixa: caixa.get(competencia) ?? { porGrupo: {}, porCategoria: {}, temMovimento: false },
        competencia: regimeEconomico(serie.get(competencia)),
      } satisfies FotoDaDre,
    }))
    .filter((f) => fotoTemMovimento(f.foto));

  if (fotos.length > 0) {
    await prisma.drePublicacao.createMany({
      data: fotos.map((f) => ({
        tenantId,
        companyId,
        competencia: f.competencia,
        foto: f.foto as unknown as Prisma.InputJsonValue,
        inicial: true,
      })),
      skipDuplicates: true,
    });
  }
  try {
    await prisma.drePublicacaoEmpresa.create({ data: { tenantId, companyId } });
  } catch (e) {
    // A outra aba chegou primeiro: a foto já está lá.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
  return true;
}

/** Publica a foto de agora de um mês. Substitui a anterior. */
export async function publicarMes(args: {
  tenantId: string;
  companyId: string;
  competencia: string;
  foto: FotoDaDre;
  userId: string | null;
  nome: string | null;
}): Promise<Publicacao> {
  const { tenantId, companyId, competencia, foto } = args;
  const dados = {
    foto: foto as unknown as Prisma.InputJsonValue,
    inicial: false,
    publicadoEm: new Date(),
    publicadoPorId: args.userId,
    publicadoPorNome: args.nome,
  };
  const l = await getPrisma().drePublicacao.upsert({
    where: { companyId_competencia: { companyId, competencia } },
    create: { tenantId, companyId, competencia, ...dados },
    update: dados,
    select: SELECAO,
  });
  return lida(l)!;
}

/**
 * Na visão do ano da DRE da equipe, os meses ("AAAA-MM") cuja DRE de agora
 * difere da publicada. O caixa vem de quem já leu o ano (`dreDoAnoDaEmpresa`,
 * com o modelo da empresa — a visão dos impostos não muda os totais por
 * grupo); a competência, numa consulta só para os doze meses.
 */
export async function mesesComRascunho(
  tenantId: string,
  companyId: string,
  ano: number,
  porMes: MesDoAno[],
  modelo: ModeloDoDre
): Promise<string[]> {
  const competencias = acumuladoDoAno(competenciaDe(ano, 12));
  const [serie, publicadas] = await Promise.all([
    serieEconomica(tenantId, companyId, competencias, { tipo: "todos" }, opcoesDoCliente(modelo)),
    publicacoesDaEmpresa(tenantId, companyId, competencias),
  ]);
  const caixa = new Map(porMes.map((m) => [competenciaDe(ano, m.mes), m]));
  return competencias.filter((c) => {
    const m = caixa.get(c);
    const agora: FotoDaDre = {
      versao: 1,
      modelo: modelo.codigo,
      caixa: m ? { porGrupo: m.porGrupo, porCategoria: m.porCategoria ?? {}, temMovimento: m.temMovimento } : { porGrupo: {}, porCategoria: {}, temMovimento: false },
      competencia: regimeEconomico(serie.get(c)),
    };
    return diferencasDaDre(publicadas.get(c)?.foto ?? null, agora).length > 0;
  });
}
