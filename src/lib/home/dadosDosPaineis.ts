// As consultas dos painéis da Home (06/10). Moravam dentro de cada painel; a
// faixa de destaques (06/10 a 10/11/2026) e depois os cartões coringa do topo
// (`cartoesServidor.ts`) precisam dos mesmos números, e consultar duas vezes
// numa Home que já é a tela mais aberta do Connect estava fora de questão.
// Cada uma é `cache()` do React: o cartão e o painel pedem os mesmos dados na
// mesma requisição e o banco é consultado uma vez só.
//
// Os argumentos são primitivos (ou o mesmo `ctx` que a Home repassa), porque
// é pela identidade deles que o `cache()` reconhece a mesma chamada.
//
// Um painel que falha não derruba a Home (07/10, auditoria dos gráficos): a
// consulta que lança devolve `null`, o painel mostra o aviso no lugar dele e
// os cartões do topo seguem com os números dos outros. Era o `error.tsx` da
// rota que trocava a tela inteira por "Não foi possível carregar o resumo" —
// por causa, por exemplo, da fila do Societário. O mesmo desenho do Início do
// portal (`BlocosDoInicio`). Como o `null` também passa pelo `cache()`, o
// cartão e o painel concordam sobre o que faltou, e o erro vai uma vez ao log.

import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
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
import { aPagarPorSemana, carteiraPorFaixa, contarFerias, faixasDasPendencias, type Soma } from "./paineis";
import { FERIAS_EM_ABERTO } from "@/lib/ferias/regras";
import { ADMISSAO_EM_ANDAMENTO, DESLIGAMENTO_EM_PROCESSO } from "@/lib/dp/contagens";

/** A consulta do painel, ou `null` quando ela falha — o erro fica no log do servidor. */
async function tentar<T>(painel: string, consulta: () => Promise<T>): Promise<T | null> {
  try {
    return await consulta();
  } catch (err) {
    // `redirect()`/`notFound()` e afins são o Next conduzindo a resposta, não falha.
    unstable_rethrow(err);
    console.error(`[home] painel indisponível: ${painel}`, err);
    return null;
  }
}

// ─── BPO ───────────────────────────────────────────────────────────────────

/** Os títulos em aberto do escritório, nas faixas do painel de contas e nas semanas. */
export const dadosDaCarteira = cache((tenantId: string) =>
  tentar("contas", async () => {
    const hojeKey = saoPauloParts(new Date()).dateKey;
    const titulos = await titulosEmAberto({ tenantId, companyIds: null });
    return {
      pagar: carteiraPorFaixa(titulos, "PAGAR", hojeKey),
      receber: carteiraPorFaixa(titulos, "RECEBER", hojeKey),
      semanas: aPagarPorSemana(titulos, hojeKey),
    };
  })
);

export const dadosDasPendencias = cache((tenantId: string, verPendencias: boolean, verAprovacoes: boolean) =>
  tentar("pendências e aprovações", async () => {
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
  })
);

// ─── Societário ────────────────────────────────────────────────────────────

export const dadosDosProcessos = cache((tenantId: string) =>
  tentar("processos", async () => {
    const agora = new Date();
    const feriados = await feriadosDoTenant(tenantId);
    const fila = await listarFila(tenantId, {}, feriados, agora);
    return {
      fila,
      estourados: fila.filter((l) => l.prazo.situacao === "estourado").length,
      noLimite: fila.filter((l) => l.prazo.situacao === "no_limite").length,
    };
  })
);

// ─── DP ────────────────────────────────────────────────────────────────────

/** Os mesmos recortes das telas: /ferias, /colaboradores, /admissoes e /afastamentos. */
const EXAMES_PENDENTES = ["SOLICITADO", "AGENDADO", "REALIZADO", "ASO_PENDENTE"] as const;

export const dadosDoDP = cache((tenantId: string) =>
  tentar("DP", async () => {
    const prisma = getPrisma();
    const [ferias, admissoes, rescisoes, exames, afastados] = await Promise.all([
      prisma.vacation.findMany({ where: { tenantId, status: { in: [...FERIAS_EM_ABERTO] } }, select: { concessivePeriodEnd: true } }),
      prisma.person.count({ where: { tenantId, ...ADMISSAO_EM_ANDAMENTO } }),
      prisma.termination.count({ where: { tenantId, ...DESLIGAMENTO_EM_PROCESSO } }),
      prisma.exameAdmissional.count({ where: { tenantId, status: { in: [...EXAMES_PENDENTES] } } }),
      prisma.absence.count({ where: { tenantId, status: { notIn: [...AFASTAMENTO_ENCERRADO] } } }),
    ]);
    return { ferias: contarFerias(ferias, new Date()), admissoes, rescisoes, exames, afastados };
  })
);

// ─── Recrutamento ──────────────────────────────────────────────────────────

/** Pelo `ctx` (e não só o tenant): o escopo de /vagas depende do setor ativo e da regra do recrutador. */
export const dadosDoRecrutamento = cache((ctx: AuthContext) =>
  tentar("recrutamento", async () => {
    const prisma = getPrisma();
    // Candidatura não tem setor, então vem pela vaga.
    const vagasAbertas = { AND: [scopedVagaWhere(ctx), { status: { in: ["ABERTA" as const, "EM_ANDAMENTO" as const] } }] };
    const [vagas, candidaturas] = await Promise.all([
      prisma.vaga.count({ where: vagasAbertas }),
      prisma.candidatura.findMany({ where: { tenantId: ctx.tenantId, vaga: vagasAbertas }, select: { stage: true, status: true } }),
    ]);
    return { vagas, funil: computeFunnelConversion(candidaturas) };
  })
);

// ─── Certificados ──────────────────────────────────────────────────────────

export const dadosDosCertificados = cache((tenantId: string) =>
  tentar("certificados", async () => {
    const hoje = new Date();
    const certs = await listarCertificados(tenantId);
    const atuais = atuaisPorDocumento(certs);
    const c = { vencido: 0, a_renovar: 0, vigente: 0 };
    for (const cert of certs) {
      const s = situacaoDoCertificado(cert, atuais.get(cert.documento), hoje);
      if (s !== "substituido") c[s] += 1;
    }
    return c;
  })
);

// A faixa de destaques lia daqui os números dos painéis (`numerosDaHome`, de
// 06/10); saiu com ela em 10/11/2026. Os cartões do topo chamam as consultas
// acima direto (`cartoesServidor.ts`).
