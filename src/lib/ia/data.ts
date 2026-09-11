// O lado impuro da fundação: ler configuração, somar o mês, abrir e fechar a
// linha de execução.
//
// A regra de divisão é a mesma do resto do projeto — `catalogo.ts`, `custo.ts`
// e `execucao.ts` não tocam no banco e por isso têm teste barato; aqui mora o
// que precisa de Prisma. Quem chama IA no app não usa nenhum dos quatro
// diretamente: usa `executarAgente`, em `src/lib/ai.ts`.

import { getPrisma } from "@/lib/prisma";
import type { AiProvider, AgentTrigger } from "@/generated/prisma/enums";
import {
  AGENT_CATALOG,
  agenteDoCatalogo,
  configEfetiva,
  modeloParaChamada,
  type AgenteDef,
} from "@/lib/ia/catalogo";
import {
  custoEmCentavos,
  somarGasto,
  temPrecoConhecido,
  type GastoDoMes,
  type UsoDeTokens,
} from "@/lib/ia/custo";
import {
  finalizarChamada,
  podeChamar,
  saudeDoAgente,
  inicioDoMesEmSaoPaulo,
  type DesfechoDaChamada,
  type SaudeDoAgente,
} from "@/lib/ia/execucao";

/**
 * Cotação do dólar em centavos de real.
 *
 * Env, com um padrão conservador: a alternativa seria buscar câmbio numa API a
 * cada chamada de IA, o que acrescenta uma dependência de rede no caminho de
 * algo que já depende de rede — e, quando ela falhasse, o custo viraria
 * desconhecido e o teto pararia de proteger. Um número aproximado e estável
 * protege melhor que um número exato e frágil.
 *
 * Padrão alto de propósito: errar para cima faz o teto travar cedo, que é o
 * lado seguro de errar.
 */
export function cotacaoUsdEmCentavos(): number {
  const bruto = Number(process.env.COTACAO_USD_CENTAVOS);
  if (Number.isFinite(bruto) && bruto > 0) return Math.round(bruto);
  return 600;
}

const ZERO: GastoDoMes = { centavos: 0, chamadas: 0, semCusto: 0 };

export type ContextoDaChamada = {
  trigger?: AgentTrigger;
  /** Quem clicou. Nulo em cron e em efeito do sistema. */
  userId?: string | null;
  /** Sobre o que foi — `candidatura`, `empresa`, `conversa`. */
  entityType?: string | null;
  entityId?: string | null;
};

/** O gasto do agente no mês corrente, em São Paulo. */
export async function gastoDoMes(
  tenantId: string,
  agentCode: string,
  agora: Date
): Promise<GastoDoMes> {
  const prisma = getPrisma();
  const linhas = await prisma.agentRun.findMany({
    where: { tenantId, agentCode, startedAt: { gte: inicioDoMesEmSaoPaulo(agora) } },
    select: { costCents: true },
  });
  return somarGasto(linhas);
}

export type PreparoDaChamada = {
  def: AgenteDef;
  provider: AiProvider;
  apiKey: string;
  model: string;
};

/**
 * Resolve tudo que a chamada precisa, e recusa antes de gastar.
 *
 * Lança em vez de devolver erro porque toda a família de funções em
 * `src/lib/ai.ts` já lança, e as telas já tratam — a mensagem chega ao usuário
 * pelo caminho que existe.
 *
 * A ordem das buscas importa pouco; a ordem das recusas importa, e está em
 * `podeChamar`.
 */
export async function prepararChamada(
  tenantId: string,
  agentCode: string,
  credenciais: { provider: AiProvider; apiKey: string; modelDoTenant: string | null } | null,
  agora: Date
): Promise<PreparoDaChamada> {
  const def = agenteDoCatalogo(agentCode);
  if (!def) throw new Error(`Agente desconhecido: ${agentCode}`);

  const prisma = getPrisma();
  const linha = await prisma.tenantAgent.findUnique({
    where: { tenantId_agentCode: { tenantId, agentCode } },
    select: { enabled: true, model: true, monthlyCapCents: true, monthlyCapCalls: true },
  });
  const config = configEfetiva(def, linha);

  const veredito = podeChamar({
    ligado: config.enabled,
    temChave: credenciais !== null,
    gasto: config.enabled && credenciais ? await gastoDoMes(tenantId, agentCode, agora) : ZERO,
    tetoMensalCentavos: config.tetoMensalCentavos,
    tetoMensalChamadas: config.tetoMensalChamadas,
  });
  if (!veredito.pode) throw new Error(veredito.texto);

  // `credenciais` não é nulo aqui: `podeChamar` já recusou por `sem_chave`.
  const creds = credenciais!;
  return {
    def,
    provider: creds.provider,
    apiKey: creds.apiKey,
    // Precedência: override do agente, override do tenant, faixa do catálogo.
    // O do agente ganha por ser o mais específico; o do tenant continua valendo
    // porque é o que já existia antes desta fundação, e cliente que o
    // configurou não deve ver o comportamento mudar sozinho.
    model: modeloParaChamada(def, creds.provider, config.model ?? creds.modelDoTenant),
  };
}

/** Abre a linha da execução, antes de qualquer token sair daqui. */
export async function abrirChamada(params: {
  tenantId: string;
  agentCode: string;
  provider: AiProvider;
  model: string;
  contexto?: ContextoDaChamada;
}): Promise<string> {
  const prisma = getPrisma();
  const run = await prisma.agentRun.create({
    data: {
      tenantId: params.tenantId,
      agentCode: params.agentCode,
      provider: params.provider,
      model: params.model,
      trigger: params.contexto?.trigger ?? "USUARIO",
      userId: params.contexto?.userId ?? null,
      entityType: params.contexto?.entityType ?? null,
      entityId: params.contexto?.entityId ?? null,
    },
    select: { id: true },
  });
  return run.id;
}

/**
 * Fecha a linha. **É o único caminho que encerra uma chamada.**
 *
 * Nunca lança: um erro ao gravar a auditoria não pode virar erro na tela de
 * quem já recebeu o resumo, e não pode engolir a exceção original de uma
 * chamada que falhou. Falha aqui vai para o log do servidor e a linha fica
 * aberta — que é visível, e é o sinal certo.
 */
export async function encerrarChamada(
  runId: string,
  desfecho: DesfechoDaChamada,
  agora: Date
): Promise<void> {
  try {
    const prisma = getPrisma();
    await prisma.agentRun.update({ where: { id: runId }, data: finalizarChamada(desfecho, agora) });
  } catch (err) {
    console.error("[ia] falha ao encerrar AgentRun", runId, err);
  }
}

/** O custo de um uso, já com a cotação e o modelo desta chamada. */
export function custoDaChamada(model: string, uso: UsoDeTokens): number | null {
  return custoEmCentavos(model, uso, cotacaoUsdEmCentavos());
}

export type LinhaDeAgente = {
  def: AgenteDef;
  enabled: boolean;
  /** O modelo que uma chamada usaria agora — já com as duas precedências. */
  model: string;
  temPrecoConhecido: boolean;
  tetoMensalCentavos: number;
  tetoMensalChamadas: number;
  gasto: GastoDoMes;
  saude: SaudeDoAgente;
  /** O cliente já mexeu na configuração deste agente? */
  temOverride: boolean;
  /**
   * O que o cliente gravou, campo a campo — e **não** o valor efetivo.
   *
   * É o que o formulário precisa: preencher o campo com o valor efetivo faria
   * "abrir e salvar sem mexer em nada" transformar herança em override fixo.
   * A partir daí o agente pararia de acompanhar mudanças no catálogo, em
   * silêncio, e ninguém ligaria uma coisa à outra.
   */
  override: { model: string | null; monthlyCapCents: number | null; monthlyCapCalls: number | null } | null;
};

/**
 * Os agentes do catálogo, com o que cada um gastou no mês.
 *
 * Uma varredura só do mês inteiro e um agrupamento em memória, em vez de uma
 * consulta por agente: são quatro hoje, mas a lista cresce e uma consulta por
 * linha é como uma tela de configuração vira quinze viagens ao banco.
 */
export async function listarAgentes(
  tenantId: string,
  provider: AiProvider | null,
  modelDoTenant: string | null,
  agora: Date
): Promise<LinhaDeAgente[]> {
  const prisma = getPrisma();
  const [overrides, runs] = await Promise.all([
    prisma.tenantAgent.findMany({
      where: { tenantId },
      select: { agentCode: true, enabled: true, model: true, monthlyCapCents: true, monthlyCapCalls: true },
    }),
    prisma.agentRun.findMany({
      where: { tenantId, startedAt: { gte: inicioDoMesEmSaoPaulo(agora) } },
      select: { agentCode: true, costCents: true },
    }),
  ]);

  const porAgente = new Map(overrides.map((o) => [o.agentCode, o]));
  const gastoPorAgente = new Map<string, { costCents: number | null }[]>();
  for (const r of runs) {
    const lista = gastoPorAgente.get(r.agentCode);
    if (lista) lista.push(r);
    else gastoPorAgente.set(r.agentCode, [r]);
  }

  return AGENT_CATALOG.map((def) => {
    const override = porAgente.get(def.code) ?? null;
    const config = configEfetiva(def, override);
    const gasto = somarGasto(gastoPorAgente.get(def.code) ?? []);
    // Sem provedor não há chave, e sem chave o modelo é hipotético — mostrar o
    // da faixa padrão é melhor que mostrar vazio, porque é o que vai valer no
    // instante em que alguém cadastrar a chave.
    const model = modeloParaChamada(def, provider ?? "ANTHROPIC", config.model ?? modelDoTenant);

    const estado = {
      ligado: config.enabled,
      temChave: provider !== null,
      gasto,
      tetoMensalCentavos: config.tetoMensalCentavos,
      tetoMensalChamadas: config.tetoMensalChamadas,
    };

    return {
      def,
      enabled: config.enabled,
      model,
      temPrecoConhecido: temPrecoConhecido(model),
      tetoMensalCentavos: config.tetoMensalCentavos,
      tetoMensalChamadas: config.tetoMensalChamadas,
      gasto,
      saude: saudeDoAgente(estado),
      temOverride: override !== null,
      override: override
        ? {
            model: override.model,
            monthlyCapCents: override.monthlyCapCents,
            monthlyCapCalls: override.monthlyCapCalls,
          }
        : null,
    };
  });
}

export type ChamadaNaLista = {
  id: string;
  agentCode: string;
  agentLabel: string;
  model: string;
  trigger: string;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean | null;
  error: string | null;
  costCents: number | null;
  userName: string | null;
  entityType: string | null;
  entityId: string | null;
};

/**
 * As últimas chamadas, para a trilha de auditoria na tela.
 *
 * Resolve o nome de quem disparou numa consulta só, e cai para o id quando o
 * usuário não existe mais — uma linha de auditoria sobrevive à conta que a
 * gerou, e perder a autoria por causa disso apagaria justamente o que a trilha
 * existe para guardar.
 */
export async function ultimasChamadas(
  tenantId: string,
  limite = 30,
  agentCode?: string
): Promise<ChamadaNaLista[]> {
  const prisma = getPrisma();
  const runs = await prisma.agentRun.findMany({
    where: { tenantId, ...(agentCode ? { agentCode } : {}) },
    orderBy: { startedAt: "desc" },
    take: limite,
  });

  const userIds = [...new Set(runs.map((r) => r.userId).filter((id): id is string => !!id))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nomePorId = new Map(users.map((u) => [u.id, u.name]));

  return runs.map((r) => ({
    id: r.id,
    agentCode: r.agentCode,
    agentLabel: agenteDoCatalogo(r.agentCode)?.label ?? r.agentCode,
    model: r.model,
    trigger: r.trigger,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    ok: r.ok,
    error: r.error,
    costCents: r.costCents,
    userName: r.userId ? nomePorId.get(r.userId) ?? r.userId : null,
    entityType: r.entityType,
    entityId: r.entityId,
  }));
}
