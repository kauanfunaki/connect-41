// Os números dos cartões coringa do topo do Início (10/11/2026, pedido do
// Kauan) e as escolhas gravadas. As regras (catálogo, quem vê, a resolução)
// estão em `cartoes.ts`, sem banco; aqui ficam as consultas.
//
// Custo: a produção é grande (centenas de empresas, centenas de milhares de
// documentos), então cada cartão é uma contagem pelo índice — ou reaproveita a
// consulta que o painel do mesmo setor já faz (`dadosDosPaineis.ts`), com o
// mesmo `cache()`. Cada consulta é `cache()` do React: o cartão e a lista do
// lápis pedem o mesmo número na mesma requisição e o banco responde uma vez.
// O Início conta só os 4 cartões da pessoa; a lista inteira (até ~40 números)
// só é contada quando ela abre o lápis (`cartoes-actions.ts`).
//
// Um cartão cuja consulta falha não derruba a Home: o número vira `null`, o
// cartão diz "Não deu para carregar" e oferece tentar de novo; o erro vai ao
// log, como nos painéis.

import { cache } from "react";
import { unstable_rethrow } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import type { AuthContext } from "@/lib/auth/context";
import { scopedHandoffWhere, scopedPipelineWhere, scopedVagaWhere } from "@/lib/auth/scope";
import { abasVisiveis, quemVeAsTransferencias, whereDaAba } from "@/lib/handoffAbas";
import { SITUACOES_COM_O_SETOR } from "@/lib/handoffs";
import { getTenantModuleStates } from "@/lib/modules";
import { getActiveSectors } from "@/lib/sectors";
import { configDoHelpdesk } from "@/lib/chamados/contexto";
import { addDaysToKey, mondayOfWeek, saoPauloParts } from "@/lib/agenda";
import { hojeIso, somarDias } from "@/lib/datas/calendario";
import { feriadosDoEscritorio } from "@/lib/feriados";
import { SO_EMPRESA_DE_VERDADE } from "@/lib/demonstracao/marca";
import { contasPorJanela } from "@/lib/financeiro/consultas";
import { setoresDaFila } from "@/lib/solicitacoes/acesso";
import { whereDaEquipe, whereDoRecorteDaEquipe, type RecorteDaEquipe } from "@/lib/solicitacoes/consultas";
import { DIAS_DEPOIS_DA_DATA_LEGAL, riscoDeMulta } from "@/lib/obrigacoes/riscoDeMulta";
import { DIAS_DO_RESUMO } from "@/lib/fiscal/recusasServidor";
import { STATUS_SEM_CONCLUSAO } from "@/lib/societario/processo";
import { licencasARenovar } from "@/lib/societario/licencas-data";
import { situacaoDaLicenca } from "@/lib/societario/licencas";
import { diasParaCobrarOProtocolo } from "@/lib/societario/protocoloParadoServidor";
import { diasDaLista } from "@/lib/societario/protocolosParadosServidor";
import { DESLIGAMENTO_EM_PROCESSO } from "@/lib/dp/contagens";
import { PRAZO_PAGAMENTO_DIAS } from "@/lib/rescisaoChecklist";
import { situacaoDoCertificado } from "@/lib/certificados/certificados";
import { dadosDasPendencias, dadosDoDP, dadosDoRecrutamento, dadosDosProcessos } from "./dadosDosPaineis";
import { solicitacoesComRespostaAtrasada } from "./indicadores";
import { cartaoDaAcademia } from "@/lib/academia/hallServidor";
import { fotosDosNumeros } from "./historico";
import type { MetricaDaHome } from "./metricas";
import {
  cartoesDisponiveis,
  definicaoDoCartao,
  lerEscolhas,
  montarCartaoPronto,
  type AmbienteDosCartoes,
  type CartaoPronto,
  type Escolhas,
  type NumeroDoCartao,
} from "./cartoes";

const DIA_MS = 86_400_000;

/** A consulta, ou `null` quando ela falha — o erro fica no log do servidor. */
async function tentar<T>(nome: string, consulta: () => Promise<T>): Promise<T | null> {
  try {
    return await consulta();
  } catch (err) {
    // `redirect()`/`notFound()` e afins são o Next conduzindo a resposta, não falha.
    unstable_rethrow(err);
    console.error(`[home] cartão indisponível: ${nome}`, err);
    return null;
  }
}

/** O começo e o fim de hoje no relógio do servidor — a mesma conta da Home para "atrasadas / hoje". */
function limitesDeHoje(): { inicio: Date; fim: Date } {
  const inicio = new Date();
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date();
  fim.setHours(23, 59, 59, 999);
  return { inicio, fim };
}

/** Meia-noite de São Paulo de um dia "AAAA-MM-DD". */
function inicioDoDiaSP(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00-03:00`);
}

// ─── O escritório ──────────────────────────────────────────────────────────

/** Módulos, setores ativos e chamados, do jeito que as regras de `cartoes.ts` leem. */
export const ambienteDosCartoes = cache(async (tenantId: string): Promise<AmbienteDosCartoes> => {
  const [estados, setores, helpdesk] = await Promise.all([
    getTenantModuleStates(tenantId),
    getActiveSectors(tenantId),
    configDoHelpdesk(tenantId).catch((err: unknown) => {
      console.error("[home] chamados indisponíveis para os cartões", err);
      return { enabled: false, sectorCode: "" };
    }),
  ]);
  return {
    modulos: new Map(estados.map((e) => [e.code, { ligado: e.enabled, setores: e.sectorCodes }])),
    setores: new Set(setores.map((s) => s.code)),
    helpdesk: { ligado: helpdesk.enabled, setor: helpdesk.sectorCode },
  };
});

// ─── As escolhas gravadas ──────────────────────────────────────────────────

/** A chave do setor ativo nas escolhas da pessoa: "" em "Todos os setores". */
export function contextoDaPessoa(ctx: Pick<AuthContext, "activeSector">): string {
  return ctx.activeSector ?? "";
}

/**
 * As escolhas da pessoa (para o setor ativo) e o padrão do setor ativo.
 * Tolerante: sem as tabelas (migration não rodada), vale o padrão do código e
 * o Início abre normalmente — o erro vai ao log.
 */
export const escolhasDosCartoes = cache(
  async (tenantId: string, userId: string, setorAtivo: string | null): Promise<{ pessoa: Escolhas | null; setor: Escolhas | null }> => {
    const prisma = getPrisma();
    const [pessoa, setor] = await Promise.all([
      userId
        ? prisma.userHomeCards
            .findUnique({ where: { userId_tenantId_sectorCode: { userId, tenantId, sectorCode: setorAtivo ?? "" } }, select: { cards: true } })
            .catch(avisarSemTabela)
        : null,
      setorAtivo
        ? prisma.sectorHomeCards
            .findUnique({ where: { tenantId_sectorCode: { tenantId, sectorCode: setorAtivo } }, select: { cards: true } })
            .catch(avisarSemTabela)
        : null,
    ]);
    return { pessoa: lerEscolhas(pessoa?.cards), setor: lerEscolhas(setor?.cards) };
  }
);

function avisarSemTabela(err: unknown): null {
  if (isPrismaMissingTableError(err)) console.error("[home] cartões do Início: falta a migration cartoes_coringa_do_inicio");
  else console.error("[home] escolhas dos cartões indisponíveis", err);
  return null;
}

// ─── As consultas ──────────────────────────────────────────────────────────

/** Atrasadas e de hoje nos kanbans que a pessoa vê (o escopo do setor ativo). */
const tarefasDoEscopo = cache((ctx: AuthContext) =>
  tentar("tarefas", async () => {
    const { inicio, fim } = limitesDeHoje();
    const prisma = getPrisma();
    const base = { tenantId: ctx.tenantId, pipeline: scopedPipelineWhere(ctx), stage: { isTerminal: false } };
    const [atrasadas, hoje] = await Promise.all([
      prisma.pipelineItem.count({ where: { ...base, dueDate: { lt: inicio } } }),
      prisma.pipelineItem.count({ where: { ...base, dueDate: { gte: inicio, lte: fim } } }),
    ]);
    return { atrasadas, hoje };
  })
);

/** As atrasadas dos kanbans de um setor, dentro do que a pessoa vê. */
const tarefasAtrasadasDoSetor = cache((ctx: AuthContext, setor: string) =>
  tentar(`tarefas do setor ${setor}`, () =>
    getPrisma().pipelineItem.count({
      where: {
        tenantId: ctx.tenantId,
        pipeline: { AND: [scopedPipelineWhere(ctx), { sectorCode: setor }] },
        stage: { isTerminal: false },
        dueDate: { lt: limitesDeHoje().inicio },
      },
    })
  )
);

/** A aba "Para o meu setor" das Transferências — o mesmo filtro da lista. */
const transferenciasDaCaixa = cache((ctx: AuthContext) =>
  tentar("transferências", async () => {
    const quem = quemVeAsTransferencias(ctx);
    if (!abasVisiveis(quem).includes("setor")) return 0;
    return getPrisma().handoff.count({ where: { AND: [scopedHandoffWhere(ctx), whereDaAba("setor", quem)] } });
  })
);

/**
 * O que chegou para um setor e está com ele — nova ou resolvendo; a devolvida
 * está com quem pediu (a regra da aba "Para o meu setor", 10/11/2026).
 */
const transferenciasParaOSetor = cache((ctx: AuthContext, setor: string) =>
  tentar(`transferências para ${setor}`, () =>
    getPrisma().handoff.count({
      where: { AND: [scopedHandoffWhere(ctx), { sectors: { some: { sectorCode: setor, status: { in: SITUACOES_COM_O_SETOR } } } }] },
    })
  )
);

const transferenciasEnviadas = cache((ctx: AuthContext) =>
  tentar("transferências enviadas", () =>
    getPrisma().handoff.count({
      where: { AND: [scopedHandoffWhere(ctx), whereDaAba("enviadas", quemVeAsTransferencias(ctx))] },
    })
  )
);

/** A resposta atrasada — a mesma conta dos antigos Indicadores (`indicadores.ts`). */
const respostasAtrasadas = cache((ctx: AuthContext) =>
  tentar("solicitações atrasadas", async () => (await solicitacoesComRespostaAtrasada(ctx, new Date()))?.quantas ?? null)
);

/** Um recorte da fila de solicitações da pessoa, no setor ativo quando há um (como a tela com `&setor=`). */
const solicitacoesNoRecorte = cache((ctx: AuthContext, recorte: RecorteDaEquipe) =>
  tentar(`solicitações ${recorte}`, () =>
    getPrisma().serviceRequest.count({
      where: {
        AND: [
          whereDaEquipe({ tenantId: ctx.tenantId, setores: setoresDaFila(ctx), userId: ctx.userId }),
          ctx.activeSector ? { sectorCode: ctx.activeSector } : {},
          whereDoRecorteDaEquipe(recorte, ctx.userId),
        ],
      },
    })
  )
);

const empresasAtivas = cache((tenantId: string) =>
  tentar("empresas ativas", () => getPrisma().company.count({ where: { tenantId, status: "ACTIVE" } }))
);

/** Os chamados em aberto que a pessoa abriu, e quantos esperam a resposta dela. */
const chamadosQueAbri = cache((tenantId: string, userId: string) =>
  tentar("chamados que abri", async () => {
    const linhas = await getPrisma().helpdeskTicket.groupBy({
      by: ["status"],
      where: { tenantId, createdById: userId, status: { notIn: ["RESOLVIDO", "CANCELADO"] } },
      _count: { _all: true },
    });
    let valor = 0;
    let alerta = 0;
    for (const l of linhas) {
      valor += l._count._all;
      if (l.status === "AGUARDANDO_USUARIO" || l.status === "AGUARDANDO_REQUERENTE") alerta += l._count._all;
    }
    return { valor, alerta };
  })
);

/**
 * A aba "Em fila" da equipe dos chamados. A lista de situações é a de
 * `lista()` em `chamados/consultas.ts` (lá é local à função) — se a aba mudar,
 * muda aqui também.
 */
const SITUACOES_DA_FILA = ["AGUARDANDO_TRIAGEM", "ABERTO", "NA_FILA", "EM_ANDAMENTO", "AGUARDANDO_APROVACAO"] as const;

const chamadosNaFila = cache((tenantId: string) =>
  tentar("chamados na fila", () => getPrisma().helpdeskTicket.count({ where: { tenantId, status: { in: [...SITUACOES_DA_FILA] } } }))
);

/** Ciclos de SLA vencidos e ainda abertos — o mesmo predicado do aviso de SLA (`chamados/alertas.ts`). */
const chamadosAtrasados = cache((tenantId: string) =>
  tentar("chamados atrasados", () =>
    getPrisma().helpdeskSlaCycle.count({
      where: {
        tenantId,
        resolvedAt: null,
        pausedAt: null,
        resolutionDueAt: { lt: new Date() },
        ticket: { status: { notIn: ["RESOLVIDO", "CANCELADO"] } },
      },
    })
  )
);

/** Duas somas por tipo (`contasPorJanela`, a do Início do portal), e não a lista de títulos do painel. */
const contasDoEscritorio = cache((tenantId: string) =>
  tentar("contas", async () => {
    const hojeKey = saoPauloParts(new Date()).dateKey;
    // Até domingo: a janela termina na segunda seguinte (exclusive).
    const j = await contasPorJanela({ tenantId, companyIds: null }, hojeKey, addDaysToKey(mondayOfWeek(hojeKey), 7));
    return { pagarVencidas: j.PAGAR.vencidas.n, receberVencidas: j.RECEBER.vencidas.n, pagarSemana: j.PAGAR.proximas.n };
  })
);

const linhasAConciliar = cache((tenantId: string) =>
  tentar("conciliação", () => getPrisma().bankTransaction.count({ where: { tenantId, status: "PENDENTE" } }))
);

/**
 * As obrigações de um setor com risco de multa — a regra do aviso
 * (`riscoDeMulta`: a dois dias úteis da data legal, no dia e até 5 dias
 * depois), lida só na janela perto da data legal pelo índice
 * `(tenantId, dataLegal)` (migration de 10/11/2026).
 */
const obrigacoesEmRisco = cache((tenantId: string, setor: string) =>
  tentar(`obrigações do setor ${setor}`, async () => {
    const hoje = hojeIso();
    const linhas = await getPrisma().obrigacaoGerada.findMany({
      where: {
        tenantId,
        dataLegal: { gte: somarDias(hoje, -DIAS_DEPOIS_DA_DATA_LEGAL), lte: somarDias(hoje, 15) },
        pipelineItemId: { not: null },
        company: SO_EMPRESA_DE_VERDADE,
        modelo: { sectorCode: setor },
        pipelineItem: { stage: { isTerminal: false, type: { not: "DONE" } } },
      },
      select: { dataLegal: true },
      take: 5000,
    });
    if (linhas.length === 0) return { valor: 0, alerta: 0 };
    const feriados = new Set((await feriadosDoEscritorio(tenantId)).keys());
    let valor = 0;
    let alerta = 0;
    for (const l of linhas) {
      const risco = riscoDeMulta(l.dataLegal, hoje, feriados);
      if (!risco) continue;
      valor += 1;
      if (risco.situacao !== "PERTO") alerta += 1;
    }
    return { valor, alerta };
  })
);

/** As guias em aberto que vencem de hoje até domingo. Guia sem vencimento (DCTFWeb, parcela) não entra. */
const guiasDaSemana = cache((tenantId: string) =>
  tentar("guias", () => {
    const hojeKey = saoPauloParts(new Date()).dateKey;
    return getPrisma().guia.count({
      where: { tenantId, pagaEm: null, vencimento: { gte: hojeKey, lte: addDaysToKey(mondayOfWeek(hojeKey), 6) } },
    });
  })
);

/**
 * "Validar" da carteira de autorizações: cadastrada pelo cliente e dentro dos
 * 30 dias para o escritório validar. Conta pelo índice `(tenantId, status)`;
 * a carteira ainda tira as de empresa inativa, que aqui entram (são poucas).
 */
const autorizacoesAValidar = cache((tenantId: string) =>
  tentar("autorizações", () =>
    getPrisma().accessAuthorization.count({
      where: {
        tenantId,
        status: "PENDING_VALIDATION",
        OR: [{ receivedAt: null }, { receivedAt: { gte: new Date(`${somarDias(hojeIso(), -30)}T00:00:00Z`) } }],
      },
    })
  )
);

const xmlRecusados = cache((tenantId: string) =>
  tentar("XML recusados", () =>
    getPrisma().fiscalXmlRefusal.count({ where: { tenantId, lastSeenAt: { gte: new Date(Date.now() - DIAS_DO_RESUMO * DIA_MS) } } })
  )
);

/** As abertas (o contador da aba de /exigencias) e as de prazo vencido. */
const exigenciasAbertas = cache((tenantId: string) =>
  tentar("exigências", async () => {
    const prisma = getPrisma();
    const base = { tenantId, resolvedAt: null, protocol: { process: { tenantId, status: { notIn: STATUS_SEM_CONCLUSAO } } } };
    const [valor, alerta] = await Promise.all([
      prisma.processRequirement.count({ where: base }),
      prisma.processRequirement.count({ where: { ...base, dueAt: { lt: new Date() } } }),
    ]);
    return { valor, alerta };
  })
);

/** As licenças vencidas ou dentro do aviso — a mesma leitura do painel do Societário. */
const licencas = cache((tenantId: string) =>
  tentar("licenças", async () => {
    const hoje = new Date();
    const lista = await licencasARenovar(tenantId, hoje);
    return { valor: lista.length, alerta: lista.filter((l) => situacaoDaLicenca(l, hoje) === "vencida").length };
  })
);

/**
 * Os protocolos parados há mais que o prazo de cobrança (a aba "Parados" de
 * /exigencias), e os parados há o dobro — o vermelho da tela. Só a contagem:
 * a lista da tela lê também a auditoria e os avisos.
 */
const protocolosParados = cache((tenantId: string) =>
  tentar("protocolos parados", async () => {
    const prazo = diasDaLista(await diasParaCobrarOProtocolo(tenantId));
    const agora = Date.now();
    const onde = (dias: number) => ({
      tenantId,
      outcome: "PENDENTE" as const,
      submittedAt: { lte: new Date(agora - dias * DIA_MS) },
      process: { tenantId, status: { in: ["EM_ANDAMENTO" as const, "AGUARDANDO_ORGAO" as const] }, company: SO_EMPRESA_DE_VERDADE },
    });
    const prisma = getPrisma();
    const [valor, alerta] = await Promise.all([
      prisma.processProtocol.count({ where: onde(prazo) }),
      prisma.processProtocol.count({ where: onde(prazo * 2) }),
    ]);
    return { valor, alerta };
  })
);

/** As rescisões em andamento que passaram dos 10 dias para pagar (o "Vencido" de `statusPrazoPagamento`). */
const rescisoesForaDoPrazo = cache((tenantId: string) =>
  tentar("rescisões fora do prazo", () => {
    const hoje = new Date();
    const inicioUTC = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
    return getPrisma().termination.count({
      where: { tenantId, ...DESLIGAMENTO_EM_PROCESSO, terminationDate: { lt: new Date(inicioUTC - PRAZO_PAGAMENTO_DIAS * DIA_MS) } },
    });
  })
);

/** As entrevistas (reuniões de candidatura) desta semana, nas vagas que a pessoa vê. */
const entrevistasDaSemana = cache((ctx: AuthContext) =>
  tentar("entrevistas", () => {
    const segunda = mondayOfWeek(saoPauloParts(new Date()).dateKey);
    return getPrisma().meeting.count({
      where: {
        tenantId: ctx.tenantId,
        candidaturaId: { not: null },
        startAt: { gte: inicioDoDiaSP(segunda), lt: inicioDoDiaSP(addDaysToKey(segunda, 7)) },
        candidatura: { vaga: scopedVagaWhere(ctx) },
      },
    });
  })
);

/**
 * A aba "Renovar" dos certificados: o certificado que vale para cada
 * documento (o de vencimento mais distante) vencido ou a vencer em 60 dias.
 * Um `groupBy` pelo índice `(tenantId, documento, expiresAt)`, sem a lista
 * com as empresas que o painel lê.
 */
const certificadosARenovar = cache((tenantId: string) =>
  tentar("certificados", async () => {
    const grupos = await getPrisma().digitalCertificate.groupBy({ by: ["documento"], where: { tenantId }, _max: { expiresAt: true } });
    const hoje = new Date();
    let valor = 0;
    let alerta = 0;
    for (const g of grupos) {
      if (!g._max.expiresAt) continue;
      const s = situacaoDoCertificado({ documento: g.documento, expiresAt: g._max.expiresAt }, undefined, hoje);
      if (s === "vencido") alerta += 1;
      if (s === "vencido" || s === "a_renovar") valor += 1;
    }
    return { valor, alerta };
  })
);

const itensEmValidacao = cache((tenantId: string) =>
  tentar("controle interno", () => getPrisma().techInternalItem.count({ where: { tenantId, status: "VALIDATION" } }))
);

const leads = cache((tenantId: string) =>
  tentar("leads", async () => {
    const linhas = await getPrisma().lead.groupBy({
      by: ["status"],
      where: { tenantId, status: { in: ["NOVO", "EM_CONTATO"] } },
      _count: { _all: true },
    });
    const de = (s: string) => linhas.find((l) => l.status === s)?._count._all ?? 0;
    return { novos: de("NOVO"), emContato: de("EM_CONTATO") };
  })
);

// ─── O número de cada cartão ───────────────────────────────────────────────

/** Números que a Home já calculou para o subtítulo e o "Meu dia" — o cartão não conta de novo. */
export type NumerosJaCalculados = {
  tarefas?: { atrasadas: number; hoje: number; atrasadasPorSetor: Readonly<Record<string, number>> };
};

const so = (valor: number | null): NumeroDoCartao | null => (valor === null ? null : { valor });

/**
 * Uma consulta por chamada de `cartoesProntos`, mesmo fora da renderização:
 * o `cache()` do React só guarda dentro de um componente do servidor, e a
 * lista do lápis (uma action) pede o mesmo `dadosDoDP` para quatro cartões.
 */
type Memo = Map<string, Promise<unknown>>;

function uma<T>(memo: Memo, chave: string, consulta: () => Promise<T>): Promise<T> {
  const ja = memo.get(chave) as Promise<T> | undefined;
  if (ja) return ja;
  const nova = consulta();
  memo.set(chave, nova);
  return nova;
}

async function numeroDoCartao(
  ctx: AuthContext,
  amb: AmbienteDosCartoes,
  chave: MetricaDaHome,
  previos: NumerosJaCalculados,
  memo: Memo
): Promise<NumeroDoCartao | null> {
  const t = ctx.tenantId;
  const m = <T,>(nome: string, consulta: () => Promise<T>) => uma(memo, nome, consulta);
  switch (chave) {
    case "tarefas_atrasadas_hoje": {
      const n = previos.tarefas ?? (await m("tarefas", () => tarefasDoEscopo(ctx)));
      return n ? { valor: n.atrasadas + n.hoje, alerta: n.atrasadas } : null;
    }
    case "tarefas_atrasadas_fiscal":
    case "tarefas_atrasadas_contabil": {
      const setor = chave === "tarefas_atrasadas_fiscal" ? "fiscal" : "contabil";
      const ja = previos.tarefas?.atrasadasPorSetor[setor];
      return so(ja ?? (await tarefasAtrasadasDoSetor(ctx, setor)));
    }
    case "transferencias_setor":
      return so(await transferenciasDaCaixa(ctx));
    case "transferencias_contabil":
      return so(await transferenciasParaOSetor(ctx, "contabil"));
    case "transferencias_enviadas":
      return so(await transferenciasEnviadas(ctx));
    case "solicitacoes_atrasadas":
      return so(await respostasAtrasadas(ctx));
    case "solicitacoes_novas":
      return so(await solicitacoesNoRecorte(ctx, "novas"));
    case "solicitacoes_aguardando_cliente":
      return so(await solicitacoesNoRecorte(ctx, "aguardando"));
    case "solicitacoes_minhas":
      return so(await solicitacoesNoRecorte(ctx, "minhas"));
    case "empresas_ativas":
      return so(await empresasAtivas(t));
    case "chamados_que_abri":
      return ctx.userId ? await chamadosQueAbri(t, ctx.userId) : { valor: 0 };
    case "chamados_na_fila":
      return so(await chamadosNaFila(t));
    case "chamados_atrasados":
      return so(await chamadosAtrasados(t));
    case "contas_pagar_vencidas":
    case "contas_receber_vencidas":
    case "contas_pagar_semana": {
      const c = await m("contas", () => contasDoEscritorio(t));
      if (!c) return null;
      const valor = chave === "contas_pagar_vencidas" ? c.pagarVencidas : chave === "contas_receber_vencidas" ? c.receberVencidas : c.pagarSemana;
      return { valor };
    }
    case "pendencias_cliente":
    case "aprovacoes_aguardando": {
      // Os mesmos argumentos que o painel passa, para o `cache()` reaproveitar a consulta dele.
      const verAprovacoes = definicaoDoCartao("aprovacoes_aguardando")!.pode(ctx, amb);
      const verPendencias = definicaoDoCartao("pendencias_cliente")!.pode(ctx, amb);
      const d = await m("pendencias", () => dadosDasPendencias(t, verPendencias, verAprovacoes));
      if (chave === "pendencias_cliente") {
        const p = d?.pendencias;
        return p ? { valor: p.vencidas + p.respondidas + p.aguardando, alerta: p.vencidas } : null;
      }
      const a = d?.aprovacoes;
      return a ? { valor: a.aguardando.n, alerta: a.reprovadas.n } : null;
    }
    case "linhas_a_conciliar":
      return so(await linhasAConciliar(t));
    case "obrigacoes_risco_fiscal":
      return obrigacoesEmRisco(t, "fiscal");
    case "obrigacoes_risco_contabil":
      return obrigacoesEmRisco(t, "contabil");
    case "guias_vencem_semana":
      return so(await guiasDaSemana(t));
    case "autorizacoes_a_validar":
      return so(await autorizacoesAValidar(t));
    case "xml_recusados":
      return so(await xmlRecusados(t));
    case "processos_estourados": {
      const p = await dadosDosProcessos(t);
      return p ? { valor: p.estourados, alerta: p.noLimite } : null;
    }
    case "exigencias_abertas":
      return exigenciasAbertas(t);
    case "licencas_a_renovar":
      return licencas(t);
    case "protocolos_parados":
      return protocolosParados(t);
    case "ferias_vencidas":
    case "ferias_a_vencer":
    case "admissoes_andamento":
    case "exames_pendentes": {
      const d = await m("dp", () => dadosDoDP(t));
      if (!d) return null;
      const valor =
        chave === "ferias_vencidas" ? d.ferias.vencidas : chave === "ferias_a_vencer" ? d.ferias.aVencer : chave === "admissoes_andamento" ? d.admissoes : d.exames;
      return { valor };
    }
    case "rescisoes_andamento": {
      const [d, fora] = await Promise.all([m("dp", () => dadosDoDP(t)), rescisoesForaDoPrazo(t)]);
      return d ? { valor: d.rescisoes, alerta: fora ?? 0 } : null;
    }
    case "vagas_abertas":
    case "candidaturas_triagem":
    case "conversao_funil": {
      const r = await m("recrutamento", () => dadosDoRecrutamento(ctx));
      if (!r) return null;
      if (chave === "vagas_abertas") return { valor: r.vagas };
      if (chave === "candidaturas_triagem") return { valor: r.funil.stages[0]?.current ?? 0 };
      return { valor: r.funil.stages[1]?.reached ?? 0, total: r.funil.total };
    }
    case "entrevistas_semana":
      return so(await entrevistasDaSemana(ctx));
    case "certificados_renovar":
      return certificadosARenovar(t);
    case "itens_em_validacao":
      return so(await itensEmValidacao(t));
    case "leads_novos":
    case "leads_em_contato": {
      const l = await m("leads", () => leads(t));
      return l ? { valor: chave === "leads_novos" ? l.novos : l.emContato } : null;
    }
    case "academia_desafio_do_dia":
      return ctx.userId ? cartaoDaAcademia(ctx) : null;
    default:
      return null;
  }
}

/**
 * Os cartões prontos para a tela, na ordem pedida: o número de cada um, a
 * variação desde ontem e a linha. Com `gravar`, agenda a foto de hoje de
 * cada número (depois da resposta, só os que mudaram) — é o que dá histórico
 * aos cartões novos do catálogo a partir do dia em que alguém os vê.
 *
 * Só monta o que a pessoa pode ver: chave fora do catálogo ou sem acesso cai
 * fora, mesmo que tenha sido pedida.
 */
export async function cartoesProntos(
  ctx: AuthContext,
  chaves: readonly MetricaDaHome[],
  { previos = {}, gravar = true }: { previos?: NumerosJaCalculados; gravar?: boolean } = {}
): Promise<CartaoPronto[]> {
  if (!ctx.tenantId) return [];
  const amb = await ambienteDosCartoes(ctx.tenantId);
  const podeVer = new Set(cartoesDisponiveis(ctx, amb).map((d) => d.chave));
  const pedidas = chaves.filter((c) => podeVer.has(c));
  const memo: Memo = new Map();
  const numeros = await Promise.all(pedidas.map((c) => numeroDoCartao(ctx, amb, c, previos, memo)));

  const valores: Partial<Record<MetricaDaHome, number>> = {};
  pedidas.forEach((c, i) => {
    const n = numeros[i];
    if (n && Number.isFinite(n.valor)) valores[c] = n.valor;
  });
  const historico = await fotosDosNumeros(ctx, valores, { gravar });
  const hojeKey = historico?.hojeKey ?? saoPauloParts(new Date()).dateKey;

  return pedidas.map((chave, i) =>
    montarCartaoPronto({
      def: definicaoDoCartao(chave)!,
      numero: numeros[i],
      fotos: historico ? (historico.fotos[chave] ?? []) : null,
      hojeKey,
      quem: ctx,
      amb,
    })
  );
}

// ─── Gravar as escolhas ────────────────────────────────────────────────────

/** Grava (ou apaga, com `cards` nulo) a escolha da pessoa no setor ativo. */
export async function gravarEscolhaDaPessoa(ctx: AuthContext, cards: string | null): Promise<void> {
  const prisma = getPrisma();
  const chave = { userId: ctx.userId, tenantId: ctx.tenantId, sectorCode: contextoDaPessoa(ctx) };
  if (cards === null) {
    await prisma.userHomeCards.deleteMany({ where: chave });
    return;
  }
  await prisma.userHomeCards.upsert({
    where: { userId_tenantId_sectorCode: chave },
    create: { ...chave, cards },
    update: { cards },
  });
}

/** Grava o padrão do setor (quem pode é a action que decide). */
export async function gravarPadraoDoSetor(ctx: AuthContext, setor: string, cards: string): Promise<void> {
  await getPrisma().sectorHomeCards.upsert({
    where: { tenantId_sectorCode: { tenantId: ctx.tenantId, sectorCode: setor } },
    create: { tenantId: ctx.tenantId, sectorCode: setor, cards, updatedById: ctx.userId },
    update: { cards, updatedById: ctx.userId },
  });
}

/** O id do setor no cadastro (a auditoria registra a entidade Sector), ou `null` se ele não existe. */
export async function idDoSetor(tenantId: string, setor: string): Promise<string | null> {
  const s = await getPrisma().sector.findFirst({ where: { tenantId, code: setor }, select: { id: true } });
  return s?.id ?? null;
}
