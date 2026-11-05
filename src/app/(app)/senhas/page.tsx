import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext, canManageSector, podeExcluir } from "@/lib/auth/context";
import { formatInstantDate } from "@/lib/format";
import { BpoCredentialsList, NewCredentialModal } from "@/components/bpoSenhas/BpoCredentialsList";
import { SeletorDoSetorDoApoio } from "@/components/apoio/SeletorDoSetorDoApoio";
import { criarCredencial, atualizarCredencial, excluirCredencial, revelarCredencial } from "./actions";
import { isModuleEnabled } from "@/lib/modules";
import { setorDaTelaDoApoio } from "@/lib/apoio/servidor";

const MODULE = "bpo_senhas";

// O Repositório de senhas é Apoio de todo setor desde 05/11/2026 (cofre por
// setor, decisão do Kauan): cada setor vê só as suas credenciais. O setor é o
// da pessoa (o que ela está usando, ou o escolhido em "Todos os setores") —
// ver `setorDaTelaDoApoio`. O módulo ligado/desligado continua valendo para o
// escritório inteiro.
export default async function SenhasPage({ searchParams }: { searchParams: Promise<{ setor?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const [{ setor: pedido }, ligado] = await Promise.all([searchParams, isModuleEnabled(ctx.tenantId, MODULE)]);
  if (!ligado) notFound();
  const apoio = await setorDaTelaDoApoio(ctx, pedido);
  if (!apoio) notFound();
  const canManage = canManageSector(ctx, apoio.setor);

  const prisma = getPrisma();
  const [credentials, companies] = await Promise.all([
    prisma.bpoCredential.findMany({
      where: { tenantId: ctx.tenantId, sectorCode: apoio.setor },
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
      {/* Sem "Voltar" (08/10/2026): é página principal, aberta pelo menu. */}
      <PageHeader
        title="Repositório de senhas"
        subtitle={`As credenciais de ${apoio.rotulo}: portais, bancos e sistemas, com cada acesso registrado.`}
        action={canManage ? <NewCredentialModal companies={companies} createAction={criarCredencial.bind(null, apoio.setor)} /> : undefined}
      />
      <SeletorDoSetorDoApoio apoio={apoio} caminho="/senhas" />

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
        // O vazio cita quem coordena o setor da tela (05/10/2026).
        setorRotulo={apoio.rotulo}
        updateAction={atualizarCredencial}
        // Excluir senha do cofre: só o administrador (13/10/2026).
        deleteAction={podeExcluir(ctx) ? excluirCredencial : undefined}
        revealAction={revelarCredencial}
      />
    </PageContainer>
  );
}
