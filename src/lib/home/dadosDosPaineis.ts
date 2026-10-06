// As consultas dos painéis da Home (06/10). Moravam dentro de cada painel; a
// faixa de destaques (opção C) precisa dos mesmos números, e consultar duas
// vezes numa Home que já é a tela mais aberta do Connect estava fora de
// questão. Cada uma é `cache()` do React: a faixa e o painel pedem os mesmos
// dados na mesma requisição e o banco é consultado uma vez só.
//
// Os argumentos são primitivos (ou o mesmo `ctx` que a Home repassa), porque
// é pela identidade deles que o `cache()` reconhece a mesma chamada.

import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { saoPauloParts } from "@/lib/agenda";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { titulosEmAberto } from "@/lib/financeiro/consultas";
import { resumoDasPendencias } from "@/lib/financeiro/pendencias/consultas";
import { setorPadraoDasPendencias, soDoSetorPadrao } from "@/lib/financeiro/pendencias/setor";
import { listarFila, feriadosDoTenant } from "@/lib/societario/fila";
import { computeFunnelConversion } from "@/lib/recruitmentFunnel";
import { listarCertificados } from "@/lib/certificados/servidor";
import { AFASTAMENTO_ENCERRADO } from "@/lib/situacoesDoDP";
import { atuaisPorDocumento, situacaoDoCertificado } from "@/lib/certificados/certificados";
import type { HomeWidgetKey } from "@/lib/homeWidgets";
import type { AcessoDoPainel } from "./acessoDosPaineis";
import type { NumerosDaHome } from "./destaques";
import { aPagarPorSemana, carteiraPorFaixa, contarFerias, faixasDasPendencias, type Soma } from "./paineis";

// ─── BPO ───────────────────────────────────────────────────────────────────

/** Os títulos em aberto do escritório, nas faixas do painel de contas e nas semanas. */
export const dadosDaCarteira = cache(async (tenantId: string) => {
  const hojeKey = saoPauloParts(new Date()).dateKey;
  const titulos = await titulosEmAberto({ tenantId, companyIds: null });
  return {
    pagar: carteiraPorFaixa(titulos, "PAGAR", hojeKey),
    receber: carteiraPorFaixa(titulos, "RECEBER", hojeKey),
    semanas: aPagarPorSemana(titulos, hojeKey),
  };
});

export const dadosDasPendencias = cache(async (tenantId: string, verPendencias: boolean, verAprovacoes: boolean) => {
  const agora = new Date();
  const prisma = getPrisma();
  const [resumo, aprovacoes] = await Promise.all([
    // O painel é do BPO: só as do setor do módulo (e as sem setor, de antes de 01/10).
    verPendencias
      ? setorPadraoDasPendencias(tenantId).then((padrao) =>
          resumoDasPendencias({ tenantId, companyIds: null, setores: soDoSetorPadrao(padrao) }, agora)
        )
      : null,
    // A contagem da fila de /aprovacoes (aguardando e reprovadas travam a baixa).
    verAprovacoes
      ? prisma.financeEntry.groupBy({
          by: ["approvalStatus"],
          where: { tenantId, kind: "PAGAR", status: { not: "CANCELADO" }, approvalStatus: { in: ["AGUARDANDO", "REPROVADO"] } },
          _count: { _all: true },
          _sum: { amount: true },
        })
      : null,
  ]);

  const daAprovacao = (s: "AGUARDANDO" | "REPROVADO"): Soma => {
    const g = aprovacoes?.find((a) => a.approvalStatus === s);
    return { n: g?._count._all ?? 0, centavos: g?._sum.amount ? centavosDeDecimal(g._sum.amount) : 0 };
  };
  return {
    pendencias: resumo ? faixasDasPendencias(resumo) : null,
    aprovacoes: aprovacoes ? { aguardando: daAprovacao("AGUARDANDO"), reprovadas: daAprovacao("REPROVADO") } : null,
  };
});

// ─── Societário ────────────────────────────────────────────────────────────

export const dadosDosProcessos = cache(async (tenantId: string) => {
  const agora = new Date();
  const feriados = await feriadosDoTenant(tenantId);
  const fila = await listarFila(tenantId, {}, feriados, agora);
  return {
    fila,
    estourados: fila.filter((l) => l.prazo.situacao === "estourado").length,
    noLimite: fila.filter((l) => l.prazo.situacao === "no_limite").length,
  };
});

// ─── DP ────────────────────────────────────────────────────────────────────

/** Os mesmos recortes das telas: /ferias, /colaboradores, /admissoes e /afastamentos. */
const FERIAS_EM_ABERTO = ["PLANEJADA", "SOLICITADA", "EM_ANALISE", "APROVADA", "PROGRAMADA", "EM_GOZO"] as const;
const EXAMES_PENDENTES = ["SOLICITADO", "AGENDADO", "REALIZADO", "ASO_PENDENTE"] as const;

export const dadosDoDP = cache(async (tenantId: string) => {
  const prisma = getPrisma();
  const [ferias, admissoes, rescisoes, exames, afastados] = await Promise.all([
    prisma.vacation.findMany({ where: { tenantId, status: { in: [...FERIAS_EM_ABERTO] } }, select: { concessivePeriodEnd: true } }),
    prisma.person.count({ where: { tenantId, type: "COLABORADOR", employmentStatus: "ADMISSAO_EM_ANDAMENTO" } }),
    prisma.termination.count({ where: { tenantId, status: { notIn: ["FINALIZADO", "CANCELADO"] } } }),
    prisma.exameAdmissional.count({ where: { tenantId, status: { in: [...EXAMES_PENDENTES] } } }),
    prisma.absence.count({ where: { tenantId, status: { notIn: [...AFASTAMENTO_ENCERRADO] } } }),
  ]);
  return { ferias: contarFerias(ferias, new Date()), admissoes, rescisoes, exames, afastados };
});

// ─── Recrutamento ──────────────────────────────────────────────────────────

/** Pelo `ctx` (e não só o tenant): o escopo de /vagas depende do setor ativo e da regra do recrutador. */
export const dadosDoRecrutamento = cache(async (ctx: AuthContext) => {
  const prisma = getPrisma();
  // Candidatura não tem setor, então vem pela vaga.
  const vagasAbertas = { AND: [scopedVagaWhere(ctx), { status: { in: ["ABERTA" as const, "EM_ANDAMENTO" as const] } }] };
  const [vagas, candidaturas] = await Promise.all([
    prisma.vaga.count({ where: vagasAbertas }),
    prisma.candidatura.findMany({ where: { tenantId: ctx.tenantId, vaga: vagasAbertas }, select: { stage: true, status: true } }),
  ]);
  return { vagas, funil: computeFunnelConversion(candidaturas) };
});

// ─── Certificados ──────────────────────────────────────────────────────────

export const dadosDosCertificados = cache(async (tenantId: string) => {
  const hoje = new Date();
  const certs = await listarCertificados(tenantId);
  const atuais = atuaisPorDocumento(certs);
  const c = { vencido: 0, a_renovar: 0, vigente: 0 };
  for (const cert of certs) {
    const s = situacaoDoCertificado(cert, atuais.get(cert.documento), hoje);
    if (s !== "substituido") c[s] += 1;
  }
  return c;
});

// ─── Faixa de destaques ────────────────────────────────────────────────────

/**
 * Os números dos painéis que estão na Home desta pessoa — e só deles: o
 * painel que ela não alcança (ou ocultou em "Personalizar") não é consultado
 * aqui. Como as funções acima são `cache()`, isto não custa consulta nova: é
 * o mesmo resultado que o painel usa logo abaixo.
 */
export async function numerosDaHome(
  ctx: AuthContext,
  paineis: ReadonlyMap<HomeWidgetKey, AcessoDoPainel>,
  tarefas: NumerosDaHome["tarefas"]
): Promise<NumerosDaHome> {
  const contas = paineis.get("painel-contas");
  const pendencias = paineis.get("painel-pendencias");
  const verCarteira = paineis.has("painel-contas") || paineis.has("painel-semanas");

  const [carteira, pend, processos, dp, recrutamento, certificados] = await Promise.all([
    verCarteira ? dadosDaCarteira(ctx.tenantId) : null,
    pendencias
      ? dadosDasPendencias(ctx.tenantId, pendencias.modulos.has("bpo_pendencias"), pendencias.modulos.has("bpo_aprovacoes"))
      : null,
    paineis.has("painel-processos") ? dadosDosProcessos(ctx.tenantId) : null,
    paineis.has("painel-dp") ? dadosDoDP(ctx.tenantId) : null,
    paineis.has("painel-recrutamento") ? dadosDoRecrutamento(ctx) : null,
    paineis.has("painel-certificados") ? dadosDosCertificados(ctx.tenantId) : null,
  ]);

  return {
    tarefas,
    contas:
      contas && carteira
        ? {
            verPagar: contas.modulos.has("bpo_contas_pagar"),
            verReceber: contas.modulos.has("bpo_contas_receber"),
            pagar: carteira.pagar,
            receber: carteira.receber,
          }
        : undefined,
    semanas: paineis.has("painel-semanas") && carteira ? { estaSemana: carteira.semanas[0] } : undefined,
    pendencias: pend ?? undefined,
    processos: processos
      ? { abertos: processos.fila.length, estourados: processos.estourados, noLimite: processos.noLimite }
      : undefined,
    dp: dp ? { feriasVencidas: dp.ferias.vencidas, feriasAVencer: dp.ferias.aVencer } : undefined,
    recrutamento: recrutamento ? { vagas: recrutamento.vagas, candidaturas: recrutamento.funil.total } : undefined,
    certificados: certificados ? { vencidos: certificados.vencido, aRenovar: certificados.a_renovar } : undefined,
  };
}
