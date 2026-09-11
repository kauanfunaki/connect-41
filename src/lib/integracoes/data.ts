// Leitura e escrita das integrações do cliente.
//
// Separado de `catalogo.ts` (declaração) e `execucao.ts` (regra pura). Aqui só
// o que toca banco e cifra — e a única porta que encerra uma execução.

import { getPrisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import {
  INTEGRATION_CATALOG,
  integracaoDoCatalogo,
  camposFaltando,
  mesclarConfig,
  configParaTela,
  segredosPreenchidos,
  type IntegracaoDef,
} from "./catalogo";
import {
  finalizarExecucao,
  saudeDaIntegracao,
  type ContadoresDaExecucao,
  type DesfechoDaExecucao,
  type Saude,
} from "./execucao";

/**
 * A configuração decifrada.
 *
 * **Só chamada no servidor, e o retorno não vai para a tela.** Quem desenha a
 * tela usa `listarIntegracoes`, que já devolve a versão sem segredo.
 */
export function lerConfig(configEnc: string): Record<string, string> {
  if (!configEnc) return {};
  try {
    const texto = decryptSecret(configEnc);
    const objeto = JSON.parse(texto) as unknown;
    if (objeto === null || typeof objeto !== "object") return {};
    const saida: Record<string, string> = {};
    for (const [k, v] of Object.entries(objeto as Record<string, unknown>)) {
      if (typeof v === "string") saida[k] = v;
    }
    return saida;
  } catch {
    // Config ilegível é config ausente: a integração vai aparecer como
    // incompleta e pedir as credenciais de novo, em vez de derrubar a tela.
    return {};
  }
}

export type IntegracaoNaTela = {
  code: string;
  label: string;
  vendor: string;
  natureza: IntegracaoDef["natureza"];
  sectorCode: string | null;
  description: string;
  campos: IntegracaoDef["campos"];
  /** Existe conexão gravada para este código? */
  conectada: boolean;
  id: string | null;
  instanceKey: string;
  nomeDoCliente: string | null;
  enabled: boolean;
  saude: Saude;
  lastRunAt: Date | null;
  lastError: string | null;
  /** Valores para o formulário — segredo sempre vazio. */
  valores: Record<string, string>;
  /** Quais segredos já estão guardados, para a tela escrever "preenchido". */
  segredosGuardados: string[];
  faltando: string[];
};

/**
 * O catálogo inteiro com o estado de cada um no tenant.
 *
 * Devolve **todas** as integrações do catálogo, conectadas ou não — é o que
 * permite a mesma consulta servir a vitrine ("o que dá para ligar") e a lista
 * de conexões ("o que está ligado"). Duas consultas para isso discordariam no
 * instante em que alguém conectasse algo entre as duas.
 */
export async function listarIntegracoes(
  tenantId: string,
  agora: Date
): Promise<IntegracaoNaTela[]> {
  const prisma = getPrisma();
  const conexoes = await prisma.tenantIntegration.findMany({
    where: { tenantId },
    orderBy: [{ integrationCode: "asc" }, { instanceKey: "asc" }],
  });

  const porCodigo = new Map<string, (typeof conexoes)[number]>();
  for (const c of conexoes) {
    // A primeira instância representa o código na vitrine; as demais aparecem
    // na tela de conexões, quando ela existir.
    if (!porCodigo.has(c.integrationCode)) porCodigo.set(c.integrationCode, c);
  }

  return INTEGRATION_CATALOG.map((def) => {
    const conexao = porCodigo.get(def.code) ?? null;
    const config = conexao ? lerConfig(conexao.configEnc) : {};
    return {
      code: def.code,
      label: def.label,
      vendor: def.vendor,
      natureza: def.natureza,
      sectorCode: def.sectorCode,
      description: def.description,
      campos: def.campos,
      conectada: conexao !== null,
      id: conexao?.id ?? null,
      instanceKey: conexao?.instanceKey ?? "default",
      nomeDoCliente: conexao?.label ?? null,
      enabled: conexao?.enabled ?? false,
      saude: saudeDaIntegracao(
        {
          enabled: conexao?.enabled ?? false,
          lastRunAt: conexao?.lastRunAt ?? null,
          lastError: conexao?.lastError ?? null,
        },
        agora
      ),
      lastRunAt: conexao?.lastRunAt ?? null,
      lastError: conexao?.lastError ?? null,
      valores: configParaTela(def, config),
      segredosGuardados: segredosPreenchidos(def, config),
      faltando: camposFaltando(def, config),
    };
  });
}

export type ResultadoDeSalvar = { ok: true; id: string } | { ok: false; erro: string };

/**
 * Cria ou atualiza uma conexão.
 *
 * A mescla com o que já estava salvo acontece **antes** de cifrar — é ela que
 * impede que editar o rótulo apague a senha (ver `mesclarConfig`).
 */
export async function salvarIntegracao(params: {
  tenantId: string;
  code: string;
  instanceKey?: string;
  label?: string | null;
  enabled?: boolean;
  campos: Record<string, unknown>;
}): Promise<ResultadoDeSalvar> {
  const def = integracaoDoCatalogo(params.code);
  if (!def) return { ok: false, erro: "Integração desconhecida." };

  const prisma = getPrisma();
  const instanceKey = params.instanceKey?.trim() || "default";

  const existente = await prisma.tenantIntegration.findUnique({
    where: {
      tenantId_integrationCode_instanceKey: {
        tenantId: params.tenantId,
        integrationCode: params.code,
        instanceKey,
      },
    },
    select: { id: true, configEnc: true },
  });

  const atual = existente ? lerConfig(existente.configEnc) : {};
  const config = mesclarConfig(def, atual, params.campos);

  const faltando = camposFaltando(def, config);
  // Ligar com credencial faltando produziria um 401 que parece problema do
  // terceiro. Guardar desligada é permitido — é o rascunho.
  if (params.enabled && faltando.length > 0) {
    return { ok: false, erro: `Preencha antes de ligar: ${faltando.join(", ")}` };
  }

  const configEnc = encryptSecret(JSON.stringify(config));

  const gravado = await prisma.tenantIntegration.upsert({
    where: {
      tenantId_integrationCode_instanceKey: {
        tenantId: params.tenantId,
        integrationCode: params.code,
        instanceKey,
      },
    },
    create: {
      tenantId: params.tenantId,
      integrationCode: params.code,
      instanceKey,
      label: params.label ?? null,
      enabled: params.enabled ?? false,
      configEnc,
    },
    update: {
      label: params.label ?? null,
      ...(params.enabled === undefined ? {} : { enabled: params.enabled }),
      configEnc,
    },
    select: { id: true },
  });

  return { ok: true, id: gravado.id };
}

/** Abre uma execução. O par obrigatório é `encerrarExecucao`. */
export async function abrirExecucao(params: {
  tenantId: string;
  integrationId: string;
  trigger?: "CRON" | "MANUAL" | "WEBHOOK";
}): Promise<string> {
  const prisma = getPrisma();
  const run = await prisma.integrationRun.create({
    data: {
      tenantId: params.tenantId,
      integrationId: params.integrationId,
      trigger: params.trigger ?? "CRON",
    },
    select: { id: true },
  });
  return run.id;
}

/**
 * Encerra uma execução — **o único caminho**.
 *
 * Grava a linha da execução e o espelho da integração na mesma transação. É
 * aqui que mora a regra que já custou um dia: sucesso limpa `lastError`,
 * inclusive quando a rodada não encontrou nada para fazer.
 *
 * Ter uma função só é o que torna a regra verdadeira sem depender de ninguém
 * lembrar dela no cron seguinte.
 */
export async function encerrarExecucao(params: {
  runId: string;
  integrationId: string;
  desfecho: DesfechoDaExecucao;
  avanco?: { cursor?: string | null; watermark?: string | null };
  agora?: Date;
}): Promise<void> {
  const prisma = getPrisma();
  const gravacao = finalizarExecucao(
    params.desfecho,
    params.agora ?? new Date(),
    params.avanco
  );

  await prisma.$transaction(async (tx) => {
    await tx.integrationRun.update({
      where: { id: params.runId },
      data: {
        finishedAt: gravacao.run.finishedAt,
        ok: gravacao.run.ok,
        error: gravacao.run.error,
        counters: gravacao.run.counters ?? undefined,
      },
    });
    await tx.tenantIntegration.update({
      where: { id: params.integrationId },
      data: gravacao.integracao,
    });
  });
}

/**
 * Roda uma função dentro de uma execução, encerrando dos dois jeitos.
 *
 * É o açúcar que faz o caminho certo ser o mais curto: quem chama não tem como
 * esquecer de encerrar, nem de limpar o erro no sucesso. Exceção vira falha
 * gravada e é re-lançada, para o chamador decidir se o laço continua.
 */
export async function executar<T>(
  params: {
    tenantId: string;
    integrationId: string;
    trigger?: "CRON" | "MANUAL" | "WEBHOOK";
  },
  corpo: () => Promise<{ resultado: T; counters?: ContadoresDaExecucao; cursor?: string | null; watermark?: string | null }>
): Promise<T> {
  const runId = await abrirExecucao(params);
  try {
    const { resultado, counters, cursor, watermark } = await corpo();
    await encerrarExecucao({
      runId,
      integrationId: params.integrationId,
      desfecho: { ok: true, counters },
      avanco: { cursor, watermark },
    });
    return resultado;
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "falha desconhecida";
    await encerrarExecucao({
      runId,
      integrationId: params.integrationId,
      desfecho: { ok: false, erro: mensagem },
    });
    throw err;
  }
}
