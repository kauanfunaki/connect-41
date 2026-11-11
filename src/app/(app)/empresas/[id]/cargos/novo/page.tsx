import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { CargoForm } from "@/components/empresas/CargoForm";
import { Card } from "@/components/ui/Card";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { criarCargo } from "../actions";
import { registroDaRota } from "@/lib/enderecoCurtoServidor";
import { endereco } from "@/lib/enderecoCurto";

export default async function NovoCargoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idDaRota } = await params;
  const ctx = await getAuthContext();
  // A empresa pelo uuid ou pelo id curto, /empresas/empresa-301/… (10/11/2026, pedido do Kauan).
  const { id: companyId, number: numeroDaEmpresa } = await registroDaRota("empresa", ctx.tenantId, idDaRota, "/cargos/novo");
  const fichaDaEmpresa = endereco("empresa", numeroDaEmpresa);
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  // Sugestão de família já usada no tenant — mesma razão da tela de edição.
  const familias = await prisma.cargo.findMany({
    where: { tenantId: ctx.tenantId, family: { not: null } },
    select: { family: true },
    distinct: ["family"],
    orderBy: { family: "asc" },
  });

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: company.name, href: `${fichaDaEmpresa}?tab=operations`, truncate: true },
          { label: "Cargos", href: `${fichaDaEmpresa}/cargos` },
          { label: "Novo" },
        ]}
      />

      <PageHeader title="Novo cargo" subtitle={company.name} />

      <div className="w-full max-w-[720px]">
        <Card className="p-6">
          <CargoForm
            action={criarCargo}
            companyId={companyId}
            cancelHref={`${fichaDaEmpresa}/cargos`}
            familiasExistentes={familias.map((f) => f.family!).filter(Boolean)}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
