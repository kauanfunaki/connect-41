import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { formatInstantDate } from "@/lib/format";
import { BpoCredentialsList } from "@/components/bpoSenhas/BpoCredentialsList";
import { criarCredencial, atualizarCredencial, excluirCredencial, revelarCredencial } from "./actions";

const SECTOR = "bpo";

export default async function BpoSenhasPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) notFound();
  const canManage = canManageSector(ctx, SECTOR);

  const prisma = getPrisma();
  const [credentials, companies] = await Promise.all([
    prisma.bpoCredential.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { createdAt: "desc" },
      include: { company: { select: { id: true, name: true } }, createdBy: { select: { name: true } } },
    }),
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <PageContainer>
      <BackButton className="mb-3" />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em]">Repositório de Senhas</h1>
          <p className="text-[13px] text-fg-muted mt-1">
            Credenciais de portais, bancos e sistemas de clientes — centralizadas com auditoria de acesso.
          </p>
        </div>
      </div>

      <BpoCredentialsList
        credentials={credentials.map((c) => ({
          id: c.id,
          title: c.title,
          companyId: c.companyId,
          companyName: c.company?.name ?? null,
          username: c.username,
          url: c.url,
          notes: c.notes,
          createdByName: c.createdBy.name,
          createdAtLabel: formatInstantDate(c.createdAt),
        }))}
        companies={companies}
        canManage={canManage}
        createAction={criarCredencial}
        updateAction={atualizarCredencial}
        deleteAction={excluirCredencial}
        revealAction={revelarCredencial}
      />
    </PageContainer>
  );
}
