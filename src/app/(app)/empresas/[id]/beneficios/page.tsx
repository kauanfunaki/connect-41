import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { notFound } from "next/navigation";
import { Gift, Plus } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { BenefitType } from "@/generated/prisma/enums";
import { getAuthContext, canWrite, podeExcluir } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { AcoesDoCadastro } from "@/components/empresas/AcoesDoCadastro";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PainelDeCadastro } from "@/components/admin/PainelDeCadastro";
import { BenefitCatalogForm } from "@/components/empresas/BenefitCatalogForm";
import { excluirBeneficio, criarBeneficio, atualizarBeneficio } from "./actions";

const TYPE_LABEL: Record<BenefitType, string> = {
  VALE_REFEICAO:       "Vale-refeição",
  VALE_ALIMENTACAO:    "Vale-alimentação",
  VALE_TRANSPORTE:     "Vale-transporte",
  AUXILIO_COMBUSTIVEL: "Auxílio combustível",
  PLANO_SAUDE:         "Plano de saúde",
  PLANO_ODONTOLOGICO:  "Plano odontológico",
  CONVENIO_FARMACIA:   "Convênio farmácia",
  CONVENIO_SESC:       "Convênio SESC",
  TOTALPASS:           "TotalPass",
  AUXILIO_EDUCACAO:    "Auxílio educação",
  ASSIDUIDADE:         "Assiduidade",
  OUTRO:               "Outro",
};

export default async function BeneficiosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ novo?: string; editar?: string }>;
}) {
  const { id: companyId } = await params;
  // Criar e editar no painel ao lado (lote 5, 28/10/2026) — ver `PainelDeCadastro`.
  const { novo, editar } = await searchParams;
  const ctx = await getAuthContext();
  const canManage = canWrite(ctx.role);

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const beneficios = await prisma.benefitCatalog.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    orderBy: { name: "asc" },
  });

  const listaHref = `/empresas/${companyId}/beneficios`;
  const novoHref = `${listaHref}?novo=1`;
  const emEdicao = canManage && editar ? beneficios.find((x) => x.id === editar) : undefined;

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: company.name, href: `/empresas/${companyId}?tab=operations`, truncate: true },
          { label: "Benefícios" },
        ]}
      />

      <PageHeader
        title="Benefícios"
        subtitle={`${beneficios.length} benefício${beneficios.length !== 1 ? "s" : ""} cadastrado${beneficios.length !== 1 ? "s" : ""} nesta empresa`}
        action={
          canManage && (
            <Button
              href={novoHref}
              variant="primary"
            >
              <Plus size={14} /> Novo benefício
            </Button>
          )
        }
      />

      {beneficios.length === 0 ? (
        <Card>
          {/* Sem repetir o "Novo benefício": ele mora no cabeçalho, e o texto diz onde (P19, 15/10/2026). */}
          <EmptyState
            icon={<Gift />}
            title="Nenhum benefício cadastrado"
            description={
              canManage
                ? "Use “+ Novo benefício”, no alto da tela, para cadastrar os benefícios oferecidos aos colaboradores desta empresa, como vale-refeição, plano de saúde ou auxílio-transporte."
                : "Os benefícios desta empresa aparecem aqui quando forem cadastrados."
            }
          />
        </Card>
      ) : (
        <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] divide-y divide-border">
          {beneficios.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-fs-3 text-fg font-medium">{b.name}</p>
                <p className="text-fs-2 text-fg-muted">{TYPE_LABEL[b.type]}</p>
              </div>
              {canManage && (
                <AcoesDoCadastro editarHref={`${listaHref}?editar=${b.id}`} excluir={podeExcluir(ctx) ? excluirBeneficio.bind(null, b.id, companyId) : undefined} nome={b.name} />
              )}
            </div>
          ))}
        </div>
      )}
      {canManage && novo === "1" && (
        <PainelDeCadastro titulo="Novo benefício" voltarPara={listaHref}>
          <BenefitCatalogForm action={criarBeneficio} companyId={companyId} cancelHref={listaHref} />
        </PainelDeCadastro>
      )}
      {emEdicao && (
        <PainelDeCadastro titulo="Editar benefício" voltarPara={listaHref}>
          <BenefitCatalogForm key={emEdicao.id} action={atualizarBeneficio} companyId={companyId} cancelHref={listaHref} defaultValues={{ id: emEdicao.id, name: emEdicao.name, type: emEdicao.type, eligibilityRule: emEdicao.eligibilityRule ?? undefined }} />
        </PainelDeCadastro>
      )}
    </PageContainer>
  );
}
