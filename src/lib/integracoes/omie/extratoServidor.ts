// A chamada do `ListarExtrato` para uma conta da empresa (lote 4, 28/10/2026).
// A leitura da resposta é `extrato.ts`; quem grava as linhas na conciliação é
// a mesma ação que grava o OFX (`app/(app)/conciliacao/actions.ts`).

import { getPrisma } from "@/lib/prisma";
import { lerConfig } from "@/lib/integracoes/data";
import { ErroDoOmie } from "./cliente";
import { instanciaDaEmpresa } from "./contas";
import { chamarOmieNaFila } from "./fila";
import { lerExtratoDoOmie, periodoDoMes, type LeituraDoExtratoDoOmie } from "./extrato";

export async function extratoDoOmie(
  tenantId: string,
  companyId: string,
  omieAccountId: string,
  competencia: string
): Promise<{ ok: true; leitura: LeituraDoExtratoDoOmie } | { ok: false; erro: string }> {
  const conexao = await getPrisma().tenantIntegration.findUnique({
    where: { tenantId_integrationCode_instanceKey: { tenantId, integrationCode: "omie", instanceKey: instanciaDaEmpresa(companyId) } },
    select: { enabled: true, configEnc: true },
  });
  if (!conexao) return { ok: false, erro: "Esta empresa não tem conta do Omie cadastrada (Configurações › Integrações)." };
  if (!conexao.enabled) return { ok: false, erro: "A conta do Omie desta empresa está desligada." };
  const config = lerConfig(conexao.configEnc);
  if (!config.appKey || !config.appSecret) return { ok: false, erro: "Falta App Key ou App Secret na conta do Omie desta empresa." };

  const periodo = periodoDoMes(competencia);
  try {
    const corpo = await chamarOmieNaFila({ appKey: config.appKey, appSecret: config.appSecret }, "financas/extrato", "ListarExtrato", {
      nCodCC: Number(omieAccountId),
      dPeriodoInicial: periodo.inicial,
      dPeriodoFinal: periodo.final,
      cExibirApenasSaldo: "N",
    });
    return { ok: true, leitura: lerExtratoDoOmie(corpo, periodo) };
  } catch (err) {
    const msg = err instanceof ErroDoOmie || err instanceof Error ? err.message : "sem resposta";
    return { ok: false, erro: `Não deu para ler o extrato no Omie: ${msg}` };
  }
}
