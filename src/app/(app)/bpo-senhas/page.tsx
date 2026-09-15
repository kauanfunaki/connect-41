import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { formatInstantDate } from "@/lib/format";
import { BpoCredentialsList } from "@/components/bpoSenhas/BpoCredentialsList";
import { criarCredencial, atualizarCredencial, excluirCredencial, revelarCredencial } from "./actions";
import { setorDoModulo } from "@/lib/modules";

// `SECTOR` é a chave do dado (onde o módulo nasce) e o padrão do gate; o
// acesso segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "bpo";
const MODULE = "bpo_senhas";

export default async function BpoSenhasPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  const canManage = canManageSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR);

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
      <PageHeader title="Repositório de Senhas" />
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
