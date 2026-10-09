import { notFound } from "next/navigation";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getActiveSectors, getAllSectors } from "@/lib/sectors";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { ModeloDePastas } from "@/components/arquivos/ModeloDePastas";
import { modeloDoEscritorio } from "@/lib/drive/servidor";

/** O modelo de pastas dos Arquivos (09/10/2026): o que toda empresa ganha ao abrir os Arquivos dela. */
export default async function ModeloDePastasPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();

  const [modelo, ativos, todos] = await Promise.all([
    modeloDoEscritorio(ctx.tenantId),
    getActiveSectors(ctx.tenantId),
    getAllSectors(ctx.tenantId),
  ]);
  const rotulo = new Map(todos.map((s) => [s.code, s.label]));

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Administração", href: "/admin" }, { label: "Modelo de pastas" }]} />
      <PageHeader
        title="Modelo de pastas"
        subtitle="As pastas que toda empresa ganha nos Arquivos. Mudar nome ou setor vale na hora para todas; pasta nova chega a cada empresa na próxima vez que alguém abrir os Arquivos dela."
      />
      <ModeloDePastas
        pastas={modelo.map((m) => ({
          id: m.id,
          nome: m.name,
          setor: m.sectorCode,
          setorRotulo: m.sectorCode ? rotulo.get(m.sectorCode) ?? m.sectorCode : null,
          compartilhada: m.sharedWithPortal,
          ativa: m.active,
        }))}
        setores={ativos.map((s) => ({ code: s.code, label: s.label }))}
      />
    </PageContainer>
  );
}
