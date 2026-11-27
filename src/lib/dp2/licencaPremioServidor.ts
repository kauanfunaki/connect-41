// Licença-prêmio no banco (27/11/2026, funcionalidade-763): a regra da
// convenção da empresa e os gozos e pagamentos já registrados.

import { getPrisma } from "@/lib/prisma";
import type { RegraDaLicencaPremio, TipoDeUsoDaLicenca, UsoDaLicencaPremio } from "./licencaPremio";

/** A regra da licença-prêmio da convenção da empresa; nula quando a convenção não tem. */
export async function regraDaLicencaPremio(tenantId: string, companyId: string): Promise<RegraDaLicencaPremio | null> {
  const cfg = await getPrisma().dp2EmpresaConfig.findFirst({ where: { tenantId, companyId }, select: { convencao: { select: { licencaPremioAnos: true, licencaPremioDias: true } } } });
  const c = cfg?.convencao;
  return c?.licencaPremioAnos && c.licencaPremioDias ? { anos: c.licencaPremioAnos, dias: c.licencaPremioDias } : null;
}

/** Os gozos e pagamentos de licença-prêmio da pessoa. */
export async function usosDaLicencaPremio(tenantId: string, personId: string): Promise<UsoDaLicencaPremio[]> {
  const linhas = await getPrisma().dp2Ocorrencia.findMany({
    where: { tenantId, personId, tipo: { in: ["LICENCA_PREMIO_GOZO", "LICENCA_PREMIO_PAGA"] } },
    select: { tipo: true, data: true, dias: true },
  });
  return linhas.map((l) => ({ tipo: l.tipo as TipoDeUsoDaLicenca, data: l.data.toISOString().slice(0, 10), dias: l.dias }));
}
