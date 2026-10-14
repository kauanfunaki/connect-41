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
import { whereDoPublico } from "@/lib/comunicados/consultas";
import { nomeExibicao } from "@/lib/companyName";
import { STATUS_OCULTOS_POR_PADRAO } from "@/lib/companyStatusFilter";
import { enviarComunicado } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovoComunicadoPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await isModuleEnabled(ctx.tenantId, "portal_solicitacoes"))) notFound();

  const ativos = (await getActiveSectors(ctx.tenantId)).filter((s) => podeComunicarPeloSetor(ctx, s.code));
  if (ativos.length === 0) notFound();

  const prisma = getPrisma();
  // Quantas empresas cada setor atende (serviço ativo), para a confirmação dizer
  // a conta antes de mandar — a mesma régua de `empresasDoPublico`. A lista do
  // "Empresas escolhidas" são as em operação; a filial vem com a matriz dela.
  const [empresas, total, porSetor] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: { notIn: STATUS_OCULTOS_POR_PADRAO } },
      select: { id: true, name: true, displayName: true, parentCompanyId: true },
    }),
    prisma.company.count({ where: whereDoPublico(ctx.tenantId, "TODOS", "", []) }),
    Promise.all(
      ativos.map(async (s) => ({
        code: s.code,
        label: s.label,
        empresas: await prisma.company.count({ where: whereDoPublico(ctx.tenantId, "SETOR", s.code, []) }),
      }))
    ),
  ]);

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Comunicados", href: "/solicitacoes/comunicados" }, { label: "Novo comunicado" }]} />
      <PageHeader title="Novo comunicado" subtitle="Sai na hora para o portal das empresas escolhidas, com um e-mail para cada pessoa com acesso a elas." />
      <div className="max-w-[820px]">
        <Card className="p-6">
          <NovoComunicadoForm
            setores={porSetor}
            totalDeEmpresas={total}
            empresas={empresas
              .map((e) => ({ id: e.id, nome: nomeExibicao(e), matrizId: e.parentCompanyId }))
              .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))}
            acao={enviarComunicado}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
