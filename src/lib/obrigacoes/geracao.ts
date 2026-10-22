// O motor das obrigações por regime (22/10/2026). Para cada modelo, gera as
// obrigações das próximas competências das empresas que batem com a regra, na
// mesma estrutura da obrigação recorrente: um PipelineItem da empresa no
// kanban do setor, na primeira etapa, com o vencimento e o responsável — as
// telas do kanban, os prazos da agenda e os alertas leem dali sem mudar nada.
//
// Roda no agendador interno (src/lib/alerts.ts, a cada 15 minutos) e ao salvar
// um modelo. É idempotente: a chave única modelo + empresa + competência de
// ObrigacaoGerada barra a segunda criação, mesmo com duas passadas ao mesmo
// tempo. A carteira se ajusta sozinha: empresa que trocou de regime (ou de
// qualquer campo da regra) ganha as obrigações que passou a ter e perde as
// futuras, ainda não concluídas, que deixou de ter. O que venceu ou foi
// concluído fica.
//
// O dueDate da atividade é o PRAZO INTERNO — é por ele que a equipe trabalha e
// que os alertas avisam. A data legal vai na descrição e em ObrigacaoGerada.

import { getPrisma } from "@/lib/prisma";
import { feriadosDoEscritorio } from "@/lib/feriados";
import { hojeIso, dataBR } from "@/lib/datas/calendario";
import { nomeExibicao } from "@/lib/companyName";
import { isPrismaUniqueError } from "@/lib/prismaErrors";
import { datasDaCompetencia, proximasOcorrencias, rotuloDaCompetencia, type DatasDaObrigacao, type Feriados, type RegraDeData } from "./calendario";
import { empresaAtende, lerListaJson, planejarGeracao, type EmpresaDaRegra, type RegraDeAplicacao } from "./regra";

export type EmpresaDaCarteira = EmpresaDaRegra & {
  nome: string;
  /** Responsável de cada setor contratado (CompanyService.responsibleUserId). */
  responsaveis: Record<string, string | null>;
};

/** O modelo gravado, nas formas das funções puras. */
export function regrasDoModelo(m: {
  periodicidade: RegraDeData["periodicidade"];
  mesesAposCompetencia: number;
  diaLegal: number | null;
  diasUteisAntes: number;
  ajuste: RegraDeData["ajuste"];
  regimes: unknown;
  semMovimento: RegraDeAplicacao["semMovimento"];
  comFuncionarios: RegraDeAplicacao["comFuncionarios"];
  estados: unknown;
  cidades: unknown;
  exigeSetorContratado: boolean;
}): { datas: RegraDeData; aplicacao: RegraDeAplicacao } {
  return {
    datas: {
      periodicidade: m.periodicidade,
      mesesAposCompetencia: m.mesesAposCompetencia,
      diaLegal: m.diaLegal,
      diasUteisAntes: m.diasUteisAntes,
      ajuste: m.ajuste,
    },
    aplicacao: {
      regimes: lerListaJson(m.regimes),
      semMovimento: m.semMovimento,
      comFuncionarios: m.comFuncionarios,
      estados: lerListaJson(m.estados),
      cidades: lerListaJson(m.cidades),
      exigeSetorContratado: m.exigeSetorContratado,
    },
  };
}

/**
 * A carteira do escritório: as empresas ativas (status ACTIVE), com o que a
 * regra lê. Prospect, inativa e encerrada não recebem obrigação.
 */
export async function carregarCarteira(tenantId: string): Promise<EmpresaDaCarteira[]> {
  const prisma = getPrisma();
  const [empresas, colaboradores, usuariosAtivos] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: {
        id: true,
        name: true,
        displayName: true,
        taxRegimeKind: true,
        taxNoMovement: true,
        taxHasEmployees: true,
        stateCode: true,
        city: true,
        services: { where: { status: "ACTIVE" }, select: { sectorCode: true, responsibleUserId: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.person.groupBy({
      by: ["currentCompanyId"],
      where: {
        tenantId,
        type: "COLABORADOR",
        isInternal: false,
        active: true,
        currentCompanyId: { not: null },
        employmentStatus: { in: ["ATIVO", "AFASTADO", "EM_FERIAS"] },
      },
      _count: { _all: true },
    }),
    prisma.user.findMany({ where: { tenantId, active: true }, select: { id: true } }),
  ]);
  const porEmpresa = new Map(colaboradores.map((c) => [c.currentCompanyId, c._count._all]));
  const ativos = new Set(usuariosAtivos.map((u) => u.id));
  return empresas.map((e) => ({
    id: e.id,
    nome: nomeExibicao(e),
    taxRegimeKind: e.taxRegimeKind,
    taxNoMovement: e.taxNoMovement,
    taxHasEmployees: e.taxHasEmployees,
    colaboradoresAtivos: porEmpresa.get(e.id) ?? 0,
    stateCode: e.stateCode,
    city: e.city,
    setoresContratados: e.services.map((s) => s.sectorCode),
    // Responsável desligado não recebe atividade: fica sem responsável.
    responsaveis: Object.fromEntries(
      e.services.map((s) => [s.sectorCode, s.responsibleUserId && ativos.has(s.responsibleUserId) ? s.responsibleUserId : null])
    ),
  }));
}

/** As empresas da carteira que batem com a regra — a prévia da tela. */
export function empresasQueAtendem(carteira: readonly EmpresaDaCarteira[], regra: RegraDeAplicacao, sectorCode: string): EmpresaDaCarteira[] {
  return carteira.filter((e) => empresaAtende(e, regra, sectorCode));
}

export type ResultadoDaGeracao = { modelos: number; criadas: number; removidas: number; reprogramadas: number };

const instante = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function textoDaAtividade(nome: string, descricao: string | null, periodicidade: RegraDeData["periodicidade"], datas: DatasDaObrigacao) {
  const linhas = [
    `Competência ${rotuloDaCompetencia(periodicidade, datas.competencia)}.`,
    `Vencimento legal: ${dataBR(datas.dataLegal)}. Prazo interno: ${dataBR(datas.prazoInterno)}.`,
  ];
  if (descricao) linhas.push("", descricao);
  return {
    title: `${nome} — ${rotuloDaCompetencia(periodicidade, datas.competencia)}`.slice(0, 200),
    description: linhas.join("\n"),
  };
}

/**
 * Gera, tira e reprograma. Sem filtro, passa por todos os modelos de todos os
 * escritórios (o agendador); com `modeloId`, só aquele (ao salvar).
 */
export async function gerarObrigacoesPorRegime(
  p: { tenantId?: string; modeloId?: string; hojeKey?: string } = {}
): Promise<ResultadoDaGeracao> {
  const prisma = getPrisma();
  const hoje = p.hojeKey ?? hojeIso();
  const modelos = await prisma.modeloDeObrigacao.findMany({
    where: { ...(p.tenantId ? { tenantId: p.tenantId } : {}), ...(p.modeloId ? { id: p.modeloId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  const r: ResultadoDaGeracao = { modelos: 0, criadas: 0, removidas: 0, reprogramadas: 0 };
  if (modelos.length === 0) return r;

  const carteiras = new Map<string, EmpresaDaCarteira[]>();
  const feriadosDo = new Map<string, Feriados>();
  const primeiraEtapa = new Map<string, string | null>();

  for (const m of modelos) {
    // Modelo desligado sem nada futuro a tirar: nem carrega a carteira.
    if (!m.active) {
      const futuras = await prisma.obrigacaoGerada.count({ where: { modeloId: m.id, dataLegal: { gt: hoje }, pipelineItemId: { not: null } } });
      if (futuras === 0) continue;
    }
    r.modelos++;
    try {
      if (!carteiras.has(m.tenantId)) carteiras.set(m.tenantId, await carregarCarteira(m.tenantId));
      if (!feriadosDo.has(m.tenantId)) feriadosDo.set(m.tenantId, new Set((await feriadosDoEscritorio(m.tenantId)).keys()));
      const carteira = carteiras.get(m.tenantId)!;
      const feriados = feriadosDo.get(m.tenantId)!;
      const { datas: regraDeData, aplicacao } = regrasDoModelo(m);

      const existentes = await prisma.obrigacaoGerada.findMany({
        where: { modeloId: m.id },
        select: {
          id: true,
          companyId: true,
          competencia: true,
          dataLegal: true,
          prazoInterno: true,
          pipelineItemId: true,
          pipelineItem: { select: { stage: { select: { type: true, isTerminal: true } } } },
        },
      });
      const plano = planejarGeracao({
        ativo: m.active,
        empresasQueAtendem: empresasQueAtendem(carteira, aplicacao, m.sectorCode).map((e) => e.id),
        ocorrencias: m.active ? proximasOcorrencias(regraDeData, hoje, feriados) : [],
        existentes: existentes.map((e) => ({
          id: e.id,
          companyId: e.companyId,
          competencia: e.competencia,
          dataLegal: e.dataLegal,
          prazoInterno: e.prazoInterno,
          pipelineItemId: e.pipelineItemId,
          concluida: !!e.pipelineItem && (e.pipelineItem.stage.type === "DONE" || e.pipelineItem.stage.isTerminal),
        })),
        hoje,
        datasDe: (comp) => datasDaCompetencia(regraDeData, comp, feriados),
      });

      for (const e of plano.remover) {
        try {
          await prisma.$transaction([
            prisma.obrigacaoGerada.delete({ where: { id: e.id } }),
            prisma.pipelineItem.delete({ where: { id: e.pipelineItemId! } }),
          ]);
          r.removidas++;
        } catch (err) {
          console.error(`[obrigacoes] falha ao tirar a obrigação ${e.id}`, err);
        }
      }

      for (const { existente, datas } of plano.reprogramar) {
        const texto = textoDaAtividade(m.nome, m.descricao, regraDeData.periodicidade, datas);
        await prisma.$transaction([
          prisma.obrigacaoGerada.update({ where: { id: existente.id }, data: { dataLegal: datas.dataLegal, prazoInterno: datas.prazoInterno } }),
          prisma.pipelineItem.update({ where: { id: existente.pipelineItemId! }, data: { dueDate: instante(datas.prazoInterno), description: texto.description } }),
        ]);
        r.reprogramadas++;
      }

      if (plano.criar.length === 0) continue;
      if (!primeiraEtapa.has(m.pipelineId)) {
        const etapa = await prisma.pipelineStage.findFirst({ where: { pipelineId: m.pipelineId }, orderBy: { order: "asc" }, select: { id: true } });
        primeiraEtapa.set(m.pipelineId, etapa?.id ?? null);
      }
      const stageId = primeiraEtapa.get(m.pipelineId);
      if (!stageId) {
        console.error(`[obrigacoes] kanban ${m.pipelineId} sem etapas — modelo ${m.id} pulado`);
        continue;
      }
      const porId = new Map(carteira.map((e) => [e.id, e]));
      for (const { companyId, datas } of plano.criar) {
        const responsavel = porId.get(companyId)?.responsaveis[m.sectorCode] ?? null;
        const texto = textoDaAtividade(m.nome, m.descricao, regraDeData.periodicidade, datas);
        try {
          await prisma.$transaction(async (tx) => {
            // A linha primeiro: a chave única barra a duplicata antes de a atividade nascer.
            const linha = await tx.obrigacaoGerada.create({
              data: {
                tenantId: m.tenantId,
                modeloId: m.id,
                companyId,
                competencia: datas.competencia,
                dataLegal: datas.dataLegal,
                prazoInterno: datas.prazoInterno,
              },
            });
            const item = await tx.pipelineItem.create({
              data: {
                tenantId: m.tenantId,
                pipelineId: m.pipelineId,
                stageId,
                entityType: "COMPANY",
                entityId: companyId,
                title: texto.title,
                description: texto.description,
                dueDate: instante(datas.prazoInterno),
                assignees: responsavel ? { create: [{ userId: responsavel }] } : undefined,
              },
            });
            await tx.obrigacaoGerada.update({ where: { id: linha.id }, data: { pipelineItemId: item.id } });
          });
          r.criadas++;
        } catch (err) {
          if (isPrismaUniqueError(err)) continue; // outra passada criou ao mesmo tempo
          console.error(`[obrigacoes] falha ao gerar ${m.id} / ${companyId} / ${datas.competencia}`, err);
        }
      }
    } catch (err) {
      console.error(`[obrigacoes] falha no modelo ${m.id}`, err);
    }
  }
  return r;
}
