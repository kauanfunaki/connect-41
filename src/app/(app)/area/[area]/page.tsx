import { notFound } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { ModuleIcon } from "@/components/shared/ModuleIcon";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { semTelasDoGeralOcultas } from "@/lib/menuGeral";
import { telasDoGeralDaPessoa } from "@/lib/menuGeralDb";
import { GRUPOS, ehGrupoDeCor } from "@/lib/aparencia/cores";
import { telasDaArea } from "@/lib/aparencia/telasDaArea";

/**
 * A página de uma área de uso (28/10/2026): todas as telas dela que a pessoa
 * abre, de qualquer setor, em cartões na cor da área — a página de área do
 * Omie. O menu continua por setor; aqui se vê a área inteira de uma vez.
 */
export default async function AreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  if (!ehGrupoDeCor(area)) notFound();
  const ctx = await getAuthContext();

  const [modulos, { labels }, telasDoGeral] = await Promise.all([
    getTenantModuleStates(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
    telasDoGeralDaPessoa(ctx),
  ]);
  const blocos = telasDaArea(area, semTelasDoGeralOcultas(modulos, telasDoGeral), (setor) => canViewSector(ctx, setor));
  const { rotulo, telas } = GRUPOS[area];

  return (
    <PageContainer>
      <PageHeader title={rotulo} subtitle={`As telas de ${rotulo} que você abre, de todos os seus setores. ${telas}`} />
      {blocos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LayoutGrid size={20} />}
            title="Nenhuma tela desta área para você"
            description="As telas aparecem aqui quando o setor delas é seu e o administrador as liga em Configurações → Setores e módulos."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-7">
          {blocos.map(({ setor, telas: lista }) => (
            <section key={setor ?? "geral"}>
              <h2 className="c41-rotulo mb-2.5">{setor ? sectorLabel(labels, setor) : "Geral"}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {lista.map((t) => (
                  <Card key={t.code} href={t.href} className="h-full p-4">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex w-8 h-8 rounded-lg items-center justify-center flex-shrink-0 bg-grupo/12 text-grupo">
                        <ModuleIcon code={t.code} size={17} />
                      </span>
                      <p className="text-fs-4 font-semibold text-fg leading-tight">{t.label}</p>
                    </div>
                    <p className="text-fs-2 text-fg-muted mt-2 leading-relaxed">{t.description}</p>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
