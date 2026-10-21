import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { CAMPOS_DA_EMPRESA_NO_SELETOR } from "@/lib/empresas/opcoesDoSeletor";
import { importarXmls } from "@/app/(app)/documentos-fiscais/entrada/actions";
import { EntradaXmlModal } from "@/components/fiscal/EntradaXmlModal";

const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";

export default async function EntradaDeXmlInterceptada() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const empresas = await getPrisma().company.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
    orderBy: { name: "asc" },
    select: CAMPOS_DA_EMPRESA_NO_SELETOR,
  });

  return <EntradaXmlModal empresas={empresas} action={importarXmls} />;
}
