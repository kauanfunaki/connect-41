import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackButton } from "@/components/shared/BackButton";
import { ClientDocumentForm } from "@/components/documentosCliente/ClientDocumentForm";
import { criarDocumento } from "../actions";

export default async function NovoDocumentoClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: companyId } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: "Documentos para Cliente", href: `/empresas/${companyId}/documentos-cliente`, truncate: true },
          { label: "Novo" },
        ]}
      />
      <BackButton className="mb-3" />

      <PageHeader title="Novo Documento" subtitle="Criado como rascunho — publique e envie quando estiver pronto." />

      <div className="w-full max-w-[860px]">
        <div className="bg-surface border border-border rounded-2xl p-6">
          <ClientDocumentForm
            action={criarDocumento}
            companyId={company.id}
            cancelHref={`/empresas/${companyId}/documentos-cliente`}
          />
        </div>
      </div>
    </PageContainer>
  );
}
