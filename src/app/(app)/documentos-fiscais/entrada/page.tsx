import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { EntradaXmlForm } from "@/components/fiscal/EntradaXmlForm";
import { CAMPOS_DA_EMPRESA_NO_SELETOR } from "@/lib/empresas/opcoesDoSeletor";
import { importarXmls } from "./actions";

// `SECTOR` é a chave do dado (onde o módulo nasce) e o padrão do gate; o
// acesso segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "fiscal";
const MODULE = "fiscal_documentos";

// Entrada de XML — o caminho manual do acervo, para o que a sincronização com o
// SPED não trouxe (ou enquanto ela não existe).
export default async function EntradaDeXmlPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const prisma = getPrisma();
  const empresas = await prisma.company.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
    orderBy: { name: "asc" },
    select: CAMPOS_DA_EMPRESA_NO_SELETOR,
  });

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <PageHeader
        title="Entrada de XML"
        subtitle="Cada arquivo é lido, casado com a empresa pelo CNPJ e deduplicado pela chave de acesso. Documento que já está no acervo não entra de novo."
      />

      <EntradaXmlForm empresas={empresas} action={importarXmls} />
    </PageContainer>
  );
}
