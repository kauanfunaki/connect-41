import { Card } from "@/components/ui/Card";
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
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageContainer } from "@/components/shared/PageContainer";
import { CompanyHeader } from "@/components/empresas/CompanyHeader";
import { CompanyDetailTabs } from "@/components/empresas/CompanyDetailTabs";
import { NavegadorDeArquivos } from "@/components/arquivos/NavegadorDeArquivos";
import { navegadorDaEquipe } from "@/lib/drive/servidor";
import { MODULO_ARQUIVOS } from "@/lib/drive/regras";
import { isModuleEnabled } from "@/lib/modules";
import { acessoAsAutorizacoes, autorizacaoDaEmpresa } from "@/lib/autorizacoes/servidor";
import { AutorizacaoNaFicha } from "@/components/autorizacoes/AutorizacaoNaFicha";
import { hojeIso } from "@/lib/datas/calendario";
import { configuracaoDoSerpro, prontidaoDoSerpro } from "@/lib/serpro/cliente";
import { CompanyFiliaisSection } from "@/components/empresas/CompanyFiliaisSection";
import { nomeExibicao, razaoSocialSecundaria } from "@/lib/companyName";
import type { CompanyStatus } from "@/generated/prisma/enums";
import { CompanyOverviewSection } from "@/components/empresas/CompanyOverviewSection";
import { ServicesSection } from "@/components/empresas/ServicesSection";
import { CompanyPeopleSection } from "@/components/empresas/CompanyPeopleSection";
import { CompanyOperationsSection } from "@/components/empresas/CompanyOperationsSection";
import { CompanyHistorySection } from "@/components/empresas/CompanyHistorySection";
import { DocumentsSection } from "@/components/documents/DocumentsSection";
import { AiCompanySummary } from "@/components/empresas/AiCompanySummary";
import { AtendimentosAccordion } from "@/components/conversas/AtendimentosAccordion";
import { channelLabel, statusLabel } from "@/lib/chatwoot/labels";
import { safeFindConversations } from "@/lib/chatwoot/conversations";
import { gerarResumoEmpresa } from "./ai-actions";

const STATUS_LABEL: Record<CompanyStatus, string> = {
  PROSPECT: "Prospecto",
  ACTIVE:   "Ativo",
  INACTIVE: "Inativo",
  CHURNED:  "Cancelado",
};

const STATUS_COLOR: Record<CompanyStatus, string> = {
  PROSPECT: "var(--c41-warning)",
  ACTIVE:   "var(--c41-success)",
  INACTIVE: "var(--c41-fg-muted)",
  CHURNED:  "var(--c41-fg-muted)",
};

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
      clientGroup: { select: { id: true, name: true } },
      parent: { select: { id: true, name: true, displayName: true, cnpj: true } },
      filiais: {
        orderBy: { name: "asc" },
        select: { id: true, name: true, displayName: true, cnpj: true, status: true, city: true, stateCode: true },
      },
    },
  });

  if (!company) notFound();

  // A aba Arquivos (09/10/2026): o primeiro nível das pastas da empresa. Abrir
  // uma pasta leva à tela dos Arquivos — a ficha não é refeita a cada clique.
  const arquivos =
    ctx.tenantId && (await isModuleEnabled(ctx.tenantId, MODULO_ARQUIVOS)) ? await navegadorDaEquipe(ctx, company.id, null) : null;

  // Autorização de acesso na Receita (09/10/2026): a da raiz do CNPJ, para
  // quem vê o setor do módulo (o Fiscal).
  const acessoAutorizacao = await acessoAsAutorizacoes(ctx);
  const autorizacao = acessoAutorizacao ? await autorizacaoDaEmpresa(ctx.tenantId, company.id) : null;
  const serproPronto = !!acessoAutorizacao?.podeEditar && prontidaoDoSerpro(await configuracaoDoSerpro(ctx.tenantId)).pronta;

  const deleteAction = excluirEmpresa.bind(null, id);

  const [companySectors, sectorMaps, documents, pipelineItems, activities] = await Promise.all([
    getCompanySectors(ctx.tenantId, id),
    getSectorMaps(ctx.tenantId),
    // Com os Arquivos ligados, a aba Documentos sai da ficha (09/10/2026): os
    // documentos antigos aparecem em Arquivos › "Do Connect".
    arquivos ? Promise.resolve([]) : listDocuments(ctx.tenantId, "COMPANY", id),
    prisma.pipelineItem.findMany({
      where: { tenantId: ctx.tenantId, entityType: "COMPANY", entityId: id },
      include: { pipeline: { select: { id: true, name: true, sectorCode: true } }, stage: { select: { name: true } } },
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

  const conversations = await safeFindConversations(() =>
    prisma.chatwootConversation.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [{ contactLink: { companyId: id } }, { contactLink: { person: { currentCompanyId: id } } }],
      },
      orderBy: { lastActivityAt: "desc" },
      take: 20,
    })
  );

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
      {/* Era uma cópia à mão da trilha (até 30/09), com outro espaçamento
          que o das sub-páginas da empresa. */}
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: company.name, truncate: true },
        ]}
      />

      <CompanyHeader
        id={company.id}
        name={nomeExibicao(company)}
        tradeName={razaoSocialSecundaria(company) ?? company.tradeName}
        kind={company.kind}
        cnpj={company.cnpj}
        cpf={company.cpf}
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
        filiaisCount={company.filiais.length}
        documentsCount={arquivos ? undefined : documents.length}
        conversationsCount={conversations.length}
        overview={
          <div className="space-y-4">
            <AiCompanySummary action={gerarResumoEmpresa.bind(null, company.id)} />
            <CompanyOverviewSection company={company} customFields={customFields} />
            {autorizacao && (
              <AutorizacaoNaFicha dados={autorizacao} nome={nomeExibicao(company)} hoje={hojeIso()} podeEditar={acessoAutorizacao!.podeEditar} serpro={serproPronto} />
            )}
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
        filiais={
          <CompanyFiliaisSection
            matriz={company.parent}
            filiais={company.filiais}
            statusLabel={STATUS_LABEL}
            statusColor={STATUS_COLOR}
          />
        }
        people={<CompanyPeopleSection companyId={company.id} people={company.people} />}
        operations={<CompanyOperationsSection companyId={company.id} />}
        documents={
          arquivos ? undefined : (
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
          )
        }
        files={
          arquivos ? (
            <NavegadorDeArquivos dados={arquivos} base={`/arquivos/empresa/${company.id}`} rotuloDaRaiz="Pastas da empresa" />
          ) : undefined
        }
        conversations={
          <Card className="px-4 py-2">
            <AtendimentosAccordion
              atendimentos={conversations.map((c) => ({
                id: c.id,
                dateLabel: c.lastActivityAt ? formatInstantDate(c.lastActivityAt) : "Sem data",
                channelLabel: channelLabel(c.channel),
                statusLabel: statusLabel(c.status),
                status: c.status,
                assigneeLabel: c.assigneeLabel,
                messageCount: c.messageCount,
              }))}
            />
          </Card>
        }
        history={
          <CompanyHistorySection
            pipelineItems={pipelineItems.map((p) => ({
              id: p.id,
              pipelineId: p.pipeline.id,
              pipelineName: p.pipeline.name,
              pipelineSectorCode: p.pipeline.sectorCode,
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
