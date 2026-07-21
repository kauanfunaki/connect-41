import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { excluirEmpresa, adicionarServico, atribuirResponsavelServico } from "../actions";
import { getAuthContext, canWrite, isFullWrite, canManageSector } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { getCompanySectors, getApplicableCustomFields } from "@/lib/customFields";
import { getSectorMaps, getAllSectors } from "@/lib/sectors";
import { getSectorUsers } from "@/lib/sectorUsers";
import { listDocuments } from "@/lib/documents";
import { formatCalendarDate, formatInstantDate } from "@/lib/format";
import { PageContainer } from "@/components/shared/PageContainer";
import { CompanyHeader } from "@/components/empresas/CompanyHeader";
import { CompanyDetailTabs } from "@/components/empresas/CompanyDetailTabs";
import { CompanyOverviewSection } from "@/components/empresas/CompanyOverviewSection";
import { ServicesSection } from "@/components/empresas/ServicesSection";
import { CompanyPeopleSection } from "@/components/empresas/CompanyPeopleSection";
import { CompanyOperationsSection } from "@/components/empresas/CompanyOperationsSection";
import { CompanyHistorySection } from "@/components/empresas/CompanyHistorySection";
import { DocumentsSection } from "@/components/documents/DocumentsSection";
import { AiCompanySummary } from "@/components/empresas/AiCompanySummary";
import { AtendimentosAccordion } from "@/components/conversas/AtendimentosAccordion";
import { channelLabel, statusLabel } from "@/lib/chatwoot/labels";
import { gerarResumoEmpresa } from "./ai-actions";

export default async function EmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  const canEdit = canWrite(ctx.role);
  const canRequestHandoff = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id, ...(await scopedCompanyWhere(ctx)) },
    include: {
      services: { orderBy: { createdAt: "asc" } },
      people: { orderBy: { name: "asc" }, take: 10 },
    },
  });

  if (!company) notFound();

  const deleteAction = excluirEmpresa.bind(null, id);

  const [companySectors, sectorMaps, documents, pipelineItems, activities] = await Promise.all([
    getCompanySectors(ctx.tenantId, id),
    getSectorMaps(ctx.tenantId),
    listDocuments(ctx.tenantId, "COMPANY", id),
    prisma.pipelineItem.findMany({
      where: { tenantId: ctx.tenantId, entityType: "COMPANY", entityId: id },
      include: { pipeline: { select: { id: true, name: true } }, stage: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activity.findMany({
      where: { tenantId: ctx.tenantId, pipelineItem: { entityType: "COMPANY", entityId: id } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { name: true } }, pipelineItem: { include: { pipeline: { select: { name: true } } } } },
    }),
  ]);

  const customFields = await getApplicableCustomFields(ctx, "COMPANY", id, companySectors);

  const conversations = await prisma.chatwootConversation.findMany({
    where: {
      tenantId: ctx.tenantId,
      OR: [{ contactLink: { companyId: id } }, { contactLink: { person: { currentCompanyId: id } } }],
    },
    orderBy: { lastActivityAt: "desc" },
    take: 20,
  });

  // Serviços contratados + responsável por setor ("tag" no vocabulário do
  // Acessorias) — setores que o usuário atual pode gerenciar, e os usuários
  // elegíveis como responsável em cada um (membros do setor + admins).
  const allSectors = await getAllSectors(ctx.tenantId);
  const manageableSectors = allSectors
    .filter((s) => s.active && canManageSector(ctx, s.code))
    .map((s) => ({ code: s.code, label: sectorMaps.labels[s.code] ?? s.code, color: sectorMaps.colors[s.code] ?? "#586577" }));

  const relevantSectorCodes = [...new Set([...company.services.map((s) => s.sectorCode), ...manageableSectors.map((s) => s.code)])];
  const usersBySectorEntries = await Promise.all(
    relevantSectorCodes.map(async (code) => [code, await getSectorUsers(ctx.tenantId, code)] as const)
  );
  const usersBySector = Object.fromEntries(usersBySectorEntries);

  return (
    <PageContainer>
      <div className="flex items-center gap-2 mb-5">
        <Link href="/empresas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Empresas
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg truncate">{company.name}</span>
      </div>

      <CompanyHeader
        id={company.id}
        name={company.name}
        tradeName={company.tradeName}
        cnpj={company.cnpj}
        status={company.status}
        city={company.city}
        stateCode={company.stateCode}
        email={company.email}
        phone={company.phone}
        logoUrl={company.logoUrl}
        canEdit={canEdit}
        canRequestHandoff={canRequestHandoff}
        deleteAction={deleteAction}
      />

      <CompanyDetailTabs
        peopleCount={company.people.length}
        documentsCount={documents.length}
        conversationsCount={conversations.length}
        overview={
          <div className="space-y-4">
            <AiCompanySummary action={gerarResumoEmpresa.bind(null, company.id)} />
            <CompanyOverviewSection company={company} customFields={customFields} />
            <ServicesSection
              companyId={company.id}
              services={company.services}
              sectorLabels={sectorMaps.labels}
              sectorColors={sectorMaps.colors}
              manageableSectors={manageableSectors}
              usersBySector={usersBySector}
              addAction={adicionarServico}
              assignAction={atribuirResponsavelServico}
            />
          </div>
        }
        people={<CompanyPeopleSection companyId={company.id} people={company.people} />}
        operations={<CompanyOperationsSection companyId={company.id} />}
        documents={
          <DocumentsSection
            entityType="COMPANY"
            entityId={company.id}
            canUpload={canEdit}
            documents={documents.map((d) => ({
              id: d.id,
              fileName: d.fileName,
              category: d.category,
              sensitive: d.sensitive,
              uploadedByName: d.uploadedBy.name,
              createdAtLabel: formatInstantDate(d.createdAt),
              expiresAtLabel: d.expiresAt ? formatCalendarDate(d.expiresAt) : null,
              expired: d.expiresAt != null && d.expiresAt < new Date(),
            }))}
          />
        }
        conversations={
          <div className="bg-surface border border-border rounded-2xl px-4 py-2">
            <AtendimentosAccordion
              atendimentos={conversations.map((c) => ({
                id: c.id,
                dateLabel: c.lastActivityAt ? formatInstantDate(c.lastActivityAt) : "Sem data",
                channelLabel: channelLabel(c.channel),
                statusLabel: statusLabel(c.status),
                status: c.status,
                assigneeLabel: c.assigneeLabel,
                preview: c.lastMessagePreview,
              }))}
            />
          </div>
        }
        history={
          <CompanyHistorySection
            pipelineItems={pipelineItems.map((p) => ({
              id: p.id,
              pipelineId: p.pipeline.id,
              pipelineName: p.pipeline.name,
              stageName: p.stage.name,
            }))}
            activities={activities.map((a) => ({
              id: a.id,
              type: a.type,
              content: a.content,
              createdAt: a.createdAt,
              userName: a.user.name,
              contextLabel: a.pipelineItem.pipeline.name,
            }))}
          />
        }
      />
    </PageContainer>
  );
}
