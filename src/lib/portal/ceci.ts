// A Ceci no portal do cliente: quem tem, e quanto pode perguntar (21/10/2026,
// fase 3).
//
// Três chaves, todas do escritório, e as três precisam estar viradas:
// 1. o agente `ceci_portal` ligado, com chave de IA (Integrações › IA) — sem
//    chave, sem IA; o teto do mês em reais e em chamadas também é de lá;
// 2. a empresa ligada (`Company.ceciNoPortal`, em Administração › Portal do
//    cliente › Ceci). Ligada na matriz, vale para as filiais que o acesso vê
//    por ela — a mesma regra do acesso (etapa 2, 14/10);
// 3. o acesso ativo, com ao menos uma empresa ligada.
//
// A Ceci responde só sobre as empresas do acesso que têm a Ceci ligada: o
// escopo das ferramentas é o do acesso cortado nessas empresas (`escopoDaCeci`).
// Um acesso com uma empresa no piloto e outra fora não ouve da Ceci sobre a de
// fora.
//
// O limite por dia é por acesso, contado nas execuções do agente
// (`AgentRun`, onde também fica o custo de cada pergunta).

import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { nomeExibicao } from "@/lib/companyName";
import { agenteDoCatalogo, configEfetiva } from "@/lib/ia/catalogo";
import { estadoDosAgentes, gastoDoMes } from "@/lib/ia/data";
import { inicioDoDiaEmSaoPaulo } from "@/lib/ia/chat/regras";
import { lerEscopoDoAcesso, montarEscopoDoAcesso, type EscopoDoAcesso } from "./escopoDoAcesso";

export const AGENTE_DO_PORTAL = "ceci_portal";

/** O que a execução grava como "sobre o que foi" — é por aqui que o limite do dia conta. */
export const ENTIDADE_DO_PORTAL = "acesso_do_portal";

/**
 * Perguntas por acesso por dia. O chat da equipe tem 30 por pessoa; o cliente
 * pergunta sobre menos coisas, e no piloto o número segura um uso fora do
 * esperado antes do teto do mês.
 */
export const LIMITE_DE_PERGUNTAS_DO_PORTAL_POR_DIA = 20;

/** O escopo do acesso cortado nas empresas com a Ceci ligada. Puro. */
export function escopoDaCeci(acesso: EscopoDoAcesso, comCeci: ReadonlySet<string>): EscopoDoAcesso {
  return montarEscopoDoAcesso(
    acesso.tenantId,
    acesso.portalUserId,
    acesso.companyIds.filter((id) => comCeci.has(id))
  );
}

/** Coluna nova que o banco ainda não tem (código antes da migration): P2022. */
function semColuna(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2022";
}

/**
 * Das empresas pedidas, as que têm a Ceci ligada — direto, ou pela matriz.
 * Antes da migration (`ceciNoPortal` não existe), nenhuma: a Ceci fica fora
 * do portal em vez de derrubá-lo.
 */
export async function empresasComCeci(tenantId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  try {
    const linhas = await getPrisma().company.findMany({
      where: { tenantId, id: { in: [...ids] }, OR: [{ ceciNoPortal: true }, { parent: { ceciNoPortal: true, tenantId } }] },
      select: { id: true },
    });
    return new Set(linhas.map((l) => l.id));
  } catch (err) {
    if (semColuna(err)) return new Set();
    throw err;
  }
}

/** O escopo da Ceci para a conta: as empresas do acesso (ativo) com a Ceci ligada. */
export async function lerEscopoDaCeci(tenantId: string, portalUserId: string): Promise<EscopoDoAcesso> {
  const acesso = await lerEscopoDoAcesso(tenantId, portalUserId);
  return escopoDaCeci(acesso, await empresasComCeci(tenantId, acesso.companyIds));
}

/** O agente está ligado e o escritório tem chave de IA? */
export async function agenteDoPortalPronto(tenantId: string): Promise<boolean> {
  const estado = (await estadoDosAgentes(tenantId, [AGENTE_DO_PORTAL])).get(AGENTE_DO_PORTAL);
  return !!estado?.ligado && estado.temChave;
}

/**
 * A Ceci aparece no portal desta conta? É a pergunta do layout (o botão) e a
 * primeira da rota. O teto do mês não entra: com ele atingido, a Ceci aparece
 * e diz que chegou ao limite, em vez de sumir sem explicação.
 */
export async function ceciNoPortalDaConta(tenantId: string, portalUserId: string): Promise<boolean> {
  if (!(await agenteDoPortalPronto(tenantId))) return false;
  return (await lerEscopoDaCeci(tenantId, portalUserId)).companyIds.length > 0;
}

/** Quantas perguntas o acesso já fez hoje (dia de São Paulo). */
export async function perguntasDeHojeDoAcesso(tenantId: string, portalUserId: string, agora: Date): Promise<number> {
  return getPrisma().agentRun.count({
    where: {
      tenantId,
      agentCode: AGENTE_DO_PORTAL,
      entityType: ENTIDADE_DO_PORTAL,
      entityId: portalUserId,
      startedAt: { gte: inicioDoDiaEmSaoPaulo(agora) },
    },
  });
}

// ─── Administração › Portal do cliente › Ceci ───────────────────────────────

/** Antes da migration `20261021180000_ceci_no_portal` a coluna não existe. */
export const FALTA_ATUALIZAR_O_BANCO_DA_CECI =
  "Falta a atualização do banco desta versão do Connect. Até ela rodar, a Ceci não pode ser ligada no portal.";

/** Uma empresa ligada a algum acesso do portal, com a chave da Ceci. */
export type EmpresaDaCeci = { id: string; nome: string; ligada: boolean; acessos: number; filiais: number };

/**
 * As empresas que o escritório pode ligar: as ligadas direto a algum acesso do
 * portal (as filiais vêm junto da matriz, e por isso não aparecem sozinhas).
 * `null` antes da migration — a tela avisa em vez de quebrar.
 */
export async function empresasDoPortalParaACeci(tenantId: string): Promise<EmpresaDaCeci[] | null> {
  const prisma = getPrisma();
  try {
    const ligacoes = await prisma.portalUserCompany.groupBy({ by: ["companyId"], where: { tenantId }, _count: { _all: true } });
    if (ligacoes.length === 0) return [];
    const acessos = new Map(ligacoes.map((l) => [l.companyId, l._count._all]));
    const empresas = await prisma.company.findMany({
      where: { tenantId, id: { in: [...acessos.keys()] } },
      select: { id: true, name: true, displayName: true, ceciNoPortal: true, _count: { select: { filiais: true } } },
    });
    return empresas
      .map((e) => ({ id: e.id, nome: nomeExibicao(e), ligada: e.ceciNoPortal, acessos: acessos.get(e.id) ?? 0, filiais: e._count.filiais }))
      .sort((a, b) => Number(b.ligada) - Number(a.ligada) || a.nome.localeCompare(b.nome, "pt-BR"));
  } catch (err) {
    if (semColuna(err) || isPrismaMissingTableError(err)) return null;
    throw err;
  }
}

/** Como está o agente da Ceci do portal: ligado, chave, e o gasto do mês contra o teto. */
export type SituacaoDaCeci = {
  ligado: boolean;
  temChave: boolean;
  gastoCentavos: number;
  chamadas: number;
  tetoCentavos: number;
  tetoChamadas: number;
};

export async function situacaoDaCeci(tenantId: string, agora: Date): Promise<SituacaoDaCeci> {
  const def = agenteDoCatalogo(AGENTE_DO_PORTAL)!;
  const [linha, estado, gasto] = await Promise.all([
    getPrisma().tenantAgent.findUnique({
      where: { tenantId_agentCode: { tenantId, agentCode: AGENTE_DO_PORTAL } },
      select: { enabled: true, model: true, monthlyCapCents: true, monthlyCapCalls: true },
    }),
    estadoDosAgentes(tenantId, [AGENTE_DO_PORTAL]),
    gastoDoMes(tenantId, AGENTE_DO_PORTAL, agora),
  ]);
  const config = configEfetiva(def, linha);
  return {
    ligado: config.enabled,
    temChave: estado.get(AGENTE_DO_PORTAL)?.temChave ?? false,
    gastoCentavos: gasto.centavos,
    chamadas: gasto.chamadas,
    tetoCentavos: config.tetoMensalCentavos,
    tetoChamadas: config.tetoMensalChamadas,
  };
}
