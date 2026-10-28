// Qual emissor atende cada empresa. Ver ./emissor.ts.
//
// A ordem da lista é a preferência: empresa cadastrada em dois emissores sai
// pelo primeiro. Com um só (o Omie), a pergunta é se a empresa tem conta.

import type { EmissorDeNfse, ResumoDoAcompanhamento } from "./emissor";
import { emissorOmie } from "./omie";

const EMISSORES: readonly EmissorDeNfse[] = [emissorOmie];

export const SEM_EMISSOR = "Esta empresa não tem emissor de NFS-e: cadastre a conta do Omie dela em Configurações › Integrações.";

export async function emissorDaEmpresa(
  tenantId: string,
  companyId: string,
  emissores: readonly EmissorDeNfse[] = EMISSORES
): Promise<EmissorDeNfse | null> {
  for (const e of emissores) {
    if (await e.atendeAEmpresa(tenantId, companyId)) return e;
  }
  return null;
}

/** O emissor de uma emissão já feita, e a empresa dela — para cancelar pelo mesmo caminho. */
export async function emissorDaEmissao(
  tenantId: string,
  emissaoId: string,
  emissores: readonly EmissorDeNfse[] = EMISSORES
): Promise<{ emissor: EmissorDeNfse; companyId: string } | null> {
  for (const e of emissores) {
    const companyId = await e.empresaDaEmissao(tenantId, emissaoId);
    if (companyId) return { emissor: e, companyId };
  }
  return null;
}

/**
 * A rodada do cron em todos os emissores. Um emissor que cai inteiro vira uma
 * falha no resumo, e os outros seguem — o mesmo critério de uma conta com
 * chave vencida, que não deixa o cron inteiro vermelho.
 */
export async function acompanharTodas(agora = new Date(), emissores: readonly EmissorDeNfse[] = EMISSORES): Promise<ResumoDoAcompanhamento> {
  const total: ResumoDoAcompanhamento = { consultadas: 0, autorizadas: 0, rejeitadas: 0, canceladas: 0, seguem: 0, falhas: [] };
  for (const e of emissores) {
    try {
      const r = await e.acompanhar(agora);
      total.consultadas += r.consultadas;
      total.autorizadas += r.autorizadas;
      total.rejeitadas += r.rejeitadas;
      total.canceladas += r.canceladas;
      total.seguem += r.seguem;
      total.falhas.push(...r.falhas);
    } catch (err) {
      total.falhas.push({ emissaoId: "-", erro: `${e.nome}: ${err instanceof Error ? err.message : "falha desconhecida"}` });
    }
  }
  return total;
}
