import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { EntradaXmlForm } from "@/components/fiscal/EntradaXmlForm";
import { importarXmls } from "./actions";

const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";

// Entrada de XML — o caminho manual do acervo, para o que a sincronização com o
// SPED não trouxe (ou enquanto ela não existe).
export default async function EntradaDeXmlPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const prisma = getPrisma();
  const empresas = await prisma.company.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, displayName: true },
  });

  return (
    <PageContainer variant="narrow">
      <BackButton className="mb-3" />
      <PageHeader title="Entrada de XML" />
      <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1 mb-6">
        Cada arquivo é lido, casado com a empresa pelo CNPJ e deduplicado pela chave de acesso.
        Documento que já está no acervo não entra de novo.
      </p>

      <EntradaXmlForm empresas={empresas} action={importarXmls} />
    </PageContainer>
  );
}
