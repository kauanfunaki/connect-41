// Contas do Omie por empresa cliente.
//
// A 41 opera o Omie dos clientes do BPO: cada empresa é uma conta Omie com a
// sua App Key e o seu App Secret. Aqui elas viram instâncias de
// `TenantIntegration` (código `omie`) com `instanceKey = "empresa:{companyId}"`
// — a tabela já aceita várias contas do mesmo sistema, e a credencial fica
// cifrada como a de qualquer integração. Plano em
// Projects/Connect-41/Plano-Integracao-Omie-2026-09-23 (vault).

import { getPrisma } from "@/lib/prisma";
import { executar, lerConfig, salvarIntegracao } from "@/lib/integracoes/data";
import { saudeDaIntegracao, type Saude } from "@/lib/integracoes/execucao";
import { nomeExibicao } from "@/lib/companyName";
import { chamarOmie, conferirEmpresa, empresasDaResposta, type ResultadoDoTeste } from "./cliente";
import { estruturaDe, type LinhaDaEstrutura } from "./estrutura";

export const PREFIXO_DA_EMPRESA = "empresa:";
export const instanciaDaEmpresa = (companyId: string) => `${PREFIXO_DA_EMPRESA}${companyId}`;

export type ContaOmieNaTela = {
  companyId: string;
  empresa: string;
  cnpj: string | null;
  enabled: boolean;
  saude: Saude;
  lastRunAt: Date | null;
  lastError: string | null;
  /** A App Key aparece (não é segredo); o App Secret nunca sai do servidor. */
  appKey: string;
};

export async function listarContasOmie(tenantId: string, agora: Date): Promise<ContaOmieNaTela[]> {
  const prisma = getPrisma();
  const conexoes = await prisma.tenantIntegration.findMany({
    where: { tenantId, integrationCode: "omie", instanceKey: { startsWith: PREFIXO_DA_EMPRESA } },
  });
  const ids = conexoes.map((c) => c.instanceKey.slice(PREFIXO_DA_EMPRESA.length));
  const empresas = await prisma.company.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true, name: true, displayName: true, cnpj: true },
  });
  const porId = new Map(empresas.map((e) => [e.id, e]));
  return conexoes
    .map((c) => {
      const companyId = c.instanceKey.slice(PREFIXO_DA_EMPRESA.length);
      const e = porId.get(companyId);
      return {
        companyId,
        empresa: e ? nomeExibicao(e) : "(empresa removida)",
        cnpj: e?.cnpj ?? null,
        enabled: c.enabled,
        saude: saudeDaIntegracao({ enabled: c.enabled, lastRunAt: c.lastRunAt, lastError: c.lastError }, agora),
        lastRunAt: c.lastRunAt,
        lastError: c.lastError,
        appKey: lerConfig(c.configEnc).appKey ?? "",
      };
    })
    .sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR"));
}

export async function salvarContaOmie(p: {
  tenantId: string;
  companyId: string;
  appKey: string;
  appSecret: string;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const empresa = await getPrisma().company.findFirst({
    where: { id: p.companyId, tenantId: p.tenantId },
    select: { name: true, displayName: true },
  });
  if (!empresa) return { ok: false, erro: "Empresa não encontrada." };
  const r = await salvarIntegracao({
    tenantId: p.tenantId,
    code: "omie",
    instanceKey: instanciaDaEmpresa(p.companyId),
    label: `Omie — ${nomeExibicao(empresa)}`,
    enabled: true,
    // Segredo em branco mantém o que já estava guardado (mesclarConfig).
    campos: { appKey: p.appKey.trim(), appSecret: p.appSecret.trim() },
  });
  return r.ok ? { ok: true } : { ok: false, erro: r.erro };
}

/**
 * Testa a conta: uma leitura inofensiva (`ListarEmpresas`) e a conferência do
 * CNPJ. Roda dentro de uma execução MANUAL, para o estado da conta na tela
 * refletir o teste — deu certo, o erro anterior some.
 */
export async function testarContaOmie(tenantId: string, companyId: string): Promise<ResultadoDoTeste | { ok: false; erro: string }> {
  const prisma = getPrisma();
  const conexao = await prisma.tenantIntegration.findUnique({
    where: { tenantId_integrationCode_instanceKey: { tenantId, integrationCode: "omie", instanceKey: instanciaDaEmpresa(companyId) } },
  });
  if (!conexao) return { ok: false, erro: "Esta empresa ainda não tem conta do Omie cadastrada." };
  const empresa = await prisma.company.findFirst({ where: { id: companyId, tenantId }, select: { cnpj: true } });
  const config = lerConfig(conexao.configEnc);
  if (!config.appKey || !config.appSecret) return { ok: false, erro: "Falta App Key ou App Secret." };

  try {
    return await executar({ tenantId, integrationId: conexao.id, trigger: "MANUAL" }, async () => {
      const corpo = await chamarOmie({ appKey: config.appKey, appSecret: config.appSecret }, "geral/empresas", "ListarEmpresas", {
        pagina: 1,
        registros_por_pagina: 50,
      });
      const empresas = empresasDaResposta(corpo);
      const resultado = conferirEmpresa(empresas, empresa?.cnpj ?? null);
      // CNPJ que não confere é falha da conta: a chave abre, mas é de outra empresa.
      if (!resultado.confere) throw new Error(resultado.aviso);
      return { resultado, counters: { empresasNaConta: empresas.length } };
    });
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "Falha ao testar." };
  }
}

// ─── Prévia das notas (Fase 1a — só leitura, nada é gravado) ─────────────────

export type PreviaDeChamada =
  | { ok: true; estrutura: LinhaDaEstrutura[] }
  | { ok: false; erro: string };

/**
 * As primeiras notas da conta, como o Omie devolve — para conferir a forma da
 * resposta antes de escrever a gravação no acervo. Duas chamadas de leitura,
 * poucas notas cada; **não grava nada** e não mexe no estado da conta.
 * Parâmetro com nome errado volta como erro do Omie, e o erro é a informação.
 */
export async function previaDasNotasOmie(
  tenantId: string,
  companyId: string
): Promise<{ nfe: PreviaDeChamada; nfse: PreviaDeChamada } | { erro: string }> {
  const conexao = await getPrisma().tenantIntegration.findUnique({
    where: { tenantId_integrationCode_instanceKey: { tenantId, integrationCode: "omie", instanceKey: instanciaDaEmpresa(companyId) } },
  });
  if (!conexao) return { erro: "Esta empresa não tem conta do Omie cadastrada." };
  const config = lerConfig(conexao.configEnc);
  if (!config.appKey || !config.appSecret) return { erro: "Falta App Key ou App Secret." };
  const cred = { appKey: config.appKey, appSecret: config.appSecret };

  const tentar = async (modulo: string, call: string, param: Record<string, unknown>): Promise<PreviaDeChamada> => {
    try {
      return { ok: true, estrutura: estruturaDe(await chamarOmie(cred, modulo, call, param)) };
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : "Falha na chamada." };
    }
  };

  // Em sequência, não em paralelo: o Omie limita chamadas simultâneas por chave.
  const nfe = await tentar("produtos/nfconsultar", "ListarNF", { pagina: 1, registros_por_pagina: 3, apenas_importado_api: "N" });
  const nfse = await tentar("servicos/nfse", "ListarNFSEs", { nPagina: 1, nRegPorPagina: 3 });
  return { nfe, nfse };
}
