// Credencial do SPED por cliente.
//
// A integração do SPED é a base de documentos **de um cliente**: cada tenant
// que tem a sua conecta a dele, e quem não tem não conecta. Por isso a
// credencial vem só de `TenantIntegration` (código `sped`, instância `default`),
// ligada na vitrine de Integrações.
//
// ─── Por que não há fallback no `.env` (14/09) ──────────────────────────────
//
// Existiu, e valia para **qualquer** tenant. Medido em 14/09: desde 09/09 o cron
// consultava o SPED da 41 com a raiz de CNPJ do 41 TALLENT — que não tem SPED
// nenhum — a cada 10 minutos. Voltou vazio e nada foi gravado, mas com um
// cliente de verdade no lugar seria um tenant consultando a base de documentos
// de outro. Tenant sem integração ligada não sincroniza nem consulta.

import { getPrisma } from "@/lib/prisma";
import { lerConfig } from "@/lib/integracoes/data";
import { integracaoDoCatalogo, camposFaltando } from "@/lib/integracoes/catalogo";
import type { CredenciaisSped } from "./client";

export async function credenciaisDoSped(tenantId: string): Promise<CredenciaisSped | null> {
  const prisma = getPrisma();
  const linha = await prisma.tenantIntegration.findUnique({
    where: {
      tenantId_integrationCode_instanceKey: { tenantId, integrationCode: "sped", instanceKey: "default" },
    },
    select: { enabled: true, configEnc: true },
  });
  if (!linha?.enabled) return null;

  const config = lerConfig(linha.configEnc);
  const faltando = camposFaltando(integracaoDoCatalogo("sped")!, config);
  if (faltando.length > 0) {
    // `salvarIntegracao` não deixa ligar com campo faltando, então o caso real
    // aqui é config que não decifrou (chave de criptografia trocada). Não há o
    // que sincronizar, mas precisa aparecer no log: calado, parece que o
    // cliente simplesmente não tem documento.
    console.warn(
      `[sped] tenant ${tenantId}: integração ligada e incompleta (falta ${faltando.join(", ")}) — nada é sincronizado`
    );
    return null;
  }

  return { baseUrl: config.baseUrl.replace(/\/+$/, ""), token: config.serviceToken };
}
