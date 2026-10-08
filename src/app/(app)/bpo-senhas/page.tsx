import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { formatInstantDate } from "@/lib/format";
import { BpoCredentialsList, NewCredentialModal } from "@/components/bpoSenhas/BpoCredentialsList";
import { criarCredencial, atualizarCredencial, excluirCredencial, revelarCredencial } from "./actions";
import { setorDoModulo } from "@/lib/modules";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";

// `SECTOR` é a chave do dado (onde o módulo nasce) e o padrão do gate; o
// acesso segue o setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "bpo";
const MODULE = "bpo_senhas";

export default async function BpoSenhasPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  if (!canActOnSector(ctx, setor)) notFound();
  const canManage = canManageSector(ctx, setor);
  // O vazio cita quem coordena o setor que opera o módulo, e não "o BPO" (05/10/2026).
  const setorRotulo = sectorLabel((await getSectorMaps(ctx.tenantId)).labels, setor);

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
      select: { id: true, name: true, logoUrl: true, cnpj: true, parentCompanyId: true },
    }),
  ]);

  return (
    <PageContainer>
      {/* Sem "Voltar" (08/10/2026): é página principal do setor, aberta pelo
          menu — a regra de contas a pagar. Subtítulo no próprio PageHeader
          (30/09), e "Nova credencial" no `action`, como as outras telas. */}
      <PageHeader
        title="Repositório de Senhas"
        subtitle="Credenciais de portais, bancos e sistemas de clientes — centralizadas com auditoria de acesso."
        action={canManage ? <NewCredentialModal companies={companies} createAction={criarCredencial} /> : undefined}
      />

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
        setorRotulo={setorRotulo}
        updateAction={atualizarCredencial}
        deleteAction={excluirCredencial}
        revealAction={revelarCredencial}
      />
    </PageContainer>
  );
}
