import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getActiveSectors } from "@/lib/sectors";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { NovoComunicadoForm } from "@/components/comunicados/NovoComunicadoForm";
import { podeComunicarPeloSetor } from "@/lib/comunicados/acesso";
import { enviarComunicado } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovoComunicadoPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await isModuleEnabled(ctx.tenantId, "portal_solicitacoes"))) notFound();

  const ativos = (await getActiveSectors(ctx.tenantId)).filter((s) => podeComunicarPeloSetor(ctx, s.code));
  if (ativos.length === 0) notFound();

  const prisma = getPrisma();
  // Quantos clientes cada setor atende (serviço ativo), para a confirmação dizer
  // a conta antes de mandar — a mesma régua de `gruposDoPublico`.
  const [clientes, porSetor] = await Promise.all([
    prisma.clientGroup.findMany({ where: { tenantId: ctx.tenantId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    Promise.all(
      ativos.map(async (s) => ({
        code: s.code,
        label: s.label,
        clientes: await prisma.clientGroup.count({
          where: {
            tenantId: ctx.tenantId,
            active: true,
            companies: { some: { services: { some: { sectorCode: s.code, status: "ACTIVE" } } } },
          },
        }),
      }))
    ),
  ]);

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Comunicados", href: "/solicitacoes/comunicados" }, { label: "Novo comunicado" }]} />
      <PageHeader title="Novo comunicado" subtitle="Sai na hora para o portal dos clientes, com um e-mail para cada usuário." />
      <div className="max-w-[820px]">
        <Card className="p-6">
          <NovoComunicadoForm
            setores={porSetor}
            totalDeClientes={clientes.length}
            clientes={clientes.map((c) => ({ id: c.id, nome: c.name }))}
            acao={enviarComunicado}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
