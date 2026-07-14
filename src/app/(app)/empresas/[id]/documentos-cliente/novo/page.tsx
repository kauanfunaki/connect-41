import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { PageContainer } from "@/components/shared/PageContainer";
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
    <PageContainer variant="narrow">
      <BackButton className="mb-3" />
      <div className="flex items-center gap-2 mb-6">
        <Link href="/empresas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Empresas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/empresas/${companyId}/documentos-cliente`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          Documentos para Cliente
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Novo</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-1">Novo Documento</h1>
      <p className="text-[13px] text-fg-muted mb-6">
        Criado como rascunho — publique e envie quando estiver pronto.
      </p>

      <div className="bg-surface border border-border rounded-lg p-6">
        <ClientDocumentForm action={criarDocumento} companyId={company.id} />
      </div>
    </PageContainer>
  );
}
