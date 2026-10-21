import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { EntradaXmlModal } from "@/components/fiscal/EntradaXmlModal";
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
  if (!ctx.tenantId || !canActOnSector(ctx, (await setoresDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const prisma = getPrisma();
  const empresas = await prisma.company.findMany({
    where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
    orderBy: { name: "asc" },
    select: CAMPOS_DA_EMPRESA_NO_SELETOR,
  });

  return (
    <PageContainer>
      {/* Trilha no lugar do "← Voltar" (P04, 15/10/2026): a tela sai de Documentos fiscais. */}
      <Breadcrumb items={[{ label: "Documentos fiscais", href: "/documentos-fiscais" }, { label: "Entrada de XML" }]} />
      <PageHeader
        title="Documentos fiscais"
        subtitle="O formulário de entrada de XML foi aberto em uma janela para você continuar no acervo ao fechar."
      />

      <EntradaXmlModal empresas={empresas} action={importarXmls} />
    </PageContainer>
  );
}
