// Credencial do SPED por cliente.
//
// Até 11/09 o token só existia no `.env`, o que funciona enquanto a 41 é o único
// cliente e colapsa na primeira venda. A convergência copiou URL e token para
// `TenantIntegration` (código `sped`, instância `default`); desde 14/09 esta é a
// fonte quando a integração está ligada na vitrine, e o `.env` fica como
// fallback — ver `src/lib/integracoes/fonte.ts`.

import { getPrisma } from "@/lib/prisma";
import { lerConfig } from "@/lib/integracoes/data";
import { escolherCredencial } from "@/lib/integracoes/fonte";
import { credenciaisDoAmbiente, type CredenciaisSped } from "./client";

export async function credenciaisDoSped(tenantId: string): Promise<CredenciaisSped | null> {
  const prisma = getPrisma();
  const linha = await prisma.tenantIntegration.findUnique({
    where: {
      tenantId_integrationCode_instanceKey: { tenantId, integrationCode: "sped", instanceKey: "default" },
    },
    select: { enabled: true, configEnc: true },
  });

  const escolha = escolherCredencial(
    linha ? { enabled: linha.enabled, config: lerConfig(linha.configEnc) } : null,
    ["baseUrl", "serviceToken"] as const,
    () => {
      const ambiente = credenciaisDoAmbiente();
      return ambiente ? { baseUrl: ambiente.baseUrl, serviceToken: ambiente.token } : null;
    }
  );
  if (!escolha) return null;

  if (escolha.fonte === "legado" && escolha.integracaoIncompleta) {
    console.warn(
      `[sped] tenant ${tenantId}: integração ligada e incompleta — usando SPED_API_URL/SPED_API_TOKEN do ambiente`
    );
  }

  return {
    baseUrl: escolha.valores.baseUrl.replace(/\/+$/, ""),
    token: escolha.valores.serviceToken,
  };
}
