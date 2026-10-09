import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { CAMPOS_DA_EMPRESA_NO_SELETOR, opcoesDeEmpresa } from "@/lib/empresas/opcoesDoSeletor";
import { nomeExibicao } from "@/lib/companyName";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ClientDocumentForm } from "@/components/documentosCliente/ClientDocumentForm";
import { rotaDosEnvios } from "@/lib/envios/regras";
import { criarDocumento } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Novo envio ao cliente. A empresa é campo desde que o envio saiu da ficha da
 * empresa (08/10/2026); quem chega pela ficha traz `?empresa=`, que já vem
 * escolhida.
 */
export default async function NovoEnvioPage({
  searchParams,
}: {
  searchParams: Promise<{ empresa?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canWrite(ctx.role)) notFound();

  const { empresa } = await searchParams;
  // As ativas, mais a da URL mesmo que não esteja ativa — quem veio da ficha
  // de uma empresa inativa não pode chegar com o campo vazio.
  const empresas = await getPrisma().company.findMany({
    where: { ...(await scopedCompanyWhere(ctx)), OR: [{ status: "ACTIVE" }, ...(empresa ? [{ id: empresa }] : [])] },
    select: CAMPOS_DA_EMPRESA_NO_SELETOR,
  });
  const escolhida = empresa ? empresas.find((e) => e.id === empresa) : undefined;

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Envios ao cliente", href: rotaDosEnvios(escolhida?.id) }, { label: "Novo envio" }]} />

      <PageHeader
        title="Novo envio"
        subtitle={
          escolhida
            ? `Para ${nomeExibicao(escolhida)}. Fica como rascunho: ao publicar, aparece no portal do cliente, e o e-mail é opcional.`
            : "Fica como rascunho: ao publicar, aparece no portal do cliente, e o e-mail é opcional."
        }
      />

      <div className="w-full max-w-[860px]">
        <Card className="p-6">
          <ClientDocumentForm
            action={criarDocumento}
            companyId={escolhida?.id}
            empresas={opcoesDeEmpresa(empresas.map((e) => ({ ...e, nome: nomeExibicao(e) })))}
            cancelHref={rotaDosEnvios(escolhida?.id)}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
